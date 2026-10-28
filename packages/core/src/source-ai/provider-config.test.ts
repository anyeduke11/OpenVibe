// `packages/core/src/source-ai/provider-config.test.ts` —— **provider 配置层**的判据测试
// （owner 2026-10-22 裁决一：「增加手动调控设置」＋「支持本地模型和 LLM API 接入」；
//  同日增强 2：「**多个 provider 配置并存，按项目或按接口形态选**」）。
//
// ## 它断什么
//
// | 断的事 | 为什么必须断 |
// |---|---|
// | 默认**关** | DL-08 的下限：没配 ⇒ AI 不可用 ⇒ 确定性层照常 |
// | **key 永不出现在视图里** | 明文落库的补偿手段（读端只能给末 4 位） |
// | **配置优先、环境变量兜底** | 「配了就按配的」；「配坏了要看得见」⇒ **配了但坏了不回退** |
// | **三档探测不许塌成一个兜底** | 用户要知道是「没填」「填错」还是「服务没起」 |
// | `available` ≡ `status === 'ready'` | 两个字段不许各说各话（口径单处） |
// | ⚠️ **老配置读成「单元素集合」** | 增强 2 换了存储形状 ⇒ **老配置不许丢** |
// | ⚠️ **选哪一份的优先级** | 显式 id → 按项目 → 默认 ⇒ 口径只留一处 |
// | ⚠️ **多份各有一把 key** | 钥匙串项按 id 分账号 ⇒ 否则两份会互相覆盖对方的 key |
//
// ⚠️ **这些是实现层测试，不计入 §7 的五十条判据**（判据数不变，DL-44 守着）。
import { afterEach, describe, expect, it } from 'vitest'
import { newDb, type TestDbHandle } from '../test-support/new-db'
import {
  DEFAULT_PROVIDER_CONFIG,
  LEGACY_PROVIDER_ID,
  apiKeyStorageDetail,
  capabilityOf,
  isLocalEndpoint,
  isValidEndpoint,
  keychainAccount,
  providerCollectionView,
  providerConfigView,
  providerEntryView,
  readProviderCollection,
  resolveApiKey,
  resolveProvider,
  resolveProviderRunner,
  selectProviderEntry,
  writeProviderCollection,
  type ProviderResolution,
} from './provider-config'
import { memoryKeychainStore } from './keychain'
import { APP_META_KEYS, AppMetaRepo } from '../repos/appMeta'
import type {
  InterpretProviderCollection as InterpretProviderCollectionType,
  InterpretProviderConfig as InterpretProviderConfigType,
  InterpretProviderEntry as InterpretProviderEntryType,
} from '@openvibe/shared'

const dbs: TestDbHandle[] = []
function db() {
  const h = newDb()
  dbs.push(h)
  return h.db
}
afterEach(() => {
  while (dbs.length > 0) dbs.pop()?.close()
})

function cfg(over: Partial<InterpretProviderConfigType> = {}): InterpretProviderConfigType {
  return { ...DEFAULT_PROVIDER_CONFIG, ...over }
}

/** 一份配置（**默认关**，id 固定 `p1`）。 */
function entry(over: Partial<InterpretProviderEntryType> = {}): InterpretProviderEntryType {
  return { ...cfg(), id: 'p1', name: '', projects: [], ...over }
}

/** 一个集合（**默认那一份 = 第一份**）。 */
function collection(
  providers: InterpretProviderEntryType[],
  defaultProviderId?: string,
): InterpretProviderCollectionType {
  return {
    providers,
    default_provider_id: defaultProviderId ?? providers[0]?.id ?? '',
  }
}

