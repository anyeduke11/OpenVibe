// `packages/core/src/db/m9-p1-6-concept-deltas.test.ts` —— M9 v1.6 P1.6 出口
// （`m9-dev-plan-2026-10.md` §6.2 + `m9-dev-language-roadmap.md` §7 DL-24）
//
// DL-24 原文：
//   "**大版本变更能报出受影响的差异条目**
//    把语言版本改成跨过某条 `since_version` 的版本 ⇒ 必须产出该条；
//    ⚠️ 变异腿：把 `until_version` 过滤漏掉 ⇒ 必红"
//
// 判定式（§3.12）：差异条目的**生效区间**是 [since_version, until_version)；
// 语言从 v_old 变到 v_new 时，受影响 = 生效区间与 [v_old, v_new] **相交**。
//   相交 ⇔ since_version <= v_new  且  (until_version 为空 或 until_version >= v_old)
//
// ⚠️ **until_version 必须真的参与判定**：漏掉它（当作"永远不过期"）会让
//   **早已过期的条目被误报** —— 本文件用三条变异腿各自证明这一点。
//
// 六道闸：
//   ① 跨过某条 since_version ⇒ 必须产出该条（DL-24 正面）
//   ② 早已过期的条目**不**被报出（until_version 的作用点）
//   ③ 正好在变更区间内到期的条目**要**被报出（边界相交）
//   ④ 两门语言版本线**不合并**（§3.12 末段）
//   ⑤ supersedes 链已建成（4 条）
//   ⑥ 当前生效条目（until_version 左闭右开）
//
// 三条变异腿：
//   ① 漏掉 until_version 过滤 ⇒ 早已过期条目被误报（DL-24 明写的那条）
//   ② 漏掉 since_version 过滤 ⇒ 尚未生效的条目被误报
//   ③ 边界比较写成 end >= to（应为 end >= from）⇒ 区间内到期的条目被漏报

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { newDb } from '../test-support/new-db'
import { seedLangTopics } from './m9-p1-seed-lang-topics'
import { seedConceptContent } from './m9-p1-5-concept-content'
import {
  seedConceptDeltas,
  listConceptDeltas,
  affectedConceptDeltas,
} from './m9-p1-6-concept-deltas'
import {
  compareParsed,
  compareVersions,
  currentDeltas,
  deltaInterval,
  isAffectedBy,
  parseVersion,
  resolveSuperseded,
  resolveSuperseding,
  type ConceptDelta,
} from './m9-concept-deltas'

const SEEDS_DIR = fileURLToPath(new URL('./seeds', import.meta.url))
const EXPECTED_DELTAS = 29
const EXPECTED_CHAINS = 4

function seedAll(h: { db: Parameters<typeof seedConceptDeltas>[0] }): void {
  seedLangTopics(h.db, SEEDS_DIR)
  seedConceptContent(h.db, SEEDS_DIR)
  seedConceptDeltas(h.db, SEEDS_DIR)
}

/**
 * 按 concept slug 拿 concept_id。
 *
 * ⚠️ **定位差异条目必须带 concept 维度** —— 同一个 (lang, aspect, since_version)
 *    在不同概念下会重复出现（例如 Go 的「类型系统」在 function / data-type /
 *    type-conversion / conditional 四个概念下都有 since=1.0 的条目）。
 *    只按 aspect + 版本过滤会把**至今仍生效**的条目误当成"已过期的那条"。
 */
function conceptIdOf(h: { db: Parameters<typeof seedConceptDeltas>[0] }, slug: string): number {
  const row = h.db.prepare(`SELECT id FROM lang_concepts WHERE slug = ?`).get(slug) as
    | { id: number }
    | undefined
  if (!row) throw new Error(`概念不存在: ${slug}`)
  return row.id
}

