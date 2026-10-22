// `packages/shared/src/m9-stage.test.ts` —— M9 v1.6 **P1f 阶段联动的纯计算层**
// （`m9-dev-plan-2026-10.md` §6.7 ＋ `m9-dev-language-roadmap.md` §1.7 / §3.21 · **DL-40 / DL-43**）
//
// ## 它断什么
//
// | 判据 | 一句话 | 本文件里对应的那支 |
// |---|---|---|
// | **§3.21 第 2 条** | 源 → 派生三条规则（`profile` / `required` / `is_default`） | 「派生规则」组 |
// | **§3.21 第 3 条** | 阶段 2 的矛盾不替 owner 裁（取「熟悉」＋ 标注） | 「阶段 2」组 |
// | **P1f.2** | 自选降级为覆盖 —— 默认推荐值来自阶段 | 「阶段推荐」组 |
// | **DL-43** | `#mode-*` 片段优先于 onboarding 默认 | 「深链锚点」组 |
//
// ## ⚠️ 为什么夹具是内联的
//
// 本层是纯函数层（不碰 DB、不碰文件）⇒ 夹具内联即可。
// 真实种子 → 派生值的逐行绑定在 `packages/core/src/db/m9-p1f-stage-tracks.test.ts`
// （那里读真种子、开真库）。
import { describe, expect, it } from 'vitest'
import {
  deriveStageTrack,
  MODE_HASHES,
  recommendedProfileForStage,
  resolveEffectiveProfile,
  resolveProfileFromHash,
  STAGE2_MIDDLE_MODE_NAME,
  type LangProfile,
  type StageTrack,
  type StageTrackSeed,
} from './m9-stage'

// ---------------------------------------------------------------------------
// 夹具（逐字取自配套方案《Agent 评测专家成才方案》§4 的 tracks 数组，2026-10-20 实测）
// ---------------------------------------------------------------------------

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

const SEEDS: StageTrackSeed[] = [PY_STAGE0, PY_STAGE1, PY_STAGE2, GO_STAGE2, PY_STAGE3, GO_STAGE3]

const TRACKS: StageTrack[] = SEEDS.map(deriveStageTrack)

// ---------------------------------------------------------------------------

describe('M9 P1f · §3.21 第 2 条 · 源 → 派生三条规则', () => {
  it('① 正向：六行的 profile / required / is_default 全部按规则落位', () => {
    const rows = TRACKS.map((t) => [t.stage_id, t.lang, t.profile, t.required, t.is_default])
    expect(rows).toEqual([
      [0, 'python', 'vibe', 1, 1],
      [1, 'python', 'familiar', 1, 1],
      [2, 'python', 'familiar', 1, 1],
      [2, 'go', 'vibe', 0, 0],
      [3, 'python', 'master', 1, 1],
      [3, 'go', 'familiar', 0, 0],
    ])
  })

  it('② 源字段逐字保留（派生不得回写源）', () => {
    for (const seed of SEEDS) {
      const row = deriveStageTrack(seed)
      expect(row.source_mode).toBe(seed.source_mode)
      expect(row.mode_name).toBe(seed.mode_name)
      expect(row.stage_name).toBe(seed.stage_name)
      expect(row.period).toBe(seed.period)
      expect(row.goals).toEqual(seed.goals)
    }
  })

  it('③ 变异腿：把「选学」判定拿掉（required 恒 1）⇒ 必须被区分出来', () => {
    const mutated = (s: StageTrackSeed): StageTrack => ({ ...deriveStageTrack(s), required: 1 as const })
    // 阶段 2/3 的 Go 在源文档里写着「选学」⇒ 必学 = 否
    expect(deriveStageTrack(GO_STAGE2).required).toBe(0)
    expect(deriveStageTrack(GO_STAGE3).required).toBe(0)
    expect(mutated(GO_STAGE2).required).toBe(1)
    expect(mutated(GO_STAGE2).required).not.toBe(deriveStageTrack(GO_STAGE2).required)
    // ⚠️ Python 四行不含「选学」⇒ 恒为 1（这一侧变异腿看不出来，故与上面合看）
    for (const s of [PY_STAGE0, PY_STAGE1, PY_STAGE2, PY_STAGE3]) {
      expect(deriveStageTrack(s).required).toBe(1)
    }
  })

  it('④ 变异腿：把 is_default 恒设 1 ⇒ Go 行必须与之不同', () => {
    const mutated = (s: StageTrackSeed): StageTrack => ({ ...deriveStageTrack(s), is_default: 1 as const })
    expect(deriveStageTrack(GO_STAGE2).is_default).toBe(0)
    expect(deriveStageTrack(GO_STAGE3).is_default).toBe(0)
    expect(mutated(GO_STAGE2).is_default).toBe(1)
    expect(mutated(GO_STAGE2).is_default).not.toBe(deriveStageTrack(GO_STAGE2).is_default)
  })

  it('⑤ 变异腿：把 source_mode → profile 的映射写反（familiar 落到 master）⇒ 必须被区分', () => {
    const mutated = (s: StageTrackSeed): StageTrack => ({
      ...deriveStageTrack(s),
      profile: s.source_mode === 'fam' ? 'master' : deriveStageTrack(s).profile,
    })
    expect(deriveStageTrack(PY_STAGE1).profile).toBe('familiar')
    expect(mutated(PY_STAGE1).profile).toBe('master')
    expect(mutated(PY_STAGE1).profile).not.toBe(deriveStageTrack(PY_STAGE1).profile)
  })

  it('⑥ `goals` 是副本（改派生结果不会回污染种子）', () => {
    const seed: StageTrackSeed = { ...PY_STAGE0, goals: [...PY_STAGE0.goals] }
    const row = deriveStageTrack(seed)
    row.goals.push('塞进去的一句')
    expect(seed.goals).toHaveLength(1)
    expect(seed.goals[0]).toBe(PY_STAGE0.goals[0])
  })
})

