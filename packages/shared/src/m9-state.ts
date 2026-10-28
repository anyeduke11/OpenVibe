// `packages/shared/src/m9-state.ts` —— M9 v1.6 **P2 · 掌握度推导的纯计算层**
// （`m9-dev-plan-2026-10.md` §6.8 ＋ `m9-dev-language-roadmap.md` §2.2 / §3.3 / §3.13
//   · **DL-05 / DL-07 / DL-25 / DL-28 / DL-34**）
//
// ## 它是什么
//
// §3.3 的三态判定，**写进代码而不是写进注释**（§3.13 末段明写的要求）——
// 因为 DL-25 是 50 条里**唯一「不验就会真的算错」**的一条：
// 它是「组合推断会多走一步」型缺陷（单看每条证据都合理，**只有叠加时才出错**），
// 而缺陷**不阻塞任何东西** ⇒ 写完 P1–P4 才发现状态算错，代价最大。
//
// ```
// 未触及 unused  ← 该知识点的词面在项目活动里 0 次出现
// 在用   active  ← 出现过（未达「掌握」阈值，或前置未就绪）
// 掌握 mastered ← 出现 ≥ N 次 且 其前置全部「掌握」
// ```
//
// ## ⚠️ 两条不可越的线（**入参里没有它们的位置**）
//
// - **DL-28 · 资源层不得参与掌握度** ⇒ 入参里**没有任何资源层字段**
//   （`TopicEvidence` 只有 `kind` / `ref` / `count`）。⚠️ 同源于 §2.2：
//   掺进时间因子，「学了 3 个月」就能点亮没碰过的知识点。
// - **DL-34 · 模式不得影响掌握度判定** ⇒ 入参里**没有任何模式字段**
//   （三档模式与它们的必学集、先学顺序一个都不在）。
//   ⇒ 三个模式下同一条知识点的状态**结构上**必然逐字相等。
//
// ⚠️ 这两条**不是靠「实现时记得别用」守住的**：`assertMasteryInput` 在**运行时**
//   拒绝任何多余字段（多一个键即抛）⇒ 违规在第一次调用时当场红，而不是在评审时才被看见。
//
// ## ⚠️ 源码证据的两条规则（§3.13）
//
// ① **封顶**：`source_hit` 证据 ⇒ 状态上限是 `active`（在用），**永远到不了 `mastered`**。
//    ⚠️ **任何组合、任何加权、多高都推不到 mastered**（§3.13 原话）。
// ② **去重**：源码证据在计数时按「**最多算 1 次**」处理 —— 同一段源码重复命中 20 次
//    只算 1 次（§3.13 末段：重复命中只增加确定性不增加掌握度）。
//
// ⚠️ **规则 ② 在最终实现里被规则 ① 遮蔽**（去掉 ② 而留着 ①，输出**逐字不变**）——
//   这是**事实不是设计意图**，如实登记在此：① 单独就足够挡住 DL-25 的两条腿。
//   ⇒ ② 仍在实现里（§3.13 明确要求），且它**在计数层是可观测的**
//   （`countEvidence` 对同一 ref 的 20 次命中只计 1）—— 那才是它的测试落点；
//   状态层的「去掉 ② 仍不变」由 `m9-state.test.ts` 的**登记腿**如实记下。
//
// ## ⚠️ 三处规格张力，本轮各取一个方向并写死在这里
//
// **① §3.3 的阶梯不是划分。** 三行各自给了**充分条件**，但没有一条说「不满足时归哪一档」：
//   「出现过 1~2 次且前置全部 ≥ 在用」不满足时，既不是「0 次出现」也不是「在用」也不是「掌握」。
//   ⇒ 本轮取**降级**方向（永远是低估，§3.3 已知不可靠处第 1 条：
//   「误判方向是把高估变成低估，可接受；反过来不可接受」）：
//   - 候选 `active` 而前置未全部「≥ 在用」 ⇒ **降为 `unused`**；
//   - 候选 `mastered` 而前置未全部 `mastered` ⇒ **降为 `active`**。
//   ⚠️ **副作用如实登记**：降级到 `unused` 时，文案「本项目未涉及」严格说是**低估**
//   （该知识点的词面确实出现过）—— 这是规格明写可接受的方向，**未改规格**。
//
// **② 「前置」的判定口径。** 「其前置全部 ≥ 在用」若按**递归**理解
//   （前置自己的状态又受它自己的前置约束），会形成**祖先闭包**要求 ——
//   而本仓 DAG 的祖先闭包最深 **14 层**、**63/72** 个知识点有前置（实测，2026-10-21）。
//   ⇒ 那样只有 9 个根知识点可能显示「本项目用到过」，其余全部压成「本项目未涉及」，
//   **三态形同虚设**。⇒ 本轮把口径写死为：
//   - **「在用」这一档**比前置的**自身状态**（`ownState`：只看它自己有没有证据），
//     比的是**直接前置**（不递归放大）—— 问的是「它的地基在项目里出现过没有」；
//   - **「掌握」这一档**比前置的**最终状态**（递归）—— 「其前置全部掌握」是严格的，
//     递归正是「冷门知识永远推不出掌握」（§3.3 已知不可靠处第 3 条）想要的。
//
// **③ 阈值 N 数哪些证据。** §3.3 写「出现 ≥ N 次」，§6.3 第 1 条写「**N 只对
//   `checklist`/`skill`/`task` 三类证据计数**（源码证据本就不进这条计数）」，
//   而 DL-25 要求「项目里只有一段用了 goroutine／装饰器、无任何其他证据 ⇒ 状态**必须停在 `active`**」。
//   ⇒ 若把源码证据完全排除在计数外，它会掉进「0 次出现」⇒ 变成 `unused` ⇒ **与 DL-25 冲突**。
//   ⇒ 本轮的口径是**唯一能同时满足三条的那一个**：
//   - **「出现过没有」**看**总计数**（源码按去重后计）⇒ 只有源码证据 ⇒ 出现过 ⇒ 不是 `unused`；
//   - **「够不够 N」**只看**非源码计数** ⇒ §6.3 第 1 条逐字成立；
//   - **封顶**另算 ⇒ 源码证据在场就永远到不了 `mastered`。
//   ⚠️ 三条**同时**成立是本轮的口径，任何一条单独改都会破另一条 ⇒ 改这里要重跑全部三支腿。

