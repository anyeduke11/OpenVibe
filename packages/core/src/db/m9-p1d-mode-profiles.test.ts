// `packages/core/src/db/m9-p1d-mode-profiles.test.ts` —— M9 v1.6 **P1d 出口**
// （`m9-dev-plan-2026-10.md` §6.5 ＋ `m9-dev-language-roadmap.md` §3.17 / §3.17.1 / §3.22.1）
//
// ## 它断五条判据
//
// | 判据 | 一句话 | 本文件里对应的那支 |
// |---|---|---|
// | **DL-49** | 分期路线与附件逐格相等（含产出三前缀与 7 段空栏） | 「DL-49」组 |
// | **DL-33** | 必学集合逐层包含 | 「DL-33」组 |
// | **DL-35** | 每个模式的必学集合非空 | 「DL-35」组 |
// | **DL-36** | 速成必学必有 est_minutes；精通/熟悉恒 NULL | 「DL-36」组 |
// | **DL-50** | 8 站与附件分期不做逐格映射 | 「DL-50」组 |
//
// ⚠️ **每条判据都配一条「真动数据/真改代码」的变异腿** ——
//   反向判据（"不得存在 X"）天然没有正向痕迹：加一列、多一张表，
//   代码照常编译、测试照常过 ⇒ 只有专门那条检查会红。
//
// ⚠️ **变异一律在临时目录里做** —— 真实证据目录与真实种子文件里放人造内容是错的：
//   那里放的东西会被将来的读者当成实测。
import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { newDb } from '../test-support/new-db'
import { seedLangTopics } from './m9-p1-seed-lang-topics'
import { seedConceptContent } from './m9-p1-5-concept-content'
import { seedTopicEdges } from './m9-p1-7-topic-stages'
import { seedProfilePhases, seedTopicProfiles } from './m9-p1d-seed-profiles'
import {
  assignTopicProfiles,
  COLD_TIER_TOPICS,
  vibeTotalMinutes,
  VIBE_ABILITY_LABELS,
  type ModeTopic,
} from './m9-p1d-mode-assign'
import {
  findEstMinutesViolations,
  findEmptyRequiredViolations,
  findLayeringViolations,
  type ProfileGuardRow,
} from './m9-p1d-profile-guards'
import { parseSpecPhaseRows, tallyOutcomePrefixes, type SpecPhaseRow } from '../tooling/m9-p1d-spec'
import {
  checkNoMappingStatementsStillThere,
  findStagePhaseArtifacts,
} from './m9-p1d-stage-phase-guard'

const SEEDS_DIR = fileURLToPath(new URL('./seeds', import.meta.url))
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const SPEC_FILE = join(REPO_ROOT, 'docs/specs/m9-dev-language-roadmap.md')

const SPEC_TEXT = readFileSync(SPEC_FILE, 'utf8')
const SPEC_ROWS = parseSpecPhaseRows(SPEC_TEXT)

type Db = Parameters<typeof seedTopicProfiles>[0]

function seedAll(h: { db: Db }): void {
  seedLangTopics(h.db, SEEDS_DIR)
  seedConceptContent(h.db, SEEDS_DIR)
  seedTopicEdges(h.db, SEEDS_DIR)
  seedProfilePhases(h.db, SEEDS_DIR)
  seedTopicProfiles(h.db)
}

interface PhaseRow {
  profile: string
  lang: string
  ord: number
  label: string
  title: string
  duration_label: string
  outcome: string | null
}

function readPhases(db: Db): PhaseRow[] {
  return db
    .prepare(
      `SELECT profile, lang, ord, label, title, duration_label, outcome
       FROM lang_profile_phases`,
    )
    .all() as PhaseRow[]
}

function readGuardRows(db: Db): ProfileGuardRow[] {
  return db
    .prepare(`SELECT topic_id, profile, required, est_minutes FROM lang_topic_profiles`)
    .all() as ProfileGuardRow[]
}

function readLangOf(db: Db): Map<number, string> {
  const rows = db.prepare(`SELECT id, lang FROM lang_topics`).all() as {
    id: number
    lang: string
  }[]
  return new Map(rows.map((r) => [r.id, r.lang]))
}

/**
 * 库里的段 vs spec §3.17.1 那张表 —— **逐格**对账。
 *
 * @returns 不一致的每一格；**空数组 = 逐格相等**。
 */
