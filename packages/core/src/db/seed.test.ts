import { describe, expect, it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { newDb } from '../test-support/new-db'
import { runSeed } from '../db/seed'
import { TermsRepo } from '../repos/terms'

function writeSeedDir(
  dir: string,
  files: Record<string, unknown>,
): void {
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), JSON.stringify(content))
  }
}

const baseFiles = {
  'terms.json': {
    schemaVersion: 1,
    items: [
      { zh: '氛围编程', en: 'vibe coding', aliases: [], definition: '以自然语言意图驱动的开发方式', example: '', tags: ['基础概念'] },
      { zh: '幻觉', en: 'hallucination', aliases: [], definition: '模型生成看似合理实则错误的内容', example: '', tags: ['风险陷阱'] },
    ],
  },
  'flow-templates.json': {
    schemaVersion: 1,
    items: [
      {
        name: '个人轻量流',
        kind: 'light',
        stages: [{ name: '启动', checklist: [{ id: 'c1', text: '需求一句话写清' }], artifacts: [] }],
      },
    ],
  },
  'prompts.json': {
    schemaVersion: 1,
    items: [{ title: '代码审查请求', content: '审查 {{language}} 代码', tags: ['精选'], platformMarks: ['generic'], useAs: 'reference' }],
  },
}

describe('UT-SEED-01 · 种子幂等与升级（夹具 bundle）', () => {
  it('跑两遍计数不变（幂等）', () => {
    const h = newDb()
    mkdirSync(h.dir, { recursive: true })
    writeSeedDir(h.dir, baseFiles)

    const first = runSeed(h.db, h.dir)
    expect(first.map((r) => r.status)).toEqual(['imported', 'imported', 'imported'])
    expect(first[0]?.created).toBe(2)

    const count = () => (h.db.prepare('SELECT COUNT(*) AS c FROM terms').get() as { c: number }).c
    const afterFirst = count()
    expect(afterFirst).toBe(2)

    const second = runSeed(h.db, h.dir)
    expect(second.every((r) => r.status === 'skipped')).toBe(true)
    expect(count()).toBe(afterFirst)
    h.close()
  })

  it('内容变更升级：新条目并入 + 未改条目更新 + 用户改过的跳过', () => {
    const h = newDb()
    mkdirSync(h.dir, { recursive: true })
    writeSeedDir(h.dir, baseFiles)
    runSeed(h.db, h.dir)

    // 用户改过「幻觉」（seed_hash → NULL）
    const terms = new TermsRepo(h.db)
    const hallucination = terms.search('hallucination')[0]?.term
    terms.update(hallucination!.id, { definition: '用户自己改过的定义' })

    // 新 bundle：修改「氛围编程」定义 + 新增一条
    writeSeedDir(h.dir, {
      'terms.json': {
        schemaVersion: 1,
        items: [
          { zh: '氛围编程', en: 'vibe coding', aliases: [], definition: '更新后的定义内容', example: '', tags: ['基础概念'] },
          { zh: '幻觉', en: 'hallucination', aliases: [], definition: '旧定义', example: '', tags: ['风险陷阱'] },
          { zh: '规则漂移', en: 'rule drift', aliases: [], definition: '新增词条定义', example: '', tags: ['风险陷阱'] },
        ],
      },
    })
    const upgraded = runSeed(h.db, h.dir)
    expect(upgraded[0]?.status).toBe('imported')
    expect(upgraded[0]?.created).toBe(1)
    expect(upgraded[0]?.updated).toBe(1)
    expect(upgraded[0]?.skipped).toBe(1)

    const total = (h.db.prepare('SELECT COUNT(*) AS c FROM terms').get() as { c: number }).c
    expect(total).toBe(3)
    expect(terms.search('vibe coding')[0]?.term.definition).toBe('更新后的定义内容')
    expect(terms.search('hallucination')[0]?.term.definition).toBe('用户自己改过的定义')
    h.close()
  })

  it('单文件缺失/损坏不阻塞（seed-content FR-1）', () => {
    const h = newDb()
    mkdirSync(h.dir, { recursive: true })
    writeFileSync(join(h.dir, 'terms.json'), '{ broken json')
    // 另两个文件缺失
    const results = runSeed(h.db, h.dir)
    expect(results[0]?.status).toBe('error')
    expect(results[1]?.status).toBe('error')
    expect(results[2]?.status).toBe('error')
    h.close()
  })
})

/** UT-SEED-02 · seed-content §7.2：仓库内真实 content/seed 首启计数，且逐条无 warning */
describe('UT-SEED-02 · 真实 content/seed 首启计数', () => {
  const REPO_SEED_DIR = fileURLToPath(new URL('../../../../content/seed', import.meta.url))

  it('导完后 SQLite 计数 terms ≥100 / 模板 3 / 提示词 20，且无单条失败', () => {
    const h = newDb()
    const results = runSeed(h.db, REPO_SEED_DIR)

    expect(results.map((r) => r.status)).toEqual(['imported', 'imported', 'imported'])
    const counts = (table: string): number =>
      (h.db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c
    expect(counts('terms')).toBeGreaterThanOrEqual(100)
    expect(counts('flow_templates')).toBe(3)
    expect(counts('prompts')).toBe(20)

    // 空库首启：全部应为新增，不允许 updated/skipped，也不允许逐条 warning
    for (const r of results) {
      expect(r.updated).toBe(0)
      expect(r.skipped).toBe(0)
      expect(r.warnings).toEqual([])
    }
    h.close()
  })

  it('rule 类提示词入库后不含未填变量（§3.4 组包即用）', () => {
    const h = newDb()
    runSeed(h.db, REPO_SEED_DIR)
    const rows = h.db
      .prepare("SELECT title, content, variables FROM prompts WHERE use_as = 'rule'")
      .all() as { title: string; content: string; variables: string }[]
    expect(rows.length).toBeGreaterThanOrEqual(6)
    for (const row of rows) {
      expect(JSON.parse(row.variables), row.title).toEqual([])
      expect(row.content, row.title).not.toMatch(/\{\{\s*[a-zA-Z_]/)
    }
    h.close()
  })
})