/** 三态（§2.3 原语② · §3.3）。 */
export type MasteryState = 'unused' | 'active' | 'mastered'

/** 证据种类（§3.1 `lang_topic_state.evidence_kind` 的取值域 —— **闭集**）。 */
export type EvidenceKind = 'checklist' | 'skill' | 'task' | 'source_hit'

/** 证据种类的运行时闭集（**新增一种必须先改这里**）。 */
export const EVIDENCE_KINDS: readonly EvidenceKind[] = ['checklist', 'skill', 'task', 'source_hit']

/**
 * 一条证据。
 *
 * ⚠️ **刻意只有三个字段** —— 没有资源 id、没有阶段 id、没有档位、没有模式
 *   ⇒ DL-28（资源层不得参与）与 DL-34（模式不得影响判定）**结构上成立**，
 *   不靠「实现时记得别用」。
 */
export interface TopicEvidence {
  /** 证据种类 */
  kind: EvidenceKind
  /** 证据出处（勾选项 / 技能名 / 任务 id / 源码相对路径） */
  ref: string
  /** 出现次数 */
  count: number
}

/** 一个知识点节点（拓扑）。 */
export interface TopicNode {
  id: number
  /** 前置知识点的 id（`lang_topic_edges`） */
  prereqTopicIds: readonly number[]
}

/**
 * 推导入参。
 *
 * ⚠️ **只有两样东西**：拓扑与证据。**没有模式、没有资源、没有时间**。
 */
export interface MasteryInput {
  /** 节点索引：id → 节点 */
  nodes: ReadonlyMap<number, TopicNode>
  /** 证据索引：topicId → 该知识点的证据 */
  byTopic: ReadonlyMap<number, readonly TopicEvidence[]>
}

