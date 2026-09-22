import type { SqliteDatabase } from '../db'
import type { TelemetryEvent } from '@openvibe/shared'

export type TelemetryOs = 'mac' | 'linux' | 'win'

export interface TelemetryQueuedEvent {
  id: number
  event: TelemetryEvent
  value: string
  day: string
  os: TelemetryOs
  appVersion: string
  queuedAt: string
  sentAt: string | null
}

export interface TelemetryEnqueueInput {
  event: TelemetryEvent
  value: string
  day: string
  os: TelemetryOs
  appVersion: string
  queuedAt: string
}

type TelemetryRow = {
  id: number
  event: string
  value: string
  day: string
  os: string
  app_version: string
  queued_at: string
  sent_at: string | null
}

function rowToEvent(row: TelemetryRow): TelemetryQueuedEvent {
  return {
    id: row.id,
    event: row.event as TelemetryEvent,
    value: row.value,
    day: row.day,
    os: row.os as TelemetryOs,
    appVersion: row.app_version,
    queuedAt: row.queued_at,
    sentAt: row.sent_at,
  }
}

/**
 * telemetry_events（design §11.5 / C-2）：匿名遥测的本地队列。
 * 批量外发的 sender 尚未落地（D12 的 owner 端点未部署、config.json 也没有端点字段），
 * 因此 MVP 的终点就是入队——开关关闭时连入队都不发生，「零外联」是结构性的。
 */
export class TelemetryRepo {
  constructor(private readonly db: SqliteDatabase) {}

  enqueue(input: TelemetryEnqueueInput): void {
    this.db
      .prepare(
        `INSERT INTO telemetry_events (event, value, day, os, app_version, queued_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(input.event, input.value, input.day, input.os, input.appVersion, input.queuedAt)
  }

  /** 待发送口径（§4.6：每批 ≤100 条，按入队序）；也是「关闭时零入队」的断言入口 */
  pending(limit = 100): TelemetryQueuedEvent[] {
    const rows = this.db
      .prepare('SELECT * FROM telemetry_events WHERE sent_at IS NULL ORDER BY id ASC LIMIT ?')
      .all(limit) as TelemetryRow[]
    return rows.map(rowToEvent)
  }
}
