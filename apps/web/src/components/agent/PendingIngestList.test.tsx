import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PendingIngestList } from './PendingIngestList'
import type { AgentIngestItem } from '../../hooks/useAgentIngests'

/**
 * 裁决控件的唯一出处（候选 2：AgentPage 复用本组件）。
 *
 * 断言意图而非表象：
 * - pending 是「这条要不要入库」（FR-2.5 的人工确认门）⇒ 必须能确认 / 拒绝；
 * - conflict 是「同键异载荷留哪条」（FR-5.6）⇒ 只给二选一，**不给**确认 / 拒绝；
 * - 两类动作都走既有 review 端点，不新增合并端点（FR-5.6.2）。
 */

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }))
vi.stubGlobal('fetch', fetchMock)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderList(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <PendingIngestList projectId="p1" onGoToInstall={() => undefined} />
    </QueryClientProvider>,
  )
}

function item(over: Partial<AgentIngestItem>): AgentIngestItem {
  return {
    id: 'i1',
    projectId: 'p1',
    kind: 'dev_log',
    status: 'pending',
    sourcePlatform: 'trae',
    sourceSessionId: null,
    rejectReason: null,
    createdAt: '2026-11-01T10:00:00Z',
    reviewedAt: null,
    payload: { title: '回流一条日志' },
    ...over,
  }
}

function mockGet(items: AgentIngestItem[]): void {
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (init?.method === 'POST') {
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }
    if (url.includes('/agent-ingests')) {
      return new Response(JSON.stringify({ items, total: items.length }), { status: 200 })
    }
    return new Response('{}', { status: 200 })
  })
}

describe('PendingIngestList · 裁决控件', () => {
  it('pending 行给「确认 / 拒绝」，点确认走既有 review 端点（FR-2.5）', async () => {
    mockGet([item({})])
    renderList()

    const confirm = await screen.findByRole('button', { name: '确认' })
    expect(screen.getByRole('button', { name: '拒绝' })).toBeTruthy()
    fireEvent.click(confirm)

    await waitFor(() =>
      expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/review'))).toBe(true),
    )
    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('/review'))
    expect(String(call?.[0])).toBe('/api/agent/ingests/i1/review')
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ to: 'published', reason: null })
  })

  it('conflict 行只给「保留先到的那条 / 接受本条并改幂等键重试」，不给确认 / 拒绝（FR-5.6）', async () => {
    mockGet([item({ id: 'c1', status: 'conflict', payload: { title: '同键异载荷' } })])
    renderList()

    expect(await screen.findByRole('button', { name: '冲突详情' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '确认' })).toBeNull()
    expect(screen.queryByRole('button', { name: '拒绝' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '冲突详情' }))
    expect(screen.getByRole('button', { name: '保留先到的那条' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '接受本条并改幂等键重试' })).toBeTruthy()
  })

  it('空队列 ⇒ empty 态的 CTA 是「让 agent 接入」（可点动作，不是文案）', async () => {
    mockGet([])
    renderList()
    const cta = await screen.findByRole('button', { name: '让 agent 接入' })
    expect(cta).toBeTruthy()
  })
})
