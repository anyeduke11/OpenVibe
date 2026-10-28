import type { FastifyInstance } from 'fastify'
import {
  LocalEventsClearOut,
  LocalEventsQuery,
  LocalEventsSummaryOut,
  type LocalEventsSummaryOut as SummaryOut,
} from '@openvibe/shared'
import { LocalEventsRepo, type SqliteDatabase } from '@openvibe/core'
import { parseOrThrow } from '../lib/validate'

/**
 * 本机事件台账的读面与清空面（local-event-ledger.md FR-4 / FR-7 · g/h/i 三条验收的被验收物）。
 *
 * ## 为什么鉴权不在这里写
 *
 * `apps/server/src/plugins/auth.ts` 是**全局 `preHandler`**，罩住所有 `/api/*`
 * （仅 `GET /api/health` 豁免）。所以「无 token ⇒ 既有 401/403 形态」这条
 * **由插件保证而非本文件保证** —— 本文件不重复写鉴权，也不该写。
 * g 条验收要断的正是「端点确实落在插件覆盖范围内」，那是集成测试的活，不是这里的活。
 *
 * ## 为什么清空是 POST 而不是 DELETE
 *
 * `DELETE /api/local-events` 语义上更贴，但**不可逆动作走 POST + 显式端点名**
 * 是本仓既有形制（`/api/settings/reseed` 同款），且「一键清空」要在 UI 上带二次确认，
 * 由前端决定走哪个动词更实际。**动作名（clear）比动词更能把意图说清。**
 */

export interface LocalEventsRouteDeps {
  db: SqliteDatabase
  /** 时间源注入，便于断言 `clearedAt` */
  now?: () => Date
}

export function registerLocalEventsRoutes(app: FastifyInstance, deps: LocalEventsRouteDeps): void {
  const repo = new LocalEventsRepo(deps.db)

  /**
   * 聚合查询（FR-4 / FR-7）。
   *
   * **窗内与累计同时返回**是这条端点的核心：只给窗内计数，
   * 一个只查过最近三天的用户会以为本机一直这么安静。
   */
  app.get('/api/local-events/summary', async (req): Promise<SummaryOut> => {
    const q = parseOrThrow(LocalEventsQuery, req.query)
    const byDay = repo.summaryInWindow(q.from, q.to)
    const cumulativeByKind = repo.cumulativeByKind()

    // 窗内按 kind 汇总：从 byDay 聚合，避免两条 SQL 各算一遍而口径漂
    const byKindMap = new Map<string, number>()
    for (const row of byDay) byKindMap.set(row.kind, (byKindMap.get(row.kind) ?? 0) + row.count)

    return LocalEventsSummaryOut.parse({
      window: { from: q.from, to: q.to, inclusive: 'start-only' },
      byDay,
      byKind: [...byKindMap.entries()]
        .map(([kind, count]) => ({ kind, count }))
        .sort((a, b) => (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0)),
      windowTotal: byDay.reduce((s, r) => s + r.count, 0),
      cumulativeTotal: cumulativeByKind.reduce((s, r) => s + r.count, 0),
      cumulativeByKind,
      activeDays: new Set(byDay.map((r) => r.day)).size,
    })
  })

  /**
   * 一键清空（FR-3.2）。
   *
   * **回传删掉的条数**是判据的一部分：「清空了 0 条」和「清空了 128 条」对用户是两件事，
   * 只回一个 200 等于让用户自己猜。
   *
   * ⚠️ 本端点**不可逆**，UI 必须带二次确认；服务端不代做这个决定。
   */
  app.post('/api/local-events/clear', async (): Promise<LocalEventsClearOut> => {
    const now = (deps.now ?? (() => new Date()))()
    const cleared = repo.clearAll()
    return LocalEventsClearOut.parse({ cleared, clearedAt: now.toISOString() })
  })
}
