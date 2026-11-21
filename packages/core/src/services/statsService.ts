import { estimateTokens } from '../pack/size'
import type { SqliteDatabase } from '../db'
import type { FlywheelStatsOut, LoopLedgerEntry, OmDensityOut, OmOut } from '@openvibe/shared'

/**
 * 本机统计聚合服务（service-layer.md FR-1 的 `statsService`，第五个服务）。
 *
 * ## 为什么有真实可实现内容（FR-1.4 不得写空壳）
 *
 * spec §6.3 记录「`growthService`／`statsService` 此刻没有可实现内容」——那是 **2026-10-03** 的采样。
 * 事实已变：本文件承载的六类聚合**今天全部有真实数据面**：
 * ① 种子计数（settings 视图的三项）；② 飞轮五项（含逐项目圈数台账）；
 * ③ OM1 有效上下文密度（按包归因 Top5）；④ OM2 首次见效时间；
 * ⑤ 遥测事件分页；⑥ 本机台账清空计数。
 * 全部**本机现算、零出网**（D3 白名单不涉及）。
 *
 * ## 为什么聚合 SQL 归这里而不是留在 route
 *
 * FR-3 的路由退化形制是「解析参数 → 调 service → 序列化」。聚合 SQL 是**业务规则**（圈数的三条
 * EXISTS 判定、达成日取三时间戳的最大值），留在 route 里意味着：换读侧口径要改路由文件，
 * 而路由文件正是并行会话改动最频繁的面（本仓 2026-10 起的常态）。收进服务层后，
 * **判定规则的实现处数从 N 降到 1**（spec §1 的价值判据）。
 *
 * ## 边界
 *
 * - **只做读侧聚合**：不写库、不改状态、不裁剪数据。写入侧（台账 kind）走 `lib/ledger.ts`。
 * - **FR-1.3 传输无关**：本文件不 import fastify／@clack／commander／node:http（FR-4 的 lint 闸强制）。
 * - **FR-1.2 deps 显式**：db 由参数传入，不取全局。
 */

export interface StatsServiceDeps {
  db: SqliteDatabase
}

/** 表名白名单：`countOf` 的表名**不可**由调用方自由传入（那是 SQL 注入面） */
export type CountableTable = 'terms' | 'flow_templates' | 'prompts' | 'skills' | 'playbooks'

/** 单表行数（FR-3.2：`settings.ts` 的 `countOf` 裸 SQL 助手整体迁入） */
export function countOf(deps: StatsServiceDeps, table: CountableTable): number {
  const row = deps.db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }
  return row.c
}

function oneOf(deps: StatsServiceDeps, sql: string): number {
  return (deps.db.prepare(sql).get() as { c: number }).c
}

/**
 * 圈数台账的单项目判定（FR-3.2 五条判定的**逐项目**求值）。
 *
 * ⚠️ 达成日 = 三条时间戳的**最大值**（最近导出 / 最近注入 / 最近一条回流日志）——
 *   一圈的完成时刻由最晚那条决定，不是最早、也不是求和。
 * ⚠️ 排序按达成日**升序** ⇒ 台账里的「圈 1」是最早走完的那一圈；
 *   **末键补 `p.id`**：同一毫秒达成的两个项目次序不能由 SQLite 的返回序决定（UT-ORDER-01）。
 */
const LOOP_LEDGER_SQL = `
  SELECT p.id AS project_id, p.name AS project_name,
         pk.name AS pack_name, p.standard_pack_version AS pack_version,
         MAX(
           (SELECT MAX(e.exported_at) FROM pack_exports e
             WHERE e.pack_id = p.standard_pack_id),
           (SELECT MAX(i.injected_at) FROM injections i
             WHERE i.project_path = p.local_path AND i.pack_id = p.standard_pack_id),
           (SELECT MAX(d.created_at) FROM dev_log_entries d
             WHERE d.project_id = p.id AND json_array_length(d.linked_asset_ids) > 0)
         ) AS completed_at
    FROM projects p
    JOIN standard_packs pk ON pk.id = p.standard_pack_id
   WHERE p.standard_pack_id IS NOT NULL
     AND p.local_path IS NOT NULL
     AND EXISTS (SELECT 1 FROM pack_exports e WHERE e.pack_id = p.standard_pack_id)
     AND EXISTS (SELECT 1 FROM injections i
                  WHERE i.project_path = p.local_path
                    AND i.pack_id = p.standard_pack_id)
     AND EXISTS (SELECT 1 FROM dev_log_entries d
                  WHERE d.project_id = p.id
                    AND json_array_length(d.linked_asset_ids) > 0)
   ORDER BY completed_at ASC, p.id ASC`

interface LoopLedgerRow {
  project_id: string
  project_name: string
  pack_name: string
  pack_version: string
  completed_at: string
}

/** 圈数台账（与 `loops` 同源判定，只把「数项目」换成「列项目」） */
export function loopLedger(deps: StatsServiceDeps): LoopLedgerEntry[] {
  const rows = deps.db.prepare(LOOP_LEDGER_SQL).all() as LoopLedgerRow[]
  return rows.map((r) => ({
    projectId: r.project_id,
    projectName: r.project_name,
    packName: r.pack_name,
    packVersion: r.pack_version,
    completedAt: r.completed_at,
  }))
}

/**
 * 飞轮五项（onboarding FR-3，D-4 新增）：全本地 SQL 聚合，不参与遥测。
 * 圈数口径 FR-3.2：同一项目「登记了标准包且该包有导出 → 该路径有注入记录 → 有 ≥1 条回流资产」记 1 圈。
 */
