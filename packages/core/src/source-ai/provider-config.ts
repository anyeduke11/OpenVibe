import {
  InterpretProviderConfig,
  type InterpretCapability,
  type InterpretProviderConfig as InterpretProviderConfigType,
  type InterpretProviderView,
} from '@openvibe/shared'
import { APP_META_KEYS, AppMetaRepo } from '../repos/appMeta'
import type { SqliteDatabase } from '../db'
import { CommandInterpretRunner, commandExists, runnerFromEnv, type SourceInterpretRunner } from './runner'
import { HttpInterpretRunner } from './http-runner'

/**
 * `packages/core/src/source-ai/provider-config.ts` —— **AI 解读 provider 的配置层**
 * （owner 2026-10-22 裁决一：「增加手动调控设置」＋「支持本地模型和 LLM API 接入」）。
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
 * ⚠️ **为什么存 `app_meta` 而不是新建表**：
 *   它是**用户偏好**（同 `langModeChoice` 的纪律）⇒ 不进任何 `lang_` 表，
 *   也**不新增表**（表数仍十七张，DL-26 守着）。
 *
 * ## ⚠️ 三条不变式
 *
 * 1. **「没配」与「配坏了」必须能分开** —— 否则用户只看到「AI 不可用」，
 *    不知道是自己没填、填错了、还是服务没起（⇒ 三档 `status` ＋ `detail`）。
 * 2. **key 永不回显** —— 视图里只有 `has_api_key` 与末 4 位（`InterpretProviderView`）。
 * 3. **配置优先、环境变量兜底** —— 用户在设置页配了就用配的；
 *    没配（`app_meta` 里**没有这个键**）才回退环境变量
 *    （保持 M3 FR-6.3「走 Pi」与 P5 的既有行为不变）。
 *    ⚠️ **注意**：配置存在但 `enabled: false` ⇒ **就是关**，
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
  timeout_ms: 30_000,
}

/** 读配置（**连有没有配过一起读**）。 */
export function readProviderConfig(db: SqliteDatabase): {
  config: InterpretProviderConfigType
  configured: boolean
} {
  const repo = new AppMetaRepo(db)
  const raw = repo.read<unknown>(APP_META_KEYS.langInterpretProvider, undefined as unknown)
  if (raw === undefined) return { config: { ...DEFAULT_PROVIDER_CONFIG }, configured: false }
  const parsed = InterpretProviderConfig.safeParse(raw)
  // ⚠️ **坏了就回落默认值**（不抛）—— 配置坏了不该把整个设置页拖垮
  if (!parsed.success) return { config: { ...DEFAULT_PROVIDER_CONFIG }, configured: false }
  return { config: parsed.data, configured: true }
}

/** 写配置（**整份覆盖** —— 形状固定，不做增量合并，避免半截配置）。 */
export function writeProviderConfig(
  db: SqliteDatabase,
  config: InterpretProviderConfigType,
): void {
  const parsed = InterpretProviderConfig.safeParse(config)
  if (!parsed.success) {
    throw new Error('provider 配置不合法')
  }
  new AppMetaRepo(db).write(APP_META_KEYS.langInterpretProvider, parsed.data)
}

/** 脱敏视图（**key 只给末 4 位**）。 */
export function providerConfigView(config: InterpretProviderConfigType): InterpretProviderView {
  const key = config.api_key.trim()
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
    timeout_ms: config.timeout_ms,
  }
}

/**
 * 按配置造 runner（**不检查能不能用** —— 那是探测的事）。
 *
 * ⚠️ 造不出来（缺命令 / 缺端点）⇒ 返回 `null` ⇒ 上层按「不可用」处理。
 */
export function runnerFromProviderConfig(
  config: InterpretProviderConfigType,
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
    apiKey: config.api_key,
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
 * **配置 → runner** 的**唯一一处**（口径单处）。
 *
 * ⚠️ **「配置存在但坏了」不回退环境变量** —— 用户在设置页配过就以配置为准
 *   （配坏了要**看得见**，而不是悄悄换一个源）。
 */
function providerRunner(
  config: InterpretProviderConfigType,
  configured: boolean,
  env: NodeJS.ProcessEnv,
): SourceInterpretRunner | null {
  if (!configured) return runnerFromEnv(env)
  if (!config.enabled) return null
  return runnerFromProviderConfig(config)
}

/**
 * 取当前该用的 runner（**同步**，**不做存在性检查**）。
 *
 * ⚠️ **为什么解读时不做检查**：解读真跑一次就知道命令在不在
 *   （失败会被归一成 `runner-not-found`）⇒ 没必要为了「跑一次解读」先 spawn 一次 `--version`。
 *   存在性检查只发生在**能力探测**那条路上（`resolveProvider`）。
 */
export function resolveProviderRunner(
  db: SqliteDatabase,
  env: NodeJS.ProcessEnv = process.env,
): SourceInterpretRunner | null {
  const { config, configured } = readProviderConfig(db)
  return providerRunner(config, configured, env)
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
 * **解析当前该用哪个 provider**（配置优先，环境变量兜底）。
 *
 * ⚠️ **不发任何请求**（只查本地：配置读不读得出来、命令在不在）⇒
 *   这个函数可以放心地被界面高频调用。
 *
 * @param db 数据库
 * @param env 环境变量（测试可注入）
 */
export async function resolveProvider(
  db: SqliteDatabase,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ProviderResolution> {
  const { config, configured } = readProviderConfig(db)

  // ---- 情形一：用户在设置页配过（**完全按配置来**，不与环境变量混）----
  if (configured) {
    if (!config.enabled) {
      return { runner: null, status: 'unconfigured', detail: 'AI 解读已关闭（设置页「AI 解读」节可打开）' }
    }
    if (config.kind === 'command') {
      const cmd = config.cmd.trim()
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
        runner: providerRunner(config, true, env),
        status: 'ready',
        detail: 'AI 解读可用（命令适配器）',
      }
    }
    // openai_http
    const endpoint = config.endpoint.trim()
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
    if (!isLocalEndpoint(endpoint) && config.api_key.trim() === '') {
      return {
        runner: null,
        status: 'misconfigured',
        detail: '这个端点不像本机地址，需要 API key —— 请填上（本地模型通常不需要）',
      }
    }
    return {
      runner: providerRunner(config, true, env),
      status: 'ready',
      detail: 'AI 解读可用（OpenAI 兼容接口）',
    }
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