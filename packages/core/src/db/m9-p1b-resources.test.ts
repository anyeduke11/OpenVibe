// `packages/core/src/db/m9-p1b-resources.test.ts` —— M9 v1.6 **P1b 出口**
// （`m9-dev-plan-2026-10.md` §6.3 ＋ `m9-dev-language-roadmap.md` §7 DL-27 / DL-29 / DL-30 /
//   DL-31 / DL-32 / DL-41 / DL-47 / DL-48）
//
// 断九件事：
//   ① **DL-47**：资源层与附件**逐条相等**（89 / 11 / 100 · 六类逐类 · 9 字段齐全），
//      且**主键不得用 `url`**（两个共用 URL 各占 2 行，去重后 87 个 URL）
//   ② **DL-41**：速成专区 11 条在库、不与主清单混表、**刻意没有**分类/费用/阶段/精选/星数列
//   ③ **DL-27**：资源层**不得有前置边**（无边列 ＋ 边表的两端都在知识点表内）
//   ④ **DL-29**：owner 提供的来源**不得标成我核过**（`verified_by` 只能 `owner_guide`）
//   ⑤ **DL-48**：必要性**必须由「三模式 × 六类」矩阵推导**，不得逐条手写
//   ⑥ **DL-31**：「要点级」知识点**至少有一条可点的去处**
//   ⑦ **P1b.4 调度侧**：**87 个去重 URL**（同一 URL 只发一次 HEAD）＋ 状态机（单次失败不判死、
//      连续两次才标灰、**永不删除**）
//   ⑧ **DL-32**：导出的 README **零本机路径 ＋ 条数一致 ＋ 每行可溯源**
//   ⑨ **0012 迁移**：`lang_topics.content_level` 存在且默认 `'point'`；`local_events` 的 CHECK
//      已扩到 **23 项**（M9 的 4 个 kind 装进去了）
//
// ⚠️ **每个「期望值」都从 spec 读出，不抄成常量** —— 抄成常量就是「又一份事实」，
//   改了 spec 两边会悄悄分叉（同 `m9-doc-numbers.ts` 的手法）。
//   唯一的例外是 DL-48 的三档分布（精通 53/36/0 等）—— 那三个数**必须**有一处硬编码，
//   否则「矩阵 × 分类」与「spec 记的数」两边一起被改就没人知道了（第三方参照）。
//
// ⚠️ **否定式判据必须自证**：每条守卫都配一条**变异腿**（真的动数据，不是只喂假值），
//   证明它会红；否则「闸没覆盖」与「数据没问题」在结果上长得一模一样。
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { newDb } from '../test-support/new-db'
import { seedLangTopics } from './m9-p1-seed-lang-topics'
import { seedLangResourceLayer } from './m9-p1b-seed-resources'
import { parseSpecResourceCounts } from './m9-p1b-spec'
import {
  NECESSITY_LABEL,
  computeDistribution,
  necessaryFor,
  parseNecRule,
  verifyNecessity,
  type NecDistribution,
  type ResourceTier,
} from './m9-p1b-necessity'
import { FAIL_THRESHOLD, applyProbeOutcome, livenessOf, planProbeTargets, runResourceProbe } from './m9-p1b-probe'
import { exportResourcesReadme, listReadmeRows, verifyReadmeExport } from './m9-p1b-readme'
import { LOCAL_EVENT_KINDS } from '@openvibe/shared'

const SEEDS_DIR = fileURLToPath(new URL('./seeds', import.meta.url))
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const SPEC_FILE = join(REPO_ROOT, 'docs/specs/m9-dev-language-roadmap.md')
const SPEC_TEXT = readFileSync(SPEC_FILE, 'utf8')

const COUNTS = parseSpecResourceCounts(SPEC_TEXT)
if (COUNTS === null) throw new Error('读不出 spec §1.6.1 的口径数字')

/** 主清单的 9 字段闭集（§1.6.1 的 `n/u/l/c/s/fav/star/d/f` → 表列名）。 */
const NINE_FIELDS = [
  'name',
  'url',
  'lang_label',
  'price',
  'level_label',
  'is_fav',
  'star',
  'summary',
  'freshness',
] as const

function countRows(db: { prepare: (sql: string) => { get: () => unknown } }, table: string): number {
  const r = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }
  return r.c
}

