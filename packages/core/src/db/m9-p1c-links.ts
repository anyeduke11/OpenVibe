// `packages/core/src/db/m9-p1c-links.ts` —— M9 v1.6 **P1c · 失效巡检的执行侧**
// （`m9-dev-plan-2026-10.md` §6.4 ＋ `m9-dev-language-roadmap.md` §3.14 · **DL-30** · DL-03 的 P1c 半）
//
// ## 它做什么
//
// ① **真出网的 HEAD**（`headStatusCode`）—— Node 标准库，无第三方依赖。
// ② **两张表一起巡检**（P1c.2）：主清单 89 行（87 个去重 URL）＋ 速成专区 11 行（11 个 URL）
//    ⇒ 合计 **98 个去重 URL**。
// ③ **DL-30 的纪律由结构保证**（不是靠约定）：
//    - 只发 HEAD —— 传输层的入参类型写死 `method: 'HEAD'`；
//    - 响应体零落库 —— 返回值**只有状态码**，没有 body 通道；
//    - 永不删除 —— 巡检只调用 `applyProbeOutcome`（UPDATE），本模块没有任何删除语句。
// ④ **DL-03 的 P1c 半**：「巡检时发现已停更 ⇒ 并入失效巡检」
//    ⇒ 资源层的「已过时」由 **tier='e'** 承载（附件 tier 图例逐字：e = 过时补充），
//      巡检把它与存活三档**并排输出**，且**不算「有效来源」**。
//
// ## ⚠️ 口径分工：这里只放「怎么跑」，不放「算式」
//
// 状态机（fails / alive 的算式）与去重规则在 `m9-p1b-probe.ts`（**唯一出处**）；
// 本文件只负责：怎么发请求、怎么把结果读回来、怎么并出「已过时」这一维、怎么出报告。
// ⇒ 改阈值只改一处；两期（P1b.4 / P1c.2）共用同一套规则。
//
// ## ⚠️ 「已过时」为什么用 tier='e'，不用文案关键词
//
// - 附件的 tier 图例把 e 档写死成「过时补充」⇒ **机器可读**，且已被 DL-47 钉住；
// - 资源行自带的 `freshness` 是**自由文案**（实测 2 条自陈「停更」），
//   用关键词去匹配它等于**再造一份口径**（关键词表），而关键词表必然漂移；
// - 实测分布：tier='e' 共 **9 条**，全部落在附件 `old` 标记的 10 条里
//   （另 1 条是 tier c 的《Go 语言圣经》中文版，内容偏旧但仍在主线 ⇒ 由文案承载，
//   已登记在 `lang_resources.json` 的 `_notes.old_note`）。
//
// ## ⚠️ 源级停更不在本模块
//
// `awesome-python-cn` 停更 4 年是**源级**事实，由 P1.10 的 `m9-source-freshness.ts`
// 按 spec §1.5 的登记负责（那 118 个知识点的出处侧）。
// 本模块管的是**资源层的 100 条链接**（URL 还在不在 ＋ 内容过不过时）—— 两层不混。
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import type { SqliteDatabase } from './index'
import {
  applyProbeOutcome,
  FAIL_THRESHOLD,
  livenessOf,
  PROBE_TABLE_NAMES,
  type Liveness,
  type ProbeTableName,
  type ProbeTransport,
} from './m9-p1b-probe'

/** 单个请求的超时（毫秒）—— 超时按「连不上」记（状态码 null ⇒ 失败）。 */
export const DEFAULT_HEAD_TIMEOUT_MS = 10_000

/** 巡检用的 User-Agent —— 标明是本工具的巡检，别装作浏览器。 */
export const PROBE_USER_AGENT = 'openvibe-m9-link-check/1.0'

/**
 * 「已过时」的档位（附件 tier 图例逐字：**e = 过时补充**）。
 *
 * ⚠️ **速成那 11 条没有这一维**：整张表恒为 v 档（0012 的注释）⇒ `tier` 恒 null。
 */
export const OUTDATED_TIER = 'e'

/** 一行资源在巡检里的引用。 */
export interface LinkRowRef {
  table: ProbeTableName
  id: number
  /** 主清单才有（速成表无 tier 列）⇒ null */
  tier: string | null
}

/** 一个待探测的 URL（**跨表去重后**）。 */
export interface LinkTarget {
  url: string
  rows: LinkRowRef[]
}