/**
 * 「掌握」的阈值 N（§3.3 第 2 条：「N 的取值无客观依据 —— 这是**产品判断不是技术判断**」）。
 *
 * ⚠️ **N = 3 是 §6.3 第 1 条的自定默认值，owner 尚未签收** ⇒
 *   裁定后**只改这一个常量**，其余口径不动。
 */
export const MASTERY_THRESHOLD_N = 3

/**
 * 三态文案（§3.3 / §6.3 第 2 条）。
 *
 * ⚠️ **两条文案纪律**（DL-05 / §6.3 第 2 条）：
 * - 不得出现「**你已掌握**」—— 这套推断**只认得出「用过」**（§3.3 末段）；
 * - 不得出现「**未触及**」三个字 —— 一律写「**本项目未涉及**」。
 *
 * ⚠️ 三条文案**都是关于项目的事实**，不是关于人的判断（§3.5 的降级提示与状态文案分离）。
 */
export const MASTERY_STATE_LABELS: Record<MasteryState, string> = {
  unused: '本项目未涉及',
  active: '本项目用到过',
  mastered: '掌握',
}

/**
 * 冷门知识点的补充说明（§6.3 第 2 条：「详情页必须写明『**本项目永远可能用不到它**（冷门知识点）』」）。
 *
 * ⚠️ 它是**关于项目的陈述**，不是对人的判断 —— 与状态文案同款纪律。
 */
export const COLD_TOPIC_NOTE = '本项目永远可能用不到它（冷门知识点）'

/** 计数结果。 */
export interface EvidenceTally {
  /** 总计数：非源码按次数全计 ＋ 源码按**不同出处各计 1**（§3.13 的去重） */
  count: number
  /** 其中来自非源码证据的部分（**阈值 N 只看这个**，§6.3 第 1 条） */
  nonSourceCount: number
  /** 源码证据的**不同出处**个数（去重后的结果；同一个出处重复命中只算 1） */
  sourceRefCount: number
  /** 是否有源码证据参与（⇒ 状态封顶在 `active`） */
  hasSource: boolean
}

/**
 * 数证据。
 *
 * ⚠️ **两条规则都在这里**（口径只留一处）：
 * - ① 非源码证据（`checklist` / `skill` / `task`）**按次数全计**；
 * - ② 源码证据**按不同出处各计 1 次**（同一段源码命中 20 次 ⇒ 只算 1 次）。
 *
 * @param evidence 该知识点的证据（`undefined` ⇒ 零证据）
 */
export function countEvidence(evidence: readonly TopicEvidence[] | undefined): EvidenceTally {
  if (!evidence || evidence.length === 0) {
    return { count: 0, nonSourceCount: 0, sourceRefCount: 0, hasSource: false }
  }
  let nonSourceCount = 0
  const sourceRefs = new Set<string>()
  for (const e of evidence) {
    if (e.kind === 'source_hit') {
      sourceRefs.add(e.ref)
      continue
    }
    nonSourceCount += e.count > 0 ? e.count : 0
  }
  return {
    count: nonSourceCount + sourceRefs.size,
    nonSourceCount,
    sourceRefCount: sourceRefs.size,
    hasSource: sourceRefs.size > 0,
  }
}

/**
 * 某个知识点**自身**的状态（**只看它自己的证据，不看前置**）。
 *
 * ⚠️ 这是「在用」那一档比前置时用的口径（见文件头张力 ② 第 ① 条）：
 *   问的是「它的地基在项目里出现过没有」，不是「它的地基的地基出现过没有」。
 *
 * @param id 知识点 id
 * @param input 拓扑 ＋ 证据
 */
export function ownStateOf(id: number, input: MasteryInput): MasteryState {
  const tally = countEvidence(input.byTopic.get(id))
  // 「0 次出现」⇒ 没有任何证据（源码也算出现，见文件头张力 ③）
  if (tally.count <= 0) return 'unused'
  // ⚠️ **规则 ①（封顶）**：有源码证据 ⇒ 再多也到不了 `mastered`（§3.13）。
  if (tally.hasSource) return 'active'
  // ⚠️ **阈值只看非源码计数**（§6.3 第 1 条：「N 只对三类证据计数」）。
  if (tally.nonSourceCount >= MASTERY_THRESHOLD_N) return 'mastered'
  return 'active'
}

