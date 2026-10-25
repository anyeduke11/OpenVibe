import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import {
  LOCAL_EVENT_KINDS,
  LEDGER_EVENT_KINDS,
  AGENT_EVENT_KINDS,
  AGENT_AI_EVENT_KINDS,
  AGENT_INGEST_KINDS,
  LANG_EVENT_KINDS,
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

const MIGRATIONS_DIR = fileURLToPath(new URL('../db/migrations', import.meta.url))

/**
 * ⚠️ 下面三条判据**刻意仍只读 0007**，不跟着扩到 0010：
 * 它们断的是「**0007 当初**只 CREATE、不 ALTER/DROP 老表」，是历史事实不是当前状态。
 * 而 0010 **必须** DROP/ALTER —— 重建表就是这两句（SQLite 改不了 CHECK）。
 * 把它们改成扫全部迁移会让 0010 自己判红，等于禁止合法的表重建。
 */
const migration = readFileSync(
  join(MIGRATIONS_DIR, '0007_local_events_and_agent_bridge.sql'),
  'utf8',
)

/** 按文件名排序的迁移全文。⚠️ 必须**排序**：判定「当前定义」靠的是最后出现的那份 */
const MIGRATIONS: { file: string; sql: string }[] = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((file) => ({ file, sql: readFileSync(join(MIGRATIONS_DIR, file), 'utf8') }))

/** 最后一份出现该表 CHECK 闭集的迁移 —— 那才是**当前生效**的定义 */
const lastDefining = (table: string, column: string) => {
  const re = new RegExp(
    `${table}(?:_[a-z0-9]+)?\\s*\\([\\s\\S]*?${column}\\s+TEXT[^)]*?CHECK\\s*\\(\\s*${column}\\s+IN\\s*\\(([\\s\\S]*?)\\)\\)`,
    'i',
  )
  for (let i = MIGRATIONS.length - 1; i >= 0; i--) {
    const m = MIGRATIONS[i]!.sql.match(re)
    if (m) return { file: MIGRATIONS[i]!.file, body: m[1] as string }
  }
  throw new Error(`全部迁移里都找不到 ${table}.${column} 的 CHECK 闭集`)
}

/**
 * 取某张表 `CHECK (col IN (...))` 里的全部单引号字面量。
 *
 * ⚠️ **为什么改成「扫全部迁移取最后一次」而不是钉死 0007**（P5 · m3 FR-9.2）：
 * 扩 `kind` 闭集在 SQLite 上只能靠**重建表**，重建后的定义写在**新迁移**里
 * （0010），0007 那份永远停在 18 项。钉死 0007 的判据会在第一次合法扩项时就误判红，
 * 于是后来者面临两个坏选择：放松判据（真的放松了），或不敢扩项（CHECK 形同虚设）。
 *
 * ⚠️ **这不是放松**：判据仍然是「**当前** CHECK ≡ 常量，逐字逐序」，
 * 仍然是双源不一致就红。变的只是「当前」怎么取 —— 从「第一份迁移」改成「最后一份迁移」。
 * 另配 `historicalDefinitionsArePrefixes` 一支：**任何历史定义的字面量集必须是当前集的
 * 前缀**（否则历史行会因新定义而非法），这一支把「最后一次」这个选择的漏洞也堵住。
 */
function checkLiterals(table: string, column: string): string[] {
  const { body } = lastDefining(table, column)
  expect(body, `迁移里 ${table}.${column} 的 CHECK 闭集为空`).toBeTruthy()
  return [...body.matchAll(/'([^']+)'/g)].map((x) => x[1]!).filter((s): s is string => s.length > 0)
}

describe('0007 迁移与 shared 常量的双源一致性', () => {
  /**
   * ⚠️ **2026-10-20 更新（M9 P1b 的 0012 迁移落地后）**：
   * 「当前定义」从 19 项变成 **23 项** —— M9 的 4 个 kind（含 `lang_resource_probe`）
   * 由迁移 **0012** 落地（0011 的注释里写明「要等 P1b 写 0012 迁移时一起加到 CHECK」）。
   *
   * ⇒ 判据的**口径不变**：**当前** CHECK ≡ `LOCAL_EVENT_KINDS`，逐字逐序、双源不一致就红。
   *   变的只是「当前」怎么取 —— 取**最后一份**定义该 CHECK 的迁移（现在是 0012）。
   *   0007 / 0010 那两份**永远是历史**：它们必须是当前集的**前缀**
   *   （否则历史行会因新定义而非法）—— 那一支由下面的「历史定义必须是前缀」守着。
   */
  it('当前 CHECK 字面量 ≡ LOCAL_EVENT_KINDS（25 项，逐字、逐序；M10/D 的 2 项由 0021 落地）', () => {
    const current = checkLiterals('local_events', 'kind')
    expect(current).toEqual([...LOCAL_EVENT_KINDS])
    // 同时锁死 23：任何后续 commit 若改了当前定义的 CHECK，会被这条红掉。
    expect(current).toHaveLength(25)
  })

  it('kind 的 CHECK 字面量 ≡ 台账 13 ＋ Agent 6 ＋ M9 预声明 4', () => {
    expect([...LOCAL_EVENT_KINDS]).toEqual([
      ...LEDGER_EVENT_KINDS,
      ...AGENT_EVENT_KINDS,
      ...LANG_EVENT_KINDS,
    ])
    expect(LEDGER_EVENT_KINDS).toHaveLength(13)
    // M8 五项 ＋ M3 AI 一项（P5 新增）。⚠️ 写死计数是有意的：扩项必须在这里被看见，
    // 否则「悄悄多了一项」不会有任何人察觉。
    expect(AGENT_EVENT_KINDS).toHaveLength(8)
    expect(AGENT_AI_EVENT_KINDS).toEqual(['ai_recommend_call', 'ai_extract_call', 'ai_discuss_call'])
    // M9 v1.6 P0 预声明 4 项。⚠️ 这 4 项在 P0 还**没有被任何 `INSERT` 引用** —— 它们要靠
    // P1 写的迁移 0011 建新表（SQLite 不能 ALTER CHECK）才会真正落地；当下
    // LANG_EVENT_KINDS 只是**声明**，与 P0-pre 阶段的「禁列扫描器接 lang_* 命名空间」
    // 配套使用。
    expect(LANG_EVENT_KINDS).toHaveLength(4)
    expect(LOCAL_EVENT_KINDS).toHaveLength(25)
  })

  it('⚠️ 每份历史迁移的 CHECK 闭集都必须是当前集的前缀（否则历史行会因新定义而非法）', () => {
    const current = [...LOCAL_EVENT_KINDS]
    for (const { file } of MIGRATIONS) {
      const re = /local_events(?:_[a-z0-9]+)?\s*\([\s\S]*?kind\s+TEXT[^)]*?CHECK\s*\(\s*kind\s+IN\s*\(([\s\S]*?)\)\)/i
      const m = file.match(re)
      if (!m) continue
      const lits = [...(m[1] as string).matchAll(/'([^']+)'/g)].map((x) => x[1]!)
      expect(
        lits,
        `${file} 的 local_events.kind 闭集不是当前 LOCAL_EVENT_KINDS 的前缀`,
      ).toEqual(current.slice(0, lits.length))
    }
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
