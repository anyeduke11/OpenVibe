// `packages/shared/src/m9-roadmap.ts` —— M9 v1.6 **P3 的路线视图模型与派生口径**
// （`m9-dev-language-roadmap.md` §3.5 / §3.18 · dev-plan §6.9 P3.2）
//
// ## 它是什么
//
// P3 页面（**开发能力**）的**视图模型** ＋ 两个派生口径：
// - **当前站 M**（§3.5「你在第 M 站」）
// - **完整度**（P3.2 的「完整度标记」）
//
// ## ⚠️ 「你在第 M 站」的口径（本轮定，写在这里以便被检查）
//
// ⚠️ **规格没有给公式** —— §3.5 只写了「显示『N 个知识点 / 你在第 M 站』」，
//   §2.3 说它是「由 ①② 推出」但没写怎么推。⇒ 本轮按 **§3.18 的站位语义**取：
//
//   **当前站 M ＝ 已点亮（state ≠ 'unused'）知识点的最大站号；一个都没点亮 ⇒ M = 1。**
//
//   依据：§3.18 的转档弹层明写「**你已经站在哪** —— 把已点亮的…映射到精通路线的站位」，
//   以及「精通路线完整 **N** 站，从第 1 站开始」。⇒ 站位是**已点亮的最远一站**，
//   不是「完成的站数」也不是「平均进度」。
//
// ⚠️ **文案纪律**（§3.18）：只给位置不给结论 ⇒ 界面写「**你站到第 M 站**」，
//   **不许写「你已完成第 M 站」**（那会把「站到」说成「学完」）。
//
// ## ⚠️ 站号是 **1 起**，`stage_id` 是 **0 起**
//
// 库里 `lang_topics.stage_id` 取值 0..7（§3.6 的八站）⇒ 对外的「第 M 站」是
// `stage_id + 1`。两套编号**只在这一处换算**（`deriveCurrentStage` ＋
// `stageNoOf`），别在调用点各写一遍。
import type { MasteryState } from './m9-state'

/** 两门语言。 */
export type LangCode = 'python' | 'go'

/** 两门语言的取值闭集。 */
export const LANG_CODES: readonly LangCode[] = ['python', 'go']

/** 路线视图里的一条知识点。 */
export interface RoadmapTopic {
  id: number
  slug: string
  title: string
  summary: string
  /** 站号（**0 起**，与库里一致） */
  stage_id: number
  /** 三态（§3.3） */
  state: MasteryState
}

/** 路线视图里的一站（§3.6 的八站）。 */
export interface RoadmapStation {
  /** 站号（**0 起**） */
  stage_id: number
  /** 对外的站号（**1 起**，§3.5 的「第 M 站」） */
  stage_no: number
  /** 站名（§3.6 的八站名） */
  name: string
  /** 该站的知识点（按 id 升序） */
  topics: RoadmapTopic[]
}

/** 路线视图（§3.5 的主视图：左站列 ＋ 右当前层）。 */
export interface RoadmapView {
  lang: LangCode
  /** 知识点总数（N） */
  topic_count: number
  /** 当前站（**1 起**） */
  current_stage: number
  /** 站数 */
  station_count: number
  stations: RoadmapStation[]
}

/**
 * 把 0 起的 `stage_id` 换算成 1 起的站号。
 *
 * ⚠️ **只留这一处** —— 库里是 0 起、界面上是 1 起，两处换算必然漂移。
 */
export function stageNoOf(stageId: number): number {
  return stageId + 1
}

/**
 * 算当前站（**1 起**）。
 *
 * ⚠️ 口径见文件头：已点亮知识点的最大站号；一个都没点亮 ⇒ 1。
 *
 * ⚠️ **「一个都没点亮」不是 0** —— 0 是**没有站**（`stage_id` 的 0 起编号），
 *   而对外的站号从 1 起 ⇒ 空集时必须落在**第 1 站**，不能落在「第 0 站」。
 *
 * @param topics 该语言的知识点
 */
export function deriveCurrentStage(topics: readonly RoadmapTopic[]): number {
  let maxStage = -1
  for (const t of topics) {
    if (t.state === 'unused') continue
    if (t.stage_id > maxStage) maxStage = t.stage_id
  }
  // 一个都没点亮 ⇒ 站在第 1 站（不是第 0 站）
  if (maxStage < 0) return 1
  return stageNoOf(maxStage)
}

/** 一站的完整度（**已点亮 / 总数**）。 */
export interface StationCompleteness {
  /** 已点亮的条目数（`state ≠ 'unused'`） */
  lit: number
  /** 该站条目总数 */
  total: number
  /** 百分比（0–100，整数；`total = 0` ⇒ 0） */
  percent: number
}

/**
 * 算一站的完整度。
 *
 * ⚠️ **「点亮」＝ 不是「未涉及」** —— 「在用」与「掌握」都算点亮
 *   （它们都说明这个项目真的用到它了）；「未涉及」不算。
 *
 * @param station 一站
 */
export function stationCompleteness(station: RoadmapStation): StationCompleteness {
  const total = station.topics.length
  let lit = 0
  for (const t of station.topics) {
    if (t.state !== 'unused') lit += 1
  }
  return { lit, total, percent: total === 0 ? 0 : Math.round((lit / total) * 100) }
}

/**
 * 三态的 chip 语气（**口径只留一处**）。
 *
 * ⚠️ 语气只是**辅助** —— chip 永远配图标 ＋ 文字，颜色不单独承载语义（DESIGN.md chip 纪律）。
 */
export const MASTERY_STATE_TONE: Record<MasteryState, 'default' | 'accent' | 'ok'> = {
  unused: 'default',
  active: 'accent',
  mastered: 'ok',
}
