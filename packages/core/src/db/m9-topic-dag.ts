// `packages/core/src/db/m9-topic-dag.ts` —— M9 v1.6 P1.7（`m9-dev-plan-2026-10.md` §6.2）
//
// 知识点 DAG 的**纯函数面**：环检测、拓扑排序、站列表分组。
// DL-04 与 DL-12 的判定逻辑都在这里，所以单测能直接对它发断言。
//
// ⚠️ **DL-04 的关键设计：环检测不能靠 stage_id 单调性蒙混过关**
//
//   常见的偷懒做法是「边只从低 stage 指向高 stage ⇒ 天然无环」——
//   但本项目的边**允许同站**（模块 ↔ 作用域、类 ↔ 实例这类真实依赖），
//   所以「跨站单调」**不是**无环的理由。
//   ⇒ 守卫必须做**真正的环检测**（DFS 三色标记），能在任意边集上指出环在哪。
//   这正是 DL-04「构造一条环（a→b→a）⇒ 必被检出」这条变异腿的根据：
//   如果守卫只是「查 stage 是否单调」，注入一条同站的 a→b→a 它就检不出来。
//
//   spec §1.4 第 107–111 行的实测反例正是「不能照搬源顺序」的证据：
//     侧栏位次：Python3 模块 = #28 …… Python logging 模块 = #76（相隔 48 位）
//   `logging` 明显依赖「模块」与「函数」—— 源把它排在与其平级的位置。
//
// ⚠️ **DL-12：库级条目不进学习路线**
//
//   §1.4 实测 84 条里 35.7% 是库级（logging / pickle / MySQL…）。
//   一个库级条目的前置是「任意语言 ＋ 按需用到」，几乎无序 ——
//   把它们塞进线性学习路线会稀释路线本身，且制造永久阻塞点。
//   ⇒ 站列表的语义是「**kind='language' 的条目**按 stage_id 分组」；
//     边只允许连接 language 类条目。
//
//   ⚠️ **闸要分清「能红的」与「同义反复的」**（P1.7 首版踩过）：
//     初版闸写成「站列表里不得出现 kind='library' 的节点」，
//     而站列表本身就是按 kind 过滤后得到的 ⇒ 该闸**恒绿**，是摆设。
//     现在的闸有四颗牙齿，每颗都能被变异腿打红：
//       ① 站列表条目数 == 库里 kind='language' 的条数（过滤被删 ⇒ 红）
//       ② 每条目的 kind 与 §1.4 规则重算一致（库级被误标成 language ⇒ 红）
//       ③ 库级条目不得被指派非 0 站号（进了某站 ⇒ 红）
//       ④ 边不得连接库级条目（接了 ⇒ 红）
//
// ⚠️ **8 站是 Python 视角的知识点分层**（§3.6 原话）⇒ Go 侧站 6/7 允许为空
//   （runoob Go 34 条里没有 Web 框架与部署条目 —— 这是**事实**，不是缺口）。
//   ⇒ 「每站非空」这条守卫**按语言**判：Python 八站全满；Go 只要求站号连续。

export type TopicKind = 'language' | 'library'

export interface DagNode {
  id: number
  lang: string
  slug: string
  title: string
  stage_id: number
  kind: TopicKind
}

/** 边方向与表一致：`topic_id → prereq_topic_id`（topic 依赖 prereq）。 */
export interface DagEdge {
  topic_id: number
  prereq_topic_id: number
}

/** §3.6 的 8 站（stage_id 0..7）。 */
export const STAGE_NAMES = [
  '语法基础',
  '数据结构',
  '函数与模块',
  '面向对象',
  '异常与文件',
  '并发',
  'Web 框架',
  '数据与部署',
] as const

