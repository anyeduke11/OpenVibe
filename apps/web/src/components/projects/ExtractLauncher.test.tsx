import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { DevLogOut } from '@openvibe/shared'
import { ExtractLauncher } from './ExtractLauncher'

/**
 * M10/D 日志区提取入口的组件腿（spec `v023-d-ai-extract.md` FR-1）：
 * 三条件渲染（总闸关 ⇒ 整体不渲染，DL-08）、多选 → 确认屏（展示确切待发内容）、
 * 结果态（候选计数 / 锚定丢弃数）。取数走 stub fetch 的真实 HTTP 形状。
 */

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }))
vi.stubGlobal('fetch', fetchMock)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const entry = (id: string, title: string, body: string): DevLogOut =>
  ({
    id,
    projectId: 'p1',
    type: 'DEV',
    entryNo: 1,
    displayNo: 'DEV-0001',
    title,
    body,
    relatedFiles: [],
    evidence: null,
    linkedAssetIds: [],
    createdAt: '2026-10-24',
    author: null,
  }) as unknown as DevLogOut

const renderLauncher = (entries: DevLogOut[]): void => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <ExtractLauncher projectId="p1" entries={entries} />
    </QueryClientProvider>,
  )
}

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status })

describe('ExtractLauncher（日志区提取入口）', () => {
  it('EXT-W1: 总闸关 ⇒ 整体不渲染（DL-08：不渲染失败态）', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ enabled: false }))
    renderLauncher([entry('l1', '踩坑', '正文')])
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(screen.queryByText(/提取候选/)).toBeNull()
  })

  it('EXT-W2: 闸开 + 多选两条 → 确认屏展示确切待发内容 → 提交后显示候选计数', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/extract/gate')) return jsonResponse({ enabled: true })
      if (url.includes('/api/extract/consents')) return jsonResponse({ consents: [] })
      if (url.includes('/api/extract') && String(input).includes('api/extract')) {
        return jsonResponse({
          status: 'ok',
          provider: 'fake',
          candidateCount: 3,
          passedCount: 2,
          droppedCount: 1,
          ingested: [],
          dropped: [],
          warnings: [],
        })
      }
      return jsonResponse({})
    })
    renderLauncher([entry('l1', '环境型红', '与环境负载相关'), entry('l2', '回归套路', '先复现')])

    await waitFor(() => expect(screen.getByRole('button', { name: /提取候选/ })).toBeTruthy())
    // 未选 ⇒ 按钮禁用；勾两条后可点
    const launch = screen.getByRole('button', { name: /提取候选/ })
    expect((launch as HTMLButtonElement).disabled).toBe(true)
    const boxes = screen.getAllByRole('checkbox')
    fireEvent.click(boxes[0]!)
    fireEvent.click(boxes[1]!)
    expect((launch as HTMLButtonElement).disabled).toBe(false)

    fireEvent.click(launch)
    await waitFor(() => expect(screen.getByText(/确认出网提取/)).toBeTruthy())
    // 确认屏展示两条日志的标题与正文预览（红线 3：出网前展示确切内容）
    expect(screen.getAllByText(/环境型红/).length).toBeGreaterThan(1) // 列表行 + 确认屏预览各一处
    expect(screen.getByText(/先复现/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /提取并记住/ }))
    await waitFor(() => expect(screen.getByText(/2 条进入待确认队列/)).toBeTruthy())
    // POST 真的打到 /api/extract 且带 confirm
    const calls = fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/api/extract'))
    expect(calls.length).toBe(1)
    const rawBody = calls[0]?.[1]?.body
    const body =
      typeof rawBody === 'string'
        ? JSON.parse(rawBody)
        : (rawBody as { confirm: boolean; remember: boolean; log_ids: string[] })
    expect(body.confirm).toBe(true)
    expect(body.remember).toBe(true)
    expect(body.log_ids).toEqual(['l1', 'l2'])
  })
})