describe('M9 P1f · §3.21 第 3 条 · 阶段 2 的矛盾不替 owner 裁', () => {
  it('① 源 mode 是 mas 而派生取「熟悉」＋ 有标注（两个源字段都留着）', () => {
    const row = deriveStageTrack(PY_STAGE2)
    expect(row.source_mode).toBe('mas')
    expect(row.mode_name).toContain(STAGE2_MIDDLE_MODE_NAME)
    expect(row.profile).toBe('familiar')
    expect(row.note).toBeTruthy()
    expect(row.note).toContain('§6.3 第 8 条')
  })

  it('② 变异腿：去掉阶段 2 的兜底（按 mas → 精通）⇒ 必须被区分', () => {
    const mutated = (s: StageTrackSeed): StageTrack => ({
      ...deriveStageTrack(s),
      profile: s.source_mode === 'mas' ? 'master' : deriveStageTrack(s).profile,
    })
    expect(deriveStageTrack(PY_STAGE2).profile).toBe('familiar')
    expect(mutated(PY_STAGE2).profile).toBe('master')
    expect(mutated(PY_STAGE2).profile).not.toBe(deriveStageTrack(PY_STAGE2).profile)
  })

  it('③ 只有阶段 2 的 Python 带标注；其余五行 note 为 null', () => {
    const withNote = TRACKS.filter((t) => t.note !== null)
    expect(withNote).toHaveLength(1)
    expect(withNote[0]!.stage_id).toBe(2)
    expect(withNote[0]!.lang).toBe('python')
  })

  it('④ 阶段 3 的 Python 是「精通」⇒ 没有矛盾、没有标注', () => {
    const row = deriveStageTrack(PY_STAGE3)
    expect(row.profile).toBe('master')
    expect(row.note).toBeNull()
  })
})

describe('M9 P1f · P1f.2 阶段 → 推荐模式（自选降级为覆盖）', () => {
  it('① 还没进阶段 ⇒ 没有推荐（null）', () => {
    expect(recommendedProfileForStage(null, TRACKS)).toBeNull()
  })

  it('② 四个阶段的推荐依次落位（Python 主线；阶段 2 是「熟悉 + 标注」）', () => {
    expect(recommendedProfileForStage(0, TRACKS)).toEqual({
      stageId: 0,
      profile: 'vibe',
      lang: 'python',
      note: null,
    })
    expect(recommendedProfileForStage(1, TRACKS)?.profile).toBe('familiar')
    const s2 = recommendedProfileForStage(2, TRACKS)
    expect(s2?.profile).toBe('familiar')
    expect(s2?.lang).toBe('python')
    expect(s2?.note).toBeTruthy()
    expect(recommendedProfileForStage(3, TRACKS)?.profile).toBe('master')
  })

  it('③ 不存在的阶段 ⇒ 没有推荐', () => {
    expect(recommendedProfileForStage(9, TRACKS)).toBeNull()
  })

  it('④ 变异腿：推荐只取 is_default=1 的那行（Go 不参与默认）', () => {
    // ⚠️ 把 Go 行排在前面 —— 若实现漏了 is_default 过滤，就会取到 Go 行
    const goFirst = [deriveStageTrack(GO_STAGE2), deriveStageTrack(PY_STAGE2)]
    const mutated = (stageId: number, rows: StageTrack[]) =>
      rows.find((t) => t.stage_id === stageId) ?? null
    expect(recommendedProfileForStage(2, goFirst)?.lang).toBe('python')
    expect(mutated(2, goFirst)?.lang).toBe('go')
    expect(mutated(2, goFirst)?.lang).not.toBe(recommendedProfileForStage(2, goFirst)?.lang)
  })

  it('⑤ 推荐只是一个默认值：另两档轨道仍留在表里（自选降级为覆盖，不是替用户决定）', () => {
    const rec = recommendedProfileForStage(3, TRACKS)
    expect(rec?.profile).toBe('master')
    // 阶段 3 还有一条 Go 轨道（熟悉 · 选学）⇒ 覆盖后仍可切过去
    const stage3 = TRACKS.filter((t) => t.stage_id === 3)
    expect(stage3).toHaveLength(2)
    expect(stage3.map((t) => t.profile)).toEqual(['master', 'familiar'])
  })
})

