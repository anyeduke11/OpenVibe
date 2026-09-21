import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { migrate } from './runner'

export type SqliteDatabase = Database.Database

/** ~/.openvibe/ 布局（design §4） */
export function openvibeHome(): string {
  return join(homedir(), '.openvibe')
}

export function defaultDbPath(): string {
  return join(openvibeHome(), 'data', 'openvibe.db')
}

export interface OpenDatabaseOptions {
  /** 打开后自动执行未跑的 migration（默认 true，dev-plan §1.2 启动序列） */
  autoMigrate?: boolean
}

/** 打开（必要时创建目录与库文件），WAL + 外键 + busy 超时（design §4/D2） */
export function openDatabase(dbPath: string, options: OpenDatabaseOptions = {}): SqliteDatabase {
  mkdirSync(dirname(dbPath), { recursive: true })
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  if (options.autoMigrate !== false) {
    migrate(db)
  }
  return db
}
