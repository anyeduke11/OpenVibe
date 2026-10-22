import {
  InterpretProviderCollection,
  InterpretProviderConfig,
  type InterpretCapability,
  type InterpretProviderCollection as InterpretProviderCollectionType,
  type InterpretProviderConfig as InterpretProviderConfigType,
  type InterpretProviderCollectionView,
  type InterpretProviderEntry as InterpretProviderEntryType,
  type InterpretProviderEntryView,
  type InterpretProviderKeyStorage,
  type InterpretProviderView,
} from '@openvibe/shared'
import { APP_META_KEYS, AppMetaRepo } from '../repos/appMeta'
import type { SqliteDatabase } from '../db'
import { CommandInterpretRunner, commandExists, runnerFromEnv, type SourceInterpretRunner } from './runner'
import { HttpInterpretRunner } from './http-runner'
import {
  KEYCHAIN_ACCOUNT,
  KEYCHAIN_SERVICE,
  realKeychainStore,
  type KeychainStore,
} from './keychain'

/**
 * `packages/core/src/source-ai/provider-config.ts` —— **AI 解读 provider 的配置层**
 * （owner 2026-10-22 裁决一：「增加手动调控设置」＋「支持本地模型和 LLM API 接入」；
 *  2026-10-22 增强 2：「**多个 provider 配置并存，按项目或按接口形态选**」）。
 *
 * ## 它是什么
 *
 * 把「用哪个 provider 解读源码」这件事，从**只能靠环境变量**变成
 * **设置页可手动调控**：
 *
 * ```
 * app_meta.langInterpretProvider  ← 形态 · 命令/端点 · 模型 · provider · key · 超时
 * ```
 *
 * ## ⚠️ 增强 2 之后：**集合**而不是单条
 *
 * ```
 * app_meta.langInterpretProvider = {
 *   providers: [ { id, name, projects, enabled, kind, cmd, args, endpoint, model, provider, api_key, api_key_storage, timeout_ms } ],
 *   default_provider_id: 'p-1',
 * }
 * ```
 *
 * ⚠️ **老配置是单条对象** ⇒ 读端**认出旧形状并包成单元素集合**（**老配置不许丢**）——
 *   见 `readProviderCollection`。
 *
 * ## ⚠️ 选哪一份（**口径只留一处** —— `selectProviderEntry`）
 *
 * 1. **显式指定**（请求带了 `provider_id`）⇒ 就是那一份；
 * 2. **按项目**（请求带了 `project_id`）⇒ 绑定了这个项目、且**启用中**的那一份；
 * 3. **默认那一份**（`default_provider_id`）；
 * 4. 都没有 ⇒ 环境变量兜底（**仅当压根没配过**）。
 *
 * ⚠️ **「按接口形态」怎么落地**：每份配置自带 `kind`（`command` / `openai_http`），
 *   命令形态与兼容接口形态**可以各存一份、互不覆盖** ⇒ 切形态不必覆盖另一份。
 *
 * ## ⚠️ 三条不变式
 *
 * 1. **「没配」与「配坏了」必须能分开** —— 否则用户只看到「AI 不可用」，
 *    不知道是自己没填、填错了、还是服务没起（⇒ 三档 `status` ＋ `detail`）。
 * 2. **key 永不回显** —— 视图里只有 `has_api_key` 与末 4 位（`InterpretProviderEntryView`）。
 * 3. **配置优先、环境变量兜底** —— 用户在设置页配了就用配的；
 *    没配（`app_meta` 里**没有这个键**）才回退环境变量
 *    （保持 M3 FR-6.3「走 Pi」与 P5 的既有行为不变）。
 *    ⚠️ **注意**：配置存在但选不出可用的一份 ⇒ **就是没有**，
 *    **不再回退环境变量**（否则「关掉开关」关不干净）。
 */