/** 按「概念 + 语言 + aspect + 起始版本」四元组精确定位一条差异 */
function findDelta(
  deltas: ConceptDelta[],
  conceptId: number,
  lang: string,
  aspect: string,
  sinceVersion: string,
): ConceptDelta {
  const found = deltas.find(
    (d) =>
      d.concept_id === conceptId &&
      d.lang === lang &&
      d.aspect === aspect &&
      d.since_version === sinceVersion,
  )
  if (!found) {
    throw new Error(`找不到差异条目: concept=${conceptId}/${lang}/${aspect}/${sinceVersion}`)
  }
  return found
}

describe('M9 P1.6 · 语言差异层 29 条入库', () => {
  it('seed 成功 import；29 条入 lang_concept_deltas；零 warnings', () => {
    const h = newDb()
    try {
      // CS2 语义：断言的是**首次**导入（seedAll 会连 deltas 一起种，二次调用会正确报 skipped）
      seedLangTopics(h.db, SEEDS_DIR)
      seedConceptContent(h.db, SEEDS_DIR)
      const res = seedConceptDeltas(h.db, SEEDS_DIR)
      expect(res.status).toBe('imported')
      expect(res.warnings).toEqual([])
      const total = (
        h.db.prepare(`SELECT COUNT(*) AS c FROM lang_concept_deltas`).get() as { c: number }
      ).c
      expect(total).toBe(EXPECTED_DELTAS)
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

  it('aspect 词表闭集（§3.12：语法/错误模型/并发模型/类型系统/包管理）', () => {
    const h = newDb()
    try {
      seedAll(h)
      const rows = h.db
        .prepare(`SELECT DISTINCT aspect FROM lang_concept_deltas`)
        .all() as { aspect: string }[]
      const allowed = new Set(['语法', '错误模型', '并发模型', '类型系统', '包管理'])
      for (const r of rows) {
        expect(allowed.has(r.aspect), `aspect 越界: ${r.aspect}`).toBe(true)
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

  it('幂等：二次 import 不增不减；supersedes 链不被重复插入打断', () => {
    const h = newDb()
    try {
      seedAll(h)
      const second = seedConceptDeltas(h.db, SEEDS_DIR)
      expect(second.created).toBe(0)
      // CS2 语义：内容未变 ⇒ 不再无条件覆盖（旧语义 updated=29），整批进入 ignored
      expect(second.updated).toBe(0)
      expect(second.ignored ?? 0).toBe(EXPECTED_DELTAS)
      const total = (
        h.db.prepare(`SELECT COUNT(*) AS c FROM lang_concept_deltas`).get() as { c: number }
      ).c
      expect(total).toBe(EXPECTED_DELTAS)
      const chains = (
        h.db
          .prepare(`SELECT COUNT(*) AS c FROM lang_concept_deltas WHERE supersedes IS NOT NULL`)
          .get() as { c: number }
      ).c
      expect(chains).toBe(EXPECTED_CHAINS)
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

describe('M9 P1.6 · DL-24 大版本变更能报出受影响的差异条目', () => {
  it('闸 ①：跨过某条 since_version ⇒ 必须产出该条', () => {
    const h = newDb()
    try {
      seedAll(h)
      // Go 1.17 → 1.18：跨过「Go 1.18 起支持类型参数」那条
      const fnConcept = conceptIdOf(h, 'function')
      const goAffected = affectedConceptDeltas(h.db, 'go', '1.17', '1.18')
      expect(
        goAffected.some(
          (d) =>
            d.concept_id === fnConcept &&
            d.aspect === '类型系统' &&
            d.since_version === '1.18',
        ),
        'Go 1.18 的泛型差异没被报出',
      ).toBe(true)

      // Python 3.9 → 3.10：跨过「Python 3.10 起有 match/case」那条
      const pyAffected = affectedConceptDeltas(h.db, 'python', '3.9', '3.10')
      expect(
        pyAffected.some((d) => d.aspect === '语法' && d.since_version === '3.10'),
        'Python 3.10 的 match 差异没被报出',
      ).toBe(true)

      // Go 1.21 → 1.22：跨过「Go 1.22 起每轮迭代新的循环变量」那条
      const goLoop = affectedConceptDeltas(h.db, 'go', '1.21', '1.22')
      expect(
        goLoop.some((d) => d.aspect === '并发模型' && d.since_version === '1.22'),
        'Go 1.22 的循环变量差异没被报出',
      ).toBe(true)

      // Go 1.12 → 1.13：跨过「Go 1.13 起有 errors.Is/As」那条
      const goErr = affectedConceptDeltas(h.db, 'go', '1.12', '1.13')
      expect(
        goErr.some((d) => d.aspect === '错误模型' && d.since_version === '1.13'),
        'Go 1.13 的 errors.Is 差异没被报出',
      ).toBe(true)
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

  it('闸 ②：早已过期的条目不被报出（until_version 的作用点）', () => {
    const h = newDb()
    try {
      seedAll(h)
      const fnConcept = conceptIdOf(h, 'function')
      const condConcept = conceptIdOf(h, 'conditional')
      // Go 1.19 → 1.20：「Go 1.18 之前没有泛型」那条（until=1.18）已过期，不该出现
      const goAffected = affectedConceptDeltas(h.db, 'go', '1.19', '1.20')
      const expiredGeneric = goAffected.filter(
        (d) =>
          d.concept_id === fnConcept &&
          d.aspect === '类型系统' &&
          d.since_version === '1.0',
      )
      expect(expiredGeneric.length, '已过期的 Go 泛型差异被误报了').toBe(0)

      // Python 3.11 → 3.12：「Python 3.10 之前没有 match」那条（until=3.10）已过期
      const pyAffected = affectedConceptDeltas(h.db, 'python', '3.11', '3.12')
      const expiredMatch = pyAffected.filter(
        (d) =>
          d.concept_id === condConcept &&
          d.aspect === '语法' &&
          d.since_version === '3.0',
      )
      expect(expiredMatch.length, '已过期的 Python match 差异被误报了').toBe(0)

      // ⚠️ **反证**：同一变更里，**至今仍生效**的差异（until 为空）必须仍在结果里
      //    —— 闸 ② 若写成「把所有 since=1.0 的都排掉」就是过严误伤。
      const stillAlive = goAffected.filter((d) => d.until_version === null)
      expect(stillAlive.length, '至今仍生效的差异被误排了').toBeGreaterThan(0)
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

  it('闸 ③：正好在变更区间内到期的条目要被报出（边界相交）', () => {
    const h = newDb()
    try {
      seedAll(h)
      // Go 1.17 → 1.18：until=1.18 那条正好在区间内到期 ⇒ 报出
      const fnConcept = conceptIdOf(h, 'function')
      const goAffected = affectedConceptDeltas(h.db, 'go', '1.17', '1.18')
      expect(
        goAffected.some(
          (d) =>
            d.concept_id === fnConcept &&
            d.aspect === '类型系统' &&
            d.since_version === '1.0',
        ),
        '区间内到期的 Go 泛型差异被漏报了',
      ).toBe(true)
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

  it('闸 ④：两门语言版本线不合并（§3.12 末段）', () => {
    const h = newDb()
    try {
      seedAll(h)
      const goAffected = affectedConceptDeltas(h.db, 'go', '1.17', '1.18')
      expect(goAffected.every((d) => d.lang === 'go'), 'Go 的结果里混进了 Python 条目').toBe(true)
      const pyAffected = affectedConceptDeltas(h.db, 'python', '3.9', '3.10')
      expect(pyAffected.every((d) => d.lang === 'python'), 'Python 的结果里混进了 Go 条目').toBe(
        true,
      )
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

  it('闸 ⑤：supersedes 链已建成（4 条），指向的都是「更早且已填 until_version」的那条', () => {
    const h = newDb()
    try {
      seedAll(h)
      const deltas = listConceptDeltas(h.db)
      const withSupersedes = deltas.filter((d) => d.supersedes !== null)
      expect(withSupersedes.length).toBe(EXPECTED_CHAINS)
      for (const d of withSupersedes) {
        const target = resolveSuperseded(deltas, d)
        expect(target, `supersedes=${d.supersedes} 指向的条目不存在`).not.toBeNull()
        // 被取代者必须更早、且有 until_version（否则两条会同时生效）
        expect(compareVersions(target!.since_version, d.since_version)).toBeLessThan(0)
        expect(target!.until_version).not.toBeNull()
        // 反向也能查回来
        expect(resolveSuperseding(deltas, target!).map((x) => x.id)).toContain(d.id)
      }
      // ⚠️ **逐链核对**（四元组精确定位）：4 条链分别是哪 4 对
      const expectedChains: Array<[string, string, string, string, string]> = [
        // [concept, lang, aspect, 老条目的 since, 新条目的 since]
        ['function', 'go', '类型系统', '1.0', '1.18'],
        ['conditional', 'python', '语法', '3.0', '3.10'],
        ['loop', 'go', '并发模型', '1.0', '1.22'],
        ['error-handling', 'go', '错误模型', '1.0', '1.13'],
      ]
      for (const [slug, lang, aspect, oldSince, newSince] of expectedChains) {
        const cid = conceptIdOf(h, slug)
        const newer = findDelta(deltas, cid, lang, aspect, newSince)
        const older = findDelta(deltas, cid, lang, aspect, oldSince)
        // 新条目的 supersedes 必须指向老条目
        expect(newer.supersedes, `${slug}/${lang}/${aspect} 的 supersedes 没指对`).toBe(older.id)
        // 老条目必须已封口（until_version = 新条目的 since_version）
        expect(older.until_version).toBe(newSince)
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

  it('闸 ⑥：当前生效条目 —— until_version 左闭右开，边界版本上老条目已不生效', () => {
    const h = newDb()
    try {
      seedAll(h)
      const fnConcept = conceptIdOf(h, 'function')
      const deltas = listConceptDeltas(h.db)
      // Go 1.17：泛型那组里只有 since=1.0 的生效
      const at117 = currentDeltas(deltas, 'go', '1.17').filter(
        (d) => d.concept_id === fnConcept && d.aspect === '类型系统',
      )
      expect(at117.map((d) => d.since_version)).toEqual(['1.0'])
      // Go 1.18：换成 since=1.18 的那条（until=1.18 的老条目在 1.18 已到期）
      const at118 = currentDeltas(deltas, 'go', '1.18').filter(
        (d) => d.concept_id === fnConcept && d.aspect === '类型系统',
      )
      expect(at118.map((d) => d.since_version)).toEqual(['1.18'])
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

describe('M9 P1.6 · DL-24 反向变异腿（证明闸确实会红）', () => {
  it('变异 ①：漏掉 until_version 过滤 ⇒ 早已过期的条目被误报（DL-24 明写的那条）', () => {
    const h = newDb()
    try {
      seedAll(h)
      const fnConcept = conceptIdOf(h, 'function')
      const deltas = listConceptDeltas(h.db)
      const affected = affectedConceptDeltas(h.db, 'go', '1.19', '1.20')

      // 正解：已过期的条目不在结果里
      const correctExpired = affected.filter(
        (d) =>
          d.concept_id === fnConcept &&
          d.aspect === '类型系统' &&
          d.since_version === '1.0',
      )
      expect(correctExpired.length).toBe(0)

      // 模拟「漏掉 until_version 过滤」的实现：end 恒为 null（永远不过期）
      const buggy = deltas.filter((d) => {
        if (d.lang !== 'go') return false
        const { start } = deltaInterval(d)
        // ❌ 漏掉了 end >= from 这一半
        return compareParsed(start, parseVersion('1.20')) <= 0
      })
      const buggyExpired = buggy.filter(
        (d) =>
          d.concept_id === fnConcept &&
          d.aspect === '类型系统' &&
          d.since_version === '1.0',
      )
      // ⇒ 漏掉过滤的实现会多报这条 ⇒ 闸能分辨
      expect(buggyExpired.length).toBeGreaterThan(correctExpired.length)
      expect(buggyExpired.length).toBe(1)
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

  it('变异 ②：漏掉 since_version 过滤 ⇒ 尚未生效的条目被误报', () => {
    const h = newDb()
    try {
      seedAll(h)
      const fnConcept = conceptIdOf(h, 'function')
      const deltas = listConceptDeltas(h.db)
      // Go 1.0 → 1.1：Go 1.18 那条泛型差异此刻还没生效，不该出现
      const affected = affectedConceptDeltas(h.db, 'go', '1.0', '1.1')
      const notYet = affected.filter(
        (d) =>
          d.concept_id === fnConcept &&
          d.aspect === '类型系统' &&
          d.since_version === '1.18',
      )
      expect(notYet.length).toBe(0)

      // 模拟「漏掉 since_version 过滤」：start 不参与判定
      const buggy = deltas.filter((d) => {
        if (d.lang !== 'go') return false
        const { end } = deltaInterval(d)
        // ❌ 漏掉了 start <= to 这一半
        return end === null || compareParsed(end, parseVersion('1.0')) >= 0
      })
      const buggyNotYet = buggy.filter(
        (d) =>
          d.concept_id === fnConcept &&
          d.aspect === '类型系统' &&
          d.since_version === '1.18',
      )
      expect(buggyNotYet.length).toBeGreaterThan(notYet.length)
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

  it('变异 ③：边界比较写成 end >= to（应为 end >= from）⇒ 区间内到期的条目被漏报', () => {
    const h = newDb()
    try {
      seedAll(h)
      const fnConcept = conceptIdOf(h, 'function')
      const deltas = listConceptDeltas(h.db)
      // Go 1.18 → 1.19：until=1.18 的条目在变更区间内到期 ⇒ 正确实现要报出
      const affected = affectedConceptDeltas(h.db, 'go', '1.18', '1.19')
      const correct = affected.filter(
        (d) =>
          d.concept_id === fnConcept &&
          d.aspect === '类型系统' &&
          d.since_version === '1.0',
      )
      expect(correct.length).toBe(1)

      // 模拟「边界比较写成 end >= to」：end=1.18 < to=1.19 ⇒ 漏报
      const buggy = deltas.filter((d) => {
        if (d.lang !== 'go') return false
        if (d.concept_id !== fnConcept || d.since_version !== '1.0') return false
        const { start, end } = deltaInterval(d)
        if (end === null) return false
        // ❌ 把 end >= from 写成 end >= to
        return (
          compareParsed(start, parseVersion('1.19')) <= 0 &&
          compareParsed(end, parseVersion('1.19')) >= 0
        )
      })
      expect(buggy.length).toBeLessThan(correct.length)
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

describe('M9 P1.6 · 版本比较的边界（数字比较而非字符串比较）', () => {
  it('"3.10" > "3.9"（字符串比较会判反）', () => {
    expect(compareVersions('3.10', '3.9')).toBe(1)
    expect(compareVersions('3.9', '3.10')).toBe(-1)
    expect(compareVersions('1.18', '1.18.0')).toBe(0)
    expect(compareVersions('1.2', '1.10')).toBe(-1)
  })

  it('isAffectedBy 的方向性：from > to（变更区间反向）⇒ 不受影响', () => {
    const delta = { since_version: '1.0', until_version: null }
    expect(isAffectedBy(delta, '1.18', '1.17')).toBe(false)
  })

  it('seed 源文件自检：29 条 ＋ 4 条 supersedes 链（构建期事实）', () => {
    const seed = JSON.parse(
      readFileSync(join(SEEDS_DIR, 'lang_concept_deltas.json'), 'utf8'),
    ) as { items: Array<{ supersedes_index: number; concept_slug: string }> }
    expect(seed.items.length).toBe(EXPECTED_DELTAS)
    expect(seed.items.filter((i) => i.supersedes_index >= 0).length).toBe(EXPECTED_CHAINS)
  })
})
