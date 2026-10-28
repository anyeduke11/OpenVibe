import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ModeDeepLink, ModeDeepLinkHint } from './ModeDeepLink'

/**
 * M9 v1.6 **P1f.4 · DL-43 的变异腿**（把深链解析改成恒空）。
 *
 * ## 它为什么单独一个文件
 *
 * ⚠️ `vi.mock` 是**按文件**生效的（会被提升到 import 之前）——
 *   若把它和正支放在同一个文件，整份文件都会跑在变异体上，正支就再也测不到真实现了。
 *   ⇒ 变异体必须独占一份文件。
 *
 * ## 变异的是什么
 *
 * DL-43：URL 片段 `#mode-*` **优先于** onboarding 默认模式。
 * ⇒ 变异体把 `resolveProfileFromHash` 换成**恒返回 `null`** 的版本 ——
 *   于是**任何片段都落回默认档**，深链彻底失效（三个锚点全部失灵）。
 * 然后跑**与生产断言逐字相同**的那条检查 ⇒ 它必须红。
 * **若这里还是绿的，说明正支那条断言根本抓不住「深链失效」这种实现。**
 */
vi.mock('@openvibe/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@openvibe/shared')>()
  return {
    ...actual,
    // ⚠️ 变异：任何片段都解析不出来 ⇒ 一律落回默认档
    resolveProfileFromHash: () => null,
  }
})

const VIEWS = {
  vibe: <p>速成视图</p>,
  master: <p>精通视图</p>,
  familiar: <p>熟悉视图</p>,
}

afterEach(cleanup)

beforeEach(() => {
  window.history.replaceState(null, '', '/')
})

describe('M9 P1f.4 · DL-43 变异腿（深链解析恒空）', () => {
  it('变异体下，生产断言「`#mode-master` 落精通视图」必须红', () => {
    window.history.replaceState(null, '', '/#mode-master')
    render(<ModeDeepLink views={VIEWS} />)

    // ⚠️ **生产断言（与 `ModeDeepLink.test.tsx` 的 ① 逐字相同）**：
    //   深链命中 ⇒ 落对应那一档。它在变异体下必须**取不到**。
    expect(() => screen.getByText('精通视图')).toThrow()
    expect(screen.queryByText('精通视图')).toBeNull()
  })

  it('变异体下，三个锚点**全部**落回默认档（深链彻底失效）', () => {
    for (const hash of ['#mode-vibe', '#mode-master', '#mode-familiar']) {
      window.history.replaceState(null, '', `/${hash}`)
      const { container, unmount } = render(
        <ModeDeepLink views={VIEWS} fallbackProfile="familiar" />,
      )
      const section = container.querySelector('[aria-label="模式内容"]')
      expect(section!.getAttribute('data-profile')).toBe('familiar')
      unmount()
      cleanup()
    }
  })

  it('变异体下，`hashchange` 也不再切档（片段变化跟不上的那种坏）', () => {
    window.history.replaceState(null, '', '/')
    render(<ModeDeepLink views={VIEWS} fallbackProfile="vibe" />)
    expect(screen.getByText('速成视图')).toBeTruthy()

    window.location.hash = '#mode-master'
    fireEvent(window, new HashChangeEvent('hashchange'))
    expect(screen.getByText('速成视图')).toBeTruthy()
    expect(screen.queryByText('精通视图')).toBeNull()
  })

  it('变异体下，提示条永远不出现（深链命中与否不可知）', () => {
    render(<ModeDeepLinkHint profile="master" hash="#mode-master" />)
    expect(screen.queryByText('深链落档')).toBeNull()
  })
})
