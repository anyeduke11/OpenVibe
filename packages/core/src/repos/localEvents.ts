import type { SqliteDatabase } from '../db'
import { AppError, type LocalEventKind } from '@openvibe/shared'

/**
 * 本机事件台账（local-event-ledger.md FR-1 / FR-3）。
 *
 * 三条不变式：
 * 1. **写入点集中在本 repo 的一处**（FR-3）——不散落到各 repo 方法里。
 *    调用方是服务层（RF1-1）；服务层未落地时的降级形态是「route 调这里」，
 *    但**写入处必须留指向 FR-3 的注释**，禁止散成多处。
 * 2. **无条件本机写**（FR-3.2）：关闭遥测与否**不影响**这里。用户可见的开关是
 *    「一键清空」，不是「是否记录」——做成开关会让隐私断言变成两条分支，
 *    也会让「永不出网」的承诺多一个可被误读的状态。
 * 3. **day 由日戳单源派生**（2026-10-14 裁定② 取 UTC）：本仓唯一的「一天」定义是
 *    `at.toISOString().slice(0, 10)`（`shared/utils.ts`），**禁止在 repo 内另写本机日形态**。
 *    代价与兑付：设置页按本机日展示窗口时必须标注换算。
 */

export interface LocalEventInput {
  kind: LocalEventKind
  subjectType?: string | null
  subjectId?: string | null
  projectId?: string | null
  /** 受限 JSON。禁列（绝对路径 / 项目名 / 用户名 / 会话正文 / cwd）由调用方保证 */
  payload?: Record<string, unknown>
}

export interface LocalEventSummary {
  kind: LocalEventKind
  day: string
  count: number
}

export class LocalEventsRepo {
  constructor(private readonly db: SqliteDatabase) {}

  /**
   * 唯一的写入点（FR-3）。`day` 在这里落列、不在读侧现算 ——
   * 照 telemetry_events 的先例，避免「同一行在不同读路径算出不同 day」。
   */
  record(input: LocalEventInput, now: Date): number {
    const day = dayOf(now)
    const info = this.db
      .prepare(
        `INSERT INTO local_events
           (kind, subject_type, subject_id, project_id, payload_json, created_at, day)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.kind,
        input.subjectType ?? null,
        input.subjectId ?? null,
        input.projectId ?? null,
        JSON.stringify(input.payload ?? {}),
        now.toISOString(),
        day,
      )
    return Number(info.lastInsertRowid)
  }

  /**
   * 按 kind × day 的计数矩阵（近 N 天，`days` 夹逼到 ≥1）。
   *
   * ⚠️ 本方法**当前零生产调用方**（实测），保留是因为它是既有导出面、删它属 B 级。
   * 端点走的是 `summaryInWindow`（FR-7 的 from/to 口径）。
   */
  summary(days: number): LocalEventSummary[] {
    const n = Math.max(1, Math.floor(days))
    const rows = this.db
      .prepare(
        `SELECT kind, day, COUNT(*) AS count
           FROM local_events
          WHERE day >= date('now', ?)
          GROUP BY kind, day
          ORDER BY day DESC, kind ASC`,
      )
      .all(`-${n} days`) as LocalEventSummary[]
    return rows.map((r) => ({ kind: r.kind as LocalEventKind, day: r.day, count: Number(r.count) }))
  }

  /**
   * 时间窗聚合（FR-7）：**`[from, to)` 含头不含尾**。
   *
   * ⚠️ **边界口径只此一处**：整个仓库存取窗一律走这里，禁止在别处再写一遍
   * `day >= ? AND day < ?` —— 两处边界写法必然会漂，而漂了没人看得出。
   *
   * `day` 列已是 `YYYY-MM-DD` 的 UTC 日戳，故可直接按**字符串**比较；
   * 不取 `created_at` 参与比较（那会把毫秒级时区差引进来，跨时区时窗会错位）。
   *
   * @param from 含头，`YYYY-MM-DD`
   * @param to   **不含尾**，`YYYY-MM-DD`
   */
  summaryInWindow(from: string, to: string): LocalEventSummary[] {
    if (from > to) throw new AppError('VALIDATION_ERROR', `时间窗 from 晚于 to：${from} > ${to}`)
    const rows = this.db
      .prepare(
        `SELECT kind, day, COUNT(*) AS count
           FROM local_events
          WHERE day >= ? AND day < ?
          GROUP BY kind, day
          ORDER BY day DESC, kind ASC`,
      )
      .all(from, to) as LocalEventSummary[]
    return rows.map((r) => ({ kind: r.kind as LocalEventKind, day: r.day, count: Number(r.count) }))
  }

  /**
   * 累计计数（**不受时间窗限制**）—— FR-7 要求「窗内计数与累计计数可区分」。
   *
   * 两者同时出现在响应里，用户才知道「这段时间有 3 次」是全部还是只是一段。
   * 只给窗内计数的话，一个只用过两天的用户会误以为本机一直这么安静。
   */
  cumulativeByKind(): { kind: LocalEventKind; count: number }[] {
    const rows = this.db
      .prepare(
        `SELECT kind, COUNT(*) AS count
           FROM local_events
          GROUP BY kind
          ORDER BY kind ASC`,
      )
      .all() as { kind: string; count: number }[]
    return rows.map((r) => ({ kind: r.kind as LocalEventKind, count: Number(r.count) }))
  }

  /** 「一键清空」（FR-3.2 给用户的那个唯一开关） */
  clearAll(): number {
    const info = this.db.prepare('DELETE FROM local_events').run()
    return Number(info.changes)
  }

  countAll(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS c FROM local_events').get() as { c: number }
    return row.c
  }
}

/** UTC 日，与 shared/utils.ts 的日戳单源同口径（2026-10-14 裁定②） */
export function dayOf(at: Date): string {
  return at.toISOString().slice(0, 10)
}
