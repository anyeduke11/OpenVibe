import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiJson } from './client'

// 这支文件钉的是 D13 那个落点的送达保证：askState 只有一次机会，「暂不」之后立刻离开页面时
// 普通 fetch 会被导航掐断（macos runner 上实测停在 unset）。keepalive 是浏览器原生能力，
// 但只有它真进了 fetch 的 init 才算数——所以这里测透传，不测服务端。

type Seen = { path: string; init?: RequestInit }

const stubFetch = (): Seen[] => {
  const seen: Seen[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      seen.push({ path, init })
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
      } as unknown as Response
    }),
  )
  return seen
}

describe('apiJson 的 keepalive 透传', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('显式 keepalive:true 会进 fetch 的 init', async () => {
    const seen = stubFetch()
    await apiJson('/api/settings/telemetry', {
      method: 'POST',
      body: { enabled: false },
      keepalive: true,
    })
    expect(seen[0]?.init?.keepalive).toBe(true)
  })

  it('没写 keepalive 的请求不被偷偷改成活过页面', async () => {
    const seen = stubFetch()
    await apiJson('/api/settings/onboarding', { method: 'POST', body: { done: true } })
    expect('keepalive' in (seen[0]?.init ?? {})).toBe(false)
  })

  it('keepalive:false 与不写同形（不产生 keepalive:false 这种噪声）', async () => {
    const seen = stubFetch()
    await apiJson('/api/stats', { keepalive: false })
    expect('keepalive' in (seen[0]?.init ?? {})).toBe(false)
  })
})

/**
 * 错误文案的中文化闸。
 *
 * **为什么要有这一支**：产品是中文优先（DESIGN.md「中文优先」，dev-plan §5.4
 * 「中文 UI 文案单一来源」）。而 web→server 的链路有两类失败，其原始文案都是
 * **英文机器串**，且措辞随浏览器/代理版本漂移：
 *   ① 传输层失败 → 浏览器抛 `TypeError: Failed to fetch`
 *   ② 非 JSON 错误体 → `res.statusText`（"Internal Server Error"）
 * 它们若原样透出，就会直接印在中文界面上（实测：`请求失败：Failed to fetch`）。
 *
 * **钉的是意图**：界面上不得出现英文机器串。所以断言不能写成「等于当前这句中文」
 * ——那会把实现细节当契约；这里断言的是「**不含英文机器串**」＋「仍是可行动的中文」。
 */
describe('错误文案的中文化', () => {
  afterEach(() => vi.unstubAllGlobals())

  /** 浏览器/代理给的英文机器串清单：出现任何一个即视为漏出实现细节 */
  const MACHINE_STRINGS = [
    'Failed to fetch',
    'Internal Server Error',
    'NetworkError',
    'Load failed',
  ]

  const stubFetchReject = (): void => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
  }

  it('传输层失败（fetch 直接抛错）⇒ 抛 ApiError，且文案不含英文机器串', async () => {
    stubFetchReject()
    const err = await apiJson('/api/terms').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    const message = (err as ApiError).message
    for (const s of MACHINE_STRINGS) expect(message).not.toContain(s)
    expect(message).not.toMatch(/[A-Za-z]/)
  })

  it('传输层失败 ⇒ status 为 0（没有 HTTP 状态码可言），与 4xx/5xx 可区分', async () => {
    stubFetchReject()
    const err = (await apiJson('/api/terms').catch((e: unknown) => e)) as ApiError
    expect(err.status).toBe(0)
    expect(err.code).toBe('TRANSPORT_FAILED')
  })

  it('非 JSON 错误体（代理 500 + text/plain 空体）⇒ 文案不含 statusText 英文', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => {
          throw new SyntaxError('Unexpected end of JSON input')
        },
      })),
    )
    const err = (await apiJson('/api/terms').catch((e: unknown) => e)) as ApiError
    for (const s of MACHINE_STRINGS) expect(err.message).not.toContain(s)
    expect(err.message).not.toMatch(/[A-Za-z]/)
  })

  /**
   * 成功响应但 body 不是合法 JSON —— 这一条守的是**另一个绕过面**。
   *
   * `res.ok` 为真时走的是 `res.json()`，它抛的 `SyntaxError` **不是 ApiError**，
   * 会绕过本文件的归一化边界直达界面（实测形态：`Unexpected token '<'`）。
   */
  it('成功响应但 body 非法 JSON ⇒ 抛 ApiError，文案不含 SyntaxError 英文', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => {
          throw new SyntaxError('Unexpected token \'<\', "<html>"... is not valid JSON')
        },
      })),
    )
    const err = await apiJson('/api/terms').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).code).toBe('INVALID_JSON')
    for (const s of MACHINE_STRINGS) expect((err as ApiError).message).not.toContain(s)
    expect((err as ApiError).message).not.toMatch(/[A-Za-z]/)
  })

  it('server 给了 {code,message} JSON ⇒ 原样透出（server 的话是权威的，不改写）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 422,
        statusText: 'Unprocessable Entity',
        json: async () => ({ code: 'VALIDATION_ERROR', message: '请求参数校验失败' }),
      })),
    )
    const err = (await apiJson('/api/terms').catch((e: unknown) => e)) as ApiError
    expect(err.code).toBe('VALIDATION_ERROR')
    expect(err.message).toBe('请求参数校验失败')
  })

  it('server 的 JSON 里 message 为空串 ⇒ 退回链路层中文，不留一个空标题', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ code: 'INTERNAL', message: '' }),
      })),
    )
    const err = (await apiJson('/api/terms').catch((e: unknown) => e)) as ApiError
    expect(err.message).not.toBe('')
    for (const s of MACHINE_STRINGS) expect(err.message).not.toContain(s)
  })
})