/** 递归深度上限（环的兜底；正常 DAG 远小于它）。 */
const MAX_DEPTH = 64

/**
 * 算一个知识点的状态。
 *
 * ⚠️ **前置条件按「降级」实现**（§3.3 的两条「且」，见文件头张力 ①）：
 * - 候选 `mastered` 但前置不全 `mastered` ⇒ 降为 `active`；
 * - 候选 `active` 但前置未全 ≥ `active` ⇒ 降为 `unused`。
 *
 * ⚠️ **降级方向永远是「低估」**（§3.3 的已知不可靠处第 1 条：
 *   「误判方向是把高估变成低估，可接受；反过来不可接受」）。
 *
 * @param topic 目标知识点
 * @param input 拓扑 ＋ 证据
 */
export function computeState(topic: TopicNode, input: MasteryInput): MasteryState {
  assertMasteryInput(input)
  return gatedStateOf(topic.id, topic, input, new Map(), 0)
}

/**
 * 最终状态（**含前置门槛**）。
 *
 * ⚠️ 两档比前置的**口径不同**（见文件头张力 ②）：
 * - 「掌握」这一档比前置的**最终状态**（递归 ⇒ 冷门知识推不出掌握）；
 * - 「在用」这一档比前置的**自身状态**（不递归 ⇒ 不会把 14 层祖先闭包全压成未涉及）。
 */
function gatedStateOf(
  id: number,
  node: TopicNode,
  input: MasteryInput,
  memo: Map<number, MasteryState>,
  depth: number,
): MasteryState {
  const cached = memo.get(id)
  if (cached !== undefined) return cached
  if (depth > MAX_DEPTH) return 'unused'

  const own = ownStateOf(id, input)
  if (own === 'unused') {
    memo.set(id, 'unused')
    return 'unused'
  }

  if (own === 'mastered') {
    // 「其前置全部「掌握」」—— 比前置的**最终状态**（递归）。
    const allMastered = node.prereqTopicIds.every(
      (pid) => prereqGatedState(pid, input, memo, depth + 1) === 'mastered',
    )
    const result = allMastered ? 'mastered' : 'active'
    memo.set(id, result)
    return result
  }

  // 「其前置全部 ≥ 在用」—— 比前置的**自身状态**（不递归放大）。
  const allActive = node.prereqTopicIds.every((pid) => {
    const p = ownStateOf(pid, input)
    return p === 'active' || p === 'mastered'
  })
  const result = allActive ? 'active' : 'unused'
  memo.set(id, result)
  return result
}

/** 取前置的最终状态（节点不在索引里 ⇒ 保守判「未涉及」：不知道前置 ⇒ 不能声称用过）。 */
function prereqGatedState(
  id: number,
  input: MasteryInput,
  memo: Map<number, MasteryState>,
  depth: number,
): MasteryState {
  const node = input.nodes.get(id)
  if (node === undefined) return 'unused'
  return gatedStateOf(id, node, input, memo, depth)
}

/**
 * 批量算（**按入参顺序**返回，便于逐条断言）。
 *
 * @param topics 要算的知识点
 * @param input 拓扑 ＋ 证据
 */
export function computeStates(
  topics: readonly TopicNode[],
  input: MasteryInput,
): Map<number, MasteryState> {
  assertMasteryInput(input)
  const memo = new Map<number, MasteryState>()
  const out = new Map<number, MasteryState>()
  for (const t of topics) out.set(t.id, gatedStateOf(t.id, t, input, memo, 0))
  return out
}

/** 取某个状态的中文文案。 */
export function masteryLabel(state: MasteryState): string {
  return MASTERY_STATE_LABELS[state]
}

// ============================================================================
// 入参形状闸（DL-28 / DL-34 的**运行时**那一半）
// ============================================================================

/** 入参形状不合法时抛出。 */
export class MasteryInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MasteryInputError'
  }
}