/** 默认配置（**总闸默认关** —— DL-08 的下限）。 */
export const DEFAULT_PROVIDER_CONFIG: InterpretProviderConfigType = {
  enabled: false,
  kind: 'command',
  cmd: '',
  args: [],
  endpoint: '',
  model: '',
  provider: '',
  api_key: '',
  api_key_storage: 'none',
  timeout_ms: 30_000,
}

/**
 * **老配置（单条）迁移成集合后，那一份的 id**。
 *
 * ⚠️ **它同时是钥匙串项的账号后缀** —— 老用户那把 key 存在 `api-key` 这个账号下
 *   ⇒ 迁移后**必须还用同一个账号**，否则「查无此项」⇒ 等于把用户的 key 弄丢了。
 */
export const LEGACY_PROVIDER_ID = 'default'

/** 空集合（**没配过**）。 */
function emptyCollection(): InterpretProviderCollectionType {
  return { providers: [], default_provider_id: '' }
}

/**
 * 一份配置的**归一**。
 *
 * ⚠️ **老配置归一**（没有 `api_key_storage` 那一列的）——
 *   旧版把 key **明文**存在配置里 ⇒ 它的真实处境就是 `inline`。
 * ⚠️ **不许默认成 `keychain`**（那会把一把明文 key 说成在钥匙串里 ⇒ 撒谎）。
 */
function normalizeEntry(entry: InterpretProviderEntryType): InterpretProviderEntryType {
  if (entry.api_key_storage === 'none' && entry.api_key.trim() !== '') {
    return { ...entry, api_key_storage: 'inline' }
  }
  return entry
}

/** 读配置集合（**连有没有配过一起读**）。 */
export function readProviderCollection(db: SqliteDatabase): {
  collection: InterpretProviderCollectionType
  configured: boolean
} {
  const repo = new AppMetaRepo(db)
  const raw = repo.read<unknown>(APP_META_KEYS.langInterpretProvider, undefined as unknown)
  if (raw === undefined) return { collection: emptyCollection(), configured: false }
  // ① **新形状**：集合
  const asCollection = InterpretProviderCollection.safeParse(raw)
  if (asCollection.success) {
    return {
      collection: {
        providers: asCollection.data.providers.map(normalizeEntry),
        default_provider_id: asCollection.data.default_provider_id,
      },
      configured: true,
    }
  }
  // ② **老形状**：单条对象 ⇒ **包成单元素集合**（老配置不许丢）
  const asLegacy = InterpretProviderConfig.safeParse(raw)
  if (asLegacy.success) {
    return {
      collection: {
        providers: [
          normalizeEntry({
            ...asLegacy.data,
            id: LEGACY_PROVIDER_ID,
            name: '',
            projects: [],
          }),
        ],
        default_provider_id: LEGACY_PROVIDER_ID,
      },
      configured: true,
    }
  }
  // ⚠️ **坏了就回落空集合**（不抛）—— 配置坏了不该把整个设置页拖垮
  return { collection: emptyCollection(), configured: false }
}

/** 写配置集合（**整份覆盖** —— 形状固定，不做增量合并，避免半截配置）。 */
export function writeProviderCollection(
  db: SqliteDatabase,
  collection: InterpretProviderCollectionType,
): void {
  const parsed = InterpretProviderCollection.safeParse(collection)
  if (!parsed.success) {
    throw new Error('provider 配置集合不合法')
  }
  new AppMetaRepo(db).write(APP_META_KEYS.langInterpretProvider, parsed.data)
}

/**
 * **选哪一份配置**（**口径只留一处** —— server 与 core 都走这里）。
 *
 * ⚠️ **优先级**：显式 `provider_id` → 按 `project_id` 绑定 → `default_provider_id`。
 *
 * ⚠️ **按项目那一档只认「启用中」的** ⇒ 绑定了但被关掉 ⇒ 落到默认那一份
 *   （「关掉」就是关掉，不许它继续被用）。
 */
