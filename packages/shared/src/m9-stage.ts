// `packages/shared/src/m9-stage.ts` —— M9 v1.6 **P1f · 阶段联动的纯计算层**
// （`m9-dev-plan-2026-10.md` §6.7 ＋ `m9-dev-language-roadmap.md` §1.7 / §3.21 · **DL-40 / DL-43**）
//
// ## 它是什么
//
// P1f 三件能脱离界面独立成立的事：
//   ① **阶段 → 轨道的派生**（§3.21 第 2 条）：源文档的 `mode` → 本模块的三值模式；
//   ② **阶段 → 推荐模式**（P1f.2）：自选降级为覆盖 —— 默认推荐值来自阶段，用户可改；
//   ③ **深链锚点解析**（§3.21 第 5 条 · DL-43）：`#mode-*` 优先于 onboarding 默认。
//
// ## ⚠️ 为什么住在 shared（不在 core）
//
// ① 界面要现算（模式页要按当前阶段给推荐档）；② core 带 `better-sqlite3` 原生依赖、
// `apps/web` 没有指向它的 workspace 链接 ⇒ 放 core 就等于让 web 抄一份 ⇒ 两处口径漂移。
//
// ## ⚠️ 阶段 2 的 Python：源文档**自相矛盾**，本模块**不替它决定**
//
// 源文档把阶段 2 的 Python 写成 `mode:"mas"`（等于精通）却把 `modeName` 写成
// 「**熟悉 → 精通**（写 checker / 流水线）」—— 两处必有一处不准。
// ⇒ §6.3 第 8 条待裁前，**实现里不许偷偷选一个**：
//   本模块取「**熟悉**」并**带标注**（spec §3.21 第 3 条的原话：
//   「如实暴露缺口，也比假装枚举够用强」）。
// ⇒ 两个源字段（`source_mode` 与 `mode_name`）**都逐字保留**，矛盾留在数据里。
import type { LangProfile } from './m9-modes'

export type { LangProfile }

/** 源文档的 `mode` 取值域（`'vibe' | 'fam' | 'mas'` —— 源用缩写）。 */
export type StageSourceMode = 'vibe' | 'fam' | 'mas'

/** 种子的一行（源文档逐字）。 */
export interface StageTrackSeed {
  stage_id: number
  stage_name: string
  period: string
  lang: 'python' | 'go'
  source_mode: StageSourceMode
  mode_name: string
  goals: string[]
}

/** 派生后的一行（`lang_stage_tracks` 的列）。 */
export interface StageTrack {
  stage_id: number
  /** 源文档 `stage_name` 逐字（「阶段 0 · 基础与入场」） */
  stage_name: string
  /** 源文档 `period` 逐字（「第 1–3 个月 · 看懂舞台，拿到入场券」） */
  period: string
  lang: 'python' | 'go'
  /** 源文档 `mode` 逐字 */
  source_mode: StageSourceMode
  /** 源文档 `modeName` 逐字 */
  mode_name: string
  /** 本模块的三值模式（阶段 2 的 Python 按 §6.3 第 8 条兜底） */
  profile: LangProfile
  /** 本模式下这条轨道是不是必学（源 `modeName` 含「选学」⇒ 否） */
  required: 0 | 1
  /** 是不是该阶段的默认落点（Python 主线 ⇒ 是） */
  is_default: 0 | 1
  /** 诚实标注（只有「源文档自相矛盾」那一条会有值） */
  note: string | null
  /** 源文档 `goals` 要点（逐字） */
  goals: string[]
}

/** 源 `mode` → 本模块模式。 */
const PROFILE_BY_SOURCE_MODE: Record<StageSourceMode, LangProfile> = {
  vibe: 'vibe',
  fam: 'familiar',
  mas: 'master',
}

/**
 * ⚠️ **源文档自己的矛盾**（不是我们的判断）：阶段 2 的 Python
 * `mode:"mas"`（精通）却叫「熟悉 → 精通」。
 */
