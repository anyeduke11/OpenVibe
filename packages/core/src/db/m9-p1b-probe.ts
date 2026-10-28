// `packages/core/src/db/m9-p1b-probe.ts` —— M9 v1.6 **资源失效巡检的状态机与去重规则**
// （P1b.4 建它 · **P1c.2 扩到第二张表** ＋ `m9-dev-plan-2026-10.md` §6.3/§6.4
//   ＋ `m9-dev-language-roadmap.md` §3.14 · **DL-30**）
//
// ## 它做什么
//
// ① **去重调度**：89 条资源只有 **87 个去重 URL**（`leetcode.cn` 与 `7days-golang` 各被两条共用）
//    ⇒ 同一个 URL **只发一次 HEAD**。否则「连续失败 2 次」会被判快一倍（§1.6.1 的实测结论）。
// ② **状态机**（§3.14 写死，实现时不许自行发挥）：
//      巡检成功（2xx/3xx） → alive=1，consecutive_fails 归零
//      连续失败第 1 次   → alive **仍为 1**，界面标「疑似失效」（单次失败多半是网络抖动）
//      连续失败 ≥ 2 次   → alive=0，界面**标灰但不删**
//
// ## ⚠️ 三条纪律是**结构上**成立的，不是靠约定
//
// - **只发 HEAD** ⇒ 传输层的入参类型写死 `method: 'HEAD'`，调用方没有别的选项。
// - **响应体零落库** ⇒ 传输层的返回值**只有状态码**，**没有 body 通道**；
//   而 `lang_resources` 的巡检四列里也没有能装正文的地方。
// - **永不删除** ⇒ 本模块只有 UPDATE，**没有 DELETE**。
//
// ⚠️ 这三条为什么必须是结构性的：DL-30 的三支里有两支（「只发 HEAD」「响应体零落库」）
//   **在单测里抓不到真实出网请求** ⇒ 只能靠**接口形状**把它们钉死。
//   写成「约定调用方别传 GET」的话，下一个人改一行就破了，而且没有任何东西会红。
//
// ## ⚠️ 本文件是**状态机与去重规则的唯一出处**
//
// P1b.4 建它（只管主清单 89 条 → 87 个 URL）；**P1c.2**（「`lang_vibe_resources` 纳入同一脚本」）
// 落地时**扩的是「哪张表」，不是「哪套规则」** —— §3.21 末段写明 DL-30 的纪律对速成那 11 条
// **同样成立**（Cursor / Windsurf / Qoder 的文档站改版频繁，恰恰更该巡检）。
//
// ⚠️ **为什么不在 P1c 另写一套**：两处各写一份状态机，两处必然漂移 ——
//   改了一处阈值、另一处还按旧值跑，而**两边都是绿的**。
//   ⇒ 口径只留一处：算式（fails / alive）与去重规则都在本文件，
//     **脚本**（`scripts/check-m9-links.ts`）与**执行侧**（`m9-p1c-links.ts`）只负责「怎么跑」。
import type { SqliteDatabase } from './index'

/**
 * 连续失败多少次才判死（§3.14 写死的状态机）。
 *
 * ⚠️ **单测钉的是行为，不是这个常量** ——
 *   DL-30 的变异腿是「把『≥2 次』写成『≥1 次』⇒ 必须红」：
 *   常量改成 1 时，「单次失败 ⇒ alive 仍为 1」那支会立刻红。
 *   ⇒ 常量可以写在这里，但**闸不靠它**。
 */
export const FAIL_THRESHOLD = 2

/**
 * 被巡检的两张表（§3.14 主清单 ＋ §3.21 速成专区）。
 *
 * ⚠️ **表的清单只有这一处**：P1b.4 只跑主清单，P1c.2 把速成那 11 条并进**同一个脚本**。
 */
export type ProbeTableName = 'lang_resources' | 'lang_vibe_resources'

export const PROBE_TABLE_NAMES: readonly ProbeTableName[] = [
  'lang_resources',
  'lang_vibe_resources',
]

/**
 * 每张表一条 SQL —— **算式只有一份**，SQL 只回答「哪张表」。
 *
 * ⚠️ 为什么 `lang_vibe_resources` 没有 tier：整张表恒为 v 档（0012 的注释），
 *   没有「过时」这一维 ⇒ P1c 的「已过时并入」对它恒为 false。
 */
const PROBE_SQL: Record<
  ProbeTableName,
  { selectTargets: string; selectRows: string; updateRow: string }
> = {
  lang_resources: {
    selectTargets: 'SELECT id, url FROM lang_resources ORDER BY url ASC, id ASC',
    selectRows: 'SELECT id, alive, consecutive_fails FROM lang_resources WHERE url = ?',
    updateRow:
      'UPDATE lang_resources SET last_status_code = ?, consecutive_fails = ?, alive = ?, last_checked_at = ? WHERE id = ?',
  },
  lang_vibe_resources: {
    selectTargets: 'SELECT id, url FROM lang_vibe_resources ORDER BY url ASC, id ASC',
    selectRows: 'SELECT id, alive, consecutive_fails FROM lang_vibe_resources WHERE url = ?',
    updateRow:
      'UPDATE lang_vibe_resources SET last_status_code = ?, consecutive_fails = ?, alive = ?, last_checked_at = ? WHERE id = ?',
  },
}

/** 传输层的请求 —— `method` 写死为 HEAD，调用方没有别的选项。 */
export interface ProbeRequest {
  method: 'HEAD'
  url: string
}

/** 传输层的响应 —— **只有状态码，没有 body 通道**（DL-30 的「响应体零落库」）。 */
export interface ProbeResponse {
  /** HTTP 状态码；连不上 / 超时 ⇒ null。 */
  statusCode: number | null
}