/** 每张表的取行 SQL —— 字段闭集按表分开（速成表没有 tier 列）。 */
const LINK_SQL: Record<ProbeTableName, { selectRows: string; selectStates: string }> = {
  lang_resources: {
    selectRows: 'SELECT id, url, tier FROM lang_resources ORDER BY id ASC',
    selectStates: 'SELECT id, tier, alive, consecutive_fails FROM lang_resources WHERE url = ?',
  },
  lang_vibe_resources: {
    selectRows: 'SELECT id, url FROM lang_vibe_resources ORDER BY id ASC',
    selectStates: 'SELECT id, alive, consecutive_fails FROM lang_vibe_resources WHERE url = ?',
  },
}

/**
 * 真出网的 HEAD —— **只取状态码**。
 *
 * ⚠️ 三条纪律里的两条落在这一层：
 * ① **只发 HEAD**（`method: 'HEAD'` 写死）；
 * ② **响应体一律丢弃**（`res.resume()`，从不读、从不缓冲、从不落库）；
 * ③ **不跟随重定向** —— `node:http` 本来就不跟（3xx 原样返回），
 *    而 §3.14 写死「2xx/3xx 都算成功」⇒ 重定向**不算失效**。
 *
 * @returns HTTP 状态码；连不上 / 超时 / 协议不对 ⇒ `null`（⇒ 按失败记）。
 */
export function headStatusCode(
  url: string,
  opts: { timeoutMs?: number; userAgent?: string } = {},
): Promise<number | null> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_HEAD_TIMEOUT_MS
  return new Promise<number | null>((resolve) => {
    let settled = false
    const done = (code: number | null): void => {
      if (settled) return
      settled = true
      resolve(code)
    }
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      done(null)
      return
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      done(null)
      return
    }
    const requestFn = parsed.protocol === 'https:' ? httpsRequest : httpRequest
    const req = requestFn(
      url,
      {
        method: 'HEAD',
        headers: {
          'user-agent': opts.userAgent ?? PROBE_USER_AGENT,
          accept: '*/*',
        },
        timeout: timeoutMs,
      },
      (res) => {
        // ⚠️ 响应体一律丢弃：落库的只有状态码（DL-30 的「响应体零落库」）
        res.resume()
        done(res.statusCode ?? null)
      },
    )
    req.on('timeout', () => {
      req.destroy()
      done(null)
    })
    req.on('error', () => {
      done(null)
    })
    req.end()
  })
}

/** 该行是不是「已过时」（tier=e）。 */
export function isOutdatedTier(tier: string | null): boolean {
  return tier === OUTDATED_TIER
}

/**
 * 造一个**真的**出网通道（生产用）—— 注入给 `runLinkProbe`。
 *
 * ⚠️ **为什么要专门造一个**，而不是让调用方自己拼：
 *   `runLinkProbe` 要的是 `{ statusCode }`（**只有状态码**），
 *   而 `headStatusCode` 返回的是**裸数字** —— 调用方自己拼就多了一次「拼错形状」的机会。
 *   ⇒ 形状在**这一处**定死，脚本与单测都从这里拿。
 */
export function createHeadTransport(
  opts: { timeoutMs?: number; userAgent?: string } = {},
): ProbeTransport {
  return async (req) => ({
    statusCode: await headStatusCode(req.url, opts),
  })
}

/**
 * 排定待探测的 URL —— **按 URL 跨表去重**。
 *
 * ⚠️ **去重的执行点只有一处**：这里按 URL 分组，`runLinkProbe` 再按 URL 键循环
 *   ⇒ 同一个 URL 无论被几条资源共用、被几张表命中，**只发一次 HEAD**。
 *
 * @returns 98 个目标（主清单 87 个 ＋ 速成 11 个；两张表实测无交集）。
 */
export function planLinkTargets(
  db: SqliteDatabase,
  tables: readonly ProbeTableName[] = PROBE_TABLE_NAMES,
): LinkTarget[] {
  const byUrl = new Map<string, LinkRowRef[]>()
  for (const table of tables) {
    const rows = db.prepare(LINK_SQL[table].selectRows).all() as {
      id: number
      url: string
      tier?: string | null
    }[]
    for (const r of rows) {
      const ref: LinkRowRef = {
        table,
        id: r.id,
        tier: table === 'lang_resources' ? (r.tier ?? null) : null,
      }
      const list = byUrl.get(r.url)
      if (list) list.push(ref)
      else byUrl.set(r.url, [ref])
    }
  }
  return [...byUrl.entries()]
    .map(([url, rows]) => ({ url, rows }))
    .sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0))
}

