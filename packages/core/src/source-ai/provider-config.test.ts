// `packages/core/src/source-ai/provider-config.test.ts` —— **provider 配置层**的判据测试
// （owner 2026-10-22 裁决一：「增加手动调控设置」＋「支持本地模型和 LLM API 接入」）。
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
//
// ⚠️ **这些是实现层测试，不计入 §7 的五十条判据**（判据数不变，DL-44 守着）。
import { afterEach, describe, expect, it } from 'vitest'
import { newDb, type TestDbHandle } from '../test-support/new-db'
import {
  DEFAULT_PROVIDER_CONFIG,
  capabilityOf,
  isLocalEndpoint,
  isValidEndpoint,
  providerConfigView,
  readProviderConfig,
  resolveProvider,
  resolveProviderRunner,
  writeProviderConfig,
  type ProviderResolution,
} from './provider-config'
import type { InterpretProviderConfig as InterpretProviderConfigType } from '@openvibe/shared'

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

describe('M9 · provider 配置层 · 读写与脱敏', () => {
  it('默认配置是**关**的（DL-08 的下限：没配 ⇒ AI 不可用）', () => {
    expect(DEFAULT_PROVIDER_CONFIG.enabled).toBe(false)
    const { config, configured } = readProviderConfig(db())
    expect(configured).toBe(false)
    expect(config.enabled).toBe(false)
  })

  it('写进去读得出来（**整份覆盖**，不做增量合并）', () => {
    const d = db()
    writeProviderConfig(
      d,
      cfg({ enabled: true, kind: 'openai_http', endpoint: 'http://127.0.0.1:11434/v1/chat/completions', model: 'qwen2.5-coder:7b', provider: 'ollama' }),
    )
    const { config, configured } = readProviderConfig(d)
    expect(configured).toBe(true)
    expect(config.kind).toBe('openai_http')
    expect(config.endpoint).toBe('http://127.0.0.1:11434/v1/chat/completions')
    expect(config.model).toBe('qwen2.5-coder:7b')
  })

  it('⚠️ **key 全文绝不出现在视图里**（只有 `has_api_key` ＋ 末 4 位）', () => {
    const secret = 'sk-THIS-IS-SECRET-123456'
    const view = providerConfigView(cfg({ api_key: secret }))
    // ⚠️ **守卫自证**：先断言「视图里确实没有全文」，否则「找不到全文」可能是**压根没 key**
    expect(view.has_api_key).toBe(true)
    expect(view.api_key_hint).toBe('3456')
    expect(JSON.stringify(view)).not.toContain('THIS-IS-SECRET')
    expect(JSON.stringify(view)).not.toContain(secret)
    // ⚠️ 视图的**形状**里压根没有 api_key 这个字段（类型上就装不下）
    expect(Object.keys(view)).not.toContain('api_key')
  })

  it('没配 key 时 hint 是空串（不是 undefined —— 界面要能直接显示）', () => {
    const view = providerConfigView(cfg())
    expect(view.has_api_key).toBe(false)
    expect(view.api_key_hint).toBe('')
  })
})

describe('M9 · provider 配置层 · 优先级（配置优先，环境变量兜底）', () => {
  it('配置存在但**关着** ⇒ 没有 runner（**不回退环境变量**）', () => {
    const d = db()
    writeProviderConfig(d, cfg({ enabled: false, kind: 'command', cmd: '/bin/echo' }))
    const env = { OPENVIBE_M9_INTERPRETER: '/bin/echo' } as NodeJS.ProcessEnv
    expect(resolveProviderRunner(d, env)).toBeNull()
  })

  it('配置存在且开着 ⇒ 用配置的（**环境变量被忽略**）', () => {
    const d = db()
    writeProviderConfig(d, cfg({ enabled: true, kind: 'command', cmd: '/bin/cat', provider: 'local' }))
    const runner = resolveProviderRunner(d, { OPENVIBE_M9_INTERPRETER: '/bin/echo' } as NodeJS.ProcessEnv)
    expect(runner).not.toBeNull()
    expect(runner?.id).toBe('cat')
    expect(runner?.provider).toBe('local')
  })

  it('**没配过** ⇒ 回退环境变量（保持 M3「走 Pi」与 P5 的既有行为）', () => {
    const runner = resolveProviderRunner(db(), {
      OPENVIBE_M9_INTERPRETER: '/bin/echo',
      OPENVIBE_M9_INTERPRETER_MODEL: 'm1',
      OPENVIBE_M9_INTERPRETER_PROVIDER: 'p1',
    } as NodeJS.ProcessEnv)
    expect(runner).not.toBeNull()
    expect(runner?.model).toBe('m1')
  })

  it('⚠️ **配坏了也不回退环境变量**（配了要看得见，不能悄悄换一个源）', () => {
    const d = db()
    writeProviderConfig(d, cfg({ enabled: true, kind: 'command', cmd: '' }))
    const runner = resolveProviderRunner(d, { OPENVIBE_M9_INTERPRETER: '/bin/echo' } as NodeJS.ProcessEnv)
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
    writeProviderConfig(d, cfg({ enabled: false }))
    const r = await resolveProvider(d, {} as NodeJS.ProcessEnv)
    expect(r.status).toBe('unconfigured')
    expect(r.detail).toContain('已关闭')
  })

  it('命令形态：**命令不存在** ⇒ `misconfigured`（说清是「找不到命令」）', async () => {
    const d = db()
    writeProviderConfig(d, cfg({ enabled: true, kind: 'command', cmd: 'definitely-not-a-real-cmd-xyz' }))
    const r = await resolveProvider(d, {} as NodeJS.ProcessEnv)
    expect(r.status).toBe('misconfigured')
    expect(r.runner).toBeNull()
    expect(r.detail).toContain('找不到命令')
  })

  it('命令形态：**命令存在** ⇒ `ready`', async () => {
    const d = db()
    writeProviderConfig(d, cfg({ enabled: true, kind: 'command', cmd: '/bin/echo' }))
    const r = await resolveProvider(d, {} as NodeJS.ProcessEnv)
    expect(r.status).toBe('ready')
    expect(r.runner).not.toBeNull()
  })

  it('HTTP 形态：**端点为空** ⇒ `misconfigured`', async () => {
    const d = db()
    writeProviderConfig(d, cfg({ enabled: true, kind: 'openai_http', endpoint: '' }))
    const r = await resolveProvider(d, {} as NodeJS.ProcessEnv)
    expect(r.status).toBe('misconfigured')
    expect(r.detail).toContain('端点')
  })

  it('HTTP 形态：**云端端点却没配 key** ⇒ `misconfigured`（并说清本地不需要）', async () => {
    const d = db()
    writeProviderConfig(d, cfg({ enabled: true, kind: 'openai_http', endpoint: 'https://api.example.com/v1/chat/completions' }))
    const r = await resolveProvider(d, {} as NodeJS.ProcessEnv)
    expect(r.status).toBe('misconfigured')
    expect(r.detail).toContain('API key')
  })

  it('HTTP 形态：**本机端点**（没 key 也算数）⇒ `ready`', async () => {
    const d = db()
    writeProviderConfig(d, cfg({ enabled: true, kind: 'openai_http', endpoint: 'http://127.0.0.1:11434/v1/chat/completions' }))
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
    const ready = capabilityOf({ runner: { id: 'r1', model: 'm', provider: 'p', interpret: async () => ({}) as never }, status: 'ready', detail: 'x' })
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