describe('M9 · provider 配置层 · 读写与脱敏', () => {
  it('默认配置是**关**的（DL-08 的下限：没配 ⇒ AI 不可用）', () => {
    expect(DEFAULT_PROVIDER_CONFIG.enabled).toBe(false)
    const { collection: c, configured } = readProviderCollection(db())
    expect(configured).toBe(false)
    expect(c.providers).toEqual([])
  })

  it('写进去读得出来（**整份覆盖**，不做增量合并）', () => {
    const d = db()
    writeProviderCollection(
      d,
      collection([
        entry({
          enabled: true,
          kind: 'openai_http',
          endpoint: 'http://127.0.0.1:11434/v1/chat/completions',
          model: 'qwen2.5-coder:7b',
          provider: 'ollama',
        }),
      ]),
    )
    const { collection: c, configured } = readProviderCollection(d)
    expect(configured).toBe(true)
    expect(c.providers).toHaveLength(1)
    expect(c.providers[0]?.kind).toBe('openai_http')
    expect(c.providers[0]?.endpoint).toBe('http://127.0.0.1:11434/v1/chat/completions')
    expect(c.providers[0]?.model).toBe('qwen2.5-coder:7b')
  })

  it('⚠️ **key 全文绝不出现在视图里**（只有 `has_api_key` ＋ 末 4 位）', () => {
    const secret = 'sk-THIS-IS-SECRET-123456'
    const view = providerConfigView(cfg({ api_key: secret }), secret)
    // ⚠️ **守卫自证**：先断言「视图里确实没有全文」，否则「找不到全文」可能是**压根没 key**
    expect(view.has_api_key).toBe(true)
    expect(view.api_key_hint).toBe('3456')
    expect(JSON.stringify(view)).not.toContain('THIS-IS-SECRET')
    expect(JSON.stringify(view)).not.toContain(secret)
    // ⚠️ 视图的**形状**里压根没有 api_key 这个字段（类型上就装不下）
    expect(Object.keys(view)).not.toContain('api_key')
  })

  it('没配 key 时 hint 是空串（不是 undefined —— 界面要能直接显示）', () => {
    const view = providerConfigView(cfg(), '')
    expect(view.has_api_key).toBe(false)
    expect(view.api_key_hint).toBe('')
  })
})

describe('M9 · provider 配置层 · 优先级（配置优先，环境变量兜底）', () => {
  it('配置存在但**关着** ⇒ 没有 runner（**不回退环境变量**）', async () => {
    const d = db()
    writeProviderCollection(
      d,
      collection([entry({ enabled: false, kind: 'command', cmd: '/bin/echo' })]),
    )
    const env = { OPENVIBE_M9_INTERPRETER: '/bin/echo' } as NodeJS.ProcessEnv
    expect(await resolveProviderRunner(d, env)).toBeNull()
  })

  it('配置存在且开着 ⇒ 用配置的（**环境变量被忽略**）', async () => {
    const d = db()
    writeProviderCollection(
      d,
      collection([entry({ enabled: true, kind: 'command', cmd: '/bin/cat', provider: 'local' })]),
    )
    const runner = await resolveProviderRunner(d, {
      OPENVIBE_M9_INTERPRETER: '/bin/echo',
    } as NodeJS.ProcessEnv)
    expect(runner).not.toBeNull()
    expect(runner?.id).toBe('cat')
    expect(runner?.provider).toBe('local')
  })

  it('**没配过** ⇒ 回退环境变量（保持 M3「走 Pi」与 P5 的既有行为）', async () => {
    const runner = await resolveProviderRunner(db(), {
      OPENVIBE_M9_INTERPRETER: '/bin/echo',
      OPENVIBE_M9_INTERPRETER_MODEL: 'm1',
      OPENVIBE_M9_INTERPRETER_PROVIDER: 'p1',
    } as NodeJS.ProcessEnv)
    expect(runner).not.toBeNull()
    expect(runner?.model).toBe('m1')
  })

  it('⚠️ **配坏了也不回退环境变量**（配了要看得见，不能悄悄换一个源）', async () => {
    const d = db()
    writeProviderCollection(d, collection([entry({ enabled: true, kind: 'command', cmd: '' })]))
    const runner = await resolveProviderRunner(d, {
      OPENVIBE_M9_INTERPRETER: '/bin/echo',
    } as NodeJS.ProcessEnv)
    expect(runner).toBeNull()
  })
})

