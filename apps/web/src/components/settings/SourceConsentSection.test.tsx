import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SourceConsentSection } from './SourceConsentSection'

/**
 * M9 v1.6 **P4.5 出口 · DL-21 的设置页那一半**（`m9-dev-plan-2026-10.md` §6.10 P4.5 ·
 * `m9-dev-language-roadmap.md` §3.9 / §7 DL-21）。
 *
 * ## 它断什么
 *
 * DL-21 原文：「走一遍「记住全发」⇒ **设置页清除** ⇒ 下次扫描必须全不勾」。
 * ⇒ 「清除」这个动作必须有一个**用户找得到的地方** —— 设置页是「本机状态」的归口。
 * ⇒ 本文件断的正是那个地方**存在、且逐项目可清**。
 *
 * ## ⚠️ 数据从 `fetch` 进来（不是替掉 hook）
 *
 * 这一层用的是 react-query ＋ `apiJson` ⇒ 直接 stub `fetch`，
 * 这样**取数与清除都真的走一遍 HTTP 形状**（URL、方法都对）。
 */
const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }))

const CONSENTS = [
  {
    project_id: 'p1',
    remember_all: true,
    remembered_at: '2026-10-21T00:00:00.000Z',
  },
  {
    project_id: 'p2',
    remember_all: false,
    remembered_at: '2026-10-21T01:00:00.000Z',
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

function mockList(items: unknown[]): void {
  fetchMock.mockImplementation(async (url: string, init?: { method?: string }) => {
    if (init?.method === 'DELETE') {
      return new Response(JSON.stringify({ cleared: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    if (String(url).includes('/api/lang/source/consents')) {
      return new Response(JSON.stringify({ consents: items }), {
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
      <SourceConsentSection />
    </QueryClientProvider>,
  )
}

describe('M9 P4.5 · DL-21 · 设置页「源码授权记忆」区', () => {
  it('① 区在设置页里，且列出**记住过哪些项目**', async () => {
    mockList(CONSENTS)
    renderSection()

    expect(screen.getByRole('heading', { name: '源码授权记忆' })).toBeTruthy()
    await waitFor(() => {
      expect(screen.getByText('p1')).toBeTruthy()
    })
    expect(screen.getByText('p2')).toBeTruthy()
    // 两档记忆的显示不同（用户要看得清自己记住了哪一种）
    expect(screen.getByText('记住「全发」')).toBeTruthy()
    expect(screen.getByText('记住「全不发」')).toBeTruthy()
  })

  it('② ⚠️ 每个项目**各自**能清（清除入口必须逐项目）', async () => {
    mockList(CONSENTS)
    renderSection()

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /清除/ })).toHaveLength(2)
    })
    fireEvent.click(screen.getAllByRole('button', { name: /清除/ })[0] as HTMLElement)

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        (c) => (c[1] as { method?: string })?.method === 'DELETE',
      )
      expect(call, '必须真的发出一次 DELETE').toBeTruthy()
      expect(String(call?.[0])).toBe('/api/lang/source/consent?project=p1')
    })
  })

  it('③ 一个都没记住过时，明确说「还没有」', async () => {
    mockList([])
    renderSection()
    await waitFor(() => {
      expect(screen.getByText('还没有任何项目被记住过。')).toBeTruthy()
    })
  })
})