export interface ProviderSelection {
  /** 显式指定那一份的 id（**优先级最高**） */
  providerId?: string
  /** 按项目选（**次之**） */
  projectId?: string
}

/** 选的结果（**三种** —— 区分「没这一份」与「压根没配」）。 */
export type ProviderSelectionResult =
  | { kind: 'entry'; entry: InterpretProviderEntryType; reason: 'explicit' | 'project' | 'default' }
  | { kind: 'missing'; providerId: string }
  | { kind: 'none' }

/**
 * 选一份配置出来。
 *
 * @param collection 配置集合
 * @param sel 选择依据（显式 id / 项目）
 */
export function selectProviderEntry(
  collection: InterpretProviderCollectionType,
  sel: ProviderSelection = {},
): ProviderSelectionResult {
  const wanted = sel.providerId?.trim() ?? ''
  if (wanted !== '') {
    const hit = collection.providers.find((p) => p.id === wanted)
    if (hit === undefined) return { kind: 'missing', providerId: wanted }
    return { kind: 'entry', entry: hit, reason: 'explicit' }
  }
  const project = sel.projectId?.trim() ?? ''
  if (project !== '') {
    const hit = collection.providers.find((p) => p.enabled && p.projects.includes(project))
    if (hit !== undefined) return { kind: 'entry', entry: hit, reason: 'project' }
  }
  const def = collection.providers.find((p) => p.id === collection.default_provider_id)
  if (def !== undefined) return { kind: 'entry', entry: def, reason: 'default' }
  return { kind: 'none' }
}

/**
 * **钥匙串项的账号**（**按配置 id 分** —— 多份并存时各有一把 key）。
 *
 * ⚠️ **老配置沿用旧账号**（`api-key`）—— 不然老用户那把 key 会「查无此项」⇒ 等于丢了。
 *
 * @param providerId 配置 id
 */
export function keychainAccount(providerId: string): string {
  const id = providerId.trim()
  return id === '' || id === LEGACY_PROVIDER_ID ? KEYCHAIN_ACCOUNT : `${KEYCHAIN_ACCOUNT}:${id}`
}

/**
 * **存储位置的人话说明**（**界面照着显示，不另写一份**）。
 *
 * ⚠️ **降级时必须说清楚** —— 「以明文存在本地数据库里」这句话是这个模块存在的意义。
 */
export function apiKeyStorageDetail(storage: InterpretProviderKeyStorage): string {
  if (storage === 'keychain') {
    return '存在 macOS 系统钥匙串里（本地数据库只留一个标记，不存 key 本身）'
  }
  if (storage === 'inline') {
    return '这台机器没有可用的系统钥匙串，key 以明文存在本地数据库里'
  }
  return '没有配置 key'
}

/**
 * 脱敏视图（**key 只给末 4 位**）。
 *
 * ⚠️ **key 由调用方传进来**（不是从 config 里取）——
 *   因为 key 可能在**系统钥匙串**里（`config.api_key` 那一刻是空的）
 *   ⇒ 视图要显示的是「**实际那把 key**」的末 4 位。
 *
 * @param config 配置
 * @param apiKey 实际那把 key（**空串** = 没有 key）
 */
export function providerConfigView(
  config: InterpretProviderConfigType,
  apiKey: string,
): InterpretProviderView {
  const key = apiKey.trim()
  const storage = config.api_key_storage
  return {
    enabled: config.enabled,
    kind: config.kind,
    cmd: config.cmd,
    args: config.args,
    endpoint: config.endpoint,
    model: config.model,
    provider: config.provider,
    has_api_key: key !== '',
    api_key_hint: key === '' ? '' : key.slice(-4),
    api_key_storage: storage,
    api_key_storage_detail: apiKeyStorageDetail(storage),
    timeout_ms: config.timeout_ms,
  }
}

