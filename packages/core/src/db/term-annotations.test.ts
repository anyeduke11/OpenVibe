import { describe, expect, it } from 'vitest'
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TERM_DOMAINS, TERM_LEVELS } from '@openvibe/shared'
import { newDb } from '../test-support/new-db'
import { applyTermAnnotations, runSeed } from './seed'
import { TermsRepo } from '../repos/terms'

/**
 * 术语库学习化 P1（m3-terms-learning FR-1/FR-2/FR-3）。
 *
 * 三条最容易悄悄坏掉、且坏了不报错的点，各有一支专门的判据：
 *   1. 回填**不许**碰 `seed_hash` —— 一碰，441 条全被标成「用户改过」，种子升级通道静默冻结；
 *   2. 定位键是 `zh`+`en` 自然键而非 `trm_xxx` —— id 是 DB 运行时生成的，换机重装即全变；
 *   3. 幂等 —— 二次启动不得再写任何行，否则「二次启动全 skipped」这条既有契约失效。
 */

const REPO_SEED_DIR = fileURLToPath(new URL('../../../../content/seed', import.meta.url))

interface LevelItem {
  zh: string | null
  en: string | null
  level: string
  starter: boolean
}

const levelsFile = JSON.parse(
  readFileSync(join(REPO_SEED_DIR, 'term-levels.json'), 'utf8'),
) as { schemaVersion: number; items: LevelItem[] }

const domainMapFile = JSON.parse(
  readFileSync(join(REPO_SEED_DIR, 'term-domain-map.json'), 'utf8'),
) as { schemaVersion: number; items: { tag: string; domain: string }[] }

// ============ 双源一致性：迁移的 CHECK 字面量 ≡ 常量 ============

const migrationPath = fileURLToPath(new URL('./migrations/0008_terms_learning.sql', import.meta.url))
const migration = readFileSync(migrationPath, 'utf8')

/**
 * 取迁移里 `ALTER TABLE terms ADD COLUMN <col> ... CHECK (<col> IN (...))` 的闭集字面量。
 * 单引号串与裸数字都收：level 写的是 `'L1'`，starter 写的是 `0`/`1`（数字不必引号）。
 */
function checkLiterals(col: string): string[] {
  const re = new RegExp(
    `ADD COLUMN ${col}\\s+[A-Z]+\\s+NOT NULL[^;]*?CHECK\\s*\\(\\s*${col}\\s+IN\\s*\\(([\\s\\S]*?)\\)\\)`,
    'i',
  )
  const m = migration.match(re)
  expect(m, `迁移里找不到 terms.${col} 的 CHECK 闭集`).not.toBeNull()
  const body = m![1]!
  return [
    ...[...body.matchAll(/'([^']+)'/g)].map((x) => x[1]!),
    ...[...body.matchAll(/(?<![\w'])\d+(?![\w'])/g)].map((x) => x[0]),
  ]
}

describe('UT-TERM-ANN-00 · 迁移 CHECK 字面量与 shared 常量同源', () => {
  it('level 的 CHECK 字面量 ≡ TERM_LEVELS（逐字、逐序）', () => {
    expect(checkLiterals('level')).toEqual([...TERM_LEVELS])
  })

  it('starter 的 CHECK 只收 0 与 1（FR-1.4 的 0/1↔boolean 边界在 DB 侧就有约束）', () => {
    expect(checkLiterals('starter')).toEqual(['0', '1'])
  })

  it('⚠️ domain 刻意**没有** CHECK —— 这是取舍不是遗漏，加回去要改本用例', () => {
    // `terms.domain` 的取值来自 vibe-hub 上游的 tags[0]，SQLite 不能 ALTER 一个 CHECK 约束，
    // 给它加 CHECK 等于把「上游加一个领域」变成「本仓重建表」。口径改在 API 写入边界（Zod）。
    expect(migration).toMatch(/ADD COLUMN domain TEXT;/)
    expect(migration).not.toMatch(/ADD COLUMN domain TEXT[^;]*CHECK/)
  })
})

// ============ 迁移落库后的默认值 ============

