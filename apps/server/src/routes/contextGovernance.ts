import type { FastifyInstance } from 'fastify'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  ContextGovernanceMerge,
  ContextGovernanceMergeStat,
  ContextGovernanceOut,
  ContextGovernanceRun,
} from '@openvibe/shared'
import { reportRoute } from '../lib/route-source'

/**
 * 上下文治理结论的只读端点（设置页「上下文治理」面板的数据源）。
 *
 * ## 为什么读文件而不是读数据库
 *
 * 结论的真源是 `pnpm context:check` 每轮落盘的 `test-results/context-check.json`
 * （本机产物、被 gitignore）与入仓的棘轮基线 `docs/context-check-baseline.json`。
 * 二者都不进 DB ⇒ 端点直接读盘，读到什么报什么。
 *
 * ## 为什么 `available: false` 要如实返回
 *
 * 没跑过 `context:check` 时若返回全 0，面板会显示成「全绿」—— 假的绿比不显示更坏
 * （与 docs:check 的「不假装有数据」同口径）。
 */

const REPORT_REL = 'test-results/context-check.json'
const HISTORY_REL = 'test-results/context-check-history.json'
const BASELINE_REL = 'docs/context-check-baseline.json'

/** 面板只画最近几轮；端点留一点余量（10 轮），不把 50 轮全塞进响应 */
const HISTORY_WINDOW = 10

/**
 * 按来源取明细时的上限（与脚本侧 `MERGE_LOG_MAX` 同值：清单本身就是这个量级）。
 *
 * ⚠️ 不设更高的上限：端点是被面板读的只读面，响应体不该无界增长。
 */
const MERGE_DETAIL_MAX = 50

/**
 * 仓根：`apps/server/src/routes` 上溯四级。
 *
 * ⚠️ 只对**仓库布局**成立（dev 与 `pnpm dev` 均如此）；发布包里这两个文件不存在
 * ⇒ 端点返回 `available: false`，这是预期降级而不是缺陷。
 */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')

function readText(abs: string): string | null {
  try {
    return readFileSync(abs, 'utf8')
  } catch {
    return null
  }
}

