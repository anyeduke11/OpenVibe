import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ModeDeepLink, ModeDeepLinkHint } from './ModeDeepLink'

/**
 * M9 v1.6 **P1f.4 出口**（`m9-dev-plan-2026-10.md` §6.7 · **DL-43**）。
 *
 * DL-43 断三件事：
 * ① `#mode-vibe` / `#mode-master` / `#mode-familiar` 三种 URL **各自落位**；
 * ② **URL 片段优先于** §3.19 的 onboarding 默认模式；
 * ③ 片段变化（`hashchange`）要跟得上 —— 模式页可能在同一文档里切档。
 *
 * ⚠️ **「优先」这条是反直觉的**（直觉是「onboarding 先问、锚点后覆盖」）——
 *   用户是**从别人给的链接进来的**，那个链接指向哪一档，就该落哪一档。
 */
const VIEWS = {
  vibe: <p>速成视图</p>,
  master: <p>精通视图</p>,
  familiar: <p>熟悉视图</p>,
}

afterEach(cleanup)

beforeEach(() => {
  // ⚠️ 片段是**跨用例残留**的（同一份 jsdom window）⇒ 每个用例前清干净
  window.history.replaceState(null, '', '/')
})

/** 把浏览器指到某个片段上，并触发一次 `hashchange`。 */
function goToHash(hash: string): void {
  window.location.hash = hash
  fireEvent(window, new HashChangeEvent('hashchange'))
}

describe('M9 P1f.4 · DL-43 深链落档', () => {
  it('① 三种 URL 各自落位（深链命中 ⇒ 落对应那一档）', () => {
    const cases: readonly [string, string][] = [
      ['#mode-vibe', '速成视图'],
      ['#mode-master', '精通视图'],
      ['#mode-familiar', '熟悉视图'],
    ]
    for (const [hash, expected] of cases) {
      window.history.replaceState(null, '', `/${hash}`)
      const { unmount } = render(<ModeDeepLink views={VIEWS} />)
      expect(screen.getByText(expected)).toBeTruthy()
      // ⚠️ 另外两档**不许**同时在 DOM 里（落位 = 单一，不是并排）
      for (const other of cases) {
        if (other[0] === hash) continue
        expect(screen.queryByText(other[1])).toBeNull()
      }
      unmount()
      cleanup()
    }
  })

  it('② **URL 片段优先于** onboarding 默认模式（默认档是 familiar，片段是 vibe ⇒ 落 vibe）', () => {
    window.history.replaceState(null, '', '/#mode-vibe')
    render(<ModeDeepLink views={VIEWS} fallbackProfile="familiar" />)
    expect(screen.getByText('速成视图')).toBeTruthy()
    expect(screen.queryByText('熟悉视图')).toBeNull()
  })

  it('③ 没有片段 ⇒ 落默认档（§3.19 的 onboarding 默认）', () => {
    render(<ModeDeepLink views={VIEWS} fallbackProfile="familiar" />)
    expect(screen.getByText('熟悉视图')).toBeTruthy()
  })

  it('④ 片段不认识 ⇒ 也落默认档（不许白屏）', () => {
    window.history.replaceState(null, '', '/#mode-unknown')
    render(<ModeDeepLink views={VIEWS} fallbackProfile="master" />)
    expect(screen.getByText('精通视图')).toBeTruthy()
  })

  it('⑤ `hashchange` 要跟得上（同一文档里切档，不改路由）', () => {
    window.history.replaceState(null, '', '/')
    render(<ModeDeepLink views={VIEWS} fallbackProfile="vibe" />)
    expect(screen.getByText('速成视图')).toBeTruthy()

    goToHash('#mode-master')
    expect(screen.getByText('精通视图')).toBeTruthy()
    expect(screen.queryByText('速成视图')).toBeNull()

    goToHash('#mode-familiar')
    expect(screen.getByText('熟悉视图')).toBeTruthy()
    expect(screen.queryByText('精通视图')).toBeNull()
  })

  it('⑥ 切档时回调落档结果（P3 用它同步侧栏）', () => {
    const seen: string[] = []
    window.history.replaceState(null, '', '/')
    render(
      <ModeDeepLink
        views={VIEWS}
        fallbackProfile="vibe"
        onProfileChange={(p) => {
          seen.push(p)
        }}
      />,
    )
    goToHash('#mode-master')
    goToHash('#mode-familiar')
    expect(seen).toEqual(['master', 'familiar'])
  })

  it('⑦ 落档状态写在容器上（`data-profile`）—— 便于断言与联调', () => {
    window.history.replaceState(null, '', '/#mode-familiar')
    const { container } = render(<ModeDeepLink views={VIEWS} />)
    const section = container.querySelector('[aria-label="模式内容"]')
    expect(section).toBeTruthy()
    expect(section!.getAttribute('data-profile')).toBe('familiar')
  })

  it('⑧ 提示条只在**深链命中时**出现（直接进入时不加这行噪音）', () => {
    const { rerender } = render(<ModeDeepLinkHint profile="master" hash="#mode-master" />)
    expect(screen.getByText('深链落档')).toBeTruthy()
    expect(screen.getByText(/#mode-master/)).toBeTruthy()

    rerender(<ModeDeepLinkHint profile="master" hash="" />)
    expect(screen.queryByText('深链落档')).toBeNull()
  })

  it('⑨ 卸载后不再监听（不许泄漏监听器）', () => {
    const spy = vi.fn()
    window.history.replaceState(null, '', '/')
    const { unmount } = render(<ModeDeepLink views={VIEWS} onProfileChange={spy} />)
    unmount()
    goToHash('#mode-master')
    expect(spy).not.toHaveBeenCalled()
  })
})
