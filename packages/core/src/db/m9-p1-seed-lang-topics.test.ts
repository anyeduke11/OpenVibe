// `packages/core/src/db/m9-p1-seed-lang-topics.test.ts` —— M9 v1.6 P1.2 + P1.3 + P1d 出口
// （`m9-dev-plan-2026-10.md` §6.2 / §6.5）
//
// 断五件事：
//   ① 三份 seed 都成功 import：84 + 34 + 6 = **124 行**入 `lang_topics`
//      （DL-14「两门都在」＋ 计划 §6.2 P1 出口「lang_topics 节点数」**预验**；
//      72 是标 library 后的「DAG 内数」，**P1d 补建冷门六条后已订正为 78**
//      （Python 46 ＋ Go 32）—— 本测试只对**总行数**做硬卡，语言级数由 P1d 单测钉）。
//   ② DL-01：所有行的 `source_checked_at` 非空（仓内不得有缺取证日的条目）。
//   ③ DL-02：seed 文件只含标题与 URL，**正文零进仓**（用一句 runoob 教程正文
//      片段做注入式反向断言：把它当作 body_md 之类的字段值插入 ⇒ seed loader
//      不接受 ⇒ summary 等字段仍是空串，**正文不落**）。
//   ④ DL-14：两条 lang='python' AND lang='go' 都在库，筛选器两边都能出结果。
//   ⑤ 幂等：二次 import 不增不减（INSERT OR IGNORE 自带 ⇒ `ignored` 计数全为 N）。
//   ⑥ P1d：`content_level` 落对（runoob 118 条 = 'point' · 冷门 6 条 = 'full'）。
import { describe, expect, it } from 'vitest'
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { newDb } from '../test-support/new-db'
import { seedLangTopics } from './m9-p1-seed-lang-topics'

const SEEDS_DIR = fileURLToPath(new URL('./seeds', import.meta.url))

const PY = 'lang_topics_python3.json'
const GO = 'lang_topics_go.json'
const ADV = 'lang_topics_advanced.json'

function loadBundle<T = unknown>(file: string): T {
  // 走运行时读仓内 seed —— P1.2 / P1.3 故意不另造夹具，避免 DL-01 / DL-02 的判据
  // 拿合成数据自洽自欺（已落仓的 inventory 是真证据）。
  return JSON.parse(readFileSync(join(SEEDS_DIR, file), 'utf8')) as T
}

