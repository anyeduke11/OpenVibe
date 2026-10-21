// `packages/shared/src/m9-roadmap.test.ts` —— M9 v1.6 **P3 的派生口径**
// （`m9-dev-language-roadmap.md` §3.5 / §3.18 · dev-plan §6.9 P3.2）
//
// ## 它断什么
//
// 两个派生口径（「口径只留一处」的落点）：
// ① **当前站 M**（§3.5「你在第 M 站」）—— 规格没给公式，本轮按 §3.18 的站位语义定；
// ② **完整度**（P3.2 的「已点亮 X / 共 Y」）—— 「点亮」＝ 不是「未涉及」。
//
// ## ⚠️ 判据正文写了断言却没写可执行检查 ＝ 闸是摆设
//
// 所以每条口径都配一支**变异腿**：真的把输入改掉，断言结果跟着变 ——
// 证明「这个数是被这些输入决定的」，而不是碰巧等于某个常量。
import { describe, expect, it } from 'vitest'
import {
  deriveCurrentStage,
  stageNoOf,
  stationCompleteness,
  MASTERY_STATE_TONE,
  LANG_CODES,
  type RoadmapStation,
  type RoadmapTopic,
} from './m9-roadmap'

function topic(id: number, stageId: number, state: RoadmapTopic['state']): RoadmapTopic {
  return { id, slug: `t${String(id)}`, title: `T${String(id)}`, summary: '', stage_id: stageId, state }
}

describe('M9 P3.2 · 站号换算（0 起 ↔ 1 起）', () => {
  it('库里 0 起 ⇒ 对外 1 起', () => {
    expect(stageNoOf(0)).toBe(1)
    expect(stageNoOf(7)).toBe(8)
  })
})

describe('M9 P3.2 · 当前站 M（§3.5 / §3.18）', () => {
  it('当前站 ＝ 已点亮知识点的最大站号（1 起）', () => {
    const topics = [
      topic(1, 0, 'unused'),
      topic(2, 1, 'active'),
      topic(3, 2, 'unused'),
      topic(4, 3, 'mastered'),
    ]
    expect(deriveCurrentStage(topics)).toBe(4)
  })

  it('一个都没点亮 ⇒ 第 1 站（**不是第 0 站**）', () => {
    expect(deriveCurrentStage([])).toBe(1)
    expect(deriveCurrentStage([topic(1, 0, 'unused'), topic(2, 3, 'unused')])).toBe(1)
  })

  it('变异腿：把最高那一站点亮 ⇒ 当前站从 1 变 4（证明它真的读状态）', () => {
    const topics = [topic(1, 0, 'unused'), topic(2, 3, 'active')]
    expect(deriveCurrentStage(topics)).toBe(4)
    topics[1] = topic(2, 3, 'unused')
    expect(deriveCurrentStage(topics)).toBe(1)
  })

  it('变异腿：站号变大 ⇒ 当前站跟着大（证明它读的是站号不是个数）', () => {
    const topics = [topic(1, 0, 'active'), topic(2, 1, 'active')]
    expect(deriveCurrentStage(topics)).toBe(2)
    topics[1] = topic(2, 5, 'active')
    expect(deriveCurrentStage(topics)).toBe(6)
  })
})

describe('M9 P3.2 · 完整度（「点亮」＝ 不是「未涉及」）', () => {
  const station = (topics: RoadmapTopic[]): RoadmapStation => ({
    stage_id: 0,
    stage_no: 1,
    name: '语法基础',
    topics,
  })

  it('在用与掌握都算点亮', () => {
    const s = station([topic(1, 0, 'active'), topic(2, 0, 'mastered'), topic(3, 0, 'unused')])
    const r = stationCompleteness(s)
    expect(r.lit).toBe(2)
    expect(r.total).toBe(3)
    expect(r.percent).toBe(67)
  })

  it('空站是 0/0（不是 NaN、不是 100%）', () => {
    const r = stationCompleteness(station([]))
    expect(r.lit).toBe(0)
    expect(r.total).toBe(0)
    expect(r.percent).toBe(0)
  })

  it('变异腿：把「在用」改成「未涉及」⇒ 点亮数减一（证明口径不是「掌握」）', () => {
    const s = station([topic(1, 0, 'active'), topic(2, 0, 'mastered')])
    expect(stationCompleteness(s).lit).toBe(2)
    s.topics[0] = topic(1, 0, 'unused')
    expect(stationCompleteness(s).lit).toBe(1)
  })
})

describe('M9 P3.2 · 三态的 chip 语气（口径只留一处）', () => {
  it('三态各有语气，且语气都落在 chip 的六形制之内', () => {
    expect(MASTERY_STATE_TONE).toEqual({ unused: 'default', active: 'accent', mastered: 'ok' })
    const allowed = new Set(['default', 'accent', 'ok', 'warn', 'danger', 'info'])
    for (const tone of Object.values(MASTERY_STATE_TONE)) {
      expect(allowed.has(tone)).toBe(true)
    }
  })
})

describe('M9 · 两门语言', () => {
  it('闭集是两门，不多不少', () => {
    expect(LANG_CODES).toEqual(['python', 'go'])
  })
})
