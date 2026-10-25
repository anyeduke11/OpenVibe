// `packages/core/src/db/m9-p1-5-concept-content.test.ts` —— M9 v1.6 P1.5 出口
// （`m9-dev-plan-2026-10.md` §6.2 + `m9-dev-language-roadmap.md` §7 DL-15）
//
// DL-15 原文：
//   "**概念层内容跨语言复用**
//    变异腿：把「函数」的概念层复制成 Python/Go 两份独立内容 ⇒ 红（§3.7 的减半机制）"
//
// §3.7 的减半机制：共通概念写**一份**，Python 与 Go 各给一段**对照样例**。
// ⇒ 「复制成两份」的正确机器形态是：**同一个概念的三段内容在 topic 侧也各存了一份**。
//
// 本测试断四道闸：
//   ① 14 个概念各 3 段齐全（steps / example / principle），共 42 行，全部 ref_kind='concept'
//      （**8 个共通 ＋ 6 个语言专有** —— §3.7「共通概念 8 个 ＋ 语言专有若干」；
//      6 个语言专有是 P1d 补建的冷门底层那六条）
//   ② 42 段 body_md 互不相同（概念层内容没有复制粘贴）
//   ③ **topic 侧零三段内容**（ref_kind='topic' 的行数 = 0）—— DL-15 的执行点
//   ④ 挂接不悬空：概念的 lang_topics 映射都命中真实 topic 且 lang 对得上
//      （共通概念挂两门 · 语言专有概念挂一门 —— 两个计数分别钉住）
//
// 反向变异腿：
//   - 注入「函数 steps 的副本」到 topic 侧 ⇒ 闸 ③ 红
//   - 注入「函数 steps 的副本」到 concept 侧（concept_id 指向别的概念）⇒ 闸 ② 红
//
// ⚠️ **两条反证**（防止闸过严误伤合法的重复）：
//   - `lang_concept_deltas` 会有同一 concept_id 的 Python/Go 两条**差异**条目（P1.6）
//     —— 那是"差异"不是"概念层内容"，DL-15 不得把它误判成复制。
//   - `lang_topics.summary` 在两门语言上**必然相同**（同一概念的一句话摘要）——
//     那是**挂接信息**不是三段内容，闸 ②③ 都不得把它算进去。

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { newDb } from '../test-support/new-db'
import { seedConceptContent } from './m9-p1-5-concept-content'
import { seedLangTopics } from './m9-p1-seed-lang-topics'

const SEEDS_DIR = fileURLToPath(new URL('./seeds', import.meta.url))
const CONCEPTS_FILE = 'lang_concepts.json'
const CONTENTS_FILE = 'lang_topic_content.json'

/**
 * 概念层规模口径（§3.7「共通概念 8 个 ＋ **语言专有若干**」）。
 *
 * ⚠️ **P1d 之后是 14 个**：8 个**共通**概念（Python/Go 各挂一条知识点）＋
 *   6 个**语言专有**概念（冷门底层那六条，各自只挂自己那门的一个知识点）。
 *   三段内容仍是每概念 3 段 ⇒ 14 × 3 = **42 段**。
 */
const EXPECTED_COMMON_CONCEPTS = 8
const EXPECTED_LANG_SPECIFIC_CONCEPTS = 6
const EXPECTED_CONCEPTS = EXPECTED_COMMON_CONCEPTS + EXPECTED_LANG_SPECIFIC_CONCEPTS
const EXPECTED_CONTENTS = EXPECTED_CONCEPTS * 3
const CONTENT_KINDS = ['steps', 'example', 'principle']

function loadSeed(file: string): {
  items: Array<{
    slug?: string
    concept_slug?: string
    kind?: string
    body_md?: string
    content_level?: string
    lang_topics?: Record<string, string>
  }>
} {
  return JSON.parse(readFileSync(join(SEEDS_DIR, file), 'utf8'))
}