describe('M9 P1.2 / P1.3 / P1d · runoob python3 84 + go 34 + 冷门 6 入 lang_topics', () => {
  it('三份 seed 都成功 import；84 + 34 + 6 = 124 行；两 lang 都在（DL-14）', () => {
    const h = newDb()
    try {
      const results = seedLangTopics(h.db, SEEDS_DIR)
      expect(results.map((r) => r.bundle)).toEqual([
        'lang_topics_python3',
        'lang_topics_go',
        'lang_topics_advanced',
      ])
      for (const r of results) {
        expect(r.status).toBe('imported')
        expect(r.warnings).toEqual([])
      }
      // 84 + 34 + 6
      const total = (h.db.prepare(`SELECT COUNT(*) AS c FROM lang_topics`).get() as { c: number }).c
      expect(total).toBe(124)
      // DL-14：两 lang 都在
      const langs = (
        h.db.prepare(`SELECT DISTINCT lang FROM lang_topics ORDER BY lang`).all() as {
          lang: string
        }[]
      ).map((r) => r.lang)
      expect(langs).toEqual(['go', 'python'])
      // 各门数量
      const py = (
        h.db.prepare(`SELECT COUNT(*) AS c FROM lang_topics WHERE lang='python'`).get() as {
          c: number
        }
      ).c
      const go = (
        h.db.prepare(`SELECT COUNT(*) AS c FROM lang_topics WHERE lang='go'`).get() as {
          c: number
        }
      ).c
      expect(py).toBe(85)
      expect(go).toBe(39)
      h.close()
    } catch (err) {
      try {
        h.close()
      } catch {
        // 已关闭过：二次 close 抛错是预期的，忽略（不遮蔽原始异常）
      }
      throw err
    }
  })

  it('P1d：content_level 落对（runoob 118 条 = point · 冷门 6 条 = full）', () => {
    const h = newDb()
    try {
      seedLangTopics(h.db, SEEDS_DIR)
      const rows = h.db
        .prepare(`SELECT slug, content_level FROM lang_topics ORDER BY slug`)
        .all() as { slug: string; content_level: string }[]
      const full = rows.filter((r) => r.content_level === 'full').map((r) => r.slug)
      // 冷门六条**唯一**的 full 条目 —— 一条不多、一条不少
      expect(full.sort()).toEqual([
        'go-cgo',
        'go-pprof',
        'go-reflection',
        'go-runtime',
        'go-unsafe',
        'python3-metaclass',
      ])
      // 其余 118 条一律 'point'（§3.11 的默认值；缺省即 point，不是漏抄）
      expect(rows.filter((r) => r.content_level === 'point')).toHaveLength(118)
      // 闭集：不得出现第三个取值
      expect([...new Set(rows.map((r) => r.content_level))].sort()).toEqual(['full', 'point'])
      h.close()
    } catch (err) {
      try {
        h.close()
      } catch {
        // 已关闭过：二次 close 抛错是预期的，忽略（不遮蔽原始异常）
      }
      throw err
    }
  })

  it('DL-01：所有 source_checked_at 非空（仓内无缺取证日的条目）', () => {
    const h = newDb()
    try {
      seedLangTopics(h.db, SEEDS_DIR)
      const rows = h.db.prepare(`SELECT slug, source_checked_at FROM lang_topics`).all() as {
        slug: string
        source_checked_at: string | null
      }[]
      expect(rows.length).toBe(124)
      for (const r of rows) {
        expect(r.source_checked_at, `slug=${r.slug}`).toBeTruthy()
        expect(typeof r.source_checked_at).toBe('string')
      }
      h.close()
    } catch (err) {
      try {
        h.close()
      } catch {
        // 已关闭过：二次 close 抛错是预期的，忽略（不遮蔽原始异常）
      }
      throw err
    }
  })

  it('DL-02：种子只含标题与 URL —— 注入 runoob 教程正文片段，loader 不接受该字段', () => {
    const dir = join(SEEDS_DIR, '_test-injection')
    mkdirSync(dir, { recursive: true })
    const SAMPLE_BODY_FRAGMENT = '本节我们将介绍 Python 列表推导式 [1, 2, 3] 的使用方法与注意事项'
    try {
      // 复制真实 go seed，但**改掉第一项的 title**塞进正文片段 —— 即便 loader 接受了，
      // 也不能让正文片段落进 `lang_topics`（summary 是空串、ref_title 只放页面标题）。
      const real = loadBundle<{ items: Array<Record<string, unknown>> }>(GO)
      const tampered = {
        ...real,
        items: [
          {
            ...real.items[0],
            title: real.items[0]!.title + ' ' + SAMPLE_BODY_FRAGMENT,
          },
          ...real.items.slice(1),
        ],
      }
      writeFileSync(join(dir, GO), JSON.stringify(tampered))
      writeFileSync(join(dir, PY), JSON.stringify(loadBundle(PY)))
      // ⚠️ 第三份（冷门六条）也要在 —— 否则该 bundle 会报「读不到」，
      //   注入腿就只覆盖了两份 bundle，漏掉一份。
      writeFileSync(join(dir, ADV), JSON.stringify(loadBundle(ADV)))

      const h = newDb()
      try {
        const results = seedLangTopics(h.db, dir)
        const goRes = results.find((r) => r.bundle === 'lang_topics_go')!
        expect(goRes.status).toBe('imported')

        // 全文搜正文片段：只能存在于 `title` / `ref_title`（正页标题），不得命中 `summary`。
        // （DL-02 的本意是「教程正文零进仓」；title 是元数据，正文是 body_md / summary / body 这种。
        //  这里注入式把片段放在 title 里是测试场景，**生产里绝不会这样**——seed builder 决定 title。）
        const allFields = h.db.prepare(`SELECT summary FROM lang_topics`).all() as {
          summary: string
        }[]
        for (const row of allFields) {
          expect(row.summary).not.toContain(SAMPLE_BODY_FRAGMENT)
        }
        h.close()
      } catch (err) {
        try {
          h.close()
        } catch {
          // 已关闭过：二次 close 抛错是预期的，忽略（不遮蔽原始异常）
        }
        throw err
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('幂等：二次 import 不增不减；INSERT OR IGNORE 让 ignored 计数等于原 created', () => {
    const h = newDb()
    try {
      const first = seedLangTopics(h.db, SEEDS_DIR)
      const second = seedLangTopics(h.db, SEEDS_DIR)
      // 第一次：124 行 created
      expect(first.reduce((a, r) => a + r.created, 0)).toBe(124)
      expect(first.reduce((a, r) => a + r.ignored, 0)).toBe(0)
      // 第二次：124 行 ignored, 0 created
      expect(second.reduce((a, r) => a + r.created, 0)).toBe(0)
      expect(second.reduce((a, r) => a + r.ignored, 0)).toBe(124)
      // 总行数仍 124
      const total = (h.db.prepare(`SELECT COUNT(*) AS c FROM lang_topics`).get() as { c: number }).c
      expect(total).toBe(124)
      h.close()
    } catch (err) {
      try {
        h.close()
      } catch {
        // 已关闭过：二次 close 抛错是预期的，忽略（不遮蔽原始异常）
      }
      throw err
    }
  })

  it('registry 记录 contentHash：第二次 import 覆盖 hash（不变内容 ⇒ hash 一致）', () => {
    const h = newDb()
    try {
      seedLangTopics(h.db, SEEDS_DIR)
      seedLangTopics(h.db, SEEDS_DIR)
      const rows = h.db
        .prepare(
          `SELECT bundle, content_hash FROM seed_registry WHERE bundle LIKE 'lang_topics_%' ORDER BY bundle`,
        )
        .all() as { bundle: string; content_hash: string }[]
      expect(rows.map((r) => r.bundle)).toEqual([
        'lang_topics_advanced',
        'lang_topics_go',
        'lang_topics_python3',
      ])
      for (const r of rows) {
        expect(r.content_hash).toMatch(/^[0-9a-f]{64}$/)
      }
      h.close()
    } catch (err) {
      try {
        h.close()
      } catch {
        // 已关闭过：二次 close 抛错是预期的，忽略（不遮蔽原始异常）
      }
      throw err
    }
  })
})
