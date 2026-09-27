import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiJson } from './client'

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
    await apiJson('/api/settings/telemetry', { method: 'POST', body: { enabled: false }, keepalive: true })
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