export const STAGE2_MIDDLE_MODE_NAME = '熟悉 → 精通'

/** 「选学」⇒ 该轨道在该模式下**不必学**。 */
const OPTIONAL_MARK = '选学'

/**
 * 派生一行：源文档的逐字字段 → 本模块的 `profile` / `required` / `is_default` / `note`。
 *
 * ⚠️ **三条规则都在这里**（口径只留一处）：
 * ① `profile`：`vibe→vibe` · `fam→familiar` · `mas→master`；
 *    **但** 源 `mode_name` 是「熟悉 → 精通」时（阶段 2 的 Python）
 *    ⇒ 取 `familiar` **并带标注**（§6.3 第 8 条待裁前的兜底）。
 * ② `required`：源 `mode_name` 含「选学」⇒ 0，否则 1
 *    （阶段 2/3 的 Go 都是「选学」—— §1.7 ① 的「Go 选学」在源文档里就是这么写的）。
 * ③ `is_default`：`lang='python'` ⇒ 1（Python 主线），Go ⇒ 0（选学、默认收起）。
 */
export function deriveStageTrack(seed: StageTrackSeed): StageTrack {
  const isMiddle = seed.source_mode === 'mas' && seed.mode_name.includes(STAGE2_MIDDLE_MODE_NAME)
  return {
    stage_id: seed.stage_id,
    stage_name: seed.stage_name,
    period: seed.period,
    lang: seed.lang,
    source_mode: seed.source_mode,
    mode_name: seed.mode_name,
    profile: isMiddle ? 'familiar' : PROFILE_BY_SOURCE_MODE[seed.source_mode],
    required: seed.mode_name.includes(OPTIONAL_MARK) ? 0 : 1,
    is_default: seed.lang === 'python' ? 1 : 0,
    note: isMiddle
      ? '源文档 mode 为 mas（精通）、modeName 为「熟悉 → 精通」；§6.3 第 8 条待裁前按「熟悉 + 标注」兜底（spec §3.21 第 3 条）'
      : null,
    goals: [...seed.goals],
  }
}

/** 某阶段的推荐（默认落点）。 */
export interface StageRecommendation {
  stageId: number
  /** 推荐模式 */
  profile: LangProfile
  /** 该阶段的默认语言（Python 主线） */
  lang: 'python' | 'go'
  /** 诚实标注（阶段 2 的 Python 有） */
  note: string | null
}

/**
 * **阶段 → 推荐模式**（P1f.2：自选降级为覆盖 —— 默认推荐值来自阶段，用户可改）。
 *
 * ⚠️ 取 `is_default=1` 的那一行（Python 主线）⇒ Go 不参与「默认」，
 *   否则两门等权并排，正是 §3.21 第 1 条要拆掉的东西。
 *
 * @param stageId 当前阶段（`null` = 用户还没进阶段 ⇒ 没有推荐）
 */
export function recommendedProfileForStage(
  stageId: number | null,
  tracks: readonly StageTrack[],
): StageRecommendation | null {
  if (stageId === null) return null
  const row = tracks.find((t) => t.stage_id === stageId && t.is_default === 1)
  if (row === undefined) return null
  return { stageId, profile: row.profile, lang: row.lang, note: row.note }
}

// ============================================================================
// 阶段 → 生效模式（§3.21 的「自选降级为覆盖」· **P1g**）
// ============================================================================

/**
 * 生效模式的**来源**。
 *
 * ⚠️ **三种来源要分得清** —— 界面上「当前是精通」这句话，
 *   含义随来源不同而不同：
 *   - `user`：用户自己选的（**自选覆盖了阶段推荐**）；
 *   - `stage`：阶段推出来的（用户没自选，默认值来自阶段 ⇒ §3.21 的正题）；
 *   - `unset`：**既没自选、也没阶段推荐** ⇒ 尚未选定（界面须如实说「还没定」）。
 */
export type ProfileSource = 'user' | 'stage' | 'unset'

