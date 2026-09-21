import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { SqliteDatabase } from './index'

const MIGRATIONS_DIR = fileURLToPath(new URL('./migrations', import.meta.url))

export function nowIso(): string {
  return new Date().toISOString()
}

/**
 * 只前进 migration runner（dev-plan §2.5）：
 * 按文件名升序执行未登记的 migration，每个单事务（失败整体回滚并抛错）；
 * 不存在 down；修改历史脚本 = 禁止（新增变更走 0003+）。
 * schema_migrations 由 runner 自举（CREATE IF NOT EXISTS），migration 文件内不再建该表。
 */
export function migrate(db: SqliteDatabase): string[] {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version    TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`)

  const appliedRows = db.prepare('SELECT version FROM schema_migrations').all() as {
    version: string
  }[]
  const applied = new Set(appliedRows.map((r) => r.version))

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  const runOne = db.transaction((version: string, sql: string) => {
    db.exec(sql)
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
      version,
      nowIso(),
    )
  })

  const result: string[] = []
  for (const file of files) {
    const version = file.replace(/\.sql$/, '')
    if (applied.has(version)) continue
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
    runOne(version, sql)
    result.push(version)
  }
  return result
}
