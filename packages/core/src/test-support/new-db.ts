import { join } from 'node:path'
import { openDatabase, type SqliteDatabase } from '../db'
import { cleanupTempDir, tempDir } from './temp-dir'

export interface TestDbHandle {
  db: SqliteDatabase
  dir: string
  close(): void
}

/**
 * 每用例新建临时库（dev-plan T2「newDb() 夹具」）。
 *
 * ⚠️ **2026-11-01 改为走 `tempDir()`**：原写法直接 `mkdtempSync`，销毁只挂在
 *   调用方的 `afterEach` ⇒ 进程被中断时目录留在磁盘上没人收
 *   （2026-10-31 实测积了 987 个 `ov-core-test-*` 目录，磁盘满导致全量测试红）。
 *   ⇒ 现在目录由 `tempDir()` 登记，**进程退出时兜底清理**。
 */
export function newDb(): TestDbHandle {
  const dir = tempDir('ov-core-test-')
  const db = openDatabase(join(dir, 'test.db'))
  return {
    db,
    dir,
    close() {
      db.close()
      // ⚠️ 走 `cleanupTempDir`（而不是自己 `rmSync`）：它会**同时把目录从登记集里摘掉**
      //   ⇒ 登记集不虚高 ⇒ 退出兜底不会对已删目录重复清理。
      cleanupTempDir(dir)
    },
  }
}