/** 概念 + 内容一起入库（P1.5 的内容依赖 P1.2/P1.3 的 topic 行） */
function seedAll(h: { db: Parameters<typeof seedConceptContent>[0] }): void {
  seedLangTopics(h.db, SEEDS_DIR)
  seedConceptContent(h.db, SEEDS_DIR)
}

describe('M9 P1.5 · 概念层 14 个概念（8 共通 ＋ 6 语言专有）＋ 42 段三段内容', () => {
  it('两份 seed 都成功 import；14 概念 + 42 段三段内容入库；零 warnings', () => {
    const h = newDb()
    try {
      // CS2 语义：断言的是**首次**导入（seedAll 会连概念一起种，二次调用会正确报 skipped）
      seedLangTopics(h.db, SEEDS_DIR)
      const results = seedConceptContent(h.db, SEEDS_DIR)
      expect(results.map((r) => r.bundle)).toEqual(['lang_concepts', 'lang_topic_content'])
      for (const r of results) {
        expect(r.status, `${r.bundle}: ${r.warnings.join(' / ')}`).toBe('imported')
        expect(r.warnings).toEqual([])
      }
      // 8 概念
      const concepts = (
        h.db.prepare(`SELECT COUNT(*) AS c FROM lang_concepts`).get() as { c: number }
      ).c
      expect(concepts).toBe(EXPECTED_CONCEPTS)
      // 42 段内容
      const contents = (
        h.db.prepare(`SELECT COUNT(*) AS c FROM lang_topic_content`).get() as { c: number }
      ).c
      expect(contents).toBe(EXPECTED_CONTENTS)
      h.close()
    } catch (err) {
      try {
        h.close()
      } catch {
        /* close 失败不影响原始错误 */
      }
      throw err
    }
  })

  it('闸 ①：14 个概念各 3 段齐全（steps/example/principle），全部 ref_kind=concept', () => {
    const h = newDb()
    try {
      seedAll(h)
      const rows = h.db
        .prepare(
          `SELECT c.slug AS concept_slug, tc.kind AS kind, tc.ref_kind AS ref_kind
           FROM lang_concepts c
           JOIN lang_topic_content tc ON tc.ref_kind = 'concept' AND tc.ref_id = c.id
           ORDER BY c.slug, tc.kind`,
        )
        .all() as { concept_slug: string; kind: string; ref_kind: string }[]
      expect(rows.length).toBe(EXPECTED_CONTENTS)
      // 每个概念 × 每种 kind 恰好一行
      const seen = new Map<string, number>()
      for (const r of rows) {
        const key = `${r.concept_slug}/${r.kind}`
        seen.set(key, (seen.get(key) ?? 0) + 1)
        expect(r.ref_kind).toBe('concept')
      }
      const conceptSlugs = new Set(
        (h.db.prepare(`SELECT slug FROM lang_concepts`).all() as { slug: string }[]).map(
          (r) => r.slug,
        ),
      )
      expect(conceptSlugs.size).toBe(EXPECTED_CONCEPTS)
      for (const slug of conceptSlugs) {
        for (const kind of CONTENT_KINDS) {
          expect(seen.get(`${slug}/${kind}`), `${slug} 缺 ${kind} 段`).toBe(1)
        }
      }
      h.close()
    } catch (err) {
      try {
        h.close()
      } catch {
        /* ignore */
      }
      throw err
    }
  })

  it('闸 ②：42 段 body_md 互不相同（概念层内容没有复制粘贴）', () => {
    const h = newDb()
    try {
      seedAll(h)
      const rows = h.db
        .prepare(`SELECT body_md FROM lang_topic_content`)
        .all() as { body_md: string }[]
      expect(rows.length).toBe(EXPECTED_CONTENTS)
      const uniq = new Set(rows.map((r) => r.body_md))
      expect(uniq.size).toBe(EXPECTED_CONTENTS)
      // 也没有空正文
      for (const r of rows) {
        expect(r.body_md.trim().length).toBeGreaterThan(0)
      }
      // ⭐ 源文件层同样成立：seed JSON 里的 42 段也互不相同
      //    （闸 ② 若只查库，seed 被手改成重复但已入库的那份就查不出来）
      const seedBodies = loadSeed(CONTENTS_FILE).items.map((it) => it.body_md ?? '')
      expect(seedBodies.length).toBe(EXPECTED_CONTENTS)
      expect(new Set(seedBodies).size).toBe(EXPECTED_CONTENTS)
      h.close()
    } catch (err) {
      try {
        h.close()
      } catch {
        /* ignore */
      }
      throw err
    }
  })

  it('闸 ③（DL-15 执行点）：topic 侧零三段内容 —— 概念层内容不复制到语言层', () => {
    const h = newDb()
    try {
      seedAll(h)
      const topicContent = (
        h.db.prepare(`SELECT COUNT(*) AS c FROM lang_topic_content WHERE ref_kind = 'topic'`).get() as {
          c: number
        }
      ).c
      expect(topicContent).toBe(0)
      h.close()
    } catch (err) {
      try {
        h.close()
      } catch {
        /* ignore */
      }
      throw err
    }
  })

  it('闸 ④：挂接不悬空 —— 8 个共通概念各挂两门 ＋ 6 个语言专有概念各挂一门；topic 都真实存在且 lang 对得上', () => {
    const h = newDb()
    try {
      seedAll(h)
      const concepts = loadSeed(CONCEPTS_FILE).items
      expect(concepts.length).toBe(EXPECTED_CONCEPTS)
      let common = 0
      let langSpecific = 0
      for (const c of concepts) {
        const mounts = Object.entries(c.lang_topics ?? {})
        expect(mounts.length, `${c.slug} 挂接为空`).toBeGreaterThan(0)
        // ⚠️ **挂两门 = 共通概念；挂一门 = 语言专有概念**（§3.7 的两类）。
        //   计数分别钉住 ⇒ 有人把语言专有概念误改成两门（或反过来）时这条会红。
        if (mounts.length === 2) common += 1
        else if (mounts.length === 1) langSpecific += 1
        else throw new Error(`${c.slug} 挂接了 ${mounts.length} 门（只允许 1 或 2）`)
        for (const [lang, slug] of mounts) {
          const row = h.db
            .prepare(`SELECT lang, kind FROM lang_topics WHERE slug = ?`)
            .get(slug) as { lang: string; kind: string } | undefined
          expect(row, `${c.slug} → ${lang}/${slug} 不存在`).toBeDefined()
          expect(row!.lang).toBe(lang)
          // 挂接的知识点必须走学习路线（kind='language'），库级不进路线
          expect(row!.kind).toBe('language')
        }
      }
      expect(common, '共通概念（挂两门）数量不对').toBe(EXPECTED_COMMON_CONCEPTS)
      expect(langSpecific, '语言专有概念（挂一门）数量不对').toBe(EXPECTED_LANG_SPECIFIC_CONCEPTS)
      h.close()
    } catch (err) {
      try {
        h.close()
      } catch {
        /* ignore */
      }
      throw err
    }
  })

  it('幂等：二次 import 不增不减；42 段内容不被重复插入', () => {
    const h = newDb()
    try {
      seedAll(h)
      const second = seedConceptContent(h.db, SEEDS_DIR)
      expect(second.reduce((a, r) => a + r.created, 0)).toBe(0)
      // CS2 语义：内容未变 ⇒ 不再无条件覆盖（旧语义 updated=56），而是整批进入 ignored
      expect(second.reduce((a, r) => a + r.updated, 0)).toBe(0)
      expect(second.reduce((a, r) => a + (r.ignored ?? 0), 0)).toBe(EXPECTED_CONCEPTS + EXPECTED_CONTENTS)
      const concepts = (
        h.db.prepare(`SELECT COUNT(*) AS c FROM lang_concepts`).get() as { c: number }
      ).c
      const contents = (
        h.db.prepare(`SELECT COUNT(*) AS c FROM lang_topic_content`).get() as { c: number }
      ).c
      expect(concepts).toBe(EXPECTED_CONCEPTS)
      expect(contents).toBe(EXPECTED_CONTENTS)
      h.close()
    } catch (err) {
      try {
        h.close()
      } catch {
        /* ignore */
      }
      throw err
    }
  })
})

