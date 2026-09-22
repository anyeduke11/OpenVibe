import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { newDb } from '../packages/core/src/test-support/new-db'
import { FlowTemplatesRepo } from '../packages/core/src/repos/flows'
import { PacksRepo } from '../packages/core/src/repos/packs'
import { ProjectsRepo } from '../packages/core/src/repos/projects'
import { PromptsRepo } from '../packages/core/src/repos/prompts'
import { TermsRepo } from '../packages/core/src/repos/terms'
import { searchPromptRowids } from '../packages/core/src/search/fts'
import type { SqliteDatabase } from '../packages/core/src/db'

/**
 * 列表排序确定性（DEV-0017 风险②/DEV-0018 风险①，T8 收口）。
 * 根因同一：批量播种的行 updated_at 同毫秒，平局无兜底键时返回序随 DB 物理序漂移，
 * 直接后果是 default 预置包指纹随机（design §7.6 要求确定性）。
 * 两条腿：① 静态守卫（新写 SQL 不能漏兜底键）；② 双库行为对照（同内容不同物理序必须同结果）。
 */

const SRC_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'core', 'src')
/** 唯一键结尾即视为确定性；其余排序键必须有它们兜底 */
const DETERMINISTIC_TAIL = new Set(['id', 'rowid', 'entry_no', 'version_no'])

function sqlLiteralsOf(tsPath: string): string[] {
  const source = readFileSync(tsPath, 'utf8')
  const literals: string[] = []
  const pattern = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g
  for (const match of source.matchAll(pattern)) {
    const text = match[1] ?? match[2] ?? match[3] ?? ''
    if (/\bORDER BY\b/i.test(text)) literals.push(text)
  }
  return literals
}

function tsFilesUnder(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...tsFilesUnder(path))
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) out.push(path)
  }
  return out
}

/** 取 ORDER BY 子句（截到 LIMIT 或语句结束）的最后一个排序键名 */
function lastSortKey(orderClause: string): string {
  const tail = orderClause.split(',').at(-1)?.trim() ?? ''
  return tail
    .replace(/\b(ASC|DESC)\b/gi, '')
    .trim()
    .split('.')
    .at(-1)!
    .replace(/\(.*\)/, '')
    .trim()
}

function clausesMissingTailKey(): string[] {
  const offenders: string[] = []
  for (const file of tsFilesUnder(SRC_ROOT)) {
    for (const sql of sqlLiteralsOf(file)) {
      for (const match of sql.matchAll(/ORDER BY\s+([\s\S]+?)(?:\bLIMIT\b|$)/gi)) {
        const clause = (match[1] ?? '').trim()
        if (!clause) continue
        if (!DETERMINISTIC_TAIL.has(lastSortKey(clause))) {
          offenders.push(`${file.replace(`${SRC_ROOT}/`, '')} — ORDER BY ${clause.replace(/\s+/g, ' ')}`)
        }
      }
    }
  }
  return offenders
}

/** 把 from 库的整表内容按指定物理序灌进 to 库（保持 id 与时间戳逐字一致） */
function cloneTable(from: SqliteDatabase, to: SqliteDatabase, table: string, reverse: boolean): void {
  const rows = from.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[]
  to.exec(`DELETE FROM ${table}`)
  for (const row of reverse ? [...rows].reverse() : rows) {
    const cols = Object.keys(row)
    to
      .prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
      .run(...cols.map((c) => row[c]))
  }
}

const PINNED = '2026-01-01T00:00:00.000Z'

describe('UT-ORDER-01 · 静态守卫：列表 SQL 必须有唯一键兜底', () => {
  it('packages/core/src 下不存在无兜底排序键的 ORDER BY', () => {
    const offenders = clausesMissingTailKey()
    // 先确认扫描真的抓到了语句（防止路径写错导致空集假绿）
    expect(tsFilesUnder(SRC_ROOT).length).toBeGreaterThan(10)
    expect(offenders.join('\n')).toBe('')
  })
})

