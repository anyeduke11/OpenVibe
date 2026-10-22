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
 *
 * ## ⚠️ 为什么这里有**三档**（首屏只有两个选项）
 *
 * §3.21 的阶段推荐（阶段 1/2 实测就是「熟悉」）经用户点「改用推荐档」后会写这一档
 * ⇒ **重选处只给两档 ⇒ 推荐档写不进去**，用户会看到「当前是熟悉」却没有任何一档被选中。
 * ⇒ 这里三档，首屏那个提问仍是两档（`ModeOnboarding` 不变）。
 */
const { MODES, CHOICE_MUTATE } = vi.hoisted(() => ({
  MODES: {
    mode_choice: 'vibe' as string | null,
    effective_profile: {
      profile: 'vibe' as string | null,
      source: 'user' as 'user' | 'stage' | 'unset',
      differs_from_recommendation: false,
      recommendation: null as {
        stage_id: number
        profile: string
        lang: string
        note: string | null
      } | null,
    },
  },
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

/** 把「生效模式」整份换掉（测试之间不互相污染）。 */
function setEffective(
  profile: string | null,
  source: 'user' | 'stage' | 'unset' = 'user',
  differs = false,
): void {
  MODES.effective_profile.profile = profile
  MODES.effective_profile.source = source
  MODES.effective_profile.differs_from_recommendation = differs
}

describe('M9 P1e · 设置页「学习模式」区（§3.19 可重选）', () => {
  it('① 当前模式**看得见**（三档都在，当前那个被勾上）', () => {
    render(<LangModeSection />)
    const [vibe, familiar, master] = radios()
    expect(vibe?.checked).toBe(true)
    expect(familiar?.checked).toBe(false)
    expect(master?.checked).toBe(false)
  })

  it('② 换一个 ⇒ 真的把选择交出去（**能改**才是「可重选」）', () => {
    render(<LangModeSection />)
    fireEvent.click(radios()[2] as HTMLInputElement)
    expect(CHOICE_MUTATE).toHaveBeenCalled()
    expect(CHOICE_MUTATE.mock.calls[0]?.[0]).toBe('master')
  })

  it('③ 还没选过时，三个选项都**不勾**（不许默认替用户做主）', () => {
    setEffective(null, 'unset')
    render(<LangModeSection />)
    for (const r of radios()) expect(r.checked).toBe(false)
    setEffective('vibe', 'user')
  })

  it('④ ⚠️ **「熟悉」这一档能选**（阶段推荐可能落在它身上）', () => {
    render(<LangModeSection />)
    fireEvent.click(radios()[1] as HTMLInputElement)
    expect(CHOICE_MUTATE.mock.calls[0]?.[0]).toBe('familiar')
  })

  it('⑤ ⚠️ 显示的是**生效档**（来自阶段推荐时也要看得见是哪一档）', () => {
    setEffective('familiar', 'stage')
    render(<LangModeSection />)
    const [vibe, familiar, master] = radios()
    expect(familiar?.checked).toBe(true)
    expect(vibe?.checked).toBe(false)
    expect(master?.checked).toBe(false)
    expect(screen.getByText(/来自阶段推荐/)).toBeTruthy()
    setEffective('vibe', 'user')
  })
})
