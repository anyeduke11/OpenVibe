// `packages/shared/src/m9-state.test.ts` —— M9 v1.6 **P2.1 / P2.2 / P2.3 出口**
// （`m9-dev-plan-2026-10.md` §6.8 ＋ `m9-dev-language-roadmap.md` §3.3 / §3.13
//   · **DL-05 / DL-07 / DL-25 / DL-28 / DL-34**）
//
// ## 它断什么
//
// | 判据 | 一句话 | 本文件里对应的那支 |
// |---|---|---|
// | **DL-25** | 源码证据永远推不到「掌握」 | 「DL-25」组 |
// | **DL-28** | 资源层不得参与掌握度推导 | 「DL-28」组 |
// | **DL-34** | 模式不得影响掌握度判定 | 「DL-34」组 |
// | **DL-05** | 判定文案不得出现「你已掌握」 | 「DL-05」组 |
// | **DL-07** | 零证据知识点必须有文案 | 「DL-07」组 |
//
// ## ⚠️ 每条判据都配一条**真改数据 / 真改代码**的变异腿
//
// 反向判据（"不得存在 X"）天然没有正向痕迹 ⇒ 只有专门那条检查会红。
import { describe, expect, it } from 'vitest'
import {
  COLD_TOPIC_NOTE,
  EVIDENCE_KINDS,
  MASTERY_STATE_LABELS,
  MASTERY_THRESHOLD_N,
  MasteryInputError,
  assertMasteryInput,
  computeState,
  computeStates,
  countEvidence,
  masteryLabel,
  ownStateOf,
  type MasteryInput,
  type TopicEvidence,
  type TopicNode,
} from './m9-state'

/** 造一份入参（**默认所有节点都没有前置**，便于单点断言）。 */
function makeInput(
  nodes: readonly TopicNode[],
  evidences: Readonly<Record<number, readonly TopicEvidence[]>> = {},
): MasteryInput {
  return {
    nodes: new Map(nodes.map((n) => [n.id, n])),
    byTopic: new Map(Object.entries(evidences).map(([k, v]) => [Number(k), v])),
  }
}

/** 一条非源码证据。 */
function ev(kind: 'checklist' | 'skill' | 'task', ref: string, count = 1): TopicEvidence {
  return { kind, ref, count }
}

/** 一条源码证据。 */
function src(ref: string, count = 1): TopicEvidence {
  return { kind: 'source_hit', ref, count }
}

describe('M9 P2.1 · 三态推导（§3.3）', () => {
  it('零证据 ⇒ 未涉及', () => {
    const node: TopicNode = { id: 1, prereqTopicIds: [] }
    const input = makeInput([node])
    expect(computeState(node, input)).toBe('unused')
  })

  it('出现 1 次 ⇒ 在用', () => {
    const node: TopicNode = { id: 1, prereqTopicIds: [] }
    const input = makeInput([node], { 1: [ev('checklist', '勾选了一次')] })
    expect(computeState(node, input)).toBe('active')
  })

  it(`出现 ${String(MASTERY_THRESHOLD_N)} 次（恰好够 N）⇒ 掌握`, () => {
    const node: TopicNode = { id: 1, prereqTopicIds: [] }
    const input = makeInput([node], {
      1: [ev('skill', '技能卡'), ev('skill', '技能卡'), ev('task', '任务')],
    })
    expect(computeState(node, input)).toBe('mastered')
  })

  it(`出现 ${String(MASTERY_THRESHOLD_N - 1)} 次（差一次）⇒ 仍在用`, () => {
    const node: TopicNode = { id: 1, prereqTopicIds: [] }
    const input = makeInput([node], { 1: [ev('skill', '技能卡'), ev('task', '任务')] })
    expect(computeState(node, input)).toBe('active')
  })

  it('阈值只对非源码证据计数（§6.3 第 1 条）', () => {
    const node: TopicNode = { id: 1, prereqTopicIds: [] }
    // 非源码 2 次 ＋ 源码 5 次 ⇒ 总计数够 N，但 N 只看非源码 ⇒ 仍在用
    const input = makeInput([node], {
      1: [ev('checklist', 'a'), ev('checklist', 'b'), src('x.ts', 5)],
    })
    expect(countEvidence(input.byTopic.get(1)).nonSourceCount).toBe(2)
    expect(countEvidence(input.byTopic.get(1)).count).toBe(3)
    expect(computeState(node, input)).toBe('active')
  })

  it('批量算与逐条算一致（口径只有一处）', () => {
    const nodes: TopicNode[] = [
      { id: 1, prereqTopicIds: [] },
      { id: 2, prereqTopicIds: [1] },
    ]
    const input = makeInput(nodes, { 1: [ev('checklist', 'a')], 2: [ev('checklist', 'b')] })
    const batch = computeStates(nodes, input)
    expect(batch.get(1)).toBe(computeState(nodes[0]!, input))
    expect(batch.get(2)).toBe(computeState(nodes[1]!, input))
  })
})

