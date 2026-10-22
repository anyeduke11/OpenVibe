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

const VIBE = [
  {
    id: 1,
    group: 'tools',
    name: 'Cursor 官方指引',
    url: 'https://cursor.com/docs',
    summary: 'AI 工具官方指引',
    alive: true,
    last_checked_at: '2026-10-19',
    consecutive_fails: 0,
  },
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
    last_checked_at: '2026-10-20',
    consecutive_fails: 0,
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
    last_checked_at: '2026-10-18',
    consecutive_fails: 2,
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
        vibe_resources: VIBE,
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
    // ⚠️ 只有「模式**标记**」筛选（两档），**没有**模式切换器
    //   （「全部」有两个 ⇒ 不断言它，改断**不该存在**的模式切换按钮）
    expect(screen.queryByRole('button', { name: '精通' })).toBeNull()
    expect(screen.queryByRole('button', { name: '速成' })).toBeNull()
    expect(screen.queryByRole('button', { name: '熟悉' })).toBeNull()
    // 模式标记那组是**两档**（§3.20 / DL-39：不许有第三档）
    // ⚠️ 两档的标签在筛选按钮与每条资源的 chip 上都会出现 ⇒ 用 getAllByRole
    expect(screen.getAllByRole('button', { name: '本模式必学' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: '仅扩展阅读' }).length).toBeGreaterThan(0)
  })

  it('⚠️ **速成专区是独立分区**（有分组标签 ＋ 与主清单分开）', async () => {
    mockCatalog()
    renderPage()
    expect(await screen.findByText('速成专区')).toBeTruthy()
    expect(await screen.findByText('Cursor 官方指引')).toBeTruthy()
    // ⚠️ 「AI 工具官方指引」既是摘要又是分组标签 ⇒ 页面上出现两次（不断言恰好一次）
    expect((await screen.findAllByText('AI 工具官方指引')).length).toBeGreaterThan(0)
  })

  it('**失效巡检信息**看得见（巡检日 ＋ 连续失败次数）', async () => {
    mockCatalog()
    renderPage()
    expect(await screen.findByText(/上次巡检 2026-10-18 · 连着失败 2 次/)).toBeTruthy()
    expect(await screen.findByText(/上次巡检 2026-10-20$/)).toBeTruthy()
  })

  it('**只看失效 / 只看精选**都进请求', async () => {
    mockCatalog()
    renderPage()
    await screen.findByText('Python 官方文档')
    fireEvent.click(screen.getByRole('button', { name: '已失效' }))
    await waitFor(() => {
      expect(requestedUrls.some((u) => u.includes('alive=dead'))).toBe(true)
    })
    fireEvent.click(screen.getByRole('button', { name: '只看精选' }))
    await waitFor(() => {
      expect(requestedUrls.some((u) => u.includes('fav=1'))).toBe(true)
    })
  })

  it('**费用 / 界面语言**筛选都进请求', async () => {
    mockCatalog()
    renderPage()
    await screen.findByText('Python 官方文档')
    fireEvent.change((await screen.findByLabelText('费用')) as HTMLSelectElement, {
      target: { value: 'paid' },
    })
    await waitFor(() => {
      expect(requestedUrls.some((u) => u.includes('price=paid'))).toBe(true)
    })
    fireEvent.change((await screen.findByLabelText('界面语言')) as HTMLSelectElement, {
      target: { value: 'en' },
    })
    await waitFor(() => {
      expect(requestedUrls.some((u) => u.includes('lang_label=en'))).toBe(true)
    })
  })
})