/**
 * **诊断原文通道**（detail）。
 *
 * ## 为什么有这一支
 *
 * 错误有**两个通道**：`message` 是中文人话（用户看到的那句），
 * `detail` 是诊断原文（`EACCES: permission denied` / `getaddrinfo ENOTFOUND …`）。
 *
 * 两者必须分开，但**都不能丢**：
 *  - 混在一起 ⇒ 中文界面漏出英文机器串（本仓明令禁止的那件事）；
 *  - 只留 message ⇒ 排障失去依据（用户看到「无法连接本地服务」，
 *    但不知道是 DNS 挂了还是端口没监听）。
 *
 * 钉的是**两通道各自的去处**：message 进中文文案，detail 进独立字段，
 * 且 detail 为空时**不产生**该字段（无诊断信息不必多写一个字段）。
 */
describe('诊断原文通道（detail）', () => {
  afterEach(() => vi.unstubAllGlobals())

  const stubErrorBody = (body: unknown, status = 502): void => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status,
        statusText: 'Bad Gateway',
        json: async () => body,
      })),
    )
  }

  it('server 给了 detail ⇒ 原样透出（诊断原文不被改写）', async () => {
    stubErrorBody({
      code: 'REMOTE_UNREACHABLE',
      message: '请求远端失败: api.github.com',
      detail: 'getaddrinfo ENOTFOUND api.github.com',
    })
    const err = (await apiJson('/api/skills/remote').catch((e: unknown) => e)) as ApiError
    expect(err.message).toBe('请求远端失败: api.github.com')
    expect(err.detail).toBe('getaddrinfo ENOTFOUND api.github.com')
  })

  it('server 给了 details（结构化数据）⇒ 与 detail（诊断原文）各归各位', async () => {
    stubErrorBody({
      code: 'VALIDATION_ERROR',
      message: '请求参数校验失败',
      details: { fieldErrors: { name: ['必填'] } },
      detail: 'Invalid string',
    })
    const err = (await apiJson('/api/prompts').catch((e: unknown) => e)) as ApiError
    expect(err.details).toEqual({ fieldErrors: { name: ['必填'] } })
    expect(err.detail).toBe('Invalid string')
  })

  it('server 没给 detail ⇒ 该字段不存在（不产生噪声字段）', async () => {
    stubErrorBody({ code: 'NOT_FOUND', message: '项目不存在: p1' })
    const err = (await apiJson('/api/projects/p1').catch((e: unknown) => e)) as ApiError
    expect(err.detail).toBeUndefined()
  })

  it('detail 为空串 ⇒ 视为没有（不产生空字段）', async () => {
    stubErrorBody({ code: 'NOT_FOUND', message: '项目不存在: p1', detail: '' })
    const err = (await apiJson('/api/projects/p1').catch((e: unknown) => e)) as ApiError
    expect(err.detail).toBeUndefined()
  })

  it('传输层失败 ⇒ 链路层中文，detail 为空（浏览器原文不外传）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    const err = (await apiJson('/api/terms').catch((e: unknown) => e)) as ApiError
    expect(err.detail).toBeUndefined()
    expect(err.message).not.toMatch(/[A-Za-z]/)
  })
})