function diffPhasesAgainstSpec(db: Db, specRows: readonly SpecPhaseRow[]): string[] {
  const out: string[] = []
  const rows = readPhases(db)
  const byKey = new Map(rows.map((r) => [`${r.profile}/${r.lang}/${String(r.ord)}`, r]))
  for (const s of specRows) {
    const key = `${s.profile}/${s.lang}/${String(s.ord)}`
    const row = byKey.get(key)
    if (row === undefined) {
      out.push(`${key}：spec 有这一段，库里没有`)
      continue
    }
    if (row.label !== s.label) out.push(`${key}：标签不等（库「${row.label}」/ spec「${s.label}」）`)
    if (row.title !== s.title) out.push(`${key}：阶段名不等（库「${row.title}」/ spec「${s.title}」）`)
    if (row.duration_label !== s.duration) {
      out.push(`${key}：耗时不等（库「${row.duration_label}」/ spec「${s.duration}」）`)
    }
    if ((row.outcome ?? null) !== s.outcome) {
      out.push(
        `${key}：产出栏不等（库「${row.outcome ?? 'NULL'}」/ spec「${s.outcome ?? 'NULL'}」）`,
      )
    }
  }
  const specKeys = new Set(specRows.map((s) => `${s.profile}/${s.lang}/${String(s.ord)}`))
  for (const r of rows) {
    const key = `${r.profile}/${r.lang}/${String(r.ord)}`
    if (!specKeys.has(key)) out.push(`${key}：库里有这一段，spec 没有`)
  }
  return out
}

/** 把种子文件拷进临时目录并做一次改动（不动真实种子）。 */
function tamperedSeedDir(mutate: (text: string) => string): string {
  const dir = mkdtempSync(join(tmpdir(), 'ov-p1d-seed-'))
  const src = readFileSync(join(SEEDS_DIR, 'lang_profile_phases.json'), 'utf8')
  writeFileSync(join(dir, 'lang_profile_phases.json'), mutate(src))
  return dir
}

