import type { SqliteDatabase } from '../db'

/**
 * 提取链的逐项目出网同意（v0.2.3 批次 D AN4，spec FR-7）。
 * 语义逐字平移 `lang_source_consent`（m9-source-scan.ts）：逐项目粒度、
 * 记忆可清除、**清除 = 删行**（DL-21：不留「曾记住」残影）。
 * 表：ai_extract_consent（迁移 0021）。
 */

export interface ExtractConsent {
  projectId: string
  rememberAll: boolean
  rememberedAt: string | null
}

export function readExtractConsent(db: SqliteDatabase, projectId: string): ExtractConsent | null {
  const row = db
    .prepare(`SELECT project_id, remember_all, remembered_at FROM ai_extract_consent WHERE project_id = ?`)
    .get(projectId) as { project_id: string; remember_all: number; remembered_at: string | null } | undefined
  if (row === undefined) return null
  return { projectId: row.project_id, rememberAll: row.remember_all === 1, rememberedAt: row.remembered_at ?? null }
}

export function listExtractConsents(db: SqliteDatabase): ExtractConsent[] {
  return (
    db.prepare(`SELECT project_id, remember_all, remembered_at FROM ai_extract_consent ORDER BY remembered_at DESC, project_id`).all() as {
      project_id: string
      remember_all: number
      remembered_at: string | null
    }[]
  ).map((r) => ({ projectId: r.project_id, rememberAll: r.remember_all === 1, rememberedAt: r.remembered_at ?? null }))
}

export function setExtractConsent(db: SqliteDatabase, projectId: string, rememberAll: boolean, now: string): void {
  db.prepare(
    `INSERT INTO ai_extract_consent (project_id, remember_all, remembered_at) VALUES (?, ?, ?)
     ON CONFLICT(project_id) DO UPDATE SET remember_all = excluded.remember_all, remembered_at = excluded.remembered_at`,
  ).run(projectId, rememberAll ? 1 : 0, now)
}

/** DL-21：清除 = 删行——置 0 会留下「曾经记住过」的残影，删了才等于「不再有任何记忆」 */
export function clearExtractConsent(db: SqliteDatabase, projectId: string): void {
  db.prepare(`DELETE FROM ai_extract_consent WHERE project_id = ?`).run(projectId)
}

/** 当日已出网的提取调用次数（预算熔断的现算源；从本机事件台账数，零新增采集点） */
export function extractCallsToday(db: SqliteDatabase, day: string, kind: 'ai_extract_call' | 'ai_discuss_call' = 'ai_extract_call'): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS c FROM local_events WHERE kind = ? AND day = ?`)
    .get(kind, day) as { c: number }
  return row.c
}