/** 入参允许出现的键（**闭集**）。 */
const INPUT_KEYS = ['nodes', 'byTopic'] as const
/** 节点允许出现的键（**闭集**）。 */
const NODE_KEYS = ['id', 'prereqTopicIds'] as const
/** 证据允许出现的键（**闭集**）。 */
const EVIDENCE_KEYS = ['kind', 'ref', 'count'] as const

/**
 * 断「入参里没有多余字段」。
 *
 * ⚠️ **为什么必须是运行时而不是注释** —— DL-28 与 DL-34 都是**否定式**判据
 *   （「不得存在 X」）：加一个字段、传一个字段，代码照常编译、状态照常算出来，
 *   只有专门那条检查会红。⇒ 这里把「闭集」写成**会抛**的断言：
 *   违规在第一次调用时当场炸，而不是在评审时才被看见。
 *
 * ⚠️ **为什么连证据对象的键也断** —— 「让已登记为阶段完成把知识点点亮」（DL-28 的变异腿）
 *   有两条实现路径：多传一个入参字段，或多造一种证据种类。⇒ 两条都要堵。
 *
 * @param input 待校验的推导入参
 * @throws MasteryInputError 入参含多余键、缺键，或证据种类不在闭集内
 */
export function assertMasteryInput(input: MasteryInput): void {
  if (input === null || typeof input !== 'object') {
    throw new MasteryInputError('推导入参必须是一个对象')
  }
  assertClosedKeys(input, INPUT_KEYS, '推导入参')
  if (!(input.nodes instanceof Map)) {
    throw new MasteryInputError('推导入参的节点索引必须是 Map')
  }
  if (!(input.byTopic instanceof Map)) {
    throw new MasteryInputError('推导入参的证据索引必须是 Map')
  }
  for (const [id, node] of input.nodes) {
    if (node === null || typeof node !== 'object') {
      throw new MasteryInputError(`节点 ${String(id)} 必须是对象`)
    }
    assertClosedKeys(node, NODE_KEYS, `节点 ${String(id)}`)
    if (typeof node.id !== 'number') {
      throw new MasteryInputError(`节点 ${String(id)} 的 id 必须是数字`)
    }
    if (!Array.isArray(node.prereqTopicIds)) {
      throw new MasteryInputError(`节点 ${String(id)} 的前置清单必须是数组`)
    }
    for (const pid of node.prereqTopicIds) {
      if (typeof pid !== 'number') {
        throw new MasteryInputError(`节点 ${String(id)} 的前置 id 必须是数字`)
      }
    }
  }
  for (const [id, list] of input.byTopic) {
    if (!Array.isArray(list)) {
      throw new MasteryInputError(`知识点 ${String(id)} 的证据清单必须是数组`)
    }
    for (const e of list) {
      if (e === null || typeof e !== 'object') {
        throw new MasteryInputError(`知识点 ${String(id)} 的证据必须是对象`)
      }
      assertClosedKeys(e, EVIDENCE_KEYS, `知识点 ${String(id)} 的证据`)
      if (!EVIDENCE_KINDS.includes(e.kind)) {
        throw new MasteryInputError(`知识点 ${String(id)} 的证据种类不在闭集内`)
      }
      if (typeof e.ref !== 'string') {
        throw new MasteryInputError(`知识点 ${String(id)} 的证据出处必须是字符串`)
      }
      if (typeof e.count !== 'number' || e.count < 0) {
        throw new MasteryInputError(`知识点 ${String(id)} 的证据次数必须是非负数`)
      }
    }
  }
}

/**
 * 断「对象的键集合是闭集」。
 *
 * @param obj 待校验对象
 * @param allowed 允许的键
 * @param where 出错时的定位描述
 */
function assertClosedKeys(obj: object, allowed: readonly string[], where: string): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) {
      throw new MasteryInputError(`${where}出现了不允许的键：${key}`)
    }
  }
  for (const key of allowed) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) {
      throw new MasteryInputError(`${where}缺少必需的键：${key}`)
    }
  }
}