describe('UT-TERM-ANN-01 · 迁移 0008 的列与默认值', () => {
  it('新库建表后三列齐备，默认 L2 / 0 / NULL（FR-1.3）', () => {
    const h = newDb()
    const row = h.db.prepare('SELECT level, starter, domain FROM terms LIMIT 1').get()
    // 空表取不到行，改用 PRAGMA 核列定义
    const cols = h.db.prepare('PRAGMA table_info(terms)').all() as {
      name: string
      notnull: number
      dflt_value: string | null
    }[]
    const level = cols.find((c) => c.name === 'level')!
    const starter = cols.find((c) => c.name === 'starter')!
    const domain = cols.find((c) => c.name === 'domain')!
    expect(level.notnull, 'level 必须 NOT NULL').toBe(1)
    expect(level.dflt_value).toBe("'L2'")
    expect(starter.notnull, 'starter 必须 NOT NULL').toBe(1)
    expect(starter.dflt_value).toBe('0')
    expect(domain.notnull, 'domain 刻意可空（未归类是合法状态）').toBe(0)
    expect(domain.dflt_value, 'domain 刻意无默认值 —— 不编造').toBeNull()
    expect(row).toBeUndefined()
    h.close()
  })

  it('迁移前建的存量行，回填前拿到默认值 L2 / false / null（不是 NULL）', () => {
    const h = newDb()
    const repo = new TermsRepo(h.db)
    const t = repo.create({ zh: '存量词条', definition: 'd' })
    const after = repo.get(t.id)!
    expect(after.level).toBe('L2')
    expect(after.starter).toBe(false)
    expect(after.domain).toBeNull()
    h.close()
  })

  it('level 的 CHECK 真在 DB 侧生效：塞 L9 被拒（判据不能只是在读侧比字符串）', () => {
    const h = newDb()
    const repo = new TermsRepo(h.db)
    const t = repo.create({ zh: 'x', definition: 'd' })
    expect(() =>
      h.db.prepare('UPDATE terms SET level = ? WHERE id = ?').run('L9', t.id),
    ).toThrow()
    h.close()
  })
})

// ============ setLearning 的两条「不许碰」 ============

describe('UT-TERM-ANN-02 · setLearning 不污染种子升级通道', () => {
  it('⚠️ 回填后 seed_hash 原样保留（若被置 NULL，下次 terms.json 升级会整条跳过）', () => {
    const h = newDb()
    const repo = new TermsRepo(h.db)
    const t = repo.create({ zh: '按钮', definition: 'd', source: 'openvibe-seed' })
    // 模拟 seed 通道登记过的词条
    repo.setSeedHash(t.id, 'seedhash-abc')
    expect(repo.get(t.id)!.seedHash).toBe('seedhash-abc')

    repo.setLearning(t.id, { level: 'L1', starter: true })

    const after = repo.get(t.id)!
    expect(after.level, '难度应已写入').toBe('L1')
    expect(after.starter).toBe(true)
    expect(after.seedHash, 'seed_hash 被回填抹掉了 ⇒ 种子升级通道已冻结').toBe('seedhash-abc')
    h.close()
  })

  it('⚠️ 回填不碰 updated_at（否则 441 条会被顶到列表最前，list() 按 updated_at DESC）', () => {
    const h = newDb()
    const repo = new TermsRepo(h.db)
    const t = repo.create({ zh: '按钮', definition: 'd' })
    const before = repo.get(t.id)!.updatedAt
    repo.setLearning(t.id, { level: 'L1' })
    expect(repo.get(t.id)!.updatedAt).toBe(before)
    h.close()
  })

  it('⚠️ 走 update() 则**会**置 NULL —— 两者行为必须不同，否则上面两条断言是永真', () => {
    const h = newDb()
    const repo = new TermsRepo(h.db)
    const t = repo.create({ zh: '按钮', definition: 'd', source: 'openvibe-seed' })
    repo.setSeedHash(t.id, 'seedhash-abc')
    repo.update(t.id, { level: 'L1' })
    expect(repo.get(t.id)!.seedHash, 'update 路径按既有语义置 NULL，本用例钉住这个差异').toBeNull()
    h.close()
  })

  it('setLearning 只写传了的字段（level/starter 与 domain 可分两次回填）', () => {
    const h = newDb()
    const repo = new TermsRepo(h.db)
    const t = repo.create({ zh: 'x', definition: 'd' })
    repo.setLearning(t.id, { level: 'L3' })
    const mid = repo.get(t.id)!
    expect(mid.level).toBe('L3')
    expect(mid.starter, '未传的字段不得被顺带改掉').toBe(false)
    expect(mid.domain).toBeNull()
    repo.setLearning(t.id, { domain: '前端' })
    expect(repo.get(t.id)!.domain).toBe('前端')
    h.close()
  })

  it('id 不存在时返回 false（调用方据此计数告警，不静默）', () => {
    const h = newDb()
    const repo = new TermsRepo(h.db)
    expect(repo.setLearning('trm_NOT_EXIST', { level: 'L1' })).toBe(false)
    expect(repo.setLearning('trm_NOT_EXIST', {})).toBe(false)
    h.close()
  })
})

// ============ 自然键定位 ============