/** 从 JSON 文本里取一个数字字段；缺失或类型不对 ⇒ undefined（不填 0） */
function num(raw: Record<string, unknown>, key: string): number | undefined {
  const v = raw[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

/** 取 `number | null` 字段：`null` 是有效值（= 明确无须下调），必须与「缺省」区分 */
function nullableNum(raw: Record<string, unknown>, key: string): number | null | undefined {
  const v = raw[key]
  if (v === null) return null
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

/**
 * 从历史文件文本里取最近 N 轮；文件缺失/非法 ⇒ undefined（面板不画趋势，不猜）。
 *
 * ⚠️ 逐项校验：历史文件是**追加产物**，中途写坏一项不该让整块趋势消失；
 * 只保留字段齐全的项，其余丢弃（宁可少画一轮，不画半轮）。
 */
export function summarizeHistory(
  historyText: string | null,
  window = HISTORY_WINDOW,
): ContextGovernanceRun[] | undefined {
  if (historyText === null) return undefined
  let runs: unknown
  try {
    runs = (JSON.parse(historyText) as { runs?: unknown }).runs
  } catch {
    return undefined
  }
  if (!Array.isArray(runs)) return undefined
  const valid = runs.filter((r): r is ContextGovernanceRun => {
    const o = r as Partial<ContextGovernanceRun>
    return (
      typeof o?.at === 'string' &&
      typeof o?.errors === 'number' &&
      typeof o?.c5 === 'number' &&
      (typeof o?.c5UpperBound === 'number' || o?.c5UpperBound === null) &&
      typeof o?.c5OverBy === 'number' &&
      (typeof o?.c5SuggestLowerBound === 'number' || o?.c5SuggestLowerBound === null) &&
      typeof o?.coAnchors === 'number' &&
      (o?.source === undefined || typeof o.source === 'string')
    )
  })
  if (valid.length === 0) return undefined
  return valid.slice(-window)
}

/**
 * 从历史文件文本里取最近 N 条合并清单；缺省/非法 ⇒ undefined（面板不展示折叠区）。
 *
 * 与 `summarizeHistory` 同源（同一个历史文件），但**逐项校验**：合并记录是审计日志，
 * 一条坏记录不该让整块清单消失（只丢那一条）。
 *
 * @param from 给了来源名 ⇒ 只取该来源的记录，且**跨窗口**（最多 `MERGE_DETAIL_MAX` 条）。
 *   这是「窗口外逐条明细」的取数口径：面板筛了某个来源，就能看到这个来源的全部记录，
 *   而不只是它落在最近 N 条窗口里的那几条。
 */
export function summarizeMerges(
  historyText: string | null,
  window = HISTORY_WINDOW,
  from?: string,
): ContextGovernanceMerge[] | undefined {
  const valid = parseMerges(historyText)
  if (valid === undefined) return undefined
  if (from !== undefined && from !== '') {
    const mine = valid.filter((m) => m.from === from).slice(-MERGE_DETAIL_MAX)
    // ⚠️ 该来源没有记录 ⇒ undefined（不返回空数组冒充「有记录」）
    if (mine.length === 0) return undefined
    return mine
  }
  return valid.slice(-window)
}

/**
 * 按来源统计**全量**合并数据（跨窗口）。
 *
 * ## 为什么单独一个字段
 *
 * `merges` 只给最近 N 条窗口；面板按来源筛选后，用户会以为「该来源就合并过这么几次」——
 * 但文件里可能还有更早的同来源记录被窗口截掉了。**没有全量数据就没法如实说「窗口外还有多少条」**。
 *
 * ## 为什么带 `lastAt`
 *
 * 全量口径的「最近一次合并时间」与窗口内的最近时间**可能不同**（某来源最近一次合并
 * 若落在窗口外，窗口内就看不到它）⇒ 必须单独给全量最近时间，否则时间维度也是残缺的。
 *
 * ⚠️ 口径与 `summarizeMerges` 一致：只统计**字段齐全**的合格记录（坏记录逐条丢弃，不计入）。
 */
export function summarizeMergesBySource(
  historyText: string | null,
): Record<string, ContextGovernanceMergeStat> | undefined {
  const valid = parseMerges(historyText)
  if (valid === undefined) return undefined
  const stats: Record<string, ContextGovernanceMergeStat> = {}
  for (const m of valid) {
    const cur = stats[m.from]
    if (cur === undefined) {
      stats[m.from] = {
        count: 1,
        accepted: m.accepted,
        added: m.added,
        dropped: m.dropped,
        lastAt: m.at,
      }
      continue
    }
    cur.count += 1
    cur.accepted += m.accepted
    cur.added += m.added
    cur.dropped += m.dropped
    if (m.at > cur.lastAt) cur.lastAt = m.at
  }
  return stats
}

/** 解析历史文件里的合并清单并逐项校验；没有合格项 ⇒ undefined */
function parseMerges(historyText: string | null): ContextGovernanceMerge[] | undefined {
  if (historyText === null) return undefined
  let merges: unknown
  try {
    merges = (JSON.parse(historyText) as { merges?: unknown }).merges
  } catch {
    return undefined
  }
  if (!Array.isArray(merges)) return undefined
  const valid = merges.filter((m): m is ContextGovernanceMerge => {
    const o = m as Partial<ContextGovernanceMerge>
    return (
      typeof o?.at === 'string' &&
      typeof o?.from === 'string' &&
      typeof o?.accepted === 'number' &&
      typeof o?.dropped === 'number' &&
      typeof o?.added === 'number'
    )
  })
  if (valid.length === 0) return undefined
  return valid
}

/**
 * 把三份文件文本合成面板要的结论（**纯函数**，便于用合成文本测两态）。
 */
export function summarizeContextGovernance(
  reportText: string | null,
  baselineText: string | null,
  historyText: string | null = null,
  mergesFrom?: string,
  mergesOffset = 0,
): ContextGovernanceOut {
  if (reportText === null) return { available: false }
  let report: Record<string, unknown>
  try {
    const parsed = JSON.parse(reportText) as unknown
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { available: false }
    }
    report = parsed as Record<string, unknown>
  } catch {
    return { available: false }
  }

  const c5 = num(report, 'c5')
  const coAnchors = num(report, 'coAnchors')
  const errors = num(report, 'errors')

  // 上界：报告里若有（新版 context:check 会写）优先；否则退回基线文件的数字。
  let upper = num(report, 'c5UpperBound')
  if (upper === undefined && baselineText !== null) {
    try {
      const b = JSON.parse(baselineText) as { c5UpperBound?: unknown }
      if (typeof b.c5UpperBound === 'number') upper = b.c5UpperBound
    } catch {
      /* 基线坏了 ⇒ 上界留空（面板显示「未知」，不猜） */
    }
  }

  const overBy =
    num(report, 'c5OverBy') ??
    (c5 !== undefined && upper !== undefined ? Math.max(0, c5 - upper) : undefined)

  const at = typeof report.at === 'string' ? report.at : undefined
  const suggest = nullableNum(report, 'c5SuggestLowerBound')
  const out: ContextGovernanceOut = { available: true }
  if (at !== undefined) out.at = at
  if (errors !== undefined) out.errors = errors
  if (c5 !== undefined) out.c5 = c5
  if (upper !== undefined) out.c5UpperBound = upper
  if (overBy !== undefined) out.c5OverBy = overBy
  if (suggest !== undefined) out.c5SuggestLowerBound = suggest
  if (coAnchors !== undefined) out.coAnchors = coAnchors
  const history = summarizeHistory(historyText)
  if (history !== undefined) out.history = history
  // 未筛选：窗口语义不变（最近 N 条）
  if (mergesFrom === undefined || mergesFrom === '') {
    const windowed = summarizeMerges(historyText, HISTORY_WINDOW)
    if (windowed !== undefined) out.merges = windowed
  } else {
    // 筛选态：分页取该来源明细（旧→新）。offset = 从最新往回跳过多少条；
    // 与 `merges` 同一份 `parseMerges` 解析，口径必然一致。
    const valid = parseMerges(historyText)
    if (valid !== undefined) {
      const all = valid.filter((m) => m.from === mergesFrom)
      const total = all.length
      out.mergesTotal = total
      const offset = Math.max(0, Math.min(mergesOffset, total))
      const start = Math.max(0, total - offset - MERGE_DETAIL_MAX)
      const end = total - offset
      const page = all.slice(start, end)
      if (page.length > 0) out.merges = page
      // 「当前页之后（更早）还有多少条」；到最早时缺省（不写 0 冒充「没截断」）
      const omitted = total - offset - page.length
      if (omitted > 0) out.mergesOmitted = omitted
    }
  }
  const mergesBySource = summarizeMergesBySource(historyText)
  if (mergesBySource !== undefined) out.mergesBySource = mergesBySource
  return out
}

export function registerContextGovernanceRoutes(app: FastifyInstance): void {
  app.get(
    '/api/context-governance',
    reportRoute(
      '/api/context-governance',
      'filesystem',
      '结论读自 test-results/context-check.json ＋ test-results/context-check-history.json（每轮覆盖/追加）与 docs/context-check-baseline.json（棘轮上界）',
    ),
    async (req) => {
      // `mergesFrom` = 只看某个来源的合并记录（**跨窗口**分页取）；
      // `mergesOffset` = 从最新往回跳过多少条（第 0 页 = 最近 50 条）。
      const { mergesFrom, mergesOffset } = req.query as {
        mergesFrom?: unknown
        mergesOffset?: unknown
      }
      const offset =
        typeof mergesOffset === 'string' && /^\d+$/.test(mergesOffset) ? Number(mergesOffset) : 0
      return summarizeContextGovernance(
        readText(join(REPO_ROOT, REPORT_REL)),
        readText(join(REPO_ROOT, BASELINE_REL)),
        readText(join(REPO_ROOT, HISTORY_REL)),
        typeof mergesFrom === 'string' && mergesFrom !== '' ? mergesFrom : undefined,
        offset,
      )
    },
  )
}
