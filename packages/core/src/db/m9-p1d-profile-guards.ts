// `packages/core/src/db/m9-p1d-profile-guards.ts` —— M9 v1.6 **P1d · 三模式的三条可执行判据**
// （`m9-dev-language-roadmap.md` §3.17 · **DL-33 / DL-35 / DL-36**）
//
// ## 为什么单独一个模块
//
// ⚠️ **判据正文写了断言却没写可执行检查 ＝ 闸是摆设**（本仓踩过的坑）：
//   每写一条判据，就要同时写出它的**判定式**；写不出判定式的判据不该进 §7。
// 本模块就是这三条判据的**判定式**，单测直接调它们 ⇒ 变异腿能真把它们打红。
//
// ## 三条判据
//
// | 判据 | 一句话 | 本模块的判定式 |
// |---|---|---|
// | **DL-33** | 必学集合逐层包含：`vibe.required ⊆ familiar.required ⊆ master.required` | `findLayeringViolations` |
// | **DL-35** | 每个模式的必学集合**非空** | `findEmptyRequiredViolations` |
// | **DL-36** | 速成每条必学必有 `est_minutes`；精通/熟悉**恒 NULL** | `findEstMinutesViolations` |
//
// ⚠️ **DL-33 的坑不是理论风险**：本轮第一版里知识点「打包与依赖管理」把
//   「安装依赖」与「打包发布」挤在一条里，于是它同时是「速成必学」与「熟悉可跳过」
//   ⇒ 当场红。**处置是拆条目，不是把判据写松。**
import type { LangProfile } from './m9-p1d-mode-assign'

export type { LangProfile }

/** 判据读的那几列（够用即可，不要求是完整行）。 */
export interface ProfileGuardRow {
  topic_id: number
  profile: LangProfile
  required: number | boolean
  est_minutes: number | null
}

const PROFILES: LangProfile[] = ['master', 'familiar', 'vibe']

/** 把 `required` 归一成布尔（库里是 0/1，内存里可能是 true/false）。 */
function isRequired(v: number | boolean): boolean {
  return v === true || v === 1
}

/**
 * **DL-33** —— 必学集合逐层包含。
 *
 * `vibe.required ⊆ familiar.required ⊆ master.required`
 *
 * ⚠️ **逐条比，不是比计数**：计数相等但成员错位正是这条要防的。
 *
 * @returns 违规说明；**空数组 = 通过**。
 */
export function findLayeringViolations(rows: readonly ProfileGuardRow[]): string[] {
  const out: string[] = []
  // 按 topic_id 分组
  const byTopic = new Map<number, Map<LangProfile, ProfileGuardRow>>()
  for (const r of rows) {
    let m = byTopic.get(r.topic_id)
    if (m === undefined) {
      m = new Map()
      byTopic.set(r.topic_id, m)
    }
    m.set(r.profile, r)
  }
  for (const [topicId, m] of byTopic) {
    const master = m.get('master')
    const familiar = m.get('familiar')
    const vibe = m.get('vibe')
    if (master === undefined || familiar === undefined || vibe === undefined) continue
    if (isRequired(vibe.required) && !isRequired(familiar.required)) {
      out.push(`topic_id=${String(topicId)}：速成必学但熟悉不必学 ⇒ 破坏「速成 ⊆ 熟悉」`)
    }
    if (isRequired(familiar.required) && !isRequired(master.required)) {
      out.push(`topic_id=${String(topicId)}：熟悉必学但精通不必学 ⇒ 破坏「熟悉 ⊆ 精通」`)
    }
  }
  return out
}

/**
 * **DL-35** —— 每个（语言 × 模式）的必学集合**非空**。
 *
 * ⚠️ **按语言分组，不只看全局**：全局非空但某一门为空，界面在那一门仍会白屏。
 *
 * @param langOf 由调用方给出「topic_id → lang」的映射（守卫不自己查库，保持纯函数）。
 * @returns 违规说明；**空数组 = 通过**。
 */
export function findEmptyRequiredViolations(
  rows: readonly ProfileGuardRow[],
  langOf: ReadonlyMap<number, string>,
): string[] {
  const out: string[] = []
  const groups = new Map<string, { total: number; required: number }>()
  for (const r of rows) {
    const lang = langOf.get(r.topic_id)
    if (lang === undefined) continue
    const key = `${lang}/${r.profile}`
    const g = groups.get(key) ?? { total: 0, required: 0 }
    g.total += 1
    if (isRequired(r.required)) g.required += 1
    groups.set(key, g)
  }
  for (const [key, g] of groups) {
    if (g.required === 0) {
      out.push(`${key} 的必学集为空（该组共 ${String(g.total)} 条）⇒ 界面会显示空白`)
    }
  }
  // ⚠️ 压根没有出现的「语言 × 模式」组合也算违规（空列表 ⇒ 空白）
  const langs = [...new Set([...langOf.values()])].sort()
  for (const lang of langs) {
    for (const profile of PROFILES) {
      const key = `${lang}/${profile}`
      if (!groups.has(key)) out.push(`${key} 一行都没有 ⇒ 切到该模式是空列表`)
    }
  }
  return out
}

/**
 * **DL-36** —— 速成每条必学必有 `est_minutes`；精通/熟悉**恒 NULL**。
 *
 * ⚠️ **反证那一半是硬约束**：精通与熟悉的时间基线由**路线分期**承担，
 *   逐条估分钟是伪造精度 ⇒ 那两个模式的 `est_minutes` 必须**恒为 NULL**，
 *   填了就是「假装有精度」。
 *
 * @returns 违规说明；**空数组 = 通过**。
 */
export function findEstMinutesViolations(rows: readonly ProfileGuardRow[]): string[] {
  const out: string[] = []
  for (const r of rows) {
    if (r.profile === 'vibe') {
      if (isRequired(r.required)) {
        if (r.est_minutes === null || r.est_minutes <= 0) {
          out.push(`topic_id=${String(r.topic_id)}：速成必学却没有 est_minutes（须为正整数）`)
        }
      } else if (r.est_minutes !== null) {
        out.push(
          `topic_id=${String(r.topic_id)}：速成**不必学**却有 est_minutes=${String(r.est_minutes)} ⇒ 不是必学就不该计时`,
        )
      }
    } else if (r.est_minutes !== null) {
      out.push(
        `topic_id=${String(r.topic_id)}：${r.profile} 模式不该有 est_minutes（实为 ${String(r.est_minutes)}）`,
      )
    }
  }
  return out
}