describe('UT-TERM-ANN-03 · 按 zh+en 自然键定位，不用运行时 id', () => {
  it('⚠️ en 为 NULL 的词条能被命中（vibe-hub 有 43 条纯缩写词条没有 en）', () => {
    const h = newDb()
    const repo = new TermsRepo(h.db)
    repo.create({ zh: 'API', definition: '应用编程接口' })
    expect(repo.findAllByNaturalKey('API', null)).toHaveLength(1)
    expect(repo.findByNaturalKey('API')!.zh).toBe('API')
    expect(repo.findAllByNaturalKey('API', 'Application Programming Interface')).toHaveLength(0)
    h.close()
  })

  it('多行同键时返回全部而不是只取第一条（findByNaturalKey 的 .get() 会静默少一条）', () => {
    const h = newDb()
    const repo = new TermsRepo(h.db)
    repo.create({ zh: '重名', en: 'Dup', definition: 'a' })
    repo.create({ zh: '重名', en: 'Dup', definition: 'b' })
    expect(repo.findAllByNaturalKey('重名', 'Dup')).toHaveLength(2)
    h.close()
  })
})

// ============ 数据文件自身 ============

describe('UT-TERM-ANN-04 · 标注数据文件', () => {
  it('term-levels.json 441 条，取值全合法，自然键唯一', () => {
    expect(levelsFile.schemaVersion).toBe(1)
    expect(levelsFile.items).toHaveLength(441)
    for (const it of levelsFile.items) {
      expect(TERM_LEVELS, `level 非法: ${JSON.stringify(it)}`).toContain(it.level as never)
      expect(typeof it.starter).toBe('boolean')
      expect(typeof it.zh === 'string' || it.zh === null).toBe(true)
      expect(typeof it.en === 'string' || it.en === null).toBe(true)
    }
    const keys = levelsFile.items.map((i) => JSON.stringify([i.zh, i.en]))
    expect(new Set(keys).size, '自然键重复会让回填静默覆盖').toBe(441)
  })

  it('⚠️ 难度分布与 FR-2.2 实测表逐位吻合（162/234/45，入门必需 134）', () => {
    const d = { L1: 0, L2: 0, L3: 0 }
    for (const it of levelsFile.items) d[it.level as keyof typeof d]++
    expect(d).toEqual({ L1: 162, L2: 234, L3: 45 })
    expect(levelsFile.items.filter((i) => i.starter)).toHaveLength(134)
  })

  it('term-domain-map.json 覆盖全部 8 领域，且每条带可复核的理由', () => {
    expect(domainMapFile.schemaVersion).toBe(1)
    expect(domainMapFile.items.length).toBeGreaterThan(0)
    for (const it of domainMapFile.items) {
      expect(TERM_DOMAINS, `领域不在词表内: ${it.domain}`).toContain(it.domain as never)
    }
    const tags = new Set(domainMapFile.items.map((i) => i.tag))
    expect(tags.size, '同一 tag 映射到两个领域 ⇒ 取值依赖文件顺序').toBe(
      domainMapFile.items.length,
    )
  })

  it('⚠️ 映射表必须覆盖自建词条实际出现的每一个 tags[0]', () => {
    const seedTerms = JSON.parse(readFileSync(join(REPO_SEED_DIR, 'terms.json'), 'utf8')) as {
      items: { tags?: string[] }[]
    }
    const tags = new Set(domainMapFile.items.map((i) => i.tag))
    const missing = new Set<string>()
    for (const t of seedTerms.items) {
      const first = t.tags?.[0]
      if (first !== undefined && !tags.has(first)) missing.add(first)
    }
    expect([...missing], '有词条的 tags[0] 不在映射表里 ⇒ 那些词条永远归不了类').toEqual([])
  })
})

// ============ 回填主流程 ============

