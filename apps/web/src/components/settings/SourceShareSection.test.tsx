import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SourceShareSection } from './SourceShareSection'

/**
 * M9 **增强 1** · 设置页「源码出网记录」区
 * （`m9-dev-language-roadmap.md` §3.9 · dev-plan §6.11 之后的增强批次）
 *
 * ## 它断什么
 *
 * 判据是「出网计数**要能读到**」——
 * `lang_source_shares` 在 P5 之前只写不读，用户与审计者都看不到「出网过几次」。
 * ⇒ 本文件断的正是「设置页有这一区，且显示的是**实跑出来的数**」。
 *
 * ## ⚠️ 数据从 `fetch` 进来（不是替掉 hook）
 *
 * 与「源码授权记忆」区同款 ⇒ **取数真的走一遍 HTTP 形状**（URL 对不对也一起断）。
 */
const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }))

const SUMMARIES = [
  {
    project_id: 'p1',
    share_count: 3,
    snippet_total: 12,
    topic_total: 5,
    last_shared_at: '2026-10-21T02:00:00.000Z',
    explicit_tick_count: 1,
    remembered_count: 2,
    memory_applied_count: 2,
    user_reticked_count: 0,
  },
  {
    project_id: 'p2',
    share_count: 1,
    snippet_total: 2,
    topic_total: 1,
    last_shared_at: '2026-10-21T01:00:00.000Z',
    explicit_tick_count: 1,
    remembered_count: 0,
    memory_applied_count: 0,
    user_reticked_count: 0,
  },
]

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function mockSummary(items: unknown[]): void {
  fetchMock.mockImplementation(async (url: string) => {
    if (String(url).includes('/api/lang/source/share-summary')) {
      return new Response(JSON.stringify({ summaries: items }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
  })
}

function renderSection(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <SourceShareSection />
    </QueryClientProvider>,
  )
}

describe('M9 增强 1 · 设置页「源码出网记录」区', () => {
  it('① 区在设置页里，且显示**每个项目出网过几次**', async () => {
    mockSummary(SUMMARIES)
    renderSection()

    expect(screen.getByRole('heading', { name: '源码出网记录' })).toBeTruthy()
    await waitFor(() => {
      expect(screen.getByText('p1')).toBeTruthy()
    })
    expect(screen.getByText('p2')).toBeTruthy()
    // ⚠️ **次数是实跑出来的那个数**（不是「1」这种默认值）
    expect(screen.getByText('出网 3 次')).toBeTruthy()
    expect(screen.getByText('出网 1 次')).toBeTruthy()
  })

  it('② 授权来源**细分三类分开显示**（owner 2026-10-22 裁决四：二分分不清「记忆带过去」与「用户自己全勾」）', async () => {
    mockSummary(SUMMARIES)
    renderSection()

    await waitFor(() => {
      // ⚠️ **三类都出现**：记忆带过去 / 自己又全勾 / 用户自己勾
      expect(screen.getByText(/记忆带过去 2 次 · 自己又全勾 0 次 · 用户自己勾 1 次/)).toBeTruthy()
    })
    expect(screen.getByText(/记忆带过去 0 次 · 自己又全勾 0 次 · 用户自己勾 1 次/)).toBeTruthy()
  })

  it('②b ⚠️ **「自己又全勾」与「记忆带过去」是两行**（二分里它们都记成 remembered）', async () => {
    mockSummary([
      {
        project_id: 'p3',
        share_count: 3,
        snippet_total: 9,
        topic_total: 3,
        last_shared_at: '2026-10-22T02:00:00.000Z',
        explicit_tick_count: 1,
        remembered_count: 2,
        memory_applied_count: 1,
        user_reticked_count: 1,
      },
    ])
    renderSection()

    await waitFor(() => {
      expect(screen.getByText(/记忆带过去 1 次 · 自己又全勾 1 次 · 用户自己勾 1 次/)).toBeTruthy()
    })
  })

  it('③ 取数真的打的是那个端点（URL 错 ⇒ 界面就是空的）', async () => {
    mockSummary(SUMMARIES)
    renderSection()

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('share-summary'))
      expect(call, '必须真的打一次 share-summary').toBeTruthy()
    })
  })

  it('④ 从没出网过时，明确说「还没有」', async () => {
    mockSummary([])
    renderSection()
    await waitFor(() => {
      expect(screen.getByText('还没有任何出网记录。')).toBeTruthy()
    })
  })
})