/** 一个 URL 巡检完的样子。 */
export interface LinkTargetReport {
  url: string
  /** 本次拿到的状态码；连不上 ⇒ null */
  statusCode: number | null
  /** 存活三档（§3.14 的状态机算出来的） */
  liveness: Liveness
  /** 该 URL 上各行的落库状态 */
  rows: (LinkRowRef & { alive: number; consecutive_fails: number; liveness: Liveness })[]
  /** 命中的行里有 tier='e' ⇒ 该 URL 已过时，**不得当真相源** */
  outdated: boolean
}

/** 一轮巡检的完整报告。 */
export interface LinkProbeReport {
  checkedAt: string
  /** 方法恒为 HEAD（写死，不是记下来的约定） */
  method: 'HEAD'
  /** 实际发出的请求数（去重后） */
  requestedUrls: number
  /** 失败（状态码 null 或 ≥400）的 URL 数 */
  failedUrls: number
  /** 被写回的行数（共用 URL 的两行都算） */
  updatedRows: number
  /** 本次被判死的行数 */
  markedDead: number
  /** 本次进入「疑似失效」的行数 */
  markedSuspect: number
  /** 已过时（tier=e）的 URL 数 */
  outdatedUrls: number
  /** 已过时（tier=e）的行数 */
  outdatedRows: number
  targets: LinkTargetReport[]
}

/** 三档里取最差的一档（dead > suspect > ok）。 */
function worstLiveness(states: readonly Liveness[]): Liveness {
  if (states.includes('dead')) return 'dead'
  if (states.includes('suspect')) return 'suspect'
  return 'ok'
}

/**
 * 跑一轮巡检（**两张表一起**）。
 *
 * ⚠️ **默认手动触发**（§3.14：产品启动时做网络请求会把「打开一个本机工具」变成「等网络」）
 *   ⇒ 本函数只被 `scripts/check-m9-links.ts` 显式调用，**不进任何启动流程**。
 *
 * @param transport 出网通道 —— 单测注入假实现，生产注入 `headStatusCode`。
 *   ⚠️ 入参类型写死 `method: 'HEAD'`，返回类型**只有状态码** ⇒ 两条纪律是结构性的。
 */
export async function runLinkProbe(
  db: SqliteDatabase,
  transport: ProbeTransport,
  opts: { checkedAt?: string; tables?: readonly ProbeTableName[] } = {},
): Promise<LinkProbeReport> {
  const checkedAt = opts.checkedAt ?? new Date().toISOString()
  const tables = opts.tables ?? PROBE_TABLE_NAMES
  const targets = planLinkTargets(db, tables)
  const targetReports: LinkTargetReport[] = []
  let failedUrls = 0
  let updatedRows = 0
  let markedDead = 0
  let markedSuspect = 0
  let outdatedUrls = 0
  let outdatedRows = 0
  for (const target of targets) {
    const res = await transport({ method: 'HEAD', url: target.url })
    // 同一张表对同一个 URL 只应用一次（否则共用 URL 的两行会被计两次失败）
    const tablesHit = [...new Set(target.rows.map((r) => r.table))]
    for (const table of tablesHit) {
      const applied = applyProbeOutcome(db, target.url, res.statusCode, checkedAt, table)
      updatedRows += applied.updatedRows
      markedDead += applied.markedDead
      markedSuspect += applied.markedSuspect
    }
    const states: (LinkRowRef & {
      alive: number
      consecutive_fails: number
      liveness: Liveness
    })[] = []
    for (const table of tablesHit) {
      const rows = db.prepare(LINK_SQL[table].selectStates).all(target.url) as {
        id: number
        tier?: string | null
        alive: number
        consecutive_fails: number
      }[]
      for (const row of rows) {
        const ref = target.rows.find((r) => r.table === table && r.id === row.id)
        states.push({
          table,
          id: row.id,
          tier: ref?.tier ?? null,
          alive: row.alive,
          consecutive_fails: row.consecutive_fails,
          liveness: livenessOf({ alive: row.alive, consecutive_fails: row.consecutive_fails }),
        })
      }
    }
    const outdated = states.some((s) => isOutdatedTier(s.tier))
    if (outdated) {
      outdatedUrls += 1
      outdatedRows += states.filter((s) => isOutdatedTier(s.tier)).length
    }
    if (res.statusCode === null || res.statusCode < 200 || res.statusCode >= 400) failedUrls += 1
    targetReports.push({
      url: target.url,
      statusCode: res.statusCode,
      liveness: worstLiveness(states.map((s) => s.liveness)),
      rows: states,
      outdated,
    })
  }
  return {
    checkedAt,
    method: 'HEAD',
    requestedUrls: targets.length,
    failedUrls,
    updatedRows,
    markedDead,
    markedSuspect,
    outdatedUrls,
    outdatedRows,
    targets: targetReports,
  }
}

