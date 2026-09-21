import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase, type SqliteDatabase } from '../db'

export interface TestDbHandle {
  db: SqliteDatabase
  dir: string
  close(): void
}

/** 每用例新建临时库（dev-plan T2「newDb() 夹具」） */
export function newDb(): TestDbHandle {
  const dir = mkdtempSync(join(tmpdir(), 'ov-core-test-'))
  const db = openDatabase(join(dir, 'test.db'))
  return {
    db,
    dir,
    close() {
      db.close()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}
