import { describe, expect, it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { newDb } from '../test-support/new-db'
import { runSeed } from '../db/seed'
import { TermsRepo } from '../repos/terms'

function writeSeedDir(dir: string, files: Record<string, unknown>): void {
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), JSON.stringify(content))
  }
}

const baseFiles = {
  'terms.json': {
    schemaVersion: 1,
    items: [
      {
        zh: '氛围编程',
        en: 'vibe coding',
        aliases: [],
        definition: '以自然语言意图驱动的开发方式',
        example: '',
        tags: ['基础概念'],
      },
      {
        zh: '幻觉',
        en: 'hallucination',
        aliases: [],
        definition: '模型生成看似合理实则错误的内容',
        example: '',
        tags: ['风险陷阱'],
      },
    ],
  },
  'flow-templates.json': {
    schemaVersion: 1,
    items: [
      {
        name: '个人轻量流',
        kind: 'light',
        stages: [
          { name: '启动', checklist: [{ id: 'c1', text: '需求一句话写清' }], artifacts: [] },
        ],
      },
    ],
  },
  'prompts.json': {
    schemaVersion: 1,
    items: [
      {
        title: '代码审查请求',
        content: '审查 {{language}} 代码',
        tags: ['精选'],
        platformMarks: ['generic'],
        useAs: 'reference',
      },
    ],
  },
  'playbooks.json': {
    schemaVersion: 1,
    items: [
      {
        scenario: '变更评审',
        problem: '只列功能清单',
        practice: '三件套 + 回退耗时实测',
        antiPractice: '口头承诺可回退',
        tags: ['风险陷阱'],
      },
    ],
  },
}

describe('UT-SEED-01 · 种子幂等与升级（夹具 bundle）', () => {
  it('跑两遍计数不变（幂等）', () => {
    const h = newDb()
    mkdirSync(h.dir, { recursive: true })
    writeSeedDir(h.dir, baseFiles)

    const first = runSeed(h.db, h.dir)
    expect(first.map((r) => r.status)).toEqual([
      'imported',
      'imported',
      'imported',
      'imported',
      // 第 5 项是 term-annotations：学习化标注回填（m3-terms-learning FR-2.3/FR-3.2）。
      // 本夹具目录只放了四个 bundle 的文件、没放两个标注文件 ⇒ 与 bundle 同口径报 error。
      'error',
    ])
    expect(first[0]?.created).toBe(2)
    // 第四条 bundle 也进幂等腿（m4 FR-9.2），否则「技巧不重复装载」无人可证
    expect(first[3]?.created).toBe(1)

    const count = () => (h.db.prepare('SELECT COUNT(*) AS c FROM terms').get() as { c: number }).c
    const afterFirst = count()
    expect(afterFirst).toBe(2)
    expect((h.db.prepare('SELECT COUNT(*) AS c FROM playbooks').get() as { c: number }).c).toBe(1)

    const second = runSeed(h.db, h.dir)
    // 幂等只对四个真 bundle 断言；标注回填在本夹具里恒为 error（文件不存在），与幂等无关。
    // 它的幂等由 term-annotations.test.ts 用真实标注文件单独守。
    expect(
      second.filter((r) => r.bundle !== 'term-annotations').every((r) => r.status === 'skipped'),
    ).toBe(true)
    expect(count()).toBe(afterFirst)
    expect((h.db.prepare('SELECT COUNT(*) AS c FROM playbooks').get() as { c: number }).c).toBe(1)
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
          {
            zh: '氛围编程',
            en: 'vibe coding',
            aliases: [],
            definition: '更新后的定义内容',
            example: '',
            tags: ['基础概念'],
          },
          {
            zh: '幻觉',
            en: 'hallucination',
            aliases: [],
            definition: '旧定义',
            example: '',
            tags: ['风险陷阱'],
          },
          {
            zh: '规则漂移',
            en: 'rule drift',
            aliases: [],
            definition: '新增词条定义',
            example: '',
            tags: ['风险陷阱'],
          },
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

  it('导完后 SQLite 计数 terms ≥100 / 模板 7 / 提示词 21 / 技巧 ≥10，且无单条失败', () => {
    const h = newDb()
    const results = runSeed(h.db, REPO_SEED_DIR)

    expect(results.map((r) => r.status)).toEqual([
      'imported',
      'imported',
      'imported',
      'imported',
      // 第 5 项是 term-annotations：学习化标注回填（m3-terms-learning FR-2.3/FR-3.2），
      // 不受 contentHash 跳过控制（332 条 vibe-hub 词条是脚本导入的，晚于 runSeed）
      'imported',
    ])
    const counts = (table: string): number =>
      (h.db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c
    expect(counts('terms')).toBeGreaterThanOrEqual(100)
    expect(counts('flow_templates')).toBe(7)
    expect(counts('prompts')).toBe(21)
    expect(counts('playbooks')).toBeGreaterThanOrEqual(10)
    // 预置技巧必须是 published，否则「有模块没内容」——进不了包（FR-6.2）
    expect(
      (
        h.db.prepare("SELECT COUNT(*) AS c FROM playbooks WHERE status='published'").get() as {
          c: number
        }
      ).c,
    ).toBe(counts('playbooks'))

    // 空库首启：全部应为新增，不允许 updated/skipped，也不允许逐条 warning。
    // 只扫四个真 bundle —— `term-annotations` 是学习化标注回填（m3-terms-learning FR-2.3），
    // 它的 created/skipped 语义与 bundle 不同（未跑 import-vibehub 时恒有 332 条未命中），
    // 由 UT-TERM-ANN-* 单独守卫，见 packages/core/src/db/term-annotations.test.ts。
    for (const r of results.filter((x) => x.bundle !== 'term-annotations')) {
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
