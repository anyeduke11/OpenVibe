import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DiscussBlock } from './DiscussBlock'

/**
 * AN2 · 问块组件腿（spec FR-3）：闸关不渲染（DL-08）；提交后回答逐段渲染 +
 * 来源徽标（下标:段名）+ 越界引用段无徽标；fetch 走真实 HTTP 形状（stub）。
 */

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }))
vi.stubGlobal('fetch', fetchMock)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const renderBlock = (): void => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <DiscussBlock projectId="p1" />
    </QueryClientProvider>,
  )
}

const OK_BODY = {
  status: 'ok',
  provider: 'fake',
  answer: '阶段一。<ref:0>清单剩 2 项。<ref:9>这段没来源。',
  segments: [
    { text: '阶段一。', source_ref: null },
    { text: '清单剩 2 项。', source_ref: 0 },
    { text: '这段没来源。', source_ref: null },
  ],
  sources: ['stage', 'checklist'],
  truncated: false,
  warnings: [],
}

describe('DiscussBlock（AgentPanel 问块）', () => {
  it('DISC-W1: 总闸关 ⇒ 不渲染（DL-08）', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ enabled: false }), { status: 200 }))
    renderBlock()
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(screen.queryByPlaceholderText(/这个项目现在/)).toBeNull()
  })

  it('DISC-W2: 提交 → 回答逐段渲染，来源段带「0:stage」徽标，越界段无徽标；POST 打到 discuss 端点', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/extract/gate')) return new Response(JSON.stringify({ enabled: true }), { status: 200 })
      if (url.includes('/discuss')) return new Response(JSON.stringify(OK_BODY), { status: 200 })
      return new Response('{}', { status: 200 })
    })
    renderBlock()
    await waitFor(() => expect(screen.getByPlaceholderText(/例如：/)).toBeTruthy())
    fireEvent.change(screen.getByPlaceholderText(/例如：/), { target: { value: '项目到哪了？' } })
    fireEvent.click(screen.getByRole('button', { name: '提问' }))
    await waitFor(() => expect(screen.getByText('清单剩 2 项。')).toBeTruthy())
    expect(screen.getByText('0:stage')).toBeTruthy() // 来源徽标（下标:段名）
    expect(screen.getByText('这段没来源。')).toBeTruthy() // 越界引用段：纯文本、无徽标
    const calls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/discuss'))
    expect(calls).toHaveLength(1)
    const body = JSON.parse(String(calls[0]?.[1]?.body)) as { question: string; confirm: boolean }
    expect(body.question).toBe('项目到哪了？')
    expect(body.confirm).toBe(true)
  })
})