export type ProbeTransport = (req: ProbeRequest) => Promise<ProbeResponse>

/** 一个待探测的 URL，以及共用它的资源行。 */
export interface ProbeTarget {
  url: string
  /** 共用这个 URL 的资源行 id（1 条或 2 条） */
  resourceIds: number[]
}

/** 一行的存活三档（§3.14 的界面语义）。 */
export type Liveness = 'ok' | 'suspect' | 'dead'

export interface ResourceProbeState {
  alive: number
  consecutive_fails: number
  /** ⚠️ 不参与三档判定（只用于展示）⇒ 可选 */
  last_status_code?: number | null
}

/**
 * 由两列算出存活三档。
 *
 * ⚠️ **三档而不是一档布尔**：§3.14 的状态机里「连续失败 1 次」是一个**独立状态**
 *   （界面标「疑似失效」），不是「活着」的同义词。
 *   只暴露 `alive` 的话，第一档与第二档在界面上长得一模一样。
 */
export function livenessOf(state: ResourceProbeState): Liveness {
  if (state.alive === 0) return 'dead'
  if (state.consecutive_fails >= 1) return 'suspect'
  return 'ok'
}

/**
 * 排定待探测的 URL 清单 —— **按 URL 去重**。
 *
 * ⚠️ **去重必须在这一层做**（而不是在传输层）：同一 URL 被两条资源共用时，
 *   失败计数也只该算一次 ⇒ 一次请求 ⇒ 一次计数 ⇒ 两行共享同一个结果。
 *
 * @returns 87 个目标（89 条资源去重后），每个目标带它的资源行 id。
 */
export function planProbeTargets(
  db: SqliteDatabase,
  table: ProbeTableName = 'lang_resources',
): ProbeTarget[] {
  const rows = db.prepare(PROBE_SQL[table].selectTargets).all() as { id: number; url: string }[]
  const byUrl = new Map<string, number[]>()
  for (const r of rows) {
    const list = byUrl.get(r.url)
    if (list) list.push(r.id)
    else byUrl.set(r.url, [r.id])
  }
  return [...byUrl.entries()]
    .map(([url, resourceIds]) => ({ url, resourceIds }))
    .sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0))
}

/**
 * 把一次探测结果落到共用该 URL 的所有资源行上。
 *
 * §3.14 的状态机（写死）：
 * - 成功（2xx/3xx）⇒ `alive=1`、`consecutive_fails=0`
 * - 失败 ⇒ `consecutive_fails += 1`；**只有 ≥ 2 次才 `alive=0`**
 *
 * ⚠️ **永不删除**：这里只有 UPDATE，没有 DELETE。
 *
 * @returns 受影响的行数与本次被判死的行数。
 */
export function applyProbeOutcome(
  db: SqliteDatabase,
  url: string,
  statusCode: number | null,
  checkedAt: string,
  table: ProbeTableName = 'lang_resources',
): { updatedRows: number; markedDead: number; markedSuspect: number } {
  const ok = statusCode !== null && statusCode >= 200 && statusCode < 400
  const rows = db.prepare(PROBE_SQL[table].selectRows).all(url) as {
    id: number
    alive: number
    consecutive_fails: number
  }[]
  const update = db.prepare(PROBE_SQL[table].updateRow)
  let markedDead = 0
  let markedSuspect = 0
  const run = db.transaction((row: { id: number; alive: number; consecutive_fails: number }) => {
    const fails = ok ? 0 : row.consecutive_fails + 1
    const alive = ok ? 1 : fails >= FAIL_THRESHOLD ? 0 : 1
    update.run(statusCode, fails, alive, checkedAt, row.id)
    if (!ok && alive === 0) markedDead += 1
    if (!ok && alive === 1) markedSuspect += 1
  })
  for (const row of rows) run(row)
  return { updatedRows: rows.length, markedDead, markedSuspect }
}

export interface ProbeRunResult {
  /** 实际发出的请求数 —— 必须是 87（89 条资源去重后） */
  requestedUrls: number
  /** 失败（状态码 ≥ 400 或连不上）的 URL 数 */
  failedUrls: number
  /** 受影响的资源行数（失败 URL 上的行数更多：共用的两行都算） */
  updatedRows: number
  /** 本次被判死的行数 */
  markedDead: number
  /** 本次进入「疑似失效」的行数 */
  markedSuspect: number
}

/**
 * 跑一轮巡检。
 *
 * ⚠️ **默认手动触发**（§3.14：产品启动时做网络请求会把「打开一个本机工具」变成「等网络」）
 *   ⇒ 本函数**只被显式调用**，不进任何启动流程。
 *
 * @param transport 出网通道 —— 单测注入假实现，生产注入真实现。
 *   ⚠️ 入参类型写死 `method: 'HEAD'`，返回类型**只有状态码** ⇒ 两条纪律是结构性的。
 */
export async function runResourceProbe(
  db: SqliteDatabase,
  transport: ProbeTransport,
  opts: { checkedAt?: string } = {},
): Promise<ProbeRunResult> {
  const checkedAt = opts.checkedAt ?? new Date().toISOString()
  const targets = planProbeTargets(db)
  let failedUrls = 0
  let updatedRows = 0
  let markedDead = 0
  let markedSuspect = 0
  for (const target of targets) {
    const res = await transport({ method: 'HEAD', url: target.url })
    const applied = applyProbeOutcome(db, target.url, res.statusCode, checkedAt)
    updatedRows += applied.updatedRows
    markedDead += applied.markedDead
    markedSuspect += applied.markedSuspect
    if (res.statusCode === null || res.statusCode < 200 || res.statusCode >= 400) failedUrls += 1
  }
  return {
    requestedUrls: targets.length,
    failedUrls,
    updatedRows,
    markedDead,
    markedSuspect,
  }
}
