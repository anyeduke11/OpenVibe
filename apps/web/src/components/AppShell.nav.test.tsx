import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppShell } from './AppShell'

/**
 * M9 v1.6 **P3.1 出口**（`m9-dev-plan-2026-10.md` §6.9 · `m9-dev-language-roadmap.md` §3.5）。
 *
 * 断侧栏那一项的**位置**，因为位置本身就是规格：
 * 「`NAV` 的 `assets` 组，**紧随「术语」之后**，图标 `compass`」——
 * 放错了组（工程/系统）或放错了次序（术语之前），规格就不成立。
 *
 * ## ⚠️ 为什么断 **DOM 次序**而不是断数组
 *
 * `NAV` 是模块内私有的字面量 ⇒ 断它的源码文本只能证明「源码长这样」，
 * 断 DOM 次序才能证明**用户看到的排列**就是这样。
 */
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const COUNTS = {
  prompts: 1,
  terms: 2,
  playbooks: 3,
  skills: 4,
  flows: 5,
  projects: 6,
  packs: 7,
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(JSON.stringify(COUNTS), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  )
})

function renderShell() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AppShell />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('M9 P3.1 · 侧栏「开发能力」', () => {
  it('在「资产」组里，且**紧随「术语库」之后**', () => {
    const { container } = renderShell()
    const nav = container.querySelector('nav[aria-label="主导航"]')
    expect(nav).not.toBeNull()

    const labels = [...(nav?.querySelectorAll('a > span.flex-1') ?? [])].map(
      (s) => s.textContent ?? '',
    )
    const termsAt = labels.indexOf('术语库')
    const devAt = labels.indexOf('开发能力')

    expect(termsAt).toBeGreaterThanOrEqual(0)
    expect(devAt).toBe(termsAt + 1)
  })

  it('链接指向 /dev', () => {
    const { container } = renderShell()
    const link = [...container.querySelectorAll('nav a')].find(
      (a) => a.textContent?.includes('开发能力'),
    )
    expect(link?.getAttribute('href')).toBe('/dev')
  })

  it('与「术语库」同属「资产」组（不是工程/系统组）', () => {
    const { container } = renderShell()
    const link = [...container.querySelectorAll('nav a')].find(
      (a) => a.textContent?.includes('开发能力'),
    )
    // 结构：<div 组><div 组名/><div 条目容器><a/>…</div></div>
    const groupBox = link?.parentElement?.parentElement
    expect(groupBox?.firstElementChild?.textContent).toBe('资产')
  })

  it('变异腿：把「开发能力」在 DOM 里挪到「术语库」之前 ⇒ 同一条判定式当场不成立', () => {
    const { container } = renderShell()
    const nav = container.querySelector('nav[aria-label="主导航"]')
    const links = [...(nav?.querySelectorAll('a') ?? [])]
    const devLink = links.find((a) => a.textContent?.includes('开发能力'))
    const termsLink = links.find((a) => a.textContent?.includes('术语库'))

    // ⚠️ **真改 DOM 次序**（不是改一个本地数组副本）—— 改完用**同一条判定式**再判一次
    expect(devLink).toBeDefined()
    expect(termsLink).toBeDefined()
    termsLink?.parentElement?.insertBefore(devLink as Node, termsLink as Node)

    const labels = [...(nav?.querySelectorAll('a > span.flex-1') ?? [])].map(
      (s) => s.textContent ?? '',
    )
    // 变异真的生效了吗？—— 先自证，否则「判定式不成立」可能只是因为它压根没在判
    expect(labels.indexOf('开发能力')).toBe(labels.indexOf('术语库') - 1)
    // ⇒ 同一条判定式（紧随术语之后）现在**不成立**
    expect(labels.indexOf('开发能力')).not.toBe(labels.indexOf('术语库') + 1)
  })
})
