import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { OmSection } from './SettingsSections'

/**
 * v0.2.3 批次 B RQ5 的设置页那一半：OM1/OM2 两件量具「找得到、读得懂、缺数据时说待采集」。
 * 数据从 `fetch` 进来（react-query + apiJson）⇒ stub `fetch`，取数真的走一遍 HTTP 形状。
 */

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }))
vi.stubGlobal('fetch', fetchMock)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const renderOm = (): void => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <OmSection />
    </QueryClientProvider>,
  )
}

const FULL_OM = {
  density: {
    packId: 'pk_1',
    packName: 'default',
    packVersion: '1.0.0',
    managedTokens: 1200,
    assetCount: 3,
    perAsset: 400,
    top5: [
      { path: 'TERMS.md', tokens: 600 },
      { path: 'CLAUDE.md', tokens: 400 },
    ],
  },
  timeToValue: {
    firstEventAt: '2026-10-24T10:00:00.000Z',
    firstInjectionAt: '2026-10-24T10:05:00.000Z',
    seconds: 300,
  },
  adoption: [
    {
      kind: 'term_candidate',
      roundNo: 2,
      published: 5,
      rejected: 5,
      rate: 0.5,
      below: 1,
    },
  ],
  verifyRate: { total: 3, passed: 2, rate: 0.667 },
}

describe('OmSection（设置页 OM 区）', () => {
  it('OM-W1: 有数据 → 密度行、Top5、时间行齐；必标「估算」', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(FULL_OM), { status: 200 }))
    renderOm()
    await waitFor(() => expect(screen.getByText(/包 default@1\.0\.0/)).toBeTruthy())
    expect(screen.getByText(/1200 token ÷ 3 项资产 ≈ 400 token\/条/)).toBeTruthy()
    expect(screen.getByText(/TERMS\.MD · 600 token/i)).toBeTruthy()
    expect(screen.getByText(/首次注入距首次使用 5 分钟/)).toBeTruthy()
    expect(screen.getByText(/估算/)).toBeTruthy()
    // OM3/OM4 有数据态（1B 批次）：采纳率行与通过率行齐
    expect(screen.getByText(/术语候选 第 2 轮：采纳 5 ／ 驳回 5 · 率 50% · ⚠️ 低于门槛/)).toBeTruthy()
    expect(screen.getByText(/verify 共 3 次：三方一致 2 次 · 通过率 67%/)).toBeTruthy()
    // 取数真的打到了 /api/om
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/om'))).toBe(true)
  })

  it('OM-W2: 空数据 → 四件都显示「待采集」，不显示 0（1B 批次：OM3 采纳率 ＋ OM4 核验通过率并入）', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          density: null,
          timeToValue: { firstEventAt: null, firstInjectionAt: null, seconds: null },
          adoption: null,
          verifyRate: null,
        }),
        { status: 200 },
      ),
    )
    renderOm()
    await waitFor(() => expect(screen.getAllByText(/待采集/).length).toBe(4))
    expect(screen.queryByText(/token\/条/)).toBeNull()
  })
})