describe('M9 · provider 配置层 · 三档能力探测（不许塌成一个兜底）', () => {
  it('没配过且没有环境变量 ⇒ `unconfigured` ＋ 说清去哪配', async () => {
    const r = await resolveProvider(db(), {} as NodeJS.ProcessEnv)
    expect(r.status).toBe('unconfigured')
    expect(r.runner).toBeNull()
    expect(r.detail).not.toBe('')
    expect(r.detail).toContain('AI 解读')
  })

  it('配了但**关着** ⇒ `unconfigured`（且说清是「关着」不是「没配」）', async () => {
    const d = db()
    writeProviderCollection(d, collection([entry({ enabled: false })]))
    const r = await resolveProvider(d, {} as NodeJS.ProcessEnv)
    expect(r.status).toBe('unconfigured')
    expect(r.detail).toContain('已关闭')
  })

  it('命令形态：**命令不存在** ⇒ `misconfigured`（说清是「找不到命令」）', async () => {
    const d = db()
    writeProviderCollection(
      d,
      collection([entry({ enabled: true, kind: 'command', cmd: 'definitely-not-a-real-cmd-xyz' })]),
    )
    const r = await resolveProvider(d, {} as NodeJS.ProcessEnv)
    expect(r.status).toBe('misconfigured')
    expect(r.runner).toBeNull()
    expect(r.detail).toContain('找不到命令')
  })

  it('命令形态：**命令存在** ⇒ `ready`', async () => {
    if (process.platform === 'win32') return // /bin/echo 是 POSIX 路径——win32 门控（README 既有纪律：CI win 腿不构成 POSIX 语义用例的证据）
    const d = db()
    writeProviderCollection(
      d,
      collection([entry({ enabled: true, kind: 'command', cmd: '/bin/echo' })]),
    )
    const r = await resolveProvider(d, {} as NodeJS.ProcessEnv)
    expect(r.status).toBe('ready')
    expect(r.runner).not.toBeNull()
  })

  it('HTTP 形态：**端点为空** ⇒ `misconfigured`', async () => {
    const d = db()
    writeProviderCollection(
      d,
      collection([entry({ enabled: true, kind: 'openai_http', endpoint: '' })]),
    )
    const r = await resolveProvider(d, {} as NodeJS.ProcessEnv)
    expect(r.status).toBe('misconfigured')
    expect(r.detail).toContain('端点')
  })

  it('HTTP 形态：**云端端点却没配 key** ⇒ `misconfigured`（并说清本地不需要）', async () => {
    const d = db()
    writeProviderCollection(
      d,
      collection([
        entry({
          enabled: true,
          kind: 'openai_http',
          endpoint: 'https://api.example.com/v1/chat/completions',
        }),
      ]),
    )
    const r = await resolveProvider(d, {} as NodeJS.ProcessEnv)
    expect(r.status).toBe('misconfigured')
    expect(r.detail).toContain('API key')
  })

  it('HTTP 形态：**本机端点**（没 key 也算数）⇒ `ready`', async () => {
    const d = db()
    writeProviderCollection(
      d,
      collection([
        entry({
          enabled: true,
          kind: 'openai_http',
          endpoint: 'http://127.0.0.1:11434/v1/chat/completions',
        }),
      ]),
    )
    const r = await resolveProvider(d, {} as NodeJS.ProcessEnv)
    expect(r.status).toBe('ready')
    expect(r.runner).not.toBeNull()
  })

  it('⚠️ `available` **恒等于** status 为 ready（两个字段不许各说各话）', () => {
    const cases: ProviderResolution[] = [
      { runner: null, status: 'unconfigured', detail: 'x' },
      { runner: null, status: 'misconfigured', detail: 'x' },
    ]
    for (const c of cases) {
      const cap = capabilityOf(c)
      expect(cap.available).toBe(false)
      expect(cap.status).toBe(c.status)
    }
    const ready = capabilityOf({
      runner: { id: 'r1', model: 'm', provider: 'p', interpret: async () => ({}) as never },
      status: 'ready',
      detail: 'x',
    })
    expect(ready.available).toBe(true)
    expect(ready.runner_id).toBe('r1')
  })
})

