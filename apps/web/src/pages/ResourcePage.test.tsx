import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ResourcePage } from './ResourcePage'

/**
 * M9 **学习资源页**（owner 2026-10-22 裁定：独立资源页 ＋ 支持筛选）。
 *
 * ## 它断什么
 *
 * | 断的事 | 为什么必须断 |
 * |---|---|
 * | **页面存在**，每条资源带**模式标记** | §3.20：资源页的核心是「这条在精通模式值不值」 |
 * | 筛选条件**真的进了请求** | 筛选没进请求 = 筛选是假的 |
 * | **空态有下一步**（不是「暂无数据」） | DESIGN.md 的 empty-hint 纪律 |
 * | **模式不在这里选** | 模式有固定入口（首屏 ＋ 设置页），两处能改就会不一致 |
 */
const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }))

const PROFILES = [
  { topic_id: 1, profile: 'master', required: 1, rank: 1, est_minutes: 30 },
  { topic_id: 2, profile: 'master', required: 0, rank: 2, est_minutes: 10 },
]

const RESOURCES = [
  {
    id: 1,
    name: 'Python 官方文档',
    url: 'https://docs.python.org',
    summary: 'Python 官方手册',
    category: 'official',
    lang: 'python',
    price: 'free',
    lang_label: 'zh',
    tier: 'a',
    is_fav: false,
    alive: true,
    topic_ids: [1],
    topic_titles: [{ id: 1, title: '知识点 A' }],
    mode_label: '本模式必学',
  },
  {
    id: 2,
    name: 'Go 入门课',
    url: 'https://go.dev/tour',
    summary: 'Go 官方入门',
    category: 'course',
    lang: 'go',
    price: 'free',
    lang_label: 'en',
    tier: 'b',
    is_fav: false,
    alive: true,
    topic_ids: [],
    topic_titles: [],
    mode_label: '仅扩展阅读',
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

function mockCatalog(resources: unknown[] = RESOURCES): void {
  fetchMock.mockImplementation(async (url: string) => {
    requestedUrls.push(String(url))
    return new Response(
      JSON.stringify({
        mode_choice: 'master',
        profile: 'master',
        profiles: PROFILES,
        total: resources.length,
        resources,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  })
}

function renderPage(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <ResourcePage />
    </QueryClientProvider>,
  )
}

describe('M9 · 学习资源页', () => {
  it('渲染出页面，**每条资源带模式标记**（两档）', async () => {
    mockCatalog()
    renderPage()
    expect(await screen.findByText('学习资源')).toBeTruthy()
    expect(await screen.findByText('Python 官方文档')).toBeTruthy()
    // ⚠️ 「本模式必学」在页面上出现多处（副标题 ＋ 筛选按钮 ＋ 每条资源的 chip）
    //   ⇒ 断的是「**至少有一处**」而不是「恰好一处」
    expect((await screen.findAllByText('本模式必学')).length).toBeGreaterThan(0)
    expect((await screen.findAllByText('仅扩展阅读')).length).toBeGreaterThan(0)
  })

  it('⚠️ **筛选条件真的进了请求**（筛选没进请求 = 筛选是假的）', async () => {
    mockCatalog()
    renderPage()
    await screen.findByText('Python 官方文档')
    const input = (await screen.findByLabelText('关键字')) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'python' } })
    await waitFor(() => {
      expect(requestedUrls.some((u) => u.includes('q=python'))).toBe(true)
    })
  })

  it('**分类筛选**也进请求', async () => {
    mockCatalog()
    renderPage()
    await screen.findByText('Python 官方文档')
    const select = (await screen.findByLabelText('分类')) as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'course' } })
    await waitFor(() => {
      expect(requestedUrls.some((u) => u.includes('category=course'))).toBe(true)
    })
  })

  it('**空态**给的是「下一步」，不是「暂无数据」', async () => {
    mockCatalog([])
    renderPage()
    expect(await screen.findByText('没有符合条件的资源。')).toBeTruthy()
    // DESIGN.md：empty-hint 必须带**一个下一步 CTA**
    expect(screen.getByRole('button', { name: /换个关键字/ })).toBeTruthy()
  })

  it('⚠️ **模式不在这一页选**（模式有固定入口：首屏 ＋ 设置页）', async () => {
    mockCatalog()
    renderPage()
    await screen.findByText('Python 官方文档')
    // 只有「模式标记」筛选（全部 / 两档），**没有**模式切换器
    expect(screen.getByRole('button', { name: '全部' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '精通' })).toBeNull()
    expect(screen.queryByRole('button', { name: '速成' })).toBeNull()
  })
})