/**
 * **取实际那把 key**（钥匙串或明文）。
 *
 * ⚠️ **钥匙串读不到 ⇒ 空串**（不是抛错）—— 上层据此说「钥匙串里没有这把 key」。
 *
 * ⚠️ **按配置 id 取那一把**（多份并存时各有各的 key）⇒ 账号见 `keychainAccount`。
 *
 * @param config 配置
 * @param store 钥匙串后端
 * @param providerId 配置 id（**缺省 = 老配置那个账号**）
 */
export async function resolveApiKey(
  config: InterpretProviderConfigType,
  store: KeychainStore = realKeychainStore,
  providerId: string = LEGACY_PROVIDER_ID,
): Promise<string> {
  if (config.api_key_storage === 'keychain') {
    const v = await store.read(KEYCHAIN_SERVICE, keychainAccount(providerId))
    return v === null ? '' : v.trim()
  }
  return config.api_key.trim()
}

/**
 * 一份配置的**对外视图**（脱敏 ＋ 绑定信息）。
 *
 * @param entry 配置
 * @param apiKey 实际那把 key（**空串** = 没有 key）
 */
export function providerEntryView(
  entry: InterpretProviderEntryType,
  apiKey: string,
): InterpretProviderEntryView {
  return {
    ...providerConfigView(entry, apiKey),
    id: entry.id,
    name: entry.name,
    projects: [...entry.projects],
  }
}

/**
 * 集合的**对外视图**（**每份的 key 各自解析** —— 各有各的钥匙串项）。
 *
 * ⚠️ **key 只给末 4 位** ⇒ 视图形状里装不下全文 ⇒ 回显在类型上就不可能。
 *
 * @param collection 配置集合
 * @param store 钥匙串后端
 */
export async function providerCollectionView(
  collection: InterpretProviderCollectionType,
  store: KeychainStore = realKeychainStore,
): Promise<InterpretProviderCollectionView> {
  const providers: InterpretProviderEntryView[] = []
  for (const entry of collection.providers) {
    const key = await resolveApiKey(entry, store, entry.id)
    providers.push(providerEntryView(entry, key))
  }
  return { providers, default_provider_id: collection.default_provider_id }
}

/**
 * 按配置造 runner（**不检查能不能用** —— 那是探测的事）。
 *
 * ⚠️ 造不出来（缺命令 / 缺端点）⇒ 返回 `null` ⇒ 上层按「不可用」处理。
 */
export function runnerFromProviderConfig(
  config: InterpretProviderConfigType,
  apiKey: string,
): SourceInterpretRunner | null {
  if (!config.enabled) return null
  if (config.kind === 'command') {
    const cmd = config.cmd.trim()
    if (cmd === '') return null
    return new CommandInterpretRunner({
      cmd,
      args: config.args,
      model: config.model.trim() === '' ? 'unknown' : config.model.trim(),
      provider: config.provider.trim() === '' ? 'unknown' : config.provider.trim(),
      timeoutMs: config.timeout_ms,
    })
  }
  const endpoint = config.endpoint.trim()
  if (endpoint === '') return null
  return new HttpInterpretRunner({
    endpoint,
    model: config.model.trim() === '' ? 'unknown' : config.model.trim(),
    provider: config.provider.trim() === '' ? 'unknown' : config.provider.trim(),
    // ⚠️ **实际那把 key**（可能来自系统钥匙串，不是 `config.api_key`）
    apiKey,
    timeoutMs: config.timeout_ms,
  })
}

/** 本机端点？（本机模型通常**不需要** API key ⇒ 不能拿「没 key」判它坏） */
export function isLocalEndpoint(endpoint: string): boolean {
  try {
    // ⚠️ **IPv6 的 hostname 带方括号**（`[::1]`）⇒ 比对前先剥掉
    const host = new URL(endpoint).hostname.toLowerCase().replace(/^\[|\]$/gu, '')
    return host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '0.0.0.0'
  } catch {
    return false
  }
}