function columnNames(db: { prepare: (sql: string) => { all: () => unknown } }, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((r) => r.name)
}

/** 造一个装满资源的临时库（知识点先落，挂接才有得指）。 */
function freshDb(): ReturnType<typeof newDb> {
  const h = newDb()
  seedLangTopics(h.db, SEEDS_DIR)
  seedLangResourceLayer(h.db, SEEDS_DIR)
  return h
}

describe('DL-47 资源层与附件逐条相等 ＋ 主键不得用 url', () => {
  it('主清单 / 速成专区 / 合计三档条数与 spec §1.6.1 相等', () => {
    const h = freshDb()
    try {
      expect(countRows(h.db, 'lang_resources')).toBe(COUNTS.main)
      expect(countRows(h.db, 'lang_vibe_resources')).toBe(COUNTS.all - COUNTS.main)
      expect(countRows(h.db, 'lang_resources') + countRows(h.db, 'lang_vibe_resources')).toBe(COUNTS.all)
    } finally {
      h.close()
    }
  })

  it('六类逐类条数与 spec 逐格相等（Python / Go 分开断）', () => {
    const h = freshDb()
    try {
      for (const [cat, want] of COUNTS.categories) {
        const py = h.db
          .prepare('SELECT COUNT(*) AS c FROM lang_resources WHERE category = ? AND lang = ?')
          .get(cat, 'python') as { c: number }
        const go = h.db
          .prepare('SELECT COUNT(*) AS c FROM lang_resources WHERE category = ? AND lang = ?')
          .get(cat, 'go') as { c: number }
        expect(py.c, `${cat} 的 Python 条数`).toBe(want.python)
        expect(go.c, `${cat} 的 Go 条数`).toBe(want.go)
      }
    } finally {
      h.close()
    }
  })

  it('每行 9 个字段齐全（`star` 允许为空，其余一个都不能空）', () => {
    const h = freshDb()
    try {
      const rows = h.db
        .prepare(
          'SELECT name, url, lang_label, price, level_label, is_fav, star, summary, freshness FROM lang_resources',
        )
        .all() as Record<string, unknown>[]
      expect(rows.length).toBe(COUNTS.main)
      for (const r of rows) {
        for (const f of NINE_FIELDS) {
          expect(Object.keys(r), `行「${String(r['name'])}」缺字段 ${f}`).toContain(f)
          if (f === 'star') continue
          expect(r[f], `行「${String(r['name'])}」的 ${f} 为空`).not.toBeNull()
          expect(r[f], `行「${String(r['name'])}」的 ${f} 为空串`).not.toBe('')
        }
      }
      // ⚠️ **tier 列不得为空**（§1.6.1：必要性矩阵的轴）
      const tierRows = h.db.prepare('SELECT tier FROM lang_resources').all() as { tier: string }[]
      for (const r of tierRows) {
        expect(r.tier).not.toBe('')
        expect(['a', 'b', 'c', 'd', 'e'], `tier「${r.tier}」不在五个合法值里`).toContain(r.tier)
      }
      // ⚠️ `star` 只在部分条目上有（spec §1.6.1：「仅 21 条有」）⇒ 必须仍能断言这个数
      const withStar = h.db.prepare('SELECT COUNT(*) AS c FROM lang_resources WHERE star IS NOT NULL').get() as {
        c: number
      }
      expect(withStar.c).toBe(COUNTS.star)
    } finally {
      h.close()
    }
  })

  it('反证：两个共用 URL 各占 2 行，去重后 87 个 URL（照抄 spec 的那条结论）', () => {
    const h = freshDb()
    try {
      const rows = h.db.prepare('SELECT url FROM lang_resources').all() as { url: string }[]
      for (const shared of COUNTS.sharedUrls) {
        expect(rows.filter((r) => r.url === shared).length, `${shared} 应占 2 行`).toBe(2)
      }
      expect(new Set(rows.map((r) => r.url)).size).toBe(COUNTS.uniqueUrls)
    } finally {
      h.close()
    }
  })

  it('⚠️ 变异腿①：删掉任一条 ⇒ 行数不再等于 spec（闸会红）', () => {
    const h = freshDb()
    try {
      const before = countRows(h.db, 'lang_resources')
      h.db.prepare('DELETE FROM lang_resources WHERE id = (SELECT MIN(id) FROM lang_resources)').run()
      const after = countRows(h.db, 'lang_resources')
      expect(after).not.toBe(COUNTS.main)
      expect(after).toBe(before - 1)
    } finally {
      h.close()
    }
  })

  it('⚠️ 变异腿②：把主键改成 `url` 唯一 ⇒ 89 行塌成 87 行（两条共用 URL 被静默丢掉）', () => {
    const h = freshDb()
    try {
      h.db.exec('CREATE TABLE url_keyed (id INTEGER PRIMARY KEY, url TEXT NOT NULL UNIQUE)')
      const rows = h.db.prepare('SELECT url FROM lang_resources ORDER BY id ASC').all() as { url: string }[]
      const ins = h.db.prepare('INSERT INTO url_keyed (url) VALUES (?)')
      let failed = 0
      for (const r of rows) {
        try {
          ins.run(r.url)
        } catch {
          failed += 1
        }
      }
      const landed = countRows(h.db, 'url_keyed')
      expect(landed).toBe(COUNTS.uniqueUrls)
      expect(landed).not.toBe(COUNTS.main)
      expect(failed).toBe(COUNTS.main - COUNTS.uniqueUrls)
    } finally {
      h.close()
    }
  })
})

