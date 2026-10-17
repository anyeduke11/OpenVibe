import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { newDb } from '../test-support/new-db'
import { openDatabase, type SqliteDatabase } from './index'
import { migrate } from './runner'
import { FlowTemplatesRepo } from '../repos/flows'
import { DevLogRepo } from '../repos/devlog'
import { LocalEventsRepo, dayOf } from '../repos/localEvents'
import { ProjectsRepo } from '../repos/projects'
import { PromptsRepo } from '../repos/prompts'
import { SkillsRepo } from '../repos/skills'

const basePrompt = { title: '代码审查请求', content: '审查代码', useAs: 'reference' as const }

describe('UT-MIGRATION-01 · migration 只前进且幂等', () => {
  it('首开建全部版本，重跑不重复不报错', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ov-mig-'))
    const db = openDatabase(join(dir, 'm.db'), { autoMigrate: false })
    const applied = migrate(db)
    expect(applied).toEqual([
      '0001_init',
      '0002_app_meta_telemetry',
      '0003_pack_exports_bundle_json',
      '0004_skill_remote_sources',
      '0005_skill_remote_tracking',
      '0006_playbooks',
      '0007_local_events_and_agent_bridge',
      '0008_terms_learning',
    ])
    expect(migrate(db)).toEqual([])
    const count = (db.prepare('SELECT COUNT(*) AS c FROM schema_migrations').get() as { c: number }).c
    expect(count).toBe(8)
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('WAL 与外键已启用', () => {
    const h = newDb()
    expect(h.db.pragma('journal_mode', { simple: true })).toBe('wal')
    expect(h.db.pragma('foreign_keys', { simple: true })).toBe(1)
    h.close()
  })
})

describe('UT-CASCADE-01 · 提示词硬删级联版本', () => {
  it('删除后 prompt_versions 计数为 0', () => {
    const h = newDb()
    const repo = new PromptsRepo(h.db)
    const { prompt } = repo.create(basePrompt)
    repo.update(prompt.id, { content: 'v2 内容' })
    repo.update(prompt.id, { content: 'v3 内容' })
    expect(repo.versions(prompt.id)).toHaveLength(3)

    repo.delete(prompt.id)
    const count = (
      h.db.prepare('SELECT COUNT(*) AS c FROM prompt_versions').get() as { c: number }
    ).c
    expect(count).toBe(0)
    h.close()
  })
})

describe('UT-CASCADE-02 · skill 与项目级联', () => {
  it('删 skill 级联版本', () => {
    const h = newDb()
    const repo = new SkillsRepo(h.db)
    repo.scan([h.dir]) // dir 无 skills → discovered 0
    // 直接构造：manual skill + 手工版本行
    const skill = repo.create({ name: 'pdf', source: 'manual' })
    h.db
      .prepare(
        `INSERT INTO skill_versions (id, skill_id, version_label, dir_hash, file_count, scanned_at)
         VALUES ('skv_x', ?, 'v1', 'hash', 1, '2026-09-21T00:00:00Z')`,
      )
      .run(skill.id)
    repo.delete(skill.id)
    const count = (h.db.prepare('SELECT COUNT(*) AS c FROM skill_versions').get() as { c: number }).c
    expect(count).toBe(0)
    h.close()
  })

  it('删项目级联 tasks/日志/勾选，且不动目标目录（此处仅验证库内级联）', () => {
    const h = newDb()
    const flows = new FlowTemplatesRepo(h.db)
    const template = flows.create({
      name: '个人轻量流',
      kind: 'light',
      stages: [
        { name: '启动', checklist: [{ id: 'c1', text: '需求一句话写清' }], artifacts: [], prompt: '' },
      ],
    })
    const projects = new ProjectsRepo(h.db)
    const project = projects.create({ name: 'demo', flowTemplateId: template.id })

    h.db
      .prepare(
        `INSERT INTO tasks (id, project_id, title, stage_name, status, order_) VALUES ('tsk_1', ?, 't', '启动', 'todo', 0)`,
      )
      .run(project.id)
    projects.checkState(project.id, '启动', 'c1', true)
    new DevLogRepo(h.db).create(project.id, { type: 'DEV', title: '', body: '', relatedFiles: [] })

    projects.delete(project.id)
    for (const table of ['tasks', 'project_check_states', 'dev_log_entries']) {
      const count = (h.db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c
      expect(count, table).toBe(0)
    }
    h.close()
  })
})

// ============ 台账 0007 升级的「既有库」两径（local-event-ledger §7-a / §7-k）============

const MIGRATIONS_DIR = fileURLToPath(new URL('./migrations', import.meta.url))

/** 0007 一笔建的四张表（m8-ledger-schema.test.ts 的同一份清单） */
const FOUR_TABLES = ['local_events', 'agent_sessions', 'agent_ingests', 'requirements'] as const

/** 七支迁移的版本号，逐字取自 migrations/ 目录下的文件名（去掉 .sql） */
const ALL_VERSIONS = [
  '0001_init',
  '0002_app_meta_telemetry',
  '0003_pack_exports_bundle_json',
  '0004_skill_remote_sources',
  '0005_skill_remote_tracking',
  '0006_playbooks',
  '0007_local_events_and_agent_bridge',
  '0008_terms_learning',
]

/** 存量行的记账时间戳：刻意早于 0007 落库（2026-10-14），好断言「旧行没被重写」 */
const LEGACY_APPLIED_AT = '2026-10-13T08:00:00.000Z'

/**
 * 构造一个**账上停在 lastVersion 的老库**——真实用户升级前的形状。
 *
 * 为什么不能直接调 migrate()：它一次跑到最新，跑不出「只到 0006」的中间态。
 * 这里逐字照抄 runner.ts 的语义（自举 schema_migrations / 单事务 / 迁移期间临时关外键，
 * 因为 0004 的 DROP TABLE skills 走隐式 DELETE 会经 CASCADE 清子表），
 * 只差一处「跑到指定版本就停」。
 */
function migrateUpTo(db: SqliteDatabase, lastVersion: string): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version    TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`)
  const runOne = db.transaction((version: string, sql: string) => {
    db.exec(sql)
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
      version,
      LEGACY_APPLIED_AT,
    )
  })
  db.pragma('foreign_keys = OFF')
  try {
    for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
      const version = file.replace(/\.sql$/, '')
      if (version > lastVersion) break
      runOne(version, readFileSync(join(MIGRATIONS_DIR, file), 'utf8'))
    }
  } finally {
    db.pragma('foreign_keys = ON')
  }
}

/** 不自动迁移地开一个空库（构造老库用），close 连临时目录一起清 */
function openLegacyDb(): { db: SqliteDatabase; close(): void } {
  const dir = mkdtempSync(join(tmpdir(), 'ov-mig-legacy-'))
  const db = openDatabase(join(dir, 'legacy.db'), { autoMigrate: false })
  return {
    db,
    close() {
      db.close()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

/** 存量数据：一个项目 + 三条任务（覆盖三种 status 与 null stage_name） */
function seedLegacyRows(db: SqliteDatabase): void {
  db.prepare(
    `INSERT INTO projects (id, name, local_path, flow_template_id, stages_snapshot, current_stage,
                           status, standard_pack_id, standard_pack_version, created_at, updated_at)
     VALUES ('prj_legacy', '存量项目-华银理财', NULL, NULL, '[]', NULL,
             'active', NULL, NULL, '2026-10-13T09:00:00.000Z', '2026-10-13T09:00:00.000Z')`,
  ).run()
  const insert = db.prepare(
    `INSERT INTO tasks (id, project_id, title, stage_name, status, order_)
     VALUES (?, 'prj_legacy', ?, ?, ?, ?)`,
  )
  insert.run('tsk_legacy_1', '存量任务一·等保测评整改', '启动', 'todo', 0)
  insert.run('tsk_legacy_2', '存量任务二·堡垒机替换', '启动', 'doing', 1)
  insert.run('tsk_legacy_3', '存量任务三·数据出境评估', null, 'done', 2)
}

/** 逐字段快照：只比 COUNT 会漏掉「行还在但被改了」的那类丢失 */
function snapshotLegacyRows(db: SqliteDatabase): { projects: unknown[]; tasks: unknown[] } {
  return {
    projects: db.prepare('SELECT * FROM projects ORDER BY id ASC').all(),
    tasks: db.prepare('SELECT * FROM tasks ORDER BY id ASC').all(),
  }
}

function tableNames(db: SqliteDatabase): string[] {
  return (
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]
  ).map((r) => r.name)
}

function countOf(db: SqliteDatabase, table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c
}

function ledgerRows(db: SqliteDatabase): { version: string; appliedAt: string }[] {
  return (
    db
      .prepare('SELECT version, applied_at AS appliedAt FROM schema_migrations ORDER BY rowid ASC')
      .all() as { version: string; appliedAt: string }[]
  )
}

describe('CORE-EVT-01 · 0007 升级的既有库两径（local-event-ledger §7-a）', () => {
  it('CORE-EVT-01a: 账上停在 0006 的老库 → 只补 0007 一行，四表齐且空，既有行零丢失', () => {
    const legacy = openLegacyDb()
    try {
      migrateUpTo(legacy.db, '0006_playbooks')
      // 前置：升级前四张表确实不存在（否则「新增空表」这半句无从谈起）
      expect(ledgerRows(legacy.db).map((r) => r.version)).toEqual(ALL_VERSIONS.slice(0, 6))
      for (const t of FOUR_TABLES) expect(tableNames(legacy.db), t).not.toContain(t)

      seedLegacyRows(legacy.db)
      const before = snapshotLegacyRows(legacy.db)

      // 只执行未登记的那一支：0007 已登记过的老迁移不会被重跑
      expect(migrate(legacy.db)).toEqual(['0007_local_events_and_agent_bridge', '0008_terms_learning'])
      expect(ledgerRows(legacy.db).map((r) => r.version)).toEqual(ALL_VERSIONS)
      // 旧记账行没被重写（新行的时间戳严格晚于存量行）
      const rows = ledgerRows(legacy.db)
      expect(rows[0]?.appliedAt).toBe(LEGACY_APPLIED_AT)
      expect(new Date(rows[6]!.appliedAt).getTime()).toBeGreaterThan(
        new Date(LEGACY_APPLIED_AT).getTime(),
      )

      for (const t of FOUR_TABLES) {
        expect(tableNames(legacy.db), t).toContain(t)
        expect(countOf(legacy.db, t), `${t} 不得有回填行`).toBe(0)
      }
      // 核心价值：既有数据逐字段不变（只比条数会漏掉「被改写」）
      expect(snapshotLegacyRows(legacy.db)).toEqual(before)

      // 幂等：再跑一次空数组，数据与四张空表都不动
      expect(migrate(legacy.db)).toEqual([])
      expect(snapshotLegacyRows(legacy.db)).toEqual(before)
      for (const t of FOUR_TABLES) expect(countOf(legacy.db, t), t).toBe(0)
    } finally {
      legacy.close()
    }
  })

  it('CORE-EVT-01b: 账上根本没有 0006 的老库（DEV-0091 之前的安装）→ 0006 与 0007 连补两行', () => {
    const legacy = openLegacyDb()
    try {
      migrateUpTo(legacy.db, '0005_skill_remote_tracking')
      expect(ledgerRows(legacy.db).map((r) => r.version)).toEqual(ALL_VERSIONS.slice(0, 5))
      expect(tableNames(legacy.db)).not.toContain('playbooks')
      for (const t of FOUR_TABLES) expect(tableNames(legacy.db), t).not.toContain(t)

      seedLegacyRows(legacy.db)
      const before = snapshotLegacyRows(legacy.db)

      // 两支连着补：0006 是后加的迁移，老用户的账上从来没有它 ⇒ 必须跑，才不会
      // 「有 0007 的表却没有 playbooks 表」这种半截状态
      expect(migrate(legacy.db)).toEqual([
        '0006_playbooks',
        '0007_local_events_and_agent_bridge',
        '0008_terms_learning',
      ])
      expect(ledgerRows(legacy.db).map((r) => r.version)).toEqual(ALL_VERSIONS)
      expect(tableNames(legacy.db)).toContain('playbooks')
      expect(countOf(legacy.db, 'playbooks')).toBe(0)
      for (const t of FOUR_TABLES) {
        expect(tableNames(legacy.db), t).toContain(t)
        expect(countOf(legacy.db, t), `${t} 不得有回填行`).toBe(0)
      }
      expect(snapshotLegacyRows(legacy.db)).toEqual(before)
      expect(migrate(legacy.db)).toEqual([])
    } finally {
      legacy.close()
    }
  })
})

describe('CORE-EVT-05 · 升级后无回填（local-event-ledger §7-k）', () => {
  it('存量库升级后写下的首条事件，时间晚于升级动作本身', () => {
    const legacy = openLegacyDb()
    try {
      migrateUpTo(legacy.db, '0006_playbooks')
      seedLegacyRows(legacy.db)
      const before = snapshotLegacyRows(legacy.db)

      const upgradeStartedAt = new Date()
      migrate(legacy.db)

      // 时间戳精度是毫秒：升级开始与随后的写入可能落在同一毫秒，那样
      // 「>」会因为分辨率而不是因为语义成立。把事件推进至少 1ms，断言仍是严格大于。
      const eventAt = new Date(Math.max(Date.now(), upgradeStartedAt.getTime() + 1))
      new LocalEventsRepo(legacy.db).record(
        { kind: 'stage_view_switched', projectId: 'prj_legacy', payload: { stage: '启动' } },
        eventAt,
      )

      const rows = legacy.db
        .prepare('SELECT created_at, day FROM local_events ORDER BY id ASC')
        .all() as { created_at: string; day: string }[]
      // 表里只有这一条 ⇒ 迁移没有偷偷回填历史行
      expect(rows).toHaveLength(1)
      expect(new Date(rows[0]!.created_at).getTime()).toBeGreaterThan(upgradeStartedAt.getTime())
      expect(rows[0]!.day).toBe(dayOf(eventAt))
      expect(snapshotLegacyRows(legacy.db)).toEqual(before)
    } finally {
      legacy.close()
    }
  })
})