/** 生效模式（§3.21）。 */
export interface EffectiveProfile {
  /** 生效的模式；`null` = **尚未选定**（既没自选也没推荐） */
  profile: LangProfile | null
  /** 生效来源 */
  source: ProfileSource
  /** 阶段推荐（`null` = 没进阶段，或该阶段没有默认轨道） */
  recommendation: StageRecommendation | null
  /**
   * 生效模式与阶段推荐**不同**。
   *
   * ⚠️ 只有 `source === 'user'` 且推荐存在时才可能为真 ⇒
   *   它就是「**你覆盖了阶段推荐**」这件事的判定式（界面据此提示）。
   */
  differsFromRecommendation: boolean
}

/**
 * **算生效模式**（§3.21：「默认推荐值来自阶段，用户可改」）。
 *
 * ⚠️ **优先级只有三档，顺序不许换**：
 *   ① **用户自选优先**（`modeChoice` 非空 ⇒ 生效）—— §3.21 原文「自选不该被删，
 *      而该**降级为覆盖手段**」⇒ 用户选过就一定是他选的那档；
 *   ② 否则用**阶段推荐**（`recommendedProfileForStage`）；
 *   ③ 两者都没有 ⇒ `unset`（**不替用户编一个默认**）。
 *
 * ⚠️ **刻意不返回「缺省精通」** —— 那一档是**界面渲染时**的兜底，
 *   属显示口径；混进本函数会让「尚未选定」变成「已经是精通」，
 *   而 §3.19 的提问屏正是靠「还没定」来触发的。
 *
 * @param input.stageChoice 用户选的阶段（`null` = 还没进阶段）
 * @param input.tracks 全部阶段轨道行
 * @param input.modeChoice 用户自选的模式（`null` = 还没自选）
 */
export function resolveEffectiveProfile(input: {
  stageChoice: number | null
  tracks: readonly StageTrack[]
  modeChoice: LangProfile | null
}): EffectiveProfile {
  const recommendation = recommendedProfileForStage(input.stageChoice, input.tracks)

  if (input.modeChoice !== null) {
    return {
      profile: input.modeChoice,
      source: 'user',
      recommendation,
      differsFromRecommendation:
        recommendation !== null && recommendation.profile !== input.modeChoice,
    }
  }
  if (recommendation !== null) {
    return {
      profile: recommendation.profile,
      source: 'stage',
      recommendation,
      differsFromRecommendation: false,
    }
  }
  return { profile: null, source: 'unset', recommendation: null, differsFromRecommendation: false }
}

// ============================================================================
// 深链锚点（§3.21 第 5 条 · DL-43）
// ============================================================================

/** 三个稳定锚点（配套方案的每条轨道带 `links` 指回本指南 ⇒ 本模块要能反向深链）。 */
export const MODE_HASHES = {
  '#mode-vibe': 'vibe',
  '#mode-master': 'master',
  '#mode-familiar': 'familiar',
} as const

/**
 * 读 URL 片段 ⇒ 那一档的模式。
 *
 * ⚠️ **优先于 §3.19 的 onboarding 默认模式** —— 这是一条会让实现者想反着写的规则
 *   （直觉是「onboarding 先问、锚点后覆盖」），故在判据 DL-43 里钉死。
 *
 * @param hash `window.location.hash`（可带可不带 `#`）
 * @returns 对应模式；片段不是这三个之一 ⇒ `null`（⇒ 落回默认档）
 */
export function resolveProfileFromHash(hash: string): LangProfile | null {
  // ⚠️ **先 trim 再剥 `#`** —— 顺序反了的话 `'  #mode-master'` 剥不掉 `#`（`/^#/` 锚在串首）
  const key = hash.trim().replace(/^#/, '').trim().toLowerCase()
  if (key === 'mode-vibe') return 'vibe'
  if (key === 'mode-master') return 'master'
  if (key === 'mode-familiar') return 'familiar'
  return null
}
