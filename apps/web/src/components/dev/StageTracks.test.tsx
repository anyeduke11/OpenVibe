import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { deriveStageTrack, type StageTrack, type StageTrackSeed } from '@openvibe/shared'
import { StageTracks } from './StageTracks'

/**
 * M9 v1.6 **P1f.3 出口**（`m9-dev-plan-2026-10.md` §6.7 · **DL-40**）。
 *
 * P1f.3 断四件事（§3.21 第 1 条）：
 * ① 两门**不得等权并排** —— Python 带「主线」、Go 带「选学」并写清适用方向；
 * ② Go **默认收起**（收起的是**默认落点**，不是把 Go 从产品里拿掉 ⇒ 收起的那一行**必须可点**）；
 * ③ 本阶段**没有** Go 轨道时，界面**不造一个空条目**；
 * ④ 阶段 2 的 Python 要**如实暴露缺口**（显示派生出的那一档 ＋ 把标注显示出来）。
 */
const PY_STAGE0: StageTrackSeed = {
  stage_id: 0,
  stage_name: '阶段 0 · 基础与入场',
  period: '第 1–3 个月 · 看懂舞台，拿到入场券',
  lang: 'python',
  source_mode: 'vibe',
  mode_name: '了解 · 速成（Vibe Coding）',
  goals: ['不背语法：能看懂 AI 生成的脚本在做什么、会读报错、会把报错回贴给 AI 迭代'],
}

const PY_STAGE1: StageTrackSeed = {
  stage_id: 1,
  stage_name: '阶段 1 · 评测基本功',
  period: '第 4–9 个月 · 从凭感觉到可复现',
  lang: 'python',
  source_mode: 'fam',
  mode_name: '熟悉',
  goals: ['独立读写代码：变量/控制流/函数/模块/异常/虚拟环境/包管理'],
}

const PY_STAGE2: StageTrackSeed = {
  stage_id: 2,
  stage_name: '阶段 2 · Agent 专项',
  period: '第 10–15 个月 · 核心差异化',
  lang: 'python',
  source_mode: 'mas',
  mode_name: '熟悉 → 精通（写 checker / 流水线）',
  goals: ['把「跑题→采集轨迹→checker 判分→汇总指标」串成可重复运行的流水线'],
}

const GO_STAGE2: StageTrackSeed = {
  stage_id: 2,
  stage_name: '阶段 2 · Agent 专项',
  period: '第 10–15 个月 · 核心差异化',
  lang: 'go',
  source_mode: 'vibe',
  mode_name: '了解 · 速成（选学）',
  goals: ['读懂云原生生态（K8s/容器/CLI 工具多为 Go）的报错与工程结构'],
}

const PY_STAGE3: StageTrackSeed = {
  stage_id: 3,
  stage_name: '阶段 3 · 专家化',
  period: '第 16–24 个月 · 从接任务到定标准',
  lang: 'python',
  source_mode: 'mas',
  mode_name: '精通',
  goals: ['异步并发、包结构、类型系统、测试与 CI 能支撑团队级评测基建'],
}

const GO_STAGE3: StageTrackSeed = {
  stage_id: 3,
  stage_name: '阶段 3 · 专家化',
  period: '第 16–24 个月 · 从接任务到定标准',
  lang: 'go',
  source_mode: 'fam',
  mode_name: '熟悉（云原生方向选学）',
  goals: ['熟悉 goroutine/channel、标准库、测试与工程规范，能写并发压测与小服务'],
}

/** 六行（八格对照面 ⇒ 阶段 0/1 没有 Go 行）。 */
const TRACKS: StageTrack[] = [
  PY_STAGE0,
  PY_STAGE1,
  PY_STAGE2,
  GO_STAGE2,
  PY_STAGE3,
  GO_STAGE3,
].map(deriveStageTrack)

afterEach(cleanup)

describe('M9 P1f.3 · §3.21 第 1 条 · 两门不得等权并排', () => {
  it('① Python 带「主线」、Go 带「选学」（两侧标签不同）', () => {
    render(<StageTracks stageId={2} tracks={TRACKS} />)
    const py = screen.getByLabelText('Python 轨道')
    const go = screen.getByLabelText('Go 轨道')
    expect(within(py).getByText('主线')).toBeTruthy()
    expect(within(go).getByText('选学')).toBeTruthy()
  })

  it('② Go 侧写清适用方向（收起时也看得见方向说明）', () => {
    render(<StageTracks stageId={2} tracks={TRACKS} />)
    const go = screen.getByLabelText('Go 轨道')
    expect(within(go).getByText(/云原生 \/ 高性能 \/ 并发压测方向/)).toBeTruthy()
  })

  it('③ Python 侧显示该阶段的模式词（速成 / 熟悉 / 精通）', () => {
    const cases: readonly [number, string][] = [
      [0, '速成'],
      [1, '熟悉'],
      [3, '精通'],
    ]
    for (const [stageId, label] of cases) {
      const { unmount } = render(<StageTracks stageId={stageId} tracks={TRACKS} />)
      const py = screen.getByLabelText('Python 轨道')
      expect(within(py).getByText(label)).toBeTruthy()
      unmount()
      cleanup()
    }
  })
})