/** 一个 URL 的最终判定：**存活三档 ＋ 「已过时」轴**（DL-03 的 P1c 半在这里并入）。 */
export interface LinkVerdict {
  liveness: Liveness
  outdated: boolean
  /** 能不能当「有效来源」—— 已过时的一律不可（§3.2：不静默当作有效来源）。 */
  usable: boolean
  /** 人类可读的一句话（巡检报告与界面共用）。 */
  notice: string
}

/**
 * 把存活三档与「已过时」并成一个判定。
 *
 * ⚠️ **两个轴是正交的，不合成一个枚举**：
 *   一条 tier=e 的资源可能「链接还在」（过时）也「已经失效」（死）；
 *   合成一个枚举就会丢掉其中一维 ⇒ 界面只能显示一半的信息。
 */
export function verdictOf(target: LinkTargetReport): LinkVerdict {
  const liveness = target.liveness
  const outdated = target.outdated
  const usable = liveness === 'ok' && !outdated
  let notice: string
  if (liveness === 'dead') {
    notice = '连续两次巡检失败 ⇒ 链接已失效（标灰但不删）'
  } else if (liveness === 'suspect') {
    notice = '一次巡检失败 ⇒ 疑似失效（多半是网络抖动，下轮再看）'
  } else if (outdated) {
    notice = '已过时（tier e · 附件图例「过时补充」）⇒ 不得当真相源'
  } else {
    notice = '正常'
  }
  return { liveness, outdated, usable, notice }
}

// ============================================================================
// 自检
// ============================================================================

export type LinkProbeRule =
  | 'method-not-head'
  | 'row-deleted'
  | 'row-added'
  | 'state-mismatch'
  | 'count-mismatch'

export interface LinkProbeViolation {
  rule: LinkProbeRule
  detail: string
}

/**
 * 巡检后的自检 —— 把「不该发生的事」逐条点出来。
 *
 * ⚠️ **「永不删除」必须能查**：巡检前后行数对不上 ⇒ 有人删了行（DL-30 的「行仍在表里」）。
 */
export function verifyLinkProbeRun(input: {
  report: LinkProbeReport
  rowsBefore: number
  rowsAfter: number
}): LinkProbeViolation[] {
  const out: LinkProbeViolation[] = []
  const { report, rowsBefore, rowsAfter } = input
  if (report.method !== 'HEAD') {
    out.push({ rule: 'method-not-head', detail: `方法不是 HEAD：${report.method}` })
  }
  if (rowsAfter < rowsBefore) {
    out.push({
      rule: 'row-deleted',
      detail: `巡检前后行数少了 ${String(rowsBefore - rowsAfter)} 行 ⇒ DL-30 的「永不删除」被破`,
    })
  }
  if (rowsAfter > rowsBefore) {
    out.push({
      rule: 'row-added',
      detail: `巡检前后行数多了 ${String(rowsAfter - rowsBefore)} 行 ⇒ 巡检只该 UPDATE`,
    })
  }
  const touched = report.targets.reduce((sum, t) => sum + t.rows.length, 0)
  if (touched !== report.updatedRows) {
    out.push({
      rule: 'count-mismatch',
      detail: `报告里的行数 ${String(touched)} 与写回的行数 ${String(report.updatedRows)} 不一致`,
    })
  }
  for (const target of report.targets) {
    const ok = target.statusCode !== null && target.statusCode >= 200 && target.statusCode < 400
    for (const row of target.rows) {
      // ⚠️ **只用巡检后的状态反查状态机**（不能反推巡检前的值 —— 那是拿结论推结论）：
      //   成功 ⇒ fails 必为 0 且 alive 必为 1；
      //   失败 ⇒ fails 必 ≥ 1，且 alive 必等于「fails 到了阈值就判死、没到就不判死」。
      const aliveExpected = row.consecutive_fails >= FAIL_THRESHOLD ? 0 : 1
      const stateOk = ok
        ? row.consecutive_fails === 0 && row.alive === 1
        : row.consecutive_fails >= 1 && row.alive === aliveExpected
      if (!stateOk) {
        out.push({
          rule: 'state-mismatch',
          detail: `${target.url} 的行 ${String(row.id)}：状态机要求 fails=${ok ? '0' : '≥1'} alive=${ok ? '1' : String(aliveExpected)}，库里是 fails=${String(row.consecutive_fails)} alive=${String(row.alive)}`,
        })
      }
    }
  }
  return out
}
