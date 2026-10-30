import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SkillCleanupBrokenDialog } from './SkillCleanupBrokenDialog'

/**
 * 「清理失效条目」对话框的**预检时机**（真机实测 2026-10-30 发现的缺陷）。
 *
 * ## 它断什么、为什么必须断
 *
 * 预检结论 = 「此刻磁盘上哪些 skill 目录已经没了」。它的有效期由**磁盘**决定，不由时间决定。
 *
 * 缺陷形态：预检走 react-query 缓存（staleTime 15s），而查询在**页面挂载时**就发起了
 * （对话框常驻挂载，只切换 open）⇒ 用户在别处删掉目录后再打开对话框，看到的仍是
 * 页面加载那一刻的快照 ⇒ 报「没有失效条目」，而服务端此刻已能报出失效条目。
 *
 * ⇒ 钉的是「**打开对话框时必须重新向服务端要一次预检**」，
 *   不是「界面长什么样」——界面长什么样由上面那支组件测无关。
 *
 * 取数真的走一遍 HTTP 形状（stub `fetch`）—— 与其它 web 层用例同款。
 */

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }))
vi.stubGlobal('fetch', fetchMock)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

/** 一份预检结果：目录已消失、无溯源、无库内副本 ⇒ 彻底丢失（会被清理）。 */
const STALE_ONE = {
  items: [
    {
      id: 'sk_stale1',
      name: 'demo-beta',
      skillDir: '/tmp/ov-skills-scan/demo-beta',
      downloadable: false,
      backedUp: false,
      unrecoverable: true,
    },
  ],
  summary: { stale: 1, unrecoverable: 1, recoverable: 0 },
}

const EMPTY = { items: [], summary: { stale: 0, unrecoverable: 0, recoverable: 0 } }

const renderDialog = (open: boolean): void => {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <SkillCleanupBrokenDialog open={open} onClose={() => {}} />
    </QueryClientProvider>,
  )
}

/** 预检请求的次数（`GET /api/skills/cleanup`） */
const previewCalls = (): number =>
  fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/api/skills/cleanup')).length

describe('清理失效条目对话框 · 预检时机', () => {
  it('打开对话框时向服务端要一次预检（不是吃页面加载时的旧快照）', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(STALE_ONE), { status: 200 }))
    renderDialog(true)

    await waitFor(() => expect(screen.getByText('demo-beta')).toBeTruthy())
    expect(previewCalls()).toBe(1)
    // 结论来自服务端这一次的应答
    expect(screen.getByText(/目录已消失 1 条/)).toBeTruthy()
  })

  it('⚠️ 预检结论会过期 ⇒ 重新打开必须重新算（不得沿用上一次的名单）', async () => {
    // 第一次打开：服务端说没有失效条目
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(EMPTY), { status: 200 }))
    const { unmount } = render(
      <QueryClientProvider client={new QueryClient()}>
        <SkillCleanupBrokenDialog open onClose={() => {}} />
      </QueryClientProvider>,
    )
    await waitFor(() => expect(screen.getByText('没有失效条目')).toBeTruthy())
    unmount()

    // 第二次打开：服务端已经能报出一条（用户在别处删掉了目录）
    fetchMock.mockResolvedValue(new Response(JSON.stringify(STALE_ONE), { status: 200 }))
    renderDialog(true)
    await waitFor(() => expect(screen.getByText('demo-beta')).toBeTruthy())
    expect(previewCalls()).toBe(2)
  })

  it('对话框关着时不发预检请求（预检只在打开时算）', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(EMPTY), { status: 200 }))
    renderDialog(false)
    await waitFor(() => expect(previewCalls()).toBe(0))
  })
})