describe('M9 P1f.3 · §3.21 第 1 条 · Go 默认收起（但不是藏起来）', () => {
  it('④ 默认收起：Go 要点**不在 DOM 里**，只留方向说明', () => {
    render(<StageTracks stageId={2} tracks={TRACKS} />)
    const go = screen.getByLabelText('Go 轨道')
    expect(within(go).queryByText(GO_STAGE2.goals[0]!)).toBeNull()
    expect(within(go).getByText(/云原生 \/ 高性能 \/ 并发压测方向/)).toBeTruthy()
  })

  it('⑤ 收起的那一行**可点**（展开后能看到 Go 轨道与其要点）', () => {
    render(<StageTracks stageId={2} tracks={TRACKS} />)
    const toggle = screen.getByRole('button', { name: '展开 Go 选学' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(toggle)
    const go = screen.getByLabelText('Go 轨道')
    expect(within(go).getByText(GO_STAGE2.goals[0]!)).toBeTruthy()
    expect(screen.getByRole('button', { name: '收起 Go 选学' }).getAttribute('aria-expanded')).toBe('true')
  })

  it('⑥ 「收起」≠「隐藏」：Go 块始终在 DOM 里（DL-14 不变）', () => {
    render(<StageTracks stageId={2} tracks={TRACKS} />)
    expect(screen.getByLabelText('Go 轨道')).toBeTruthy()
    expect(screen.getByRole('button', { name: '展开 Go 选学' })).toBeTruthy()
  })
})

describe('M9 P1f.3 · §3.21 第 2 条 · 本阶段没有 Go 轨道时不造空条目', () => {
  it('⑦ 阶段 0 与阶段 1 **不渲染** Go 那一块', () => {
    for (const stageId of [0, 1]) {
      const { unmount } = render(<StageTracks stageId={stageId} tracks={TRACKS} />)
      expect(screen.queryByLabelText('Go 轨道')).toBeNull()
      expect(screen.queryByRole('button', { name: /Go 选学/ })).toBeNull()
      // ⚠️ 也不许出现「本阶段无 Go 轨道」这类**空卡** ——
      //   「没有这条轨道」是关于阶段的结论，不是「有一条可选轨道」。
      expect(screen.queryByText(/无 Go 轨道/)).toBeNull()
      unmount()
      cleanup()
    }
  })

  it('⑧ 阶段 2/3 有 Go 轨道 ⇒ 那一块**必须渲染**（对照面不是单向的）', () => {
    for (const stageId of [2, 3]) {
      const { unmount } = render(<StageTracks stageId={stageId} tracks={TRACKS} />)
      expect(screen.getByLabelText('Go 轨道')).toBeTruthy()
      unmount()
      cleanup()
    }
  })
})

describe('M9 P1f.3 · §3.21 第 3 条 · 阶段 2 的矛盾如实暴露', () => {
  it('⑨ 阶段 2 的 Python 显示「熟悉」＋ 标注（不是把「熟悉 → 精通」当第三档摆出来）', () => {
    render(<StageTracks stageId={2} tracks={TRACKS} />)
    const py = screen.getByLabelText('Python 轨道')
    expect(within(py).getByText('熟悉')).toBeTruthy()
    expect(within(py).getByText('本阶段还需向精通推进')).toBeTruthy()
    expect(within(py).getByText(/§6\.3 第 8 条/)).toBeTruthy()
    // ⚠️ 「熟悉 → 精通」是**源文档的原文**，界面不许把它当成一档展示
    expect(within(py).queryByText(/熟悉 → 精通（写 checker/)).toBeNull()
  })

  it('⑩ 阶段 3 的 Python 显示「精通」**且无标注**（没有矛盾就不造标注）', () => {
    render(<StageTracks stageId={3} tracks={TRACKS} />)
    const py = screen.getByLabelText('Python 轨道')
    expect(within(py).getByText('精通')).toBeTruthy()
    expect(within(py).queryByText('本阶段还需向精通推进')).toBeNull()
  })
})

describe('M9 P1f.3 · 边界态', () => {
  it('⑪ 还没进阶段 ⇒ 说「还没有选定阶段」，不渲染任何轨道', () => {
    render(<StageTracks stageId={null} tracks={TRACKS} />)
    expect(screen.getByText('还没有选定阶段')).toBeTruthy()
    expect(screen.queryByLabelText('Python 轨道')).toBeNull()
    expect(screen.queryByLabelText('Go 轨道')).toBeNull()
  })

  it('⑫ 当前阶段一条轨道都没有 ⇒ 说「还没有选定阶段」（不白屏）', () => {
    render(<StageTracks stageId={9} tracks={TRACKS} />)
    expect(screen.getByText('还没有选定阶段')).toBeTruthy()
  })

  it('⑬ Python 的要点逐条渲染', () => {
    render(<StageTracks stageId={2} tracks={TRACKS} />)
    const py = screen.getByLabelText('Python 轨道')
    for (const g of PY_STAGE2.goals) {
      expect(within(py).getByText(g)).toBeTruthy()
    }
  })
})
