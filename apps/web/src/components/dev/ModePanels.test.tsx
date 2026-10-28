import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ModeOnboardingPanel, ModePanels } from './ModePanels'

/**
 * M9 **增强 6** · P1e / P1f 四个界面件的**挂载**（`ModePanels.tsx`）
 *
 * ## 它断什么
 *
 * 判据是「这四个组件**真的接上真实数据**了」——
 * 之前它们写好了却一直没有挂载（读端缺「模式相关的行」这一层）。
 * ⇒ 本文件断的是：面板里**真的出现了**四个组件的内容，
 *   而不是四个空壳（组件在、数据不在 ⇒ 界面等于没接）。
 *
 * ## ⚠️ 顺带断 P1g 的「阶段 → 推荐档」
 *
 * §3.21：「默认推荐值来自阶段，用户可改」⇒ 面板上要能**选阶段**、
 * **看到推荐档**、**一键改用**。
 */
const { MODES, CHOICE_MUTATE, STAGE_MUTATE } = vi.hoisted(() => ({
  MODES: {
    mode_choice: null as string | null,
    stage_choice: null as number | null,
    effective_profile: {
      profile: null as string | null,
      source: 'unset' as 'user' | 'stage' | 'unset',
      differs_from_recommendation: false,
      recommendation: null as {
        stage_id: number
        profile: string
        lang: string
        note: string | null
      } | null,
    },
    profiles: [
      { topic_id: 1, profile: 'master' as const, required: 1 as const, rank: 1, est_minutes: 60 },
      { topic_id: 1, profile: 'vibe' as const, required: 1 as const, rank: 1, est_minutes: 10 },
    ],
    topics: [
      { id: 1, lang: 'python' as const, slug: 'py-a', stage_id: 0, kind: 'language' as const },
    ],
    stage_tracks: [
      {
        stage_id: 0,
        stage_name: '阶段 0 · 基础与入场',
        period: '第 1–3 个月',
        lang: 'python' as const,
        source_mode: 'vibe' as const,
        mode_name: '速成',
        profile: 'vibe' as const,
        required: 1 as const,
        is_default: 1 as const,
        note: null,
        goals: ['看懂舞台，拿到入场券'],
      },
      {
        stage_id: 1,
        stage_name: '阶段 1 · 评测基本功',
        period: '第 4–9 个月',
        lang: 'python' as const,
        source_mode: 'fam' as const,
        mode_name: '熟悉',
        profile: 'familiar' as const,
        required: 1 as const,
        is_default: 1 as const,
        note: null,
        goals: ['独立读写代码'],
      },
    ],
    resources: [
      {
        id: 1,
        name: '资源一',
        url: 'https://example.com/1',
        topic_ids: [1],
        topic_titles: [{ id: 1, title: 'A' }],
      },
    ],
    lit_topic_ids: [1],
  },
  CHOICE_MUTATE: vi.fn(),
  STAGE_MUTATE: vi.fn(),
}))

vi.mock('../../hooks/useLangRoadmap', () => ({
  useLangModes: () => ({ data: MODES, isError: false }),
  useLangModeChoice: () => ({ mutate: CHOICE_MUTATE, isPending: false }),
  useLangStageChoice: () => ({ mutate: STAGE_MUTATE, isPending: false }),
}))

afterEach(() => {
  cleanup()
  CHOICE_MUTATE.mockReset()
  STAGE_MUTATE.mockReset()
})

/** 把「生效模式」整份换掉（测试之间不互相污染）。 */
function setEffective(
  profile: string | null,
  source: 'user' | 'stage' | 'unset' = 'user',
  recommendation: (typeof MODES)['effective_profile']['recommendation'] = null,
  differs = false,
): void {
  MODES.effective_profile.profile = profile
  MODES.effective_profile.source = source
  MODES.effective_profile.recommendation = recommendation
  MODES.effective_profile.differs_from_recommendation = differs
}

