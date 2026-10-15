import type { SqliteDatabase } from '../db'
import type { LocalEventKind } from '@openvibe/shared'

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

  /** 按 kind × day 的计数矩阵（FR-4 聚合端点的数据源） */
  summary(days: number): LocalEventSummary[] {
    const rows = this.db
      .prepare(
        `SELECT kind, day, COUNT(*) AS count
           FROM local_events
          WHERE day >= date('now', ?)
          GROUP BY kind, day
          ORDER BY day DESC, kind ASC, id ASC`,
      )
      .all(`-${Math.max(1, Math.floor(days))} days`) as LocalEventSummary[]
    return rows.map((r) => ({ kind: r.kind as LocalEventKind, day: r.day, count: Number(r.count) }))
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
