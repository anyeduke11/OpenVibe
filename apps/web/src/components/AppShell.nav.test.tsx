import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppShell } from './AppShell'

/**
 * 侧栏导航的**成长阶段分组**（原型 `灵典-全功能Demo-成长视角-20261107.html` 的 NAV）。
 *
 * 断的是 DOM 次序与分组归属 —— `NAV` 是模块内私有字面量，断源码文本只能证明
 * 「源码长这样」，断 DOM 才能证明**用户看到的排列**就是这样。
 *
 * ## 分组口径
 *
 * 六组：飞轮全景 / 跟随·F0 / 实践·F1 / 作者·F2 / 定标·F3 / 系统。
 * 旧版按功能面切（概览/资产/工程/系统），现按「你在哪一步」切。
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
    vi.fn(
      async () =>
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

/** 组名 → 该组下的条目文案（按 DOM 次序） */
function groups(container: HTMLElement): { name: string; items: string[] }[] {
  const nav = container.querySelector('nav[aria-label="主导航"]')
  const out: { name: string; items: string[] }[] = []
  for (const box of Array.from(nav?.children ?? [])) {
    const name = box.firstElementChild?.textContent ?? ''
    const items = Array.from(box.querySelectorAll('a > span.flex-1')).map(
      (s) => s.textContent ?? '',
    )
    out.push({ name, items })
  }
  return out
}

describe('侧栏 · 成长阶段六组', () => {
  it('六组按 F0 → F3 次序排列', () => {
    const { container } = renderShell()
    const names = groups(container).map((g) => g.name)
    expect(names).toEqual(['飞轮全景', '跟随 · F0', '实践 · F1', '作者 · F2', '定标 · F3', '系统'])
  })

  it('「飞轮全景」在首组且指向 /', () => {
    const { container } = renderShell()
    const gs = groups(container)
    expect(gs[0]?.items).toContain('飞轮全景')
    const link = [...container.querySelectorAll('nav a')].find((a) =>
      a.textContent?.includes('飞轮全景'),
    )
    expect(link?.getAttribute('href')).toBe('/')
  })

  it('「学习与开发」在「实践 · F1」组，指向 /learn', () => {
    const { container } = renderShell()
    const gs = groups(container)
    const practice = gs.find((g) => g.name === '实践 · F1')
    expect(practice?.items).toContain('学习与开发')
    const link = [...container.querySelectorAll('nav a')].find((a) =>
      a.textContent?.includes('学习与开发'),
    )
    expect(link?.getAttribute('href')).toBe('/learn')
  })

  it('「注入与漂移」「加载协议」「团队协作」同在「定标 · F3」组', () => {
    const { container } = renderShell()
    const standard = groups(container).find((g) => g.name === '定标 · F3')
    expect(standard?.items).toEqual(
      expect.arrayContaining(['注入与漂移', '加载协议', '团队协作', '成长与统计']),
    )
  })

  it('变异腿：把「学习与开发」挪出「实践 · F1」⇒ 分组判定当场不成立', () => {
    const { container } = renderShell()
    const gs = groups(container)
    const practice = gs.find((g) => g.name === '实践 · F1')
    expect(practice?.items).toContain('学习与开发')
    // ⚠️ 真改 DOM：把该链接移到「作者 · F2」组
    const nav = container.querySelector('nav[aria-label="主导航"]')
    const learn = Array.from(container.querySelectorAll('nav a')).find((a) =>
      a.textContent?.includes('学习与开发'),
    )
    const authorBox = Array.from(nav?.children ?? []).find(
      (b) => b.firstElementChild?.textContent === '作者 · F2',
    )
    const itemsBox = authorBox?.querySelector('div:nth-child(2)')
    itemsBox?.appendChild(learn as Node)
    const after = groups(container)
    expect(after.find((g) => g.name === '实践 · F1')?.items).not.toContain('学习与开发')
  })
})