describe('M9 · provider 配置层 · 端点判定的两个小工具', () => {
  it('本机端点判定（127.0.0.1 / localhost / ::1 都算本机）', () => {
    expect(isLocalEndpoint('http://127.0.0.1:11434/v1/chat/completions')).toBe(true)
    expect(isLocalEndpoint('http://localhost:1234/v1')).toBe(true)
    expect(isLocalEndpoint('http://[::1]:1234/v1')).toBe(true)
    expect(isLocalEndpoint('https://api.example.com/v1')).toBe(false)
  })

  it('端点合法性（只认 http/https）', () => {
    expect(isValidEndpoint('http://127.0.0.1:11434/v1')).toBe(true)
    expect(isValidEndpoint('https://api.example.com/v1')).toBe(true)
    expect(isValidEndpoint('ftp://x/y')).toBe(false)
    expect(isValidEndpoint('不是 URL')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 批次 D · API key 走系统钥匙串（降级路径也必须被断到）
// ---------------------------------------------------------------------------

describe('M9 · provider 配置层 · key 存在哪（钥匙串 / 明文降级）', () => {
  it('① ⚠️ **老配置**（只有明文 key、没有存储标记）⇒ 认成 `inline`（不许说成在钥匙串里）', () => {
    const d = db()
    // ⚠️ **手工写一份「旧版形状」**（没有 api_key_storage 那一列）
    new AppMetaRepo(d).write(APP_META_KEYS.langInterpretProvider, {
      enabled: true,
      kind: 'openai_http',
      cmd: '',
      args: [],
      endpoint: 'https://api.example.com/v1/chat/completions',
      model: 'm',
      provider: 'p',
      api_key: 'sk-legacy-9999',
      timeout_ms: 30_000,
    })
    const { collection: c } = readProviderCollection(d)
    expect(c.providers).toHaveLength(1)
    expect(c.providers[0]?.api_key_storage).toBe('inline')
    expect(c.providers[0]?.api_key).toBe('sk-legacy-9999')
  })

  it('② 存储位置的三档**人话说明**都非空（界面照着显示）', () => {
    expect(apiKeyStorageDetail('keychain')).toContain('钥匙串')
    expect(apiKeyStorageDetail('inline')).toContain('明文')
    expect(apiKeyStorageDetail('none')).toContain('没有配置')
  })

  it('③ ⚠️ **钥匙串模式** ⇒ 实际那把 key 从钥匙串读（配置里不留全文）', async () => {
    const store = memoryKeychainStore()
    await store.store('svc', 'api-key', 'sk-from-keychain-1234')
    const config = cfg({ enabled: true, api_key_storage: 'keychain', api_key: '' })
    const key = await resolveApiKey(config, store)
    expect(key).toBe('sk-from-keychain-1234')
    // ⚠️ 视图里仍然只有末 4 位
    const view = providerConfigView(config, key)
    expect(view.has_api_key).toBe(true)
    expect(view.api_key_hint).toBe('1234')
    expect(view.api_key_storage).toBe('keychain')
    expect(JSON.stringify(view)).not.toContain('from-keychain')
  })

  it('④ ⚠️ **钥匙串里读不到** ⇒ 空串（不是抛错 ⇒ 上层说「钥匙串里没有这把 key」）', async () => {
    const store = memoryKeychainStore()
    const key = await resolveApiKey(cfg({ api_key_storage: 'keychain' }), store)
    expect(key).toBe('')
  })

  it('⑤ ⚠️ **降级路径**：钥匙串不可用 ⇒ 明文存（且**必须被标成 inline**）', async () => {
    const store = memoryKeychainStore({ failWith: '本机不是 macOS' })
    const support = await store.support()
    expect(support.available).toBe(false)
    const written = await store.store('svc', 'api-key', 'sk-plain-0000')
    expect(written.ok).toBe(false)
    // ⇒ 降级时 key 只能留在配置里（明文）⇒ 存储标记**必须**是 inline
    const config = cfg({ api_key_storage: 'inline', api_key: 'sk-plain-0000' })
    expect(config.api_key_storage).toBe('inline')
    expect(providerConfigView(config, 'sk-plain-0000').api_key_storage_detail).toContain('明文')
  })
})

// ---------------------------------------------------------------------------
// 增强 2 · 多份 provider 配置并存（按项目 / 按接口形态选）
// ---------------------------------------------------------------------------

describe('M9 · provider 配置层 · 增强 2 · 多份并存', () => {
  it('① ⚠️ **老配置（单条）读成「单元素集合」**（**老配置不许丢**）', () => {
    const d = db()
    new AppMetaRepo(d).write(APP_META_KEYS.langInterpretProvider, {
      enabled: true,
      kind: 'command',
      cmd: '/bin/echo',
      args: [],
      endpoint: '',
      model: 'm',
      provider: 'p',
      api_key: '',
      api_key_storage: 'none',
      timeout_ms: 30_000,
    })
    const { collection: c, configured } = readProviderCollection(d)
    expect(configured).toBe(true)
    expect(c.providers).toHaveLength(1)
    expect(c.providers[0]?.cmd).toBe('/bin/echo')
    // ⚠️ 老配置那一份的 id 是固定的（**钥匙串账号也用它** ⇒ 老 key 不丢）
    expect(c.providers[0]?.id).toBe(LEGACY_PROVIDER_ID)
    expect(c.default_provider_id).toBe(LEGACY_PROVIDER_ID)
  })

  it('② ⚠️ **老配置那一把 key 还在原来的钥匙串账号下**（不丢）', () => {
    expect(keychainAccount(LEGACY_PROVIDER_ID)).toBe('api-key')
    // ⚠️ **多份各自分账号**（否则两份会互相覆盖对方的 key）
    expect(keychainAccount('p-2')).toBe('api-key:p-2')
    expect(keychainAccount('p-2')).not.toBe(keychainAccount('p-3'))
  })

  it('③ ⚠️ **选哪一份**：显式 id > 按项目绑定 > 默认', () => {
    const c = collection(
      [
        entry({ id: 'p1', name: '默认那份', enabled: true, projects: [] }),
        entry({ id: 'p2', name: '绑了 pX 的那份', enabled: true, projects: ['pX'] }),
      ],
      'p1',
    )
    // ① 显式 id
    expect(selectProviderEntry(c, { providerId: 'p2' })).toMatchObject({
      kind: 'entry',
      reason: 'explicit',
      entry: { id: 'p2' },
    })
    // ② 按项目
    expect(selectProviderEntry(c, { projectId: 'pX' })).toMatchObject({
      kind: 'entry',
      reason: 'project',
      entry: { id: 'p2' },
    })
    // ③ 都没命中 ⇒ 默认那一份
    expect(selectProviderEntry(c, { projectId: 'pY' })).toMatchObject({
      kind: 'entry',
      reason: 'default',
      entry: { id: 'p1' },
    })
  })

  it('④ ⚠️ **显式指定的那一份不存在** ⇒ `missing`（与「压根没配」分开）', () => {
    const c = collection([entry({ id: 'p1' })], 'p1')
    expect(selectProviderEntry(c, { providerId: 'p-nope' })).toEqual({
      kind: 'missing',
      providerId: 'p-nope',
    })
  })

  it('⑤ ⚠️ **绑定了项目但被关掉** ⇒ 不用它（落到默认那一份）', () => {
    const c = collection(
      [entry({ id: 'p1', projects: [] }), entry({ id: 'p2', enabled: false, projects: ['pX'] })],
      'p1',
    )
    expect(selectProviderEntry(c, { projectId: 'pX' })).toMatchObject({
      kind: 'entry',
      reason: 'default',
      entry: { id: 'p1' },
    })
  })

  it('⑥ ⚠️ **按项目选**时，runner 真的是那一份（不是默认那份）', async () => {
    const d = db()
    writeProviderCollection(
      d,
      collection(
        [
          entry({
            id: 'p1',
            enabled: true,
            kind: 'command',
            cmd: '/bin/echo',
            provider: 'default-one',
          }),
          entry({
            id: 'p2',
            enabled: true,
            kind: 'command',
            cmd: '/bin/cat',
            provider: 'bound-one',
            projects: ['pX'],
          }),
        ],
        'p1',
      ),
    )
    const runner = await resolveProviderRunner(d, {} as NodeJS.ProcessEnv, undefined, {
      projectId: 'pX',
    })
    expect(runner?.provider).toBe('bound-one')
    // ⚠️ **显式 id 优先级更高**（压过项目绑定）
    const byId = await resolveProviderRunner(d, {} as NodeJS.ProcessEnv, undefined, {
      providerId: 'p1',
      projectId: 'pX',
    })
    expect(byId?.provider).toBe('default-one')
  })

  it('⑦ ⚠️ **多份各有一把 key**（钥匙串项按 id 分账号，互不覆盖）', async () => {
    const store = memoryKeychainStore()
    await store.store('svc', keychainAccount('p1'), 'sk-first-1111')
    await store.store('svc', keychainAccount('p2'), 'sk-second-2222')
    const c = collection(
      [
        entry({ id: 'p1', api_key_storage: 'keychain', api_key: '' }),
        entry({ id: 'p2', api_key_storage: 'keychain', api_key: '' }),
      ],
      'p1',
    )
    const view = await providerCollectionView(c, store)
    expect(view.providers[0]?.api_key_hint).toBe('1111')
    expect(view.providers[1]?.api_key_hint).toBe('2222')
    // ⚠️ 视图里**没有全文**
    expect(JSON.stringify(view)).not.toContain('sk-first')
    expect(JSON.stringify(view)).not.toContain('sk-second')
  })

  it('⑧ ⚠️ **集合视图**带上 id / 名称 / 绑定项目（界面要按这些分组）', async () => {
    const c = collection([entry({ id: 'p1', name: '云端', projects: ['pA', 'pB'] })], 'p1')
    const view = await providerCollectionView(c, memoryKeychainStore())
    expect(view.default_provider_id).toBe('p1')
    expect(view.providers[0]?.id).toBe('p1')
    expect(view.providers[0]?.name).toBe('云端')
    expect(view.providers[0]?.projects).toEqual(['pA', 'pB'])
    // ⚠️ **单份视图**也是同一套字段（口径单处）
    expect(providerEntryView(c.providers[0]!, '').id).toBe('p1')
  })

  it('⑨ ⚠️ **显式指定不存在的那一份** ⇒ 能力探测说「找不到这份配置」（不是「没配」）', async () => {
    const d = db()
    writeProviderCollection(d, collection([entry({ id: 'p1', enabled: true, cmd: '/bin/echo' })]))
    const r = await resolveProvider(d, {} as NodeJS.ProcessEnv, undefined, { providerId: 'p-nope' })
    expect(r.status).toBe('misconfigured')
    expect(r.detail).toContain('找不到这份 provider 配置')
  })
})