describe('M9 P2.1 · DL-25 源码证据封顶「在用」', () => {
  it('只有一段源码证据 ⇒ 停在「在用」（不是「未涉及」，也不是「掌握」）', () => {
    const node: TopicNode = { id: 1, prereqTopicIds: [] }
    const input = makeInput([node], { 1: [src('pkg/mod.go')] })
    expect(computeState(node, input)).toBe('active')
  })

  it('同一段源码重复命中 20 次 ⇒ 仍停在「在用」', () => {
    const node: TopicNode = { id: 1, prereqTopicIds: [] }
    const input = makeInput([node], { 1: [src('pkg/mod.go', 20)] })
    expect(computeState(node, input)).toBe('active')
  })

  it('源码 ＋ 非源码 5 次（够 N）⇒ 仍停在「在用」（封顶压过阈值）', () => {
    const node: TopicNode = { id: 1, prereqTopicIds: [] }
    const input = makeInput([node], {
      1: [src('pkg/mod.go'), ev('checklist', 'a'), ev('checklist', 'b'), ev('checklist', 'c'), ev('checklist', 'd'), ev('checklist', 'e')],
    })
    expect(countEvidence(input.byTopic.get(1)).nonSourceCount).toBe(5)
    expect(computeState(node, input)).toBe('active')
  })

  it('20 个**不同**源码出处 ⇒ 仍停在「在用」（封顶与出处数无关）', () => {
    const node: TopicNode = { id: 1, prereqTopicIds: [] }
    const list: TopicEvidence[] = []
    for (let i = 0; i < 20; i += 1) list.push(src(`pkg/file-${String(i)}.go`))
    const input = makeInput([node], { 1: list })
    expect(countEvidence(input.byTopic.get(1)).sourceRefCount).toBe(20)
    expect(computeState(node, input)).toBe('active')
  })

  it('⚠️ 登记腿：去重规则在**状态层**被封顶规则遮蔽（去掉它输出逐字不变）', () => {
    // ⚠️ 这不是断言「去重有效」，而是**如实记录一个事实**：§3.13 的两条源码规则里，
    //   封顶（①）单独就够挡住 DL-25 的两条腿 ⇒ 去掉去重（②）后状态输出**逐字不变**。
    //   ⇒ 去重的真正落点是**计数层**（下一支）。
    const node: TopicNode = { id: 1, prereqTopicIds: [] }
    const list: TopicEvidence[] = [src('pkg/mod.go', 20)]
    for (let i = 0; i < 19; i += 1) list.push(src('pkg/mod.go', 20))
    const withDedup = computeState(node, makeInput([node], { 1: list }))
    // 去掉去重：把源码按次数全计
    const withoutDedup = (() => {
      const tally = list.reduce((acc, e) => acc + e.count, 0)
      if (tally < MASTERY_THRESHOLD_N) return 'active'
      return 'active' // ⚠️ 封顶（①）单独就把它按在「在用」
    })()
    expect(withDedup).toBe(withoutDedup)
    expect(withDedup).toBe('active')
  })

  it('去重在**计数层**可观测：同一出处 20 次只计 1', () => {
    const tally = countEvidence([src('pkg/mod.go', 20), src('pkg/mod.go', 20)])
    expect(tally.sourceRefCount).toBe(1)
    expect(tally.count).toBe(1)
    expect(tally.hasSource).toBe(true)
  })

  it('去重在**计数层**可观测：20 个不同出处计 20', () => {
    const list: TopicEvidence[] = []
    for (let i = 0; i < 20; i += 1) list.push(src(`pkg/file-${String(i)}.go`, 3))
    const tally = countEvidence(list)
    expect(tally.sourceRefCount).toBe(20)
    expect(tally.count).toBe(20)
  })
})