describe('M9 P1f · DL-43 深链锚点（片段优先于 onboarding 默认）', () => {
  it('① 三个锚点各自落位', () => {
    expect(resolveProfileFromHash('#mode-vibe')).toBe('vibe')
    expect(resolveProfileFromHash('#mode-master')).toBe('master')
    expect(resolveProfileFromHash('#mode-familiar')).toBe('familiar')
  })

  it('② 容错：缺 `#`、大写、前后空白都认', () => {
    expect(resolveProfileFromHash('mode-vibe')).toBe('vibe')
    expect(resolveProfileFromHash('#MODE-VIBE')).toBe('vibe')
    expect(resolveProfileFromHash('  #mode-master  ')).toBe('master')
  })

  it('③ 不是这三个之一 ⇒ null（⇒ 落回默认档）', () => {
    expect(resolveProfileFromHash('#mode-unknown')).toBeNull()
    expect(resolveProfileFromHash('#')).toBeNull()
    expect(resolveProfileFromHash('')).toBeNull()
    expect(resolveProfileFromHash('#section-3')).toBeNull()
  })

  it('④ `MODE_HASHES` 与解析器一致（口径只留一处：锚点表不许各写一份）', () => {
    for (const [hash, profile] of Object.entries(MODE_HASHES)) {
      expect(resolveProfileFromHash(hash)).toBe(profile)
    }
    expect(Object.keys(MODE_HASHES)).toHaveLength(3)
  })

  it('⑤ 变异腿：解析器恒返回 null ⇒ 三个锚点全落默认（⇒ 这条闸是摆设）', () => {
    const mutated = (_hash: string): null => null
    for (const [hash, profile] of Object.entries(MODE_HASHES)) {
      expect(resolveProfileFromHash(hash)).toBe(profile)
      expect(mutated(hash)).toBeNull()
    }
  })

  it('⑥ 「熟悉」不许落到「精通」（模式档位不许串行）', () => {
    expect(resolveProfileFromHash('#mode-familiar')).not.toBe('master')
    expect(resolveProfileFromHash('#mode-master')).not.toBe('familiar')
  })
})

// ---------------------------------------------------------------------------
// P1g · 阶段 → 生效模式（§3.21「默认推荐值来自阶段，用户可改」）
// ---------------------------------------------------------------------------

describe('M9 P1g · 生效模式的优先级（自选 ?? 阶段推荐 ?? 尚未选定）', () => {
  it('① 用户自选**优先于**阶段推荐（§3.21：自选降级为覆盖手段）', () => {
    const eff = resolveEffectiveProfile({
      stageChoice: 3,
      tracks: TRACKS,
      modeChoice: 'vibe',
    })
    expect(eff.profile).toBe('vibe')
    expect(eff.source).toBe('user')
    // ⚠️ 推荐**仍然算出来**（界面要拿它提示「你覆盖了推荐」）
    expect(eff.recommendation?.profile).toBe('master')
    expect(eff.differsFromRecommendation).toBe(true)
  })

  it('② 没有自选 ⇒ 用阶段推荐（来源＝阶段）', () => {
    const eff = resolveEffectiveProfile({ stageChoice: 1, tracks: TRACKS, modeChoice: null })
    expect(eff.profile).toBe('familiar')
    expect(eff.source).toBe('stage')
    expect(eff.differsFromRecommendation).toBe(false)
  })

  it('③ 既没自选也没进阶段 ⇒ **尚未选定**（不替用户编一个默认）', () => {
    const eff = resolveEffectiveProfile({ stageChoice: null, tracks: TRACKS, modeChoice: null })
    expect(eff.profile).toBeNull()
    expect(eff.source).toBe('unset')
    expect(eff.recommendation).toBeNull()
    expect(eff.differsFromRecommendation).toBe(false)
  })

  it('④ 自选与推荐**相同** ⇒ 不算覆盖（differs 为假）', () => {
    const eff = resolveEffectiveProfile({ stageChoice: 3, tracks: TRACKS, modeChoice: 'master' })
    expect(eff.profile).toBe('master')
    expect(eff.source).toBe('user')
    expect(eff.differsFromRecommendation).toBe(false)
  })

  it('⚠️ 变异腿：把优先级倒过来（阶段推荐压过用户自选）⇒ 必须被区分出来', () => {
    const swapped = (input: {
      stageChoice: number | null
      tracks: readonly StageTrack[]
      modeChoice: LangProfile | null
    }) => {
      // 模拟「先看阶段、再看自选」的错误实现
      const rec = recommendedProfileForStage(input.stageChoice, input.tracks)
      const profile = rec?.profile ?? input.modeChoice
      return profile
    }
    const input = { stageChoice: 3, tracks: TRACKS, modeChoice: 'vibe' as const }
    expect(resolveEffectiveProfile(input).profile).toBe('vibe')
    expect(swapped(input)).toBe('master')
    expect(swapped(input)).not.toBe(resolveEffectiveProfile(input).profile)
  })
})