export function flywheelStats(deps: StatsServiceDeps): FlywheelStatsOut {
  const ledger = loopLedger(deps)
  return {
    assets:
      oneOf(deps, 'SELECT COUNT(*) AS c FROM prompts') +
      oneOf(deps, 'SELECT COUNT(*) AS c FROM terms') +
      oneOf(deps, 'SELECT COUNT(*) AS c FROM skills'),
    packs: oneOf(deps, 'SELECT COUNT(*) AS c FROM standard_packs'),
    injections: oneOf(deps, 'SELECT COUNT(*) AS c FROM injections'),
    reflows: oneOf(
      deps,
      'SELECT COUNT(*) AS c FROM dev_log_entries WHERE json_array_length(linked_asset_ids) > 0',
    ),
    loops: ledger.length,
    loops_ledger: ledger,
  }
}

/**
 * OM1 有效上下文密度（v0.2.3 批次 B RQ5；全本机现算，零出网）。
 *
 * ⚠️ 渲染产物（不含 manifest）的估算 token 合计；`perAsset` = managedTokens ÷ assetCount，除零为 null。
 * ⚠️ 本函数**不产字节**：只读已渲染的产物内容做 token 估算（估计口径见 `pack/size.ts`）。
 */
export function omDensity(
  deps: StatsServiceDeps,
  rendered: {
    packId: string
    packName: string
    packVersion: string
    files: { path: string; content: string }[]
    assetCount: number
  },
): OmDensityOut {
  const per = rendered.files.map((f) => ({
    path: f.path,
    tokens: estimateTokens(f.content).approxTokens,
  }))
  const managedTokens = per.reduce((sum, p) => sum + p.tokens, 0)
  return {
    packId: rendered.packId,
    packName: rendered.packName,
    packVersion: rendered.packVersion,
    managedTokens,
    assetCount: rendered.assetCount,
    perAsset:
      rendered.assetCount > 0 ? Math.round((managedTokens / rendered.assetCount) * 10) / 10 : null,
    top5: [...per].sort((a, b) => b.tokens - a.tokens).slice(0, 5),
  }
}

/**
 * OM2 首次见效时间：首次本机事件（台账 MIN(created_at)）→ 第一次注入（injections MIN(injected_at)）
 * 的墙钟差；任一端缺失为 null（面板显示「待采集」）。
 */
export function omTimeToValue(deps: StatsServiceDeps): OmOut['timeToValue'] {
  const firstEventAt =
    (deps.db.prepare('SELECT MIN(created_at) AS t FROM local_events').get() as { t: string | null })
      .t ?? null
  const firstInjectionAt =
    (deps.db.prepare('SELECT MIN(injected_at) AS t FROM injections').get() as { t: string | null })
      .t ?? null
  const seconds =
    firstEventAt !== null && firstInjectionAt !== null
      ? Math.max(0, Math.round((Date.parse(firstInjectionAt) - Date.parse(firstEventAt)) / 1000))
      : null
  return { firstEventAt, firstInjectionAt, seconds }
}

/** 遥测事件分页（读侧；写侧走 TelemetryRepo，与本机台账是两层） */
export interface TelemetryRow {
  id: number
  event: string
  value: string
  day: string
  os: string
  app_version: string
  queued_at: string
  sent_at: string | null
}

export function telemetryEvents(deps: StatsServiceDeps, limit: number): TelemetryRow[] {
  return deps.db
    .prepare(
      `SELECT id, event, value, day, os, app_version, queued_at, sent_at
         FROM telemetry_events ORDER BY id DESC LIMIT ?`,
    )
    .all(limit) as TelemetryRow[]
}

/** 遥测事件总数 */
export function telemetryEventCount(deps: StatsServiceDeps): number {
  return oneOf(deps, 'SELECT COUNT(*) AS c FROM telemetry_events')
}

/** 本机台账条数（清空端点回传「删掉了几条」用） */
export function localEventCount(deps: StatsServiceDeps): number {
  return oneOf(deps, 'SELECT COUNT(*) AS c FROM local_events')
}

// ── 本机台账三件（/api/local-events 的读与清空）──────────────────────────
//
// F-1：`localEvents.ts` 的三个 repo 方法（summaryInWindow / cumulativeByKind / clearAll）
// 是**台账域的业务动作**，不是传输层的事。归口到 statsService 的理由：它与本文件的
// 「本机统计聚合」同域（读的是同一张 local_events 表），拆两个服务反而让聚合口径分裂。

import { LocalEventsRepo } from '../repos/localEvents'

/** 时间窗内按 kind × day 的计数（`[from, to)` 含头不含尾——全仓唯一边界口径） */
export function localEventSummaryInWindow(
  deps: StatsServiceDeps,
  from: string,
  to: string,
): ReturnType<LocalEventsRepo['summaryInWindow']> {
  return new LocalEventsRepo(deps.db).summaryInWindow(from, to)
}

/** 按 kind 的累计计数（不受时间窗约束） */
export function localEventCumulativeByKind(
  deps: StatsServiceDeps,
): ReturnType<LocalEventsRepo['cumulativeByKind']> {
  return new LocalEventsRepo(deps.db).cumulativeByKind()
}

/** 一键清空（返回删掉的条数；**不产生清空事件行**） */
export function clearLocalEvents(deps: StatsServiceDeps): number {
  return new LocalEventsRepo(deps.db).clearAll()
}