describe('UT-ORDER-02 · 行为：同内容不同物理插入序，列表结果必须一致', () => {
  function fixture(): { a: SqliteDatabase; b: SqliteDatabase; close(): void } {
    const ha = newDb()
    const hb = newDb()
    const terms = new TermsRepo(ha.db)
    for (const [zh, en] of [
      ['规则漂移', 'rule drift'],
      ['漂移检测', 'drift detection'],
      ['检查点', 'checkpoint'],
      ['飞轮', 'flywheel'],
      ['幂等', 'idempotency'],
      ['术语表', 'glossary'],
    ] as [string, string][]) {
      terms.create({ zh, en, aliases: [zh], definition: `${zh}的定义，用于排序确定性用例校验`, example: '', tags: ['基础概念'], source: 'manual', status: 'active' })
    }
    const prompts = new PromptsRepo(ha.db)
    for (const title of ['同题提示词 A', '同题提示词 A', '另一条提示词', '再一条提示词', '第五条提示词']) {
      prompts.create({ title, description: '', content: `内容 ${title} {{var}}`, tags: ['精选'], folderPath: '/精选', platformMarks: ['generic'], useAs: 'reference', status: 'active' })
    }
    const flows = new FlowTemplatesRepo(ha.db)
    for (const name of ['流一', '流二', '流三']) {
      flows.create({ name, kind: 'light', stages: [{ name: '启动', checklist: [{ id: 'c1', text: '需求一句话写清' }], artifacts: [] }] })
    }
    const projects = new ProjectsRepo(ha.db)
    for (const name of ['项目甲', '项目乙', '项目丙']) {
      projects.create({ name, flowTemplateId: flows.list()[0]!.id })
    }
    const packs = new PacksRepo(ha.db)
    for (const name of ['pack-a', 'pack-b', 'pack-c']) {
      packs.create({ name, description: '', selection: { termIds: terms.list().map((t) => t.id), promptIds: [], flowTemplateId: null }, targets: ['claude-code'] })
    }
    // 时间戳全部钉死成同一毫秒：这正是批量播种的真实形态
    for (const table of ['terms', 'prompts', 'flow_templates', 'projects', 'standard_packs']) {
      ha.db.prepare(`UPDATE ${table} SET updated_at = ?`).run(PINNED)
    }
    // B 库拿同样内容、相反物理序（rowid 与插入序一致，故反向灌入即制造平局歧义）
    cloneTable(ha.db, hb.db, 'terms', true)
    cloneTable(ha.db, hb.db, 'prompts', true)
    cloneTable(ha.db, hb.db, 'flow_templates', true)
    cloneTable(ha.db, hb.db, 'projects', true)
    cloneTable(ha.db, hb.db, 'standard_packs', true)
    return {
      a: ha.db,
      b: hb.db,
      close() {
        ha.close()
        hb.close()
      },
    }
  }

  it('五个 repo 的 list() 在两库物理序相反时仍给出同一序列', () => {
    const h = fixture()
    const pairs: [string, (db: SqliteDatabase) => string[]][] = [
      ['terms.list', (db) => new TermsRepo(db).list().map((t) => t.id)],
      ['terms.list zh', (db) => new TermsRepo(db).list().map((t) => t.zh ?? '')],
      ['prompts.list', (db) => new PromptsRepo(db).list({ page: 1, size: 50 }).items.map((p) => p.id)],
      ['prompts.export', (db) => new PromptsRepo(db).exportAll().map((p) => p.title)],
      ['flows.list', (db) => new FlowTemplatesRepo(db).list().map((f) => f.id)],
      ['projects.list', (db) => new ProjectsRepo(db).list({ includeArchived: true }).map((p) => p.id)],
      ['packs.list', (db) => new PacksRepo(db).list().map((p) => p.id)],
    ]
    for (const [label, read] of pairs) {
      expect(read(h.a), label).toEqual(read(h.b))
    }
    h.close()
  })

  it('同毫秒时列表按 id 升序兜底（而非插入序）', () => {
    const h = fixture()
    const a = new TermsRepo(h.a).list().map((t) => t.id)
    expect(a).toEqual([...a].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)))
    h.close()
  })

  it('LIKE 降级检索（<3 字）在同毫秒下两库命中序一致', () => {
    const h = fixture()
    const termsA = new TermsRepo(h.a).search('漂移')
    const termsB = new TermsRepo(h.b).search('漂移')
    expect(termsA.length).toBeGreaterThan(1)
    expect(termsA.map((r) => r.term.id)).toEqual(termsB.map((r) => r.term.id))

    const idOf = (db: SqliteDatabase, rowids: number[]) =>
      rowids.map(
        (rowid) => (db.prepare('SELECT id FROM prompts WHERE rowid = ?').get(rowid) as { id: string }).id,
      )
    const promptsA = idOf(h.a, searchPromptRowids(h.a, '提示'))
    const promptsB = idOf(h.b, searchPromptRowids(h.b, '提示'))
    expect(promptsA.length).toBeGreaterThan(1)
    expect(promptsA).toEqual(promptsB)
    h.close()
  })

  it('FTS MATCH 路径（≥3 字）命中集合一致，且同库重复查询序稳定', () => {
    const h = fixture()
    const first = new TermsRepo(h.a).search('rule drift').map((r) => r.term.id)
    const second = new TermsRepo(h.a).search('rule drift').map((r) => r.term.id)
    const mirrored = new TermsRepo(h.b).search('rule drift').map((r) => r.term.id)
    expect(first.length).toBeGreaterThan(0)
    expect(first).toEqual(second)
    expect([...first].sort()).toEqual([...mirrored].sort())
    h.close()
  })
})