describe('M9 增强 6 · 模式面板真的接上了数据', () => {
  it('① 四个组件的内容都在（**不是四个空壳**）', () => {
    render(<ModePanels lang="python" projectId="p1" />)

    // ⚠️ §3.21 阶段轨道（真数据：轨道的要点与模式档位都来自 `lang_stage_tracks`）
    //    ⚠️ 夹具里有**两个阶段** ⇒ 轨道区域有两个（每个阶段一节）
    expect(screen.getAllByRole('region', { name: '阶段轨道' }).length).toBe(2)
    expect(screen.getAllByRole('article', { name: 'Python 轨道' }).length).toBe(2)
    expect(screen.getByText('看懂舞台，拿到入场券')).toBeTruthy()
    expect(screen.getByText('阶段 0')).toBeTruthy()
    // ⚠️ §3.20 资源模式标记
    expect(screen.getByText('资源一')).toBeTruthy()
    expect(screen.getByText('本模式必学')).toBeTruthy()
    // ⚠️ §3.18 转档
    expect(screen.getByText('从速成转档')).toBeTruthy()
  })

  it('② ⚠️ §3.19：**答过就不再问**（`mode_choice` 有值 ⇒ 不渲染提问屏）', () => {
    MODES.mode_choice = 'vibe'
    render(<ModeOnboardingPanel projectId="p1" />)
    expect(screen.queryByText('这套指南你打算怎么用')).toBeNull()
    MODES.mode_choice = null
  })

  it('③ 还没答过 ⇒ 渲染提问屏（**首屏**那一个区块）', () => {
    render(<ModeOnboardingPanel projectId="p1" />)
    expect(screen.getByText('这套指南你打算怎么用')).toBeTruthy()
    // ⚠️ 出口必须存在（「跳过，按默认走」是必需项，不是可选项）
    expect(screen.getByText('跳过，按默认走')).toBeTruthy()
  })
})

describe('M9 P1g · 阶段 → 推荐档（§3.21：推荐值来自阶段，用户可改）', () => {
  it('① 阶段选择器**在**（能选阶段）', () => {
    render(<ModePanels lang="python" projectId="p1" />)
    const group = screen.getByRole('radiogroup', { name: '当前阶段' })
    expect(group).toBeTruthy()
    // ⚠️ 单选标签用**阶段名**（与每个阶段的小标题「阶段 0」区分得开）
    expect(screen.getByText('阶段 0 · 基础与入场')).toBeTruthy()
  })

  it('② 选一个阶段 ⇒ 真的把阶段交出去', () => {
    render(<ModePanels lang="python" projectId="p1" />)
    const radios = screen.getAllByRole('radio') as HTMLInputElement[]
    // 第一个是「还没进阶段」，后面依次是各阶段
    fireEvent.click(radios[2] as HTMLInputElement)
    expect(STAGE_MUTATE).toHaveBeenCalled()
    expect(STAGE_MUTATE.mock.calls[0]?.[0]).toBe(1)
  })

  it('③ ⚠️ 有推荐时**看得见推荐档**（阶段 1 ⇒ 熟悉）', () => {
    setEffective('familiar', 'stage', {
      stage_id: 1,
      profile: 'familiar',
      lang: 'python',
      note: null,
    })
    render(<ModePanels lang="python" projectId="p1" />)
    expect(screen.getByText(/阶段 1 推荐：熟悉/)).toBeTruthy()
    setEffective(null, 'unset')
  })

  it('④ ⚠️ 用户覆盖了推荐 ⇒ 界面**说出来**（不悄悄改）', () => {
    setEffective(
      'vibe',
      'user',
      {
        stage_id: 1,
        profile: 'familiar',
        lang: 'python',
        note: null,
      },
      true,
    )
    render(<ModePanels lang="python" projectId="p1" />)
    expect(screen.getByText('你覆盖了阶段推荐')).toBeTruthy()
    setEffective(null, 'unset')
  })

  it('⑤ ⚠️ 「改用推荐档」⇒ 交出去的是**一次模式选择**（不是改阶段）', () => {
    setEffective(
      'vibe',
      'user',
      {
        stage_id: 1,
        profile: 'familiar',
        lang: 'python',
        note: null,
      },
      true,
    )
    render(<ModePanels lang="python" projectId="p1" />)
    const btn = screen.getByText('改用推荐档')
    fireEvent.click(btn)
    expect(CHOICE_MUTATE).toHaveBeenCalled()
    expect(CHOICE_MUTATE.mock.calls[0]?.[0]).toBe('familiar')
    // ⚠️ **不是**改阶段（那是另一件事）
    expect(STAGE_MUTATE).not.toHaveBeenCalled()
    setEffective(null, 'unset')
  })
})
