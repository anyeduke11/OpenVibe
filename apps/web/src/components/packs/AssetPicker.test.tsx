import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AssetPicker, type AssetIds } from './AssetPicker'

/**
 * v0.2.4 F8 / R5：资产选择器的「前 200 条代表全部」缺陷。
 *
 * `usePromptAggregates` 固定 `page=1&size=200` ⇒ 第 201 条之后的提示词不可选，
 * 而用户无从得知「还有更多」。判据：达到上限时**明确提示**，而不是静默截断。
 */

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }))
vi.stubGlobal('fetch', fetchMock)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const EMPTY: AssetIds = { promptIds: [], termIds: [], skillIds: [], playbookIds: [] }

function renderPicker(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <AssetPicker value={EMPTY} stale={EMPTY} onChange={() => {}} />
    </QueryClientProvider>,
  )
}

/** 提示词条目（只填组件渲染要用的字段） */
function prompt(i: number): Record<string, unknown> {
  return {
    id: `p${String(i)}`,
    title: `提示词 ${String(i)}`,
    description: '',
    useAs: 'reference',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

/** 按端点分发：提示词走 items/total，其余三栏空 */
function stubFetch(promptItems: unknown[], promptTotal: number): void {
  fetchMock.mockImplementation((path: string) => {
    const url = String(path)
    if (url.includes('/api/prompts')) {
      return Promise.resolve(
        new Response(JSON.stringify({ items: promptItems, total: promptTotal, page: 1 }), {
          status: 200,
        }),
      )
    }
    if (url.includes('/api/terms')) {
      return Promise.resolve(new Response(JSON.stringify({ items: [], total: 0 }), { status: 200 }))
    }
    if (url.includes('/api/skills')) {
      return Promise.resolve(new Response(JSON.stringify({ items: [], total: 0 }), { status: 200 }))
    }
    if (url.includes('/api/playbooks')) {
      return Promise.resolve(new Response(JSON.stringify({ items: [], total: 0 }), { status: 200 }))
    }
    return Promise.resolve(new Response('{}', { status: 404 }))
  })
}

describe('AssetPicker · 截断提示（v0.2.4 F8 / R5）', () => {
  it('① 201 条提示词 ⇒ 显示「仅显示前 200 条（共 201 条）」提示', async () => {
    stubFetch(
      Array.from({ length: 200 }, (_, i) => prompt(i)),
      201,
    )
    renderPicker()
    await waitFor(() => expect(screen.getByText(/仅显示前 200 条（共 201 条）/)).toBeTruthy())
  })

  it('② 200 条以内 ⇒ 不显示截断提示（提示不是恒真）', async () => {
    stubFetch(
      Array.from({ length: 3 }, (_, i) => prompt(i)),
      3,
    )
    renderPicker()
    await waitFor(() => expect(screen.getByText(/提示词（active）（3）/)).toBeTruthy())
    expect(screen.queryByText(/仅显示前/)).toBeNull()
  })
})