/**
 * 在有向图里找出一条**环**（返回环上的节点 id 序列），无环则返回 null。
 *
 * 算法：DFS 三色标记（white 未访问 / gray 在当前路径上 / black 已完成）。
 * 遇到 gray 节点即说明它在自己的 DFS 路径上 ⇒ 成环。
 *
 * ⚠️ **为什么用 DFS 而不是 Kahn**：Kahn 只能回答"有没有环"，
 *   报不出环在哪 —— 而 DL-04 的判据是「**必被检出**」，
 *   报出具体路径才能让人知道该改哪条边。
 *
 * @param nodes 图中的全部节点（必须包含孤立节点）
 * @param edges 边（`topic_id → prereq_topic_id`）
 * @returns 环上的节点 id 序列（首尾同一个 id 表示闭合）；无环 ⇒ null
 */
export function findCycle(nodes: DagNode[], edges: DagEdge[]): number[] | null {
  const WHITE = 0
  const GRAY = 1
  const BLACK = 2
  const color = new Map<number, number>()
  for (const n of nodes) color.set(n.id, WHITE)

  // 邻接表：沿「学习顺序」方向走（prereq → topic）
  const adj = new Map<number, number[]>()
  for (const n of nodes) adj.set(n.id, [])
  for (const e of edges) {
    if (!adj.has(e.prereq_topic_id)) continue
    adj.get(e.prereq_topic_id)!.push(e.topic_id)
  }

  const path: number[] = []

  const visit = (id: number): number[] | null => {
    color.set(id, GRAY)
    path.push(id)
    for (const next of adj.get(id) ?? []) {
      const c = color.get(next) ?? WHITE
      if (c === GRAY) {
        // 找到环：从 next 在 path 里的位置截出来
        const start = path.indexOf(next)
        return [...path.slice(start), next]
      }
      if (c === WHITE) {
        const found = visit(next)
        if (found) return found
      }
    }
    path.pop()
    color.set(id, BLACK)
    return null
  }

  for (const n of nodes) {
    if ((color.get(n.id) ?? WHITE) !== WHITE) continue
    const found = visit(n.id)
    if (found) return found
  }
  return null
}

/**
 * 拓扑排序（Kahn）。**有环时返回 null**。
 *
 * @returns 拓扑序（节点 id 数组）；有环 ⇒ null
 */
export function topoOrder(nodes: DagNode[], edges: DagEdge[]): number[] | null {
  const indeg = new Map<number, number>()
  const adj = new Map<number, number[]>()
  for (const n of nodes) {
    indeg.set(n.id, 0)
    adj.set(n.id, [])
  }
  for (const e of edges) {
    if (!indeg.has(e.topic_id) || !indeg.has(e.prereq_topic_id)) continue
    // 沿学习顺序方向：prereq 的 indeg += 1
    indeg.set(e.topic_id, (indeg.get(e.topic_id) ?? 0) + 1)
    adj.get(e.prereq_topic_id)!.push(e.topic_id)
  }
  const queue: number[] = []
  for (const n of nodes) if ((indeg.get(n.id) ?? 0) === 0) queue.push(n.id)
  const out: number[] = []
  while (queue.length > 0) {
    const id = queue.shift()!
    out.push(id)
    for (const next of adj.get(id) ?? []) {
      const d = (indeg.get(next) ?? 0) - 1
      indeg.set(next, d)
      if (d === 0) queue.push(next)
    }
  }
  return out.length === nodes.length ? out : null
}

/**
 * 站列表分组（DL-12 的执行点 · **生产路径**）。
 *
 * ⚠️ **只收 `kind='language'` 的条目** —— 库级条目（logging / MySQL…）不进学习路线。
 *   它们在 `lang_topics` 里 `stage_id` 恒为 0（无语义占位），
 *   站列表的查询恒带 kind 过滤 ⇒ 裸查 `GROUP BY stage_id` 会看到 49 条库级，
 *   **那不是站列表**。
 *
 * @returns stage_id → 节点数组（只含 language 类）
 */
export function stationGroups(nodes: DagNode[]): Map<number, DagNode[]> {
  const groups = new Map<number, DagNode[]>()
  for (const n of nodes) {
    if (n.kind !== 'language') continue
    const arr = groups.get(n.stage_id) ?? []
    arr.push(n)
    groups.set(n.stage_id, arr)
  }
  return groups
}