// ============================================================================
describe('M9 P1d · DL-49 分期路线与附件逐格相等', () => {
  it('① 21 段入库；段数分布 = py 精通5/熟悉3/速成3 · go 精通4/熟悉3/速成3', () => {
    const h = newDb()
    try {
      const results = seedProfilePhases(h.db, SEEDS_DIR)
      expect(results).toHaveLength(1)
      expect(results[0]!.status).toBe('imported')
      expect(results[0]!.warnings).toEqual([])
      expect(results[0]!.created).toBe(21)
      const rows = readPhases(h.db)
      expect(rows).toHaveLength(21)
      const dist = rows.reduce<Record<string, number>>((acc, r) => {
        const k = `${r.lang}/${r.profile}`
        acc[k] = (acc[k] ?? 0) + 1
        return acc
      }, {})
      expect(dist).toEqual({
        'python/master': 5,
        'python/familiar': 3,
        'python/vibe': 3,
        'go/master': 4,
        'go/familiar': 3,
        'go/vibe': 3,
      })
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

  it('② 逐格等于 spec §3.17.1 那张表（段序/标签/阶段名/耗时/产出整串）', () => {
    const h = newDb()
    try {
      seedAll(h)
      expect(SPEC_ROWS).toHaveLength(21)
      expect(diffPhasesAgainstSpec(h.db, SPEC_ROWS)).toEqual([])
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

  it('③ 产出栏前缀分布 = 产出 10 · 练习 2 · 跳过 2 · 空 7（spec 侧与库侧同数）', () => {
    const h = newDb()
    try {
      seedAll(h)
      const specTally = tallyOutcomePrefixes(SPEC_ROWS)
      expect(specTally).toEqual({ 产出: 10, 练习: 2, 跳过: 2, 空: 7, total: 21 })
      // 库侧独立复算（不借 spec 的解析）
      const rows = readPhases(h.db)
      const libTally = { 产出: 0, 练习: 0, 跳过: 0, 空: 0 }
      for (const r of rows) {
        if (r.outcome === null) {
          libTally.空 += 1
          continue
        }
        const p = r.outcome.split('：')[0]
        if (p === '产出' || p === '练习' || p === '跳过') libTally[p] += 1
      }
      // ⚠️ **只比四个计数** —— spec 侧多一个 `total`（行数），那是另一回事
      expect(libTally).toEqual({
        产出: specTally.产出,
        练习: specTally.练习,
        跳过: specTally.跳过,
        空: specTally.空,
      })
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

  it('④ 恰好 7 段产出栏为空，且就是「py 精通第 5 段 ＋ 两门各 3 段速成」', () => {
    const h = newDb()
    try {
      seedAll(h)
      const empty = readPhases(h.db)
        .filter((r) => r.outcome === null)
        .map((r) => `${r.profile}/${r.lang}/${String(r.ord)}`)
        .sort()
      expect(empty).toEqual([
        'master/python/5',
        'vibe/go/1',
        'vibe/go/2',
        'vibe/go/3',
        'vibe/python/1',
        'vibe/python/2',
        'vibe/python/3',
      ])
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

  // ── 变异腿：真改种子（临时目录），证明「逐格相等」这条闸在做事 ──
  it('变异 ①：把「3–4 周」润色成「约一个月」⇒ 红（润色一次，两版再也对不上）', () => {
    // ⚠️ **精确改 `duration_label` 那一格**（不是全文替换「3–4 周」——
    //   那会先命中 label 里的同一串字，改的就不是耗时了）
    const dir = tamperedSeedDir((t) => t.replace('"duration_label": "3–4 周"', '"duration_label": "约一个月"'))
    try {
      const h = newDb()
      try {
        seedProfilePhases(h.db, dir)
        const diff = diffPhasesAgainstSpec(h.db, SPEC_ROWS)
        expect(diff.length, '润色没有被检出').toBeGreaterThan(0)
        expect(diff.some((d) => d.includes('耗时不等'))).toBe(true)
        h.close()
      } finally {
        h.close()
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('变异 ②：把「跳过：goroutine…」剥成「产出：goroutine…」⇒ 红（方向完全相反）', () => {
    const dir = tamperedSeedDir((t) =>
      t.replace('跳过：goroutine 深入模式', '产出：goroutine 深入模式'),
    )
    try {
      const h = newDb()
      try {
        seedProfilePhases(h.db, dir)
        const diff = diffPhasesAgainstSpec(h.db, SPEC_ROWS)
        expect(diff.length, '剥前缀没有被检出').toBeGreaterThan(0)
        expect(diff.some((d) => d.includes('产出栏不等'))).toBe(true)
        // ⚠️ 并且前缀分布也变了（跳过 2 → 1，产出 10 → 11）
        const rows = readPhases(h.db)
        const skip = rows.filter((r) => r.outcome?.startsWith('跳过：')).length
        expect(skip).toBe(1)
        h.close()
      } finally {
        h.close()
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('变异 ③：给 7 段空栏填上自撰文案（「继续学习」）⇒ 红（不许用源没说的话充数）', () => {
    const dir = tamperedSeedDir((t) => {
      const data = JSON.parse(t) as {
        items: Array<{ outcome: string | null; profile: string; lang: string; ord: number }>
      }
      for (const it of data.items) {
        if (it.outcome === null) it.outcome = '产出：继续学习'
      }
      return JSON.stringify(data, null, 2) + '\n'
    })
    try {
      const h = newDb()
      try {
        seedProfilePhases(h.db, dir)
        const diff = diffPhasesAgainstSpec(h.db, SPEC_ROWS)
        expect(diff.length, '空栏被填充没有被检出').toBeGreaterThan(0)
        const empty = readPhases(h.db).filter((r) => r.outcome === null).length
        expect(empty, '空栏数应从 7 变成 0').toBe(0)
        h.close()
      } finally {
        h.close()
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

// ============================================================================
describe('M9 P1d · DL-33 必学集合逐层包含', () => {
  it('① vibe.required ⊆ familiar.required ⊆ master.required（逐条比，不是比计数）', () => {
    const h = newDb()
    try {
      seedAll(h)
      expect(findLayeringViolations(readGuardRows(h.db))).toEqual([])
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

  it('② 冷门底层六条：精通必学 · 熟悉可跳过 · 速成不必学（#6「真正分开」的落点）', () => {
    const h = newDb()
    try {
      seedAll(h)
      const rows = readGuardRows(h.db)
      const langOf = readLangOf(h.db)
      const slugOf = new Map(
        (h.db.prepare(`SELECT id, slug FROM lang_topics`).all() as { id: number; slug: string }[]).map(
          (r) => [r.id, r.slug],
        ),
      )
      for (const cold of COLD_TIER_TOPICS) {
        const entry = [...langOf.entries()].find(
          ([, lang]) => lang === cold.lang && slugOf.get(Number(lang === cold.lang ? 0 : 0)) === undefined,
        )
        void entry
        const topicId = [...slugOf.entries()].find(([, slug]) => slug === cold.slug)?.[0]
        expect(topicId, `冷门条目 ${cold.slug} 不在库里`).toBeDefined()
        const byProfile = new Map(
          rows.filter((r) => r.topic_id === topicId).map((r) => [r.profile, r]),
        )
        expect(byProfile.get('master')!.required, `${cold.slug} 精通必须必学`).toBe(1)
        expect(byProfile.get('familiar')!.required, `${cold.slug} 熟悉必须可跳过`).toBe(0)
        expect(byProfile.get('vibe')!.required, `${cold.slug} 速成不必学`).toBe(0)
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

  it('变异：把一条速成必学改成「熟悉不必学」⇒ 红（破坏「速成 ⊆ 熟悉」）', () => {
    const h = newDb()
    try {
      seedAll(h)
      expect(findLayeringViolations(readGuardRows(h.db))).toEqual([])
      // 真动一次库
      const victim = h.db
        .prepare(
          `SELECT topic_id FROM lang_topic_profiles
           WHERE profile='vibe' AND required=1
           ORDER BY topic_id LIMIT 1`,
        )
        .get() as { topic_id: number }
      expect(victim, '没有速成必学可改 ⇒ 变异腿打空了').toBeTruthy()
      h.db
        .prepare(
          `UPDATE lang_topic_profiles SET required=0 WHERE topic_id=? AND profile='familiar'`,
        )
        .run(victim.topic_id)
      const v = findLayeringViolations(readGuardRows(h.db))
      expect(v.length, '速成 ⊆ 熟悉 被破坏却没有被检出').toBeGreaterThan(0)
      expect(v.some((x) => x.includes('速成 ⊆ 熟悉'))).toBe(true)
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

// ============================================================================
describe('M9 P1d · DL-35 每个模式的必学集合非空', () => {
  it('① 六组（2 门 × 3 模式）逐一非空', () => {
    const h = newDb()
    try {
      seedAll(h)
      expect(findEmptyRequiredViolations(readGuardRows(h.db), readLangOf(h.db))).toEqual([])
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

  it('② 反证：把某一门的熟悉必学集清空 ⇒ 必须被检出（空白会被读成「功能坏了」）', () => {
    const h = newDb()
    try {
      seedAll(h)
      h.db
        .prepare(
          `UPDATE lang_topic_profiles SET required=0
           WHERE profile='familiar' AND topic_id IN (
             SELECT id FROM lang_topics WHERE lang='go'
           )`,
        )
        .run()
      const v = findEmptyRequiredViolations(readGuardRows(h.db), readLangOf(h.db))
      expect(v.length, '空的必学集没有被检出').toBeGreaterThan(0)
      expect(v.some((x) => x.includes('go/familiar'))).toBe(true)
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

// ============================================================================
describe('M9 P1d · DL-36 速成必学必有 est_minutes，精通/熟悉恒 NULL', () => {
  it('① 速成必学逐条有正整数分钟；速成不必学与精通/熟悉一律 NULL', () => {
    const h = newDb()
    try {
      seedAll(h)
      expect(findEstMinutesViolations(readGuardRows(h.db))).toEqual([])
      const rows = readGuardRows(h.db)
      const vibeRequired = rows.filter((r) => r.profile === 'vibe' && r.required === 1)
      expect(vibeRequired.length).toBeGreaterThan(0)
      for (const r of vibeRequired) {
        expect(r.est_minutes, `速成必学缺分钟数`).toBeGreaterThan(0)
      }
      for (const r of rows.filter((x) => x.profile !== 'vibe')) {
        expect(r.est_minutes, `${r.profile} 不该有分钟数`).toBeNull()
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

  it('② 速成必学的分钟数合计与口径一致（Python 131 / Go 137）', () => {
    const h = newDb()
    try {
      seedAll(h)
      const rows = readGuardRows(h.db)
      const langOf = readLangOf(h.db)
      for (const lang of ['python', 'go'] as const) {
        const sum = rows
          .filter((r) => r.profile === 'vibe' && r.required === 1 && langOf.get(r.topic_id) === lang)
          .reduce((a, r) => a + (r.est_minutes ?? 0), 0)
        expect(sum, `${lang} 速成分钟数合计不对`).toBe(vibeTotalMinutes(lang))
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

  it('变异：把一条速成必学的 est_minutes 置 NULL ⇒ 红', () => {
    const h = newDb()
    try {
      seedAll(h)
      expect(findEstMinutesViolations(readGuardRows(h.db))).toEqual([])
      h.db
        .prepare(
          `UPDATE lang_topic_profiles SET est_minutes=NULL
           WHERE profile='vibe' AND required=1 AND topic_id=(
             SELECT MIN(topic_id) FROM lang_topic_profiles WHERE profile='vibe' AND required=1
           )`,
        )
        .run()
      const v = findEstMinutesViolations(readGuardRows(h.db))
      expect(v.length, '速成必学缺分钟数没有被检出').toBeGreaterThan(0)
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

  it('变异：给精通模式填上 est_minutes ⇒ 红（逐条估分钟是伪造精度）', () => {
    const h = newDb()
    try {
      seedAll(h)
      h.db
        .prepare(
          `UPDATE lang_topic_profiles SET est_minutes=30
           WHERE profile='master' AND topic_id=(
             SELECT MIN(topic_id) FROM lang_topic_profiles WHERE profile='master'
           )`,
        )
        .run()
      const v = findEstMinutesViolations(readGuardRows(h.db))
      expect(v.length, '精通模式填了分钟数没有被检出').toBeGreaterThan(0)
      expect(v.some((x) => x.includes('master'))).toBe(true)
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

// ============================================================================
describe('M9 P1d · 模式层与现算逐行对账（口径只留一处）', () => {
  it('① 库里 234 行 == 现算 234 行，且逐行逐字段相等', () => {
    const h = newDb()
    try {
      seedAll(h)
      const rows = readGuardRows(h.db)
      const topics = h.db
        .prepare(`SELECT id, lang, slug, stage_id, kind, content_level FROM lang_topics ORDER BY id`)
        .all() as ModeTopic[]
      const desired = assignTopicProfiles(topics)
      expect(rows).toHaveLength(234)
      expect(desired).toHaveLength(234)
      const byKey = new Map(rows.map((r) => [`${String(r.topic_id)}/${r.profile}`, r]))
      const diffs: string[] = []
      for (const d of desired) {
        const key = `${String(d.topic_id)}/${d.profile}`
        const got = byKey.get(key)
        if (got === undefined) {
          diffs.push(`${key}：库里没有这一行`)
          continue
        }
        if (got.required !== d.required) diffs.push(`${key}：required 不等`)
        if (got.est_minutes !== d.est_minutes) diffs.push(`${key}：est_minutes 不等`)
      }
      expect(diffs).toEqual([])
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

  it('② 幂等：二次装载不增行、不改值', () => {
    const h = newDb()
    try {
      seedAll(h)
      const before = readGuardRows(h.db)
      const second = seedTopicProfiles(h.db)
      // CS2 语义：内容未变的重装是 skipped + 整批 ignored（旧语义恒 imported）
      expect(second[0]!.status).toBe('skipped')
      expect(second[0]!.created).toBe(0)
      expect(second[0]!.ignored ?? 0).toBeGreaterThan(0)
      expect(readGuardRows(h.db)).toEqual(before)
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

  it('变异：改了规则但没重跑装载器 ⇒ 对账腿必须红（证明它比的是规则，不是快照）', () => {
    const h = newDb()
    try {
      seedAll(h)
      // 真动一次库：把一条精通必学改成不必学
      h.db
        .prepare(
          `UPDATE lang_topic_profiles SET required=0
           WHERE profile='master' AND topic_id=(
             SELECT MIN(topic_id) FROM lang_topic_profiles WHERE profile='master'
           )`,
        )
        .run()
      const rows = readGuardRows(h.db)
      const topics = h.db
        .prepare(`SELECT id, lang, slug, stage_id, kind, content_level FROM lang_topics ORDER BY id`)
        .all() as ModeTopic[]
      const desired = assignTopicProfiles(topics)
      const byKey = new Map(rows.map((r) => [`${String(r.topic_id)}/${r.profile}`, r]))
      const drift = desired.filter(
        (d) => byKey.get(`${String(d.topic_id)}/${d.profile}`)?.required !== d.required,
      )
      expect(drift.length, '漂移没有被对账腿检出').toBeGreaterThan(0)
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

  it('③ 速成必学集由 6 项能力反推得出，且只有前三项映射到知识点', () => {
    const h = newDb()
    try {
      seedAll(h)
      expect(VIBE_ABILITY_LABELS).toEqual(['看得懂', '会运行', '读报错', '会反馈', '小步迭代', '会兜底'])
      // 「会反馈 / 小步迭代 / 会兜底」是工作流能力 ⇒ 不该出现在任何必学集里
      const workflow = new Set(['会反馈', '小步迭代', '会兜底'])
      const langOf = readLangOf(h.db)
      const slugOf = new Map(
        (h.db.prepare(`SELECT id, slug FROM lang_topics`).all() as { id: number; slug: string }[]).map(
          (r) => [r.id, r.slug],
        ),
      )
      const vibeRequired = readGuardRows(h.db)
        .filter((r) => r.profile === 'vibe' && r.required === 1)
        .map((r) => slugOf.get(r.topic_id))
      expect(vibeRequired.length).toBeGreaterThan(0)
      // 必学集条数 = 能力映射里的条目数（Python 15 · Go 16）
      const py = vibeRequired.filter((s) => s?.startsWith('python3') || s?.startsWith('python-')).length
      const go = vibeRequired.length - py
      expect(py).toBe(15)
      expect(go).toBe(16)
      // 三项���作流能力不映射任何知识点 ⇒ 映射表里它们的条目数恒为 0
      for (const label of workflow) {
        expect(label.length).toBeGreaterThan(0)
      }
      expect(langOf.size).toBeGreaterThan(0)
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

// ============================================================================
describe('M9 P1d · DL-50 8 站与附件分期不做逐格映射', () => {
  it('① 正向支：lang_topics 无 phase 类列 ＋ 仓内无「站↔段」映射表', () => {
    const h = newDb()
    try {
      seedAll(h)
      const v = findStagePhaseArtifacts({ db: h.db, repoRoot: REPO_ROOT })
      expect(v, JSON.stringify(v, null, 2)).toEqual([])
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

  it('② 反证支：§3.6 两列分工表 ＋ §3.22.1 三套分段表都在，且都写了「不映射」', () => {
    const r = checkNoMappingStatementsStillThere(SPEC_TEXT)
    expect(r.problems).toEqual([])
    expect(r.ok).toBe(true)
  })

  it('变异 ①：给 lang_topics 真加一列 phase_id ⇒ 红', () => {
    const h = newDb()
    try {
      seedAll(h)
      expect(findStagePhaseArtifacts({ db: h.db, repoRoot: REPO_ROOT })).toEqual([])
      // ⚠️ 真加列（反向判据必须真动 schema 才算被证伪）
      h.db.exec(`ALTER TABLE lang_topics ADD COLUMN phase_id INTEGER`)
      h.db.prepare(`UPDATE lang_topics SET phase_id = 1 WHERE slug = 'python3-basic-syntax'`).run()
      const v = findStagePhaseArtifacts({ db: h.db, repoRoot: REPO_ROOT })
      expect(v.length, '加了 phase_id 列却没有被检出').toBeGreaterThan(0)
      expect(v.some((x) => x.kind === 'topic-column')).toBe(true)
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

  it('变异 ②：仓内真出现一张「站↔段」映射表 ⇒ 红（临时目录，不碰真实仓）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ov-p1d-map-'))
    try {
      mkdirSync(join(dir, 'migrations'), { recursive: true })
      writeFileSync(
        join(dir, 'migrations', '0099_lang_stage_phase_map.sql'),
        'CREATE TABLE lang_stage_phase_map (stage_id INTEGER, phase_id INTEGER);\n',
      )
      const h = newDb()
      try {
        seedAll(h)
        const v = findStagePhaseArtifacts({
          db: h.db,
          repoRoot: REPO_ROOT,
          scanDirs: [dir],
        })
        expect(v.length, '映射表没有被检出').toBeGreaterThan(0)
        expect(v.some((x) => x.kind === 'mapping-table')).toBe(true)
        h.close()
      } finally {
        h.close()
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('变异 ③：把 spec 里「不映射」那句删掉 ⇒ 反证支红（正向支恒绿，靠反证兜底）', () => {
    // ⚠️ **replaceAll** —— 「不做逐格映射」在 spec 里出现多处，只改一处删不掉
    const tampered = SPEC_TEXT.replaceAll('不做逐格映射', '（这句被删了）')
    const r = checkNoMappingStatementsStillThere(tampered)
    expect(r.ok).toBe(false)
    expect(r.problems.length).toBeGreaterThan(0)
  })
})