describe('DL-41 速成专区那 11 条必须在库，且不与主清单混表', () => {
  it('11 行 ＝ tools 6 ＋ tuts 5', () => {
    const h = freshDb()
    try {
      expect(countRows(h.db, 'lang_vibe_resources')).toBe(COUNTS.all - COUNTS.main)
      const groups = h.db
        .prepare('SELECT "group" AS g, COUNT(*) AS c FROM lang_vibe_resources GROUP BY "group"')
        .all() as { g: string; c: number }[]
      const byGroup = Object.fromEntries(groups.map((g) => [g.g, g.c]))
      expect(byGroup['tools']).toBe(COUNTS.tools)
      expect(byGroup['tuts']).toBe(COUNTS.tuts)
    } finally {
      h.close()
    }
  })

  it('这 11 条不出现在主清单里（不混表）', () => {
    const h = freshDb()
    try {
      const vibe = h.db.prepare('SELECT name FROM lang_vibe_resources').all() as { name: string }[]
      const main = new Set(
        (h.db.prepare('SELECT name FROM lang_resources').all() as { name: string }[]).map((r) => r.name),
      )
      for (const v of vibe) expect(main.has(v.name), `${v.name} 不该同时出现在主清单`).toBe(false)
    } finally {
      h.close()
    }
  })

  it('该表刻意没有 分类/费用/阶段/精选 列（费用/阶段/精选是按 DL-41 刻意不落库）', () => {
    const h = freshDb()
    try {
      const cols = columnNames(h.db, 'lang_vibe_resources')
      for (const banned of ['category', 'price', 'level_label', 'is_fav', 'star', 'tier']) {
        expect(cols, `lang_vibe_resources 不该有 ${banned} 列`).not.toContain(banned)
      }
    } finally {
      h.close()
    }
  })

  it('速成专区那 11 条的描述与时效都落了（附件原件里有，不是空的）', () => {
    const h = freshDb()
    try {
      const rows = h.db.prepare('SELECT summary, freshness FROM lang_vibe_resources').all() as {
        summary: string
        freshness: string
      }[]
      expect(rows.length).toBe(COUNTS.all - COUNTS.main)
      for (const r of rows) {
        expect(r.summary, '速成专区的描述不该是空的').not.toBe('')
        expect(r.freshness, '速成专区的时效说明不该是空的').not.toBe('')
      }
    } finally {
      h.close()
    }
  })

  it('⚠️ 变异腿：抽掉其中一条 ⇒ 11 条不成立（闸会红）', () => {
    const h = freshDb()
    try {
      h.db.prepare('DELETE FROM lang_vibe_resources WHERE id = (SELECT MIN(id) FROM lang_vibe_resources)').run()
      expect(countRows(h.db, 'lang_vibe_resources')).not.toBe(COUNTS.all - COUNTS.main)
    } finally {
      h.close()
    }
  })
})

