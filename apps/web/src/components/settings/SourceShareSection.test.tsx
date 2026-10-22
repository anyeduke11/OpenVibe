import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

let requestedUrls: string[] = []

beforeEach(() => {
  requestedUrls = []
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function mockSummary(
  items: unknown[],
  daily: unknown[] = [],
  byProvider: unknown[] = [],
): void {
  fetchMock.mockImplementation(async (url: string) => {
    requestedUrls.push(String(url))
    if (String(url).includes('/api/lang/source/share-daily')) {
      return new Response(JSON.stringify({ daily }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    if (String(url).includes('/api/lang/source/share-by-provider')) {
      return new Response(JSON.stringify({ groups: byProvider }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
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

  it('④ **按日明细**是折叠的，展开后才请求（**显式绝对窗口** ⇒ 不随日历漂移）', async () => {
    mockSummary(SUMMARIES, [
      {
        day: '2026-10-21',
        project_id: 'p1',
        share_count: 2,
        snippet_total: 8,
        memory_applied_count: 1,
        user_reticked_count: 0,
        self_ticked_count: 1,
      },
    ])
    renderSection()

    // ⚠️ **默认不请求**（不展开就不该发）
    await waitFor(() => expect(screen.getByText('出网 3 次')).toBeTruthy())
    expect(requestedUrls.some((u) => u.includes('share-daily'))).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: '展开按日明细' }))
    await waitFor(() => {
      expect(requestedUrls.some((u) => u.includes('share-daily?from='))).toBe(true)
    })
    expect(await screen.findByText('2026-10-21')).toBeTruthy()
    expect(screen.getByText(/记忆带过去 1 次 · 自己又全勾 0 次 · 用户自己勾 1 次/)).toBeTruthy()
  })
  it('⑤ ⚠️ **按 provider 分组**是折叠的，展开后才请求（**显式绝对窗口**）', async () => {
    mockSummary(SUMMARIES)
    renderSection()

    await waitFor(() => expect(screen.getByText('出网 3 次')).toBeTruthy())
    // ⚠️ **默认不请求**（不展开就不该发）
    expect(requestedUrls.some((u) => u.includes('share-by-provider'))).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: '展开按 provider 分组' }))
    await waitFor(() => {
      expect(requestedUrls.some((u) => u.includes('share-by-provider?from='))).toBe(true)
    })
  })

  it('⑥ ⚠️ **分组表显示「哪一家 ＋ 哪个模型 ＋ 几次 ＋ 多少 token」**', async () => {
    mockSummary(SUMMARIES, [], [
      {
        provider: 'sensenova',
        model: 'deepseek-v4-flash',
        share_count: 2,
        snippet_total: 5,
        usage_total_tokens: 200,
        usage_known_count: 2,
      },
    ])
    renderSection()

    fireEvent.click(screen.getByRole('button', { name: '展开按 provider 分组' }))
    expect(await screen.findByText('sensenova')).toBeTruthy()
    expect(screen.getByText('deepseek-v4-flash')).toBeTruthy()
    expect(screen.getByText('出网 2 次')).toBeTruthy()
    expect(screen.getByText('用量 200 token')).toBeTruthy()
  })

  it('⑦ ⚠️ **「未知」那一组必须显示出来**（provider 改过 ⇒ 改之前出的网没有标识）', async () => {
    mockSummary(SUMMARIES, [], [
      {
        provider: '',
        model: '',
        share_count: 1,
        snippet_total: 1,
        usage_total_tokens: null,
        usage_known_count: 0,
      },
    ])
    renderSection()

    fireEvent.click(screen.getByRole('button', { name: '展开按 provider 分组' }))
    // ⚠️ **不许并进现在这家** ⇒ 必须有一行叫「未知」
    expect(await screen.findByText('未知')).toBeTruthy()
    // ⚠️ **没有用量 ⇒ 说「用量未知」，不是「用量 0 token」**
    expect(screen.getByText('用量未知')).toBeTruthy()
  })

  it('⑧ ⚠️ **部分已知 ⇒ 说清「已知 N/M 次」**（不许把不知道的当 0）', async () => {
    mockSummary(SUMMARIES, [], [
      {
        provider: 'agnes',
        model: 'agnes-3.0-flash',
        share_count: 3,
        snippet_total: 4,
        usage_total_tokens: 100,
        usage_known_count: 1,
      },
    ])
    renderSection()

    fireEvent.click(screen.getByRole('button', { name: '展开按 provider 分组' }))
    expect(await screen.findByText('agnes')).toBeTruthy()
    expect(screen.getByText(/（已知 1\/3 次）/)).toBeTruthy()
  })
})
