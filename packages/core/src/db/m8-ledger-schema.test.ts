import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  LOCAL_EVENT_KINDS,
  LEDGER_EVENT_KINDS,
  AGENT_EVENT_KINDS,
  AGENT_INGEST_KINDS,
  AGENT_INGEST_STATUSES,
  TELEMETRY_EVENTS,
} from '@openvibe/shared'

/**
 * 台账 + M8 的双源一致性闸（local-event-ledger.md FR-1.4 / FR-2.2，
 * m8-agent-bridge.md FR-1.4）。
 *
 * 为什么必须是测试而不是注释：本仓已实证遥测那份同样的双源**当前无人守**
 * （`grep -rln 'TELEMETRY_EVENTS' --include='*.test.ts'` 为空）。
 * 这条闸的存在理由就是「不得再落一个」。
 *
 * 变异腿：往任一侧加一项而不同步改另一侧 ⇒ 必判红。
 */

const migrationPath = fileURLToPath(
  new URL('../db/migrations/0007_local_events_and_agent_bridge.sql', import.meta.url),
)
const migration = readFileSync(migrationPath, 'utf8')

/** 取某张表 `CHECK (col IN (...))` 里的全部单引号字面量 */
function checkLiterals(table: string, column: string): string[] {
  const re = new RegExp(
    `${table}\\s*\\([\\s\\S]*?${column}\\s+TEXT[^)]*?CHECK\\s*\\(\\s*${column}\\s+IN\\s*\\(([\\s\\S]*?)\\)\\)`,
    'i',
  )
  const m = migration.match(re)
  expect(m, `迁移里找不到 ${table}.${column} 的 CHECK 闭集`).not.toBeNull()
  const body = (m as RegExpMatchArray)[1]
  expect(body, `迁移里 ${table}.${column} 的 CHECK 闭集为空`).toBeDefined()
  return [...body!.matchAll(/'([^']+)'/g)].map((x) => x[1]!).filter((s): s is string => s.length > 0)
}

describe('0007 迁移与 shared 常量的双源一致性', () => {
  it('kind 的 CHECK 字面量 ≡ LOCAL_EVENT_KINDS（逐字、逐序）', () => {
    expect(checkLiterals('local_events', 'kind')).toEqual([...LOCAL_EVENT_KINDS])
  })

  it('kind 的 CHECK 字面量 ≡ 台账 13 ＋ M8 5 的并集', () => {
    expect([...LOCAL_EVENT_KINDS]).toEqual([...LEDGER_EVENT_KINDS, ...AGENT_EVENT_KINDS])
    expect(LEDGER_EVENT_KINDS).toHaveLength(13)
    expect(AGENT_EVENT_KINDS).toHaveLength(5)
    expect(LOCAL_EVENT_KINDS).toHaveLength(18)
  })

  it('台账 kind 与遥测三事件严格不同名（台账永不出网、遥测默认关，混名会让误解被代码坐实）', () => {
    const overlap = LOCAL_EVENT_KINDS.filter((k) => (TELEMETRY_EVENTS as readonly string[]).includes(k))
    expect(overlap).toEqual([])
  })

  it('agent_ingests.kind CHECK ≡ AGENT_INGEST_KINDS 五项', () => {
    expect(checkLiterals('agent_ingests', 'kind')).toEqual([...AGENT_INGEST_KINDS])
  })

  it('agent_ingests.status CHECK ≡ 四态闭集，且**不得有第五态**', () => {
    const statuses = checkLiterals('agent_ingests', 'status')
    expect(statuses).toEqual([...AGENT_INGEST_STATUSES])
    // 「已过期」是 created_at + 时间窗的读侧判据，不是存储态（FR-1.2.3）
    expect(statuses).not.toContain('expired')
    expect(statuses).toHaveLength(4)
  })

  it('三张 M8 表在同一次迁移里一次建齐（裁①：分两次会让「kind 已扩但表未建」静默存在）', () => {
    for (const t of ['local_events', 'agent_sessions', 'agent_ingests', 'requirements']) {
      expect(migration, `${t} 不在 0007 里`).toContain(`CREATE TABLE ${t}`)
    }
  })

  it('local_events 建了两条索引且不带 FTS（台账不做全文检索）', () => {
    expect(migration).toContain('idx_local_events_kind_day')
    expect(migration).toContain('idx_local_events_created_at')
    expect(migration.toUpperCase()).not.toContain('VIRTUAL TABLE')
  })

  it('迁移只 CREATE、不 ALTER 既有表（老库升级即新增空表，历史无记录属预期，不得回填）', () => {
    expect(migration.toUpperCase()).not.toContain('ALTER TABLE')
    expect(migration.toUpperCase()).not.toContain('DROP TABLE')
  })
})