/** 端点是不是合法的 http(s) URL。 */
export function isValidEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/** provider 的**解析结果**（runner ＋ 三档状态 ＋ 人话原因）。 */
export interface ProviderResolution {
  runner: SourceInterpretRunner | null
  status: InterpretCapability['status']
  detail: string
}

/**
 * **一份配置 → runner**（**口径单处** —— 多份并存时也只这一处）。
 *
 * ⚠️ **关掉就是关掉** ⇒ 返回 `null`（上层按「不可用」处理）。
 */
function runnerOfEntry(entry: InterpretProviderEntryType, apiKey: string): SourceInterpretRunner | null {
  if (!entry.enabled) return null
  return runnerFromProviderConfig(entry, apiKey)
}

/**
 * 取当前该用的 runner（**异步**，**不做存在性检查**）。
 *
 * ⚠️ **为什么是异步**：key 可能在**系统钥匙串**里 ⇒ 读它要起一个子进程
 *   （`security find-generic-password`）⇒ 同步接口做不到。
 * ⚠️ **为什么解读时不做存在性检查**：解读真跑一次就知道命令在不在
 *   （失败会被归一成 `runner-not-found`）⇒ 没必要为了「跑一次解读」先 spawn 一次 `--version`。
 *   存在性检查只发生在**能力探测**那条路上（`resolveProvider`）。
 *
 * @param db 数据库
 * @param env 环境变量（测试可注入）
 * @param store 钥匙串后端
 * @param sel 选哪一份（**显式 id → 按项目 → 默认**）
 */
export async function resolveProviderRunner(
  db: SqliteDatabase,
  env: NodeJS.ProcessEnv = process.env,
  store: KeychainStore = realKeychainStore,
  sel: ProviderSelection = {},
): Promise<SourceInterpretRunner | null> {
  const { collection, configured } = readProviderCollection(db)
  // ⚠️ **压根没配过 ⇒ 回退环境变量**（保持既有行为）
  if (!configured) return runnerFromEnv(env)
  const picked = selectProviderEntry(collection, sel)
  // ⚠️ **「显式指定的那份不存在」与「压根没配」都拿不到 runner** ——
  //   但**原因不一样** ⇒ 那是 `resolveProvider` 那条路要分清楚的事
  if (picked.kind !== 'entry') return null
  const apiKey = await resolveApiKey(picked.entry, store, picked.entry.id)
  return runnerOfEntry(picked.entry, apiKey)
}

/**
 * **能力形状的唯一构造处**（`available` 与 `status` 不许各写一遍）。
 *
 * ⚠️ **等价性**：`available === (status === 'ready')` ——
 *   `unconfigured` / `misconfigured` 两档的 runner 都是 `null` ⇒ `available` 必为 false。
 *   ⇒ 界面**读 `status` 拿原因、读 `available` 决定要不要渲染 T2 区**（DL-08）。
 */
export function capabilityOf(resolution: ProviderResolution): InterpretCapability {
  return {
    available: resolution.runner !== null,
    runner_id: resolution.runner?.id ?? null,
    status: resolution.status,
    detail: resolution.detail,
  }
}

/**
 * **探测一份配置能不能用**（**不发任何请求** —— 只查本地：命令在不在、端点像不像 URL）。
 *
 * @param entry 配置
 * @param apiKey 实际那把 key
 */