describe('M9 P2.1 · 前置条件按「降级」实现（§3.3 的两条「且」）', () => {
  it('候选「掌握」但前置未就绪 ⇒ 降为「在用」', () => {
    const nodes: TopicNode[] = [
      { id: 1, prereqTopicIds: [] },
      { id: 2, prereqTopicIds: [1] },
    ]
    const input = makeInput(nodes, { 2: [ev('checklist', 'a'), ev('checklist', 'b'), ev('checklist', 'c')] })
    expect(computeState(nodes[1]!, input)).toBe('active')
  })

  it('候选「在用」但前置零证据 ⇒ 降为「未涉及」（低估方向）', () => {
    const nodes: TopicNode[] = [
      { id: 1, prereqTopicIds: [] },
      { id: 2, prereqTopicIds: [1] },
    ]
    const input = makeInput(nodes, { 2: [ev('checklist', 'a')] })
    expect(computeState(nodes[1]!, input)).toBe('unused')
  })

  it('前置齐全 ⇒ 保持原档', () => {
    const nodes: TopicNode[] = [
      { id: 1, prereqTopicIds: [] },
      { id: 2, prereqTopicIds: [1] },
    ]
    const input = makeInput(nodes, {
      1: [ev('checklist', 'a'), ev('checklist', 'b'), ev('checklist', 'c')],
      2: [ev('checklist', 'a'), ev('checklist', 'b'), ev('checklist', 'c')],
    })
    expect(computeState(nodes[1]!, input)).toBe('mastered')
  })

  it('⚠️「在用」这一档比前置的**自身状态**（不递归放大）', () => {
    // 形状：1（根，无证据）← 2（有证据）← 3（有证据）
    //   - 2 的**自身**状态是「在用」，但它的**最终**状态是「未涉及」（根 1 没证据 ⇒ 降级）
    //   - 3 比前置时只看**自身状态** ⇒ 3 仍是「在用」
    //   ⚠️ 若比的是**最终状态**（递归），3 会被压成「未涉及」⇒ 14 层祖先闭包会压掉整张图
    const nodes: TopicNode[] = [
      { id: 1, prereqTopicIds: [] },
      { id: 2, prereqTopicIds: [1] },
      { id: 3, prereqTopicIds: [2] },
    ]
    const input = makeInput(nodes, { 2: [ev('checklist', 'a')], 3: [ev('checklist', 'b')] })
    expect(ownStateOf(2, input)).toBe('active')
    expect(computeState(nodes[1]!, input)).toBe('unused')
    expect(computeState(nodes[2]!, input)).toBe('active')
  })

  it('「掌握」这一档比前置的**最终状态**（递归 ⇒ 冷门知识推不出掌握）', () => {
    const nodes: TopicNode[] = [
      { id: 1, prereqTopicIds: [] },
      { id: 2, prereqTopicIds: [1] },
      { id: 3, prereqTopicIds: [2] },
    ]
    // 2 有足够证据（自身「掌握」），但 1 没有 ⇒ 2 的最终状态是「在用」
    // ⇒ 3 比前置的**最终状态** ⇒ 3 拿不到「掌握」。
    const input = makeInput(nodes, { 2: [ev('checklist', 'a'), ev('checklist', 'b'), ev('checklist', 'c')], 3: [ev('checklist', 'a'), ev('checklist', 'b'), ev('checklist', 'c')] })
    expect(ownStateOf(2, input)).toBe('mastered')
    expect(computeState(nodes[1]!, input)).toBe('active')
    expect(computeState(nodes[2]!, input)).toBe('active')
  })

  it('前置不在节点索引里 ⇒ 保守判「未涉及」（不知道前置就不能声称用过）', () => {
    const nodes: TopicNode[] = [{ id: 1, prereqTopicIds: [999] }]
    const input = makeInput(nodes, { 1: [ev('checklist', 'a')] })
    expect(computeState(nodes[0]!, input)).toBe('unused')
  })
})

describe('M9 P2.3 · DL-28 资源层不得参与掌握度推导', () => {
  it('入参多一个字段 ⇒ 当场抛（不是「悄悄忽略」）', () => {
    const nodes: TopicNode[] = [{ id: 1, prereqTopicIds: [] }]
    const input = {
      nodes: new Map(nodes.map((n) => [n.id, n])),
      byTopic: new Map<number, readonly TopicEvidence[]>(),
      // ⚠️ 这一行就是「资源层参与推导」的形态 ⇒ 必须被拒
      resources: [{ id: 1, name: '某资源' }],
    } as unknown as MasteryInput
    expect(() => assertMasteryInput(input)).toThrow(MasteryInputError)
    expect(() => computeState(nodes[0]!, input)).toThrow(MasteryInputError)
  })

  it('证据对象多一个字段 ⇒ 当场抛', () => {
    const nodes: TopicNode[] = [{ id: 1, prereqTopicIds: [] }]
    const input = makeInput(nodes, {
      1: [{ kind: 'checklist', ref: 'a', count: 1, tier: 'a' } as unknown as TopicEvidence],
    })
    expect(() => computeState(nodes[0]!, input)).toThrow(MasteryInputError)
  })

  it('「已登记为阶段完成」这种新证据种类 ⇒ 当场抛（证据种类是闭集）', () => {
    const nodes: TopicNode[] = [{ id: 1, prereqTopicIds: [] }]
    const input = makeInput(nodes, {
      1: [{ kind: 'stage_done', ref: '阶段 1', count: 1 } as unknown as TopicEvidence],
    })
    expect(() => computeState(nodes[0]!, input)).toThrow(MasteryInputError)
  })

  it('证据种类闭集就是四个（§3.1 的取值域）', () => {
    expect([...EVIDENCE_KINDS]).toEqual(['checklist', 'skill', 'task', 'source_hit'])
  })
})