describe('M9 P1.5 · DL-15 反向变异腿（证明闸确实会红）', () => {
  it('变异 ①：把「函数」的概念层 steps 复制到 Python topic 侧 ⇒ 闸 ③ 红', () => {
    const h = newDb()
    try {
      seedAll(h)
      // 原状：闸 ③ 通过
      const before = (
        h.db.prepare(`SELECT COUNT(*) AS c FROM lang_topic_content WHERE ref_kind = 'topic'`).get() as {
          c: number
        }
      ).c
      expect(before).toBe(0)

      // 注入：把「函数」的 steps 复制成两条，分别挂 Python/Go 的 function topic
      const fnConcept = h.db
        .prepare(`SELECT id FROM lang_concepts WHERE slug = 'function'`)
        .get() as { id: number }
      const stepsBody = (
        h.db
          .prepare(
            `SELECT body_md FROM lang_topic_content WHERE ref_kind='concept' AND ref_id=? AND kind='steps'`,
          )
          .get(fnConcept.id) as { body_md: string }
      ).body_md
      for (const slug of ['python3-function', 'go-functions']) {
        const topic = h.db.prepare(`SELECT id FROM lang_topics WHERE slug = ?`).get(slug) as {
          id: number
        }
        h.db
          .prepare(
            `INSERT INTO lang_topic_content (ref_kind, ref_id, kind, body_md, content_level, updated_at)
             VALUES ('topic', ?, 'steps', ?, 'full', '2026-10-19')`,
          )
          .run(topic.id, stepsBody)
      }

      // 闸 ③ 现在红：topic 侧有 2 份
      const after = (
        h.db.prepare(`SELECT COUNT(*) AS c FROM lang_topic_content WHERE ref_kind = 'topic'`).get() as {
          c: number
        }
      ).c
      expect(after).toBe(2)
      expect(after).not.toBe(0)
      h.close()
    } catch (err) {
      try {
        h.close()
      } catch {
        /* ignore */
      }
      throw err
    }
  })

  it('变异 ②：把同一段内容复制到另一个概念下 ⇒ 闸 ② 红（内容唯一性）', () => {
    const h = newDb()
    try {
      seedAll(h)
      const before = (
        h.db.prepare(`SELECT COUNT(DISTINCT body_md) AS c FROM lang_topic_content`).get() as {
          c: number
        }
      ).c
      expect(before).toBe(EXPECTED_CONTENTS)

      // 注入：把「函数」的 steps 再抄一份挂到「条件语句」概念下
      const fnConcept = h.db
        .prepare(`SELECT id FROM lang_concepts WHERE slug = 'function'`)
        .get() as { id: number }
      const condConcept = h.db
        .prepare(`SELECT id FROM lang_concepts WHERE slug = 'conditional'`)
        .get() as { id: number }
      const stepsBody = (
        h.db
          .prepare(
            `SELECT body_md FROM lang_topic_content WHERE ref_kind='concept' AND ref_id=? AND kind='steps'`,
          )
          .get(fnConcept.id) as { body_md: string }
      ).body_md
      // ⚠️ 0020 起 (ref_kind, ref_id, kind) 有唯一索引：DB 本身就是这道闸——
      // 同键双行在写入层即被拒（此前是先放进来再靠闸 ② 应用层查出）。
      expect(() =>
        h.db
          .prepare(
            `INSERT INTO lang_topic_content (ref_kind, ref_id, kind, body_md, content_level, updated_at)
             VALUES ('concept', ?, 'steps', ?, 'full', '2026-10-19')`,
          )
          .run(condConcept.id, stepsBody),
      ).toThrowError(/UNIQUE/)
      // 行数与唯一正文数都不变（重复没能进来）
      const after = (
        h.db.prepare(`SELECT COUNT(*) AS c FROM lang_topic_content`).get() as { c: number }
      ).c
      expect(after).toBe(EXPECTED_CONTENTS)
      h.close()
    } catch (err) {
      try {
        h.close()
      } catch {
        /* ignore */
      }
      throw err
    }
  })
})

