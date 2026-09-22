import type { SqliteDatabase } from '../db'

/**
 * app_meta（design §5 的 C-1 表）：跨进程共享 KV 的唯一权威处。
 * 值一律以 JSON 字面量入库，读回按 fallback 容错——单个键损坏不该拖垮设置页与遥测闸门。
 */
export const APP_META_KEYS = {
  telemetryEnabled: 'telemetryEnabled',
  telemetryAskState: 'telemetryAskState',
  onboardingDone: 'onboardingDone',
} as const

export class AppMetaRepo {
  constructor(private readonly db: SqliteDatabase) {}

  read<T>(key: string, fallback: T): T {
    const row = this.db.prepare('SELECT value FROM app_meta WHERE key = ?').get(key) as
      { value: string } | undefined
    if (!row) return fallback
    try {
      return JSON.parse(row.value) as T
    } catch {
      return fallback
    }
  }

  write(key: string, value: unknown): void {
    this.db
      .prepare(
        `INSERT INTO app_meta (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(key, JSON.stringify(value))
  }
}