async function probeEntry(
  entry: InterpretProviderEntryType,
  apiKey: string,
): Promise<ProviderResolution> {
  if (!entry.enabled) {
    return { runner: null, status: 'unconfigured', detail: 'AI 解读已关闭（设置页「AI 解读」节可打开）' }
  }
  if (entry.kind === 'command') {
    const cmd = entry.cmd.trim()
    if (cmd === '') {
      return { runner: null, status: 'misconfigured', detail: '没有填解读命令' }
    }
    const exists = await commandExists(cmd)
    const base = cmd.split('/').pop() ?? cmd
    if (!exists) {
      return {
        runner: null,
        status: 'misconfigured',
        detail: `找不到命令「${base}」（不在 PATH 里，或路径写错了）`,
      }
    }
    return {
      runner: runnerOfEntry(entry, apiKey),
      status: 'ready',
      detail: 'AI 解读可用（命令适配器）',
    }
  }
  // openai_http
  const endpoint = entry.endpoint.trim()
  if (endpoint === '') {
    return { runner: null, status: 'misconfigured', detail: '没有填解读端点' }
  }
  if (!isValidEndpoint(endpoint)) {
    return {
      runner: null,
      status: 'misconfigured',
      detail: '端点不是一个合法的 http:// 或 https:// 地址',
    }
  }
  // ⚠️ **用「实际那把 key」判**（不是 `entry.api_key`）——
  //   keychain 模式下 `entry.api_key` 是空的，真正的 key 在系统钥匙串里。
  if (!isLocalEndpoint(endpoint) && apiKey.trim() === '') {
    // ⚠️ **「钥匙串里没有这把 key」与「压根没配 key」是两件事** ⇒ 分开说
    if (entry.api_key_storage === 'keychain') {
      return {
        runner: null,
        status: 'misconfigured',
        detail: '系统钥匙串里找不到这把 key —— 重新保存一次 API key 即可',
      }
    }
    return {
      runner: null,
      status: 'misconfigured',
      detail: '这个端点不像本机地址，需要 API key —— 请填上（本地模型通常不需要）',
    }
  }
  return {
    runner: runnerOfEntry(entry, apiKey),
    status: 'ready',
    detail: 'AI 解读可用（OpenAI 兼容接口）',
  }
}

/**
 * **解析当前该用哪个 provider**（配置优先，环境变量兜底）。
 *
 * ⚠️ **不发任何请求**（只查本地：配置读不读得出来、命令在不在）⇒
 *   这个函数可以放心地被界面高频调用。
 *
 * @param db 数据库
 * @param env 环境变量（测试可注入）
 * @param store 钥匙串后端
 * @param sel 选哪一份（**显式 id → 按项目 → 默认**）
 */
export async function resolveProvider(
  db: SqliteDatabase,
  env: NodeJS.ProcessEnv = process.env,
  store: KeychainStore = realKeychainStore,
  sel: ProviderSelection = {},
): Promise<ProviderResolution> {
  const { collection, configured } = readProviderCollection(db)

  // ---- 情形一：用户在设置页配过（**完全按配置来**，不与环境变量混）----
  if (configured) {
    const picked = selectProviderEntry(collection, sel)
    // ⚠️ **「显式指定的那一份不存在」是「配坏了」** ⇒ 得一档 `misconfigured` + 说清是哪一份
    if (picked.kind === 'missing') {
      return {
        runner: null,
        status: 'misconfigured',
        detail: `找不到这份 provider 配置（id：${picked.providerId}）`,
      }
    }
    if (picked.kind === 'none') {
      return {
        runner: null,
        status: 'unconfigured',
        detail: '还没有配置 AI 解读服务（设置页「AI 解读」节可以手动配置）',
      }
    }
    // ⚠️ **实际那把 key**（可能来自系统钥匙串）—— 探测也要用真的那把，
    //   否则「钥匙串里其实没有这把 key」这件事会被藏起来。
    const apiKey = await resolveApiKey(picked.entry, store, picked.entry.id)
    return probeEntry(picked.entry, apiKey)
  }

  // ---- 情形二：没配过 ⇒ 回退环境变量（保持既有行为）----
  const envRunner = runnerFromEnv(env)
  if (envRunner === null) {
    return {
      runner: null,
      status: 'unconfigured',
      detail: '还没有配置 AI 解读服务（设置页「AI 解读」节可以手动配置）',
    }
  }
  return {
    runner: envRunner,
    status: 'ready',
    detail: 'AI 解读可用（用的是环境变量里配置的解读命令）',
  }
}