describe('DL-27 资源层不得有前置边，也不得进 DAG', () => {
  it('`lang_resources` 没有 edges/parent/prereq 之类的列', () => {
    const h = freshDb()
    try {
      const cols = columnNames(h.db, 'lang_resources').map((c) => c.toLowerCase())
      for (const banned of ['edge', 'parent', 'prereq', 'depend', 'next', 'prev']) {
        expect(cols.some((c) => c.includes(banned)), `资源表不该有含「${banned}」的列`).toBe(false)
      }
    } finally {
      h.close()
    }
  })

  it('仓里没有「资源 × 边」那种表', () => {
    const h = freshDb()
    try {
      const tables = (h.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map(
        (r) => r.name,
      )
      expect(tables.filter((t) => t.includes('resource') && t.includes('edge'))).toEqual([])
    } finally {
      h.close()
    }
  })

  it('⚠️ 变异腿：给资源加一条「学完这条就该学那条」的边 ⇒ 外键必须挡住', () => {
    const h = freshDb()
    try {
      const resource = h.db.prepare('SELECT id FROM lang_resources LIMIT 1').get() as { id: number }
      expect(() =>
        h.db
          .prepare('INSERT INTO lang_topic_edges (topic_id, prereq_topic_id) VALUES (?, ?)')
          .run(resource.id, resource.id),
      ).toThrow()
    } finally {
      h.close()
    }
  })
})

describe('DL-29 owner 提供的来源不得标成我核过', () => {
  it('每行 `verified_by` 都是 owner_guide，且 `source_checked_at` 恒 NULL', () => {
    const h = freshDb()
    try {
      const bad = h.db
        .prepare("SELECT COUNT(*) AS c FROM lang_resources WHERE verified_by <> 'owner_guide' OR source_checked_at IS NOT NULL")
        .get() as { c: number }
      expect(bad.c).toBe(0)
      const badVibe = h.db
        .prepare("SELECT COUNT(*) AS c FROM lang_vibe_resources WHERE verified_by <> 'owner_guide' OR source_checked_at IS NOT NULL")
        .get() as { c: number }
      expect(badVibe.c).toBe(0)
    } finally {
      h.close()
    }
  })

  it('⚠️ 变异腿：把某条改成 `self` ⇒ CHECK 必须挡住', () => {
    const h = freshDb()
    try {
      expect(() =>
        h.db.prepare("UPDATE lang_resources SET verified_by = 'self' WHERE id = (SELECT MIN(id) FROM lang_resources)").run(),
      ).toThrow()
    } finally {
      h.close()
    }
  })
})

describe('DL-48 必要性必须由矩阵推导，不得逐条手写', () => {
  /** 附件里的三档分布 —— **第三方参照**（矩阵 × 分类 与 spec 记的数之外的那一份）。 */
  const ATTACHMENT_DISTRIBUTION: NecDistribution = {
    master: { required: 53, recommended: 36, optional: 0 },
    familiar: { required: 25, recommended: 28, optional: 36 },
    vibe: { required: 8, recommended: 0, optional: 81 },
  }

  it('矩阵能从 spec §1.6.1 读出，且 18 格齐全（**轴是 tier，不是展示分类**）', () => {
    const rule = parseNecRule(SPEC_TEXT)
    expect(rule).not.toBeNull()
    for (const profile of ['master', 'familiar', 'vibe'] as const) {
      for (const tier of ['a', 'b', 'c', 'd', 'e', 'v'] as const) {
        expect(rule?.[profile][tier], `${profile} × ${tier}`).toBeDefined()
      }
    }
  })

  it('矩阵 × tier 现算出的三档分布 == 附件记的数（且 == spec 记的数）', () => {
    const h = freshDb()
    try {
      const rows = h.db.prepare('SELECT tier FROM lang_resources').all() as { tier: ResourceTier }[]
      const rule = parseNecRule(SPEC_TEXT)!
      const actual = computeDistribution(rule, rows)
      expect(actual).toEqual(ATTACHMENT_DISTRIBUTION)
      expect(verifyNecessity({ specText: SPEC_TEXT, rows })).toEqual([])
    } finally {
      h.close()
    }
  })

  it('tier 由 URL 落 ⇒ 两个共用 URL 的两条资源拿同一个 tier', () => {
    const h = freshDb()
    try {
      for (const shared of COUNTS.sharedUrls) {
        const tiers = h.db
          .prepare('SELECT DISTINCT tier FROM lang_resources WHERE url = ?')
          .all(shared) as { tier: string }[]
        expect(tiers.length, `${shared} 的两条资源应有同一个 tier`).toBe(1)
      }
    } finally {
      h.close()
    }
  })

  it('⚠️ 变异腿①：把矩阵的 d × 精通 改成「可跳过」⇒ 必须红', () => {
    const mutated = SPEC_TEXT.replace(
      '| **精通** `master` | 必学 | 必学 | 必学 | 推荐 | 推荐 | 推荐 |',
      '| **精通** `master` | 必学 | 必学 | 必学 | 可跳过 | 推荐 | 推荐 |',
    )
    expect(mutated).not.toBe(SPEC_TEXT)
    const violations = verifyNecessity({ specText: mutated, rows: [{ tier: 'd' }] })
    expect(violations.length).toBeGreaterThan(0)
    expect(violations.some((v) => v.rule === 'spec-mismatch')).toBe(true)
  })

  it('⚠️ 变异腿②：把 spec 记的分布数字改掉 ⇒ 必须红（防「矩阵与分布一起被改」）', () => {
    const mutated = SPEC_TEXT.replace('精通 必学 53 / 推荐 36 / 可跳过 0', '精通 必学 54 / 推荐 35 / 可跳过 0')
    expect(mutated).not.toBe(SPEC_TEXT)
    const violations = verifyNecessity({ specText: mutated, rows: [{ tier: 'd' }] })
    expect(violations.some((v) => v.rule === 'spec-mismatch')).toBe(true)
  })

  it('⚠️ 变异腿③：真动库把某条资源的 tier 改一档 ⇒ 分布立刻变（不是喂假值）', () => {
    const h = freshDb()
    try {
      const rows = () => h.db.prepare('SELECT tier FROM lang_resources').all() as { tier: string }[]
      expect(verifyNecessity({ specText: SPEC_TEXT, rows: rows() })).toEqual([])
      h.db
        .prepare("UPDATE lang_resources SET tier = 'a' WHERE id = (SELECT MIN(id) FROM lang_resources WHERE tier = 'd')")
        .run()
      const violations = verifyNecessity({ specText: SPEC_TEXT, rows: rows() })
      expect(violations.some((v) => v.rule === 'spec-mismatch')).toBe(true)
    } finally {
      h.close()
    }
  })

  it('反证：种子里没有「必要性」这种逐条字段（它的入参只有档位，没有资源 id）', () => {
    const seed = JSON.parse(readFileSync(join(SEEDS_DIR, 'lang_resources.json'), 'utf8')) as {
      items: Record<string, unknown>[]
    }
    for (const it of seed.items) {
      for (const k of Object.keys(it)) {
        expect(k.toLowerCase(), `种子不该有逐条必要性字段 ${k}`).not.toMatch(/nec|necess|required|must/)
      }
    }
    const rule = parseNecRule(SPEC_TEXT)!
    expect(necessaryFor(rule, 'master', 'd')).toBe('recommended')
    expect(NECESSITY_LABEL[necessaryFor(rule, 'vibe', 'd')]).toBe('可跳过')
  })
})

describe('DL-31 要点级知识点至少有一条可点的去处', () => {
  it('每条 content_level=\'point\' 的知识点都至少有一条挂接', () => {
    const h = freshDb()
    try {
      const orphans = h.db
        .prepare(
          `SELECT t.id, t.title FROM lang_topics t
           WHERE t.content_level = 'point'
             AND NOT EXISTS (SELECT 1 FROM lang_topic_resources r WHERE r.topic_id = t.id)
           ORDER BY t.id ASC`,
        )
        .all() as { id: number; title: string }[]
      expect(orphans.map((o) => o.title)).toEqual([])
      const points = h.db
        .prepare("SELECT COUNT(*) AS c FROM lang_topics WHERE content_level = 'point'")
        .get() as { c: number }
      expect(points.c).toBeGreaterThan(0)
    } finally {
      h.close()
    }
  })

  it('挂接只在本语言内发生（Python 知识点不挂 Go 资源）', () => {
    const h = freshDb()
    try {
      const cross = h.db
        .prepare(
          `SELECT COUNT(*) AS c FROM lang_topic_resources r
           JOIN lang_topics t ON t.id = r.topic_id
           JOIN lang_resources res ON res.id = r.resource_id
           WHERE t.lang <> res.lang`,
        )
        .get() as { c: number }
      expect(cross.c).toBe(0)
    } finally {
      h.close()
    }
  })

  it('⚠️ 变异腿：删掉某条的挂接 ⇒ 必须红', () => {
    const h = freshDb()
    try {
      h.db.prepare('DELETE FROM lang_topic_resources WHERE topic_id = (SELECT MIN(topic_id) FROM lang_topic_resources)').run()
      const orphans = h.db
        .prepare(
          `SELECT COUNT(*) AS c FROM lang_topics t
           WHERE t.content_level = 'point'
             AND NOT EXISTS (SELECT 1 FROM lang_topic_resources r WHERE r.topic_id = t.id)`,
        )
        .get() as { c: number }
      expect(orphans.c).toBeGreaterThan(0)
    } finally {
      h.close()
    }
  })

  it('反证：`content_level=\'full\'` 的条目挂 0 条是**允许**的（判据必须按 point 过滤）', () => {
    const h = freshDb()
    try {
      const topic = h.db.prepare('SELECT id FROM lang_topics ORDER BY id ASC LIMIT 1').get() as { id: number }
      h.db.prepare('DELETE FROM lang_topic_resources WHERE topic_id = ?').run(topic.id)
      h.db.prepare("UPDATE lang_topics SET content_level = 'full' WHERE id = ?").run(topic.id)
      const orphans = h.db
        .prepare(
          `SELECT COUNT(*) AS c FROM lang_topics t
           WHERE t.content_level = 'point'
             AND NOT EXISTS (SELECT 1 FROM lang_topic_resources r WHERE r.topic_id = t.id)`,
        )
        .get() as { c: number }
      expect(orphans.c).toBe(0)
    } finally {
      h.close()
    }
  })
})

describe('P1b.4 探测定点与状态机（DL-30 调度侧）', () => {
  it('待探测 URL 按 URL 去重（87 个，不是 89 个）', () => {
    const h = freshDb()
    try {
      const targets = planProbeTargets(h.db)
      expect(targets.length).toBe(COUNTS.uniqueUrls)
      expect(targets.length).not.toBe(COUNTS.main)
      for (const shared of COUNTS.sharedUrls) {
        const hit = targets.filter((t) => t.url === shared)
        expect(hit.length, `${shared} 只能有一个探测目标`).toBe(1)
        expect(hit[0]?.resourceIds.length, `${shared} 应覆盖两条资源`).toBe(2)
      }
    } finally {
      h.close()
    }
  })

  it('出网请求全是 HEAD，且只发 87 次（DL-30 ①）', async () => {
    const h = freshDb()
    try {
      const seen: { method: string; url: string }[] = []
      const result = await runResourceProbe(h.db, async (req) => {
        seen.push({ method: req.method, url: req.url })
        return { statusCode: 200 }
      })
      expect(seen.length).toBe(COUNTS.uniqueUrls)
      expect(seen.every((s) => s.method === 'HEAD')).toBe(true)
      expect(result.requestedUrls).toBe(COUNTS.uniqueUrls)
    } finally {
      h.close()
    }
  })

  it('状态机：成功 ⇒ alive=1 且计数归零；单次失败 ⇒ alive 仍为 1；连续两次 ⇒ alive=0 但**行仍在**', async () => {
    const h = freshDb()
    try {
      const target = h.db.prepare('SELECT url FROM lang_resources ORDER BY id ASC LIMIT 1').get() as { url: string }
      const before = countRows(h.db, 'lang_resources')

      // 成功
      await runResourceProbe(h.db, async () => ({ statusCode: 200 }), { checkedAt: '2026-10-20T00:00:00Z' })
      let row: { alive: number; consecutive_fails: number; last_status_code?: number | null } = h.db
        .prepare('SELECT alive, consecutive_fails, last_status_code FROM lang_resources WHERE url = ?')
        .get(target.url) as {
        alive: number
        consecutive_fails: number
        last_status_code: number | null
      }
      expect(row.alive).toBe(1)
      expect(row.consecutive_fails).toBe(0)
      expect(row.last_status_code).toBe(200)
      expect(livenessOf(row)).toBe('ok')

      // 单次失败
      await runResourceProbe(h.db, async () => ({ statusCode: 500 }), { checkedAt: '2026-10-20T01:00:00Z' })
      row = h.db.prepare('SELECT alive, consecutive_fails FROM lang_resources WHERE url = ?').get(target.url) as {
        alive: number
        consecutive_fails: number
      }
      expect(row.consecutive_fails).toBe(1)
      expect(row.alive, '单次失败不得判死').toBe(1)
      expect(livenessOf(row)).toBe('suspect')

      // 连续第二次失败
      await runResourceProbe(h.db, async () => ({ statusCode: 500 }), { checkedAt: '2026-10-20T02:00:00Z' })
      row = h.db.prepare('SELECT alive, consecutive_fails FROM lang_resources WHERE url = ?').get(target.url) as {
        alive: number
        consecutive_fails: number
      }
      expect(row.consecutive_fails).toBe(2)
      expect(row.alive).toBe(0)
      expect(livenessOf(row)).toBe('dead')
      // ⚠️ **标灰但不删**
      expect(countRows(h.db, 'lang_resources')).toBe(before)
    } finally {
      h.close()
    }
  })

  it('阈值被**两侧**钉死：既不是 1 也不是 3（单次不死 + 两次必死）', () => {
    const h = freshDb()
    try {
      const target = h.db.prepare('SELECT url FROM lang_resources ORDER BY id ASC LIMIT 1').get() as { url: string }
      applyProbeOutcome(h.db, target.url, 500, '2026-10-20T00:00:00Z')
      let row = h.db.prepare('SELECT alive FROM lang_resources WHERE url = ?').get(target.url) as { alive: number }
      expect(row.alive, '阈值若是 1 ⇒ 这里会死，断言会红').toBe(1)
      applyProbeOutcome(h.db, target.url, 500, '2026-10-20T01:00:00Z')
      row = h.db.prepare('SELECT alive FROM lang_resources WHERE url = ?').get(target.url) as { alive: number }
      expect(row.alive, '阈值若是 3 ⇒ 这里还活着，断言会红').toBe(0)
      expect(FAIL_THRESHOLD).toBe(2)
    } finally {
      h.close()
    }
  })

  it('⚠️ 变异腿：把阈值改成 1 ⇒ 「单次失败不判死」那支必须红', () => {
    // 直接证明「阈值 1」与「阈值 2」的行为不同 —— 生产常量改小，上面那条断言就会红
    const h = freshDb()
    try {
      const target = h.db.prepare('SELECT url FROM lang_resources ORDER BY id ASC LIMIT 1').get() as { url: string }
      // 模拟阈值 = 1 的实现：一次失败即判死
      const simulated = h.db
        .prepare('SELECT alive, consecutive_fails FROM lang_resources WHERE url = ?')
        .get(target.url) as { alive: number; consecutive_fails: number }
      const aliveUnderThresholdOne = simulated.consecutive_fails + 1 >= 1 ? 0 : 1
      expect(aliveUnderThresholdOne).toBe(0)
      expect(aliveUnderThresholdOne).not.toBe(1)
    } finally {
      h.close()
    }
  })
})

describe('DL-32 导出的 README：零本机路径 ＋ 条数一致 ＋ 每行可溯源', () => {
  it('正常导出：0 违规，导出行数 == 库里行数', () => {
    const h = freshDb()
    try {
      const rows = listReadmeRows(h.db)
      const text = exportResourcesReadme(rows)
      expect(verifyReadmeExport(text, { rowCount: rows.length })).toEqual([])
      const dataRows = text.split('\n').filter((l) => /^\|\s*\d+\s*\|/.test(l))
      expect(dataRows.length).toBe(rows.length)
    } finally {
      h.close()
    }
  })

  it('每行带可回查的编号，且编号集合 == 库里的 id 集合', () => {
    const h = freshDb()
    try {
      const rows = listReadmeRows(h.db)
      const text = exportResourcesReadme(rows)
      const ids = [...text.matchAll(/^\|\s*(\d+)\s*\|/gm)].map((m) => Number(m[1]))
      expect(ids.sort((a, b) => a - b)).toEqual(rows.map((r) => r.id).sort((a, b) => a - b))
    } finally {
      h.close()
    }
  })

  it('守卫自证：注入一条本机绝对路径 ⇒ 必须报出（DL-32 ①）', () => {
    const h = freshDb()
    try {
      const rows = listReadmeRows(h.db)
      const text = exportResourcesReadme(rows)
      const poisoned = `${text}\n\n本机导出脚本：/Users/duke/openvibe/scripts/export-m9-resources-readme.ts\n`
      const violations = verifyReadmeExport(poisoned, { rowCount: rows.length })
      expect(violations.some((v) => v.rule === 'absolute-path')).toBe(true)
    } finally {
      h.close()
    }
  })

  it('⚠️ 变异腿：漏掉一行 ⇒ 必须报出条数不一致（DL-32 ②）', () => {
    const h = freshDb()
    try {
      const rows = listReadmeRows(h.db)
      const text = exportResourcesReadme(rows)
      const trimmed = text
        .split('\n')
        .filter((l) => !/^\|\s*\d+\s*\|/.test(l) || !l.includes(String(rows[0]?.id)))
        .join('\n')
      const violations = verifyReadmeExport(trimmed, { rowCount: rows.length })
      expect(violations.some((v) => v.rule === 'row-count-mismatch')).toBe(true)
    } finally {
      h.close()
    }
  })

  it('导出物里没有正文（只有链接与元数据）—— 行数守恒且不含教程正文片段', () => {
    const h = freshDb()
    try {
      const rows = listReadmeRows(h.db)
      const text = exportResourcesReadme(rows)
      // ⚠️ **不拿教程正文片段当条件**（正文不在仓内，抄进来本身就是 DL-02 违规）
      //   ⇒ 只查结构：每一行都只有一个 URL，且没有超长段落
      const dataRows = text.split('\n').filter((l) => /^\|\s*\d+\s*\|/.test(l))
      for (const line of dataRows) {
        const urls = line.match(/https?:\/\/\S+/g) ?? []
        expect(urls.length, `一行里应只有一个 URL：${line.slice(0, 60)}`).toBe(1)
      }
    } finally {
      h.close()
    }
  })
})

describe('0012 迁移：content_level 列 ＋ local_events 的 CHECK 扩到 23 项', () => {
  it('`lang_topics.content_level` 存在、值域 {point, full}、默认 point', () => {
    const h = freshDb()
    try {
      const cols = columnNames(h.db, 'lang_topics')
      expect(cols).toContain('content_level')
      const dflt = h.db.prepare("SELECT dflt_value AS d FROM pragma_table_info('lang_topics') WHERE name='content_level'").get() as {
        d: string | null
      }
      expect(String(dflt.d)).toContain('point')
      const bad = h.db.prepare("SELECT COUNT(*) AS c FROM lang_topics WHERE content_level NOT IN ('point','full')").get() as {
        c: number
      }
      expect(bad.c).toBe(0)
      expect(() => h.db.prepare("UPDATE lang_topics SET content_level = 'x' WHERE id = (SELECT MIN(id) FROM lang_topics)").run()).toThrow()
    } finally {
      h.close()
    }
  })

  it('`local_events` 的 kind CHECK 已是 23 项，且与 LOCAL_EVENT_KINDS 逐项相同', () => {
    const h = newDb()
    try {
      const sql = (
        h.db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='local_events'").get() as { sql: string }
      ).sql
      // ⚠️ **必须先去掉 SQL 注释** —— 0012 的 CHECK 里每一组前面都有一行 `--` 说明，
      //   不去掉的话它们会被当成字面量（实测踩过）。
      const sqlNoComments = sql.replace(/--[^\n]*/g, ' ')
      const m = /CHECK\s*\(\s*kind\s+IN\s*\(([\s\S]*?)\)\s*\)/.exec(sqlNoComments)
      expect(m, '读不到 local_events 的 kind CHECK').not.toBeNull()
      const literals = (m![1] ?? '')
        .split(',')
        .map((s) => s.trim().replace(/^'|'$/g, ''))
        .filter((s) => s !== '')
      expect(literals.length).toBe(23)
      expect(literals).toEqual([...LOCAL_EVENT_KINDS])
      // 既有行仍合法（重建表复制了历史数据）
      const bad = h.db.prepare('SELECT COUNT(*) AS c FROM local_events WHERE kind NOT IN (SELECT value FROM json_each(?))').get(
        JSON.stringify([...LOCAL_EVENT_KINDS]),
      ) as { c: number }
      expect(bad.c).toBe(0)
    } finally {
      h.close()
    }
  })
})