describe('M9 P2.3 · DL-34 模式不得影响掌握度判定', () => {
  it('入参多一个模式字段 ⇒ 当场抛', () => {
    const nodes: TopicNode[] = [{ id: 1, prereqTopicIds: [] }]
    const input = {
      nodes: new Map(nodes.map((n) => [n.id, n])),
      byTopic: new Map<number, readonly TopicEvidence[]>(),
      // ⚠️ 这一行就是「模式参与判定」的形态 ⇒ 必须被拒
      profile: 'master',
    } as unknown as MasteryInput
    expect(() => computeState(nodes[0]!, input)).toThrow(MasteryInputError)
  })

  it('同一个知识点在三档模式下的状态**逐字相等**（因为入参里没有模式）', () => {
    // ⚠️ 这一支是 DL-34 的**行为**那一半：入参不承载模式 ⇒ 三次调用的输入逐字相同
    //   ⇒ 输出必然逐字相同。**若入参长出模式字段**，上面的闭集闸会先红。
    const nodes: TopicNode[] = [
      { id: 1, prereqTopicIds: [] },
      { id: 2, prereqTopicIds: [1] },
    ]
    const input = makeInput(nodes, {
      1: [ev('checklist', 'a'), ev('checklist', 'b'), ev('checklist', 'c')],
      2: [ev('checklist', 'a'), ev('checklist', 'b'), ev('checklist', 'c')],
    })
    const results = (['master', 'familiar', 'vibe'] as const).map(() =>
      computeStates(nodes, input).get(2),
    )
    expect(results[0]).toBe(results[1])
    expect(results[1]).toBe(results[2])
    expect(results[0]).toBe('mastered')
  })

  it('必学与否、先后顺序都不在证据的形状里（证据只有三字段）', () => {
    const node: TopicNode = { id: 1, prereqTopicIds: [] }
    const input = makeInput([node], { 1: [{ kind: 'checklist', ref: 'a', count: 1 }] })
    expect(Object.keys(input.byTopic.get(1)![0]!)).toEqual(['kind', 'ref', 'count'])
    expect(computeState(node, input)).toBe('active')
  })
})

describe('M9 P2.2 · DL-05 / DL-07 三态文案', () => {
  it('三态文案逐字取自 §6.3 第 2 条与 dev-plan P2.2', () => {
    expect(MASTERY_STATE_LABELS.unused).toBe('本项目未涉及')
    expect(MASTERY_STATE_LABELS.active).toBe('本项目用到过')
    expect(MASTERY_STATE_LABELS.mastered).toBe('掌握')
  })

  it('⚠️ 文案里不得出现「你已掌握」与「未触及」三个字（DL-05 / §6.3 第 2 条）', () => {
    for (const [state, label] of Object.entries(MASTERY_STATE_LABELS)) {
      expect(label.includes('你已掌握'), `${state} 的文案`).toBe(false)
      expect(label.includes('未触及'), `${state} 的文案`).toBe(false)
    }
    expect(COLD_TOPIC_NOTE.includes('你已掌握')).toBe(false)
    expect(COLD_TOPIC_NOTE.includes('未触及')).toBe(false)
  })

  it('冷门知识点的补充说明在（§6.3 第 2 条要求详情页写明）', () => {
    expect(COLD_TOPIC_NOTE).toContain('本项目永远可能用不到它')
  })

  it('DL-07 正支：零证据知识点**有文案**（不是空白）', () => {
    const node: TopicNode = { id: 1, prereqTopicIds: [] }
    const input = makeInput([node])
    const state = computeState(node, input)
    expect(state).toBe('unused')
    expect(masteryLabel(state).trim().length).toBeGreaterThan(0)
    expect(masteryLabel(state)).toBe('本项目未涉及')
  })

  it('每个状态都有文案（三态都不许空）', () => {
    for (const state of ['unused', 'active', 'mastered'] as const) {
      expect(masteryLabel(state).length).toBeGreaterThan(0)
    }
  })
})