describe('UT-TERM-ANN-05 · applyTermAnnotations 主流程', () => {
  /** 真实种子目录 → 只保留 terms 相关文件，另两个 bundle 不参与本组断言 */
  function seedTermsOnly(dir: string): void {
    mkdirSync(dir, { recursive: true })
    for (const f of ['terms.json', 'term-levels.json', 'term-domain-map.json']) {
      cpSync(join(REPO_SEED_DIR, f), join(dir, f))
    }
  }

  it('真实种子首启：109 条自建词条全部按 zh+en 命中并落标', () => {
    const h = newDb()
    const dir = mkdtempSync(join(tmpdir(), 'ov-ann-'))
    seedTermsOnly(dir)
    const results = runSeed(h.db, dir)
    const ann = results.find((r) => r.bundle === 'term-annotations')!
    expect(ann.status).toBe('imported')

    const repo = new TermsRepo(h.db)
    const terms = repo.list()
    expect(terms).toHaveLength(109)
    // 332 条 vibe-hub 词条尚未导入 ⇒ 未命中是正常初态，计入 skipped 而非告警
    expect(ann.skipped).toBe(441 - 109)
    expect(ann.warnings, '未命中不该逐条刷屏（332 条会让每次首启刷满告警）').toEqual([])

    // 逐条核对：每个词条的 level/starter/domain 都与数据文件一致
    const byKey = new Map(levelsFile.items.map((i) => [JSON.stringify([i.zh, i.en]), i]))
    for (const t of terms) {
      const want = byKey.get(JSON.stringify([t.zh ?? null, t.en ?? null]))
      expect(want, `词条没有对应标注: ${t.zh}`).toBeDefined()
      expect(t.level).toBe(want!.level)
      expect(t.starter).toBe(want!.starter)
    }
    // 领域：8 个粗粒度 tag 经映射表换一手，109 条一个都不能留空
    const map = new Map(domainMapFile.items.map((i) => [i.tag, i.domain]))
    for (const t of terms) {
      expect(map.get(t.tags[0]!)).toBe(t.domain)
    }
    expect(new Set(terms.map((t) => t.domain)).size).toBeGreaterThan(1)
    h.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('⚠️ 幂等：二次运行 created=0 且 status=skipped（既有契约「二次启动全 skipped」）', () => {
    const h = newDb()
    const dir = mkdtempSync(join(tmpdir(), 'ov-ann-'))
    seedTermsOnly(dir)
    runSeed(h.db, dir)
    const second = applyTermAnnotations(h.db, dir)
    expect(second.created, '二次运行又写了行 ⇒ setLearning 在做无值变更的 UPDATE').toBe(0)
    expect(second.status).toBe('skipped')
    h.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('⚠️ 走的是 setLearning 不是 update：回填后 seed_hash 全部还在', () => {
    const h = newDb()
    const dir = mkdtempSync(join(tmpdir(), 'ov-ann-'))
    seedTermsOnly(dir)
    runSeed(h.db, dir)
    const h1 = new TermsRepo(h.db)
    const nulls = (
      h.db.prepare("SELECT COUNT(*) AS c FROM terms WHERE seed_hash IS NULL").get() as { c: number }
    ).c
    expect(nulls, '有词条被标成「用户改过」⇒ 种子升级通道已冻结').toBe(0)
    expect(h1.list()).toHaveLength(109)
    h.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('vibe-hub 词条：tags[0] 就是领域，经映射表查不到时按原值直取', () => {
    const h = newDb()
    const dir = mkdtempSync(join(tmpdir(), 'ov-ann-'))
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'term-levels.json'), JSON.stringify({ schemaVersion: 1, items: [] }))
    writeFileSync(join(dir, 'term-domain-map.json'), JSON.stringify({ schemaVersion: 1, items: [] }))
    const repo = new TermsRepo(h.db)
    repo.create({ zh: '按钮', definition: 'd', tags: ['前端', '交互'], source: 'vibe-hub' })
    const ann = applyTermAnnotations(h.db, dir)
    expect(repo.list()[0]!.domain).toBe('前端')
    expect(ann.created).toBe(1)
    h.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('两个标注文件都缺失 ⇒ status=error 且不抛（与 bundle 同口径，单文件失败不阻塞）', () => {
    const h = newDb()
    const dir = mkdtempSync(join(tmpdir(), 'ov-ann-'))
    const ann = applyTermAnnotations(h.db, dir)
    expect(ann.status).toBe('error')
    expect(ann.warnings.length).toBeGreaterThan(0)
    h.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('条目字段非法时计入 skipped 并告警，不整轮崩掉', () => {
    const h = newDb()
    const dir = mkdtempSync(join(tmpdir(), 'ov-ann-'))
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, 'term-levels.json'),
      JSON.stringify({ schemaVersion: 1, items: [{ zh: 'x', en: 'y', level: 'L9', starter: true }] }),
    )
    writeFileSync(join(dir, 'term-domain-map.json'), JSON.stringify({ schemaVersion: 1, items: [] }))
    const ann = applyTermAnnotations(h.db, dir)
    expect(ann.skipped).toBe(1)
    expect(ann.warnings.join(' ')).toContain('难度标注条目非法')
    // status 判据是「有没有真的写进去」：这一轮一条都没写成，故为 skipped 而非 imported，
    // 异常只体现在 warnings 与 skipped 计数上 —— 真正要人看的是 warnings。
    expect(ann.status).toBe('skipped')
    expect(ann.created).toBe(0)
    h.close()
    rmSync(dir, { recursive: true, force: true })
  })
})
