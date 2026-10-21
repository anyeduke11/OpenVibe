import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
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
 */
const { MODES, CHOICE_MUTATE } = vi.hoisted(() => ({
  MODES: {
    mode_choice: null as string | null,
    profiles: [
      { topic_id: 1, profile: 'master' as const, required: 1 as const, rank: 1, est_minutes: 60 },
      { topic_id: 1, profile: 'vibe' as const, required: 1 as const, rank: 1, est_minutes: 10 },
    ],
    topics: [{ id: 1, lang: 'python' as const, slug: 'py-a', stage_id: 0, kind: 'language' as const }],
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
}))

vi.mock('../../hooks/useLangRoadmap', () => ({
  useLangModes: () => ({ data: MODES, isError: false }),
  useLangModeChoice: () => ({ mutate: CHOICE_MUTATE, isPending: false }),
}))

afterEach(cleanup)

describe('M9 增强 6 · 模式面板真的接上了数据', () => {
  it('① 四个组件的内容都在（**不是四个空壳**）', () => {
    render(<ModePanels lang="python" projectId="p1" />)

    // ⚠️ §3.21 阶段轨道（真数据：轨道的要点与模式档位都来自 `lang_stage_tracks`）
    expect(screen.getByRole('region', { name: '阶段轨道' })).toBeTruthy()
    expect(screen.getByRole('article', { name: 'Python 轨道' })).toBeTruthy()
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
