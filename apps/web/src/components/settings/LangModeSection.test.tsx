import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LangModeSection } from './LangModeSection'

/**
 * M9 P1e · 设置页「学习模式」区（`m9-dev-language-roadmap.md` §3.19 第 1 条）
 *
 * ## 它断什么
 *
 * §3.19 第 1 条：「答过就不再问（**可在设置页重选**，但不在每次进入时再问一遍）」。
 * ⇒ 只做「首屏问一次」而不给重选入口，等于让「答错」**不可挽回**。
 * ⇒ 本文件断的是「这个入口存在、能改、当前值可见」。
 */
const { MODES, CHOICE_MUTATE } = vi.hoisted(() => ({
  MODES: { mode_choice: 'vibe' as string | null },
  CHOICE_MUTATE: vi.fn(),
}))

vi.mock('../../hooks/useLangRoadmap', () => ({
  useLangModes: () => ({ data: MODES, isError: false }),
  useLangModeChoice: () => ({ mutate: CHOICE_MUTATE, isPending: false }),
}))

afterEach(() => {
  cleanup()
  CHOICE_MUTATE.mockReset()
})

function radios(): HTMLInputElement[] {
  return screen.getAllByRole('radio') as HTMLInputElement[]
}

describe('M9 P1e · 设置页「学习模式」区（§3.19 可重选）', () => {
  it('① 当前模式**看得见**（两个选项都在，当前那个被勾上）', () => {
    render(<LangModeSection />)
    const [vibe, master] = radios()
    expect(vibe?.checked).toBe(true)
    expect(master?.checked).toBe(false)
  })

  it('② 换一个 ⇒ 真的把选择交出去（**能改**才是「可重选」）', () => {
    render(<LangModeSection />)
    fireEvent.click(radios()[1] as HTMLInputElement)
    expect(CHOICE_MUTATE).toHaveBeenCalled()
    expect(CHOICE_MUTATE.mock.calls[0]?.[0]).toBe('master')
  })

  it('③ 还没选过时，两个选项都**不勾**（不许默认替用户做主）', () => {
    MODES.mode_choice = null
    render(<LangModeSection />)
    for (const r of radios()) expect(r.checked).toBe(false)
    MODES.mode_choice = 'vibe'
  })
})