describe('M9 P1.5 · DL-15 两条反证（防止闸过严误伤合法重复）', () => {
  it('反证 ①：lang_concept_deltas 同一 concept 的 Python/Go 两条差异 ⇒ 闸 ③ 仍绿', () => {
    const h = newDb()
    try {
      seedAll(h)
      // 造 P1.6 形态的差异条目：同一 concept_id，python/go 各一条
      const fnConcept = h.db
        .prepare(`SELECT id FROM lang_concepts WHERE slug = 'function'`)
        .get() as { id: number }
      h.db
        .prepare(
          `INSERT INTO lang_concept_deltas (concept_id, lang, aspect, summary, since_version)
           VALUES (?, 'python', '错误模型', 'Python 用异常', '3.0')`,
        )
        .run(fnConcept.id)
      h.db
        .prepare(
          `INSERT INTO lang_concept_deltas (concept_id, lang, aspect, summary, since_version)
           VALUES (?, 'go', '错误模型', 'Go 用 error 返回值', '1.0')`,
        )
        .run(fnConcept.id)

      // 差异条目**不是**三段内容 ⇒ 闸 ③ 仍绿
      const topicContent = (
        h.db.prepare(`SELECT COUNT(*) AS c FROM lang_topic_content WHERE ref_kind = 'topic'`).get() as {
          c: number
        }
      ).c
      expect(topicContent).toBe(0)
      // 差异表里同一 concept 两条是合法的
      const deltas = (
        h.db
          .prepare(`SELECT COUNT(*) AS c FROM lang_concept_deltas WHERE concept_id = ?`)
          .get(fnConcept.id) as { c: number }
      ).c
      expect(deltas).toBe(2)
      h.close()
    } catch (err) {
      try {
        h.close()
      } catch {
        /* ignore */
      }
      throw err
    }
  })

  it('反证 ②：两门语言的 lang_topics.summary 相同（挂接信息）⇒ 闸 ②③ 仍绿', () => {
    const h = newDb()
    try {
      seedAll(h)
      const py = h.db
        .prepare(`SELECT summary FROM lang_topics WHERE slug = 'python3-function'`)
        .get() as { summary: string }
      const go = h.db
        .prepare(`SELECT summary FROM lang_topics WHERE slug = 'go-functions'`)
        .get() as { summary: string }
      // summary 是挂接信息（同一概念的一句话摘要）⇒ 两边相同是**预期**
      expect(py.summary).toBe(go.summary)
      expect(py.summary.length).toBeGreaterThan(0)
      // 但它**不是**三段内容 ⇒ 闸 ②（正文唯一性）不把它算进去
      const contents = (
        h.db.prepare(`SELECT COUNT(*) AS c FROM lang_topic_content`).get() as { c: number }
      ).c
      expect(contents).toBe(EXPECTED_CONTENTS)
      // 闸 ③ 仍绿
      const topicContent = (
        h.db.prepare(`SELECT COUNT(*) AS c FROM lang_topic_content WHERE ref_kind = 'topic'`).get() as {
          c: number
        }
      ).c
      expect(topicContent).toBe(0)
      h.close()
    } catch (err) {
      try {
        h.close()
      } catch {
        /* ignore */
      }
      throw err
    }
  })
})