/**
 * **未过滤**的分组 —— 只用于反证，不是站列表。
 *
 * ⚠️ **为什么需要它**：在当前 schema 下（`stage_id INTEGER NOT NULL CHECK 0..7`），
 *   库级条目没有「不在任何站」的表达方式 —— 它们的 `stage_id` 只能是 0，
 *   而 0 同时也是「语法基础」这一站。
 *   ⇒ 「库级有没有混进站列表」这件事**只能**靠 kind 过滤来表达，
 *     而「过滤是否还在」是**代码/数据**层面的事，不是数据层面能自证的。
 *   ⇒ DL-12 的纯度闸改成两条互补的断言：
 *     ① 站列表条目数 == 库里 kind='language' 的条数（过滤还在 ⇒ 两侧相等；
 *        过滤被删 ⇒ 站列表会多出全部库级条目 ⇒ 立刻不等 ⇒ 红）；
 *     ② 库里每条目的 kind 与 §1.4 规则重算一致（**库级被误标成 language ⇒ 红**）。
 *   `rawStageGroups` 让 ① 的反证不必改源码就能在单测里做出来。
 *
 * @returns stage_id → 节点数组（含 library 类）
 */
export function rawStageGroups(nodes: DagNode[]): Map<number, DagNode[]> {
  const groups = new Map<number, DagNode[]>()
  for (const n of nodes) {
    const arr = groups.get(n.stage_id) ?? []
    arr.push(n)
    groups.set(n.stage_id, arr)
  }
  return groups
}

/**
 * DL-12 的断言体 ①：**库级条目不得被指派站号**。
 *
 * 库级条目的 `stage_id` 约定恒为 0（无语义占位，因为 `NOT NULL CHECK 0..7`
 * 不给它「不属于任何站」的表达）。一旦它被指派了非 0 站号，
 * 就等于被排进了学习路线的那一站 ⇒ 红。
 *
 * @param nodes 全部节点
 * @returns 违规的节点（库里没有 ⇒ 返回空数组）
 */
export function libraryWithStageAssigned(nodes: DagNode[]): DagNode[] {
  return nodes.filter((n) => n.kind === 'library' && n.stage_id !== 0)
}

/**
 * DL-12 的推论：边不得连接库级条目。
 *
 * @returns 违规的边
 */
export function edgesTouchingLibrary(nodes: DagNode[], edges: DagEdge[]): DagEdge[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  return edges.filter((e) => {
    const topic = byId.get(e.topic_id)
    const prereq = byId.get(e.prereq_topic_id)
    if (!topic || !prereq) return false
    return topic.kind !== 'language' || prereq.kind !== 'language'
  })
}

/**
 * 站号的结构性检查：连续无空洞。
 *
 * ⚠️ **不要求每站非空** —— 8 站是 Python 视角的分层（§3.6），
 *   Go 侧站 6/7 本来就没有内容（runoob Go 34 条里无 Web 框架与部署条目）。
 *   空洞才是问题（那说明中间某站整站漏了）。
 */
export function stageHoles(groups: Map<number, DagNode[]>): number[] {
  const used = [...groups.keys()].sort((a, b) => a - b)
  const holes: number[] = []
  for (let i = 0; i < used.length; i++) {
    if (used[i] !== i) holes.push(i)
  }
  return holes
}

/**
 * 每条边的前置站必须**不晚于**后继站（前置不能出现在更晚的站）。
 *
 * ⚠️ 这**不是**无环的充分条件（同站边允许存在），
 *   但它是「路线能自上而下走」的必要条件 —— 前置在更晚的站，
 *   用户按站序走就会遇到「要学后面的才能学前面的」的矛盾。
 */
export function edgesViolatingStageOrder(nodes: DagNode[], edges: DagEdge[]): DagEdge[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  return edges.filter((e) => {
    const topic = byId.get(e.topic_id)
    const prereq = byId.get(e.prereq_topic_id)
    if (!topic || !prereq) return false
    return prereq.stage_id > topic.stage_id
  })
}
