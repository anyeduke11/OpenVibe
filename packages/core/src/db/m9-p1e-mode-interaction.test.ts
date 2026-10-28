// `packages/core/src/db/m9-p1e-mode-interaction.test.ts` —— M9 v1.6 **P1e 出口**（计算层）
// （`m9-dev-plan-2026-10.md` §6.6 ＋ `m9-dev-language-roadmap.md` §3.18 / §3.20 · **DL-37 / DL-39**）
//
// ## 它断四条判据
//
// | 判据 | 一句话 | 本文件里对应的那支 |
// |---|---|---|
// | **DL-37** | 转档起始站 == 「已点亮速成必学 → 精通站位」的逐条映射结果 | 「DL-37」组 |
// | **DL-39** | 资源的模式标记 == 「必学集合反查」的结果 | 「DL-39」组 |
// | **§3.18 第 2 条** | 映射是查表，不是维护（不建对照表） | 「查表不是维护」组 |
// | **§3.20 第 3 条** | 反查口径只留一处 | 「口径只留一处」组 |
//
// ## ⚠️ 每条判据都配一条**真动数据 / 真改代码**的变异腿
//
//   反向判据（"不得存在 X"）天然没有正向痕迹：多一张对照表、谓词多写一遍，
//   代码照常编译、测试照常过 ⇒ 只有专门那条检查会红。
//
// ⚠️ **变异一律在临时目录 / 临时库里做** —— 真实证据目录与真实种子文件里放人造内容是错的：
//   那里放的东西会被将来的读者当成实测。
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { newDb } from '../test-support/new-db'
import { seedLangTopics } from './m9-p1-seed-lang-topics'
import { seedLangResourceLayer } from './m9-p1b-seed-resources'
import { seedProfilePhases, seedTopicProfiles } from './m9-p1d-seed-profiles'
import {
  computeTransferPlan,
  isRequiredIn,
  requiredTopicIds,
  resourceModeLabel,
  RESOURCE_MODE_LABELS,
  type LangProfile,
  type TopicProfileLite,
  type TopicStageLite,
  type TransferMappingEntry,
} from '@openvibe/shared'
import {
  countCodeOccurrences,
  findHardcodedSlugLiterals,
  findTransferPlanViolations,
} from '@openvibe/shared'

const SEEDS_DIR = fileURLToPath(new URL('./seeds', import.meta.url))
/** 计算层的源码（守卫要扫的是**它**，不是测试文件） */
const CALC_SRC_FILE = fileURLToPath(
  new URL('../../../shared/src/m9-mode-interaction.ts', import.meta.url),
)

type Db = Parameters<typeof seedTopicProfiles>[0]

interface TopicRow {
  id: number
  lang: 'python' | 'go'
  slug: string
  stage_id: number
  kind: 'language' | 'library'
}

interface ProfileRow {
  topic_id: number
  profile: LangProfile
  required: 0 | 1
  rank: number
  est_minutes: number | null
}

interface ResourceRow {
  id: number
  name: string
}

function seedAll(h: { db: Db }): void {
  seedLangTopics(h.db, SEEDS_DIR)
  seedLangResourceLayer(h.db, SEEDS_DIR)
  seedProfilePhases(h.db, SEEDS_DIR)
  seedTopicProfiles(h.db)
}

function readTopics(db: Db): TopicRow[] {
  return db.prepare(`SELECT id, lang, slug, stage_id, kind FROM lang_topics`).all() as TopicRow[]
}

function readProfiles(db: Db): ProfileRow[] {
  return db
    .prepare(`SELECT topic_id, profile, required, rank, est_minutes FROM lang_topic_profiles`)
    .all() as ProfileRow[]
}

function readResources(db: Db): ResourceRow[] {
  return db.prepare(`SELECT id, name FROM lang_resources`).all() as ResourceRow[]
}

/** 某条资源挂接了哪些知识点（反查方向：`lang_topic_resources` 只有「知识点 → 资源」一个方向） */
function readAttachedTopicIds(db: Db, resourceId: number): number[] {
  return (
    db
      .prepare(`SELECT topic_id FROM lang_topic_resources WHERE resource_id = ?`)
      .all(resourceId) as { topic_id: number }[]
  ).map((r) => r.topic_id)
}

/**
 * **独立复算**：某门语言下「速成必学」逐条的站位（直查 SQL，不借实现）。
 *
 * ⚠️ **必须与实现走不同的路** —— 实现是「读行 → 在 JS 里算」，这里是「让 SQL 算」。
 *   两者同源的话，实现错了 oracle 也跟着错，这条判据就成了摆设。
 */
function oracleVibeMapping(db: Db, lang: 'python' | 'go'): TransferMappingEntry[] {
  const rows = db
    .prepare(
      `SELECT t.id AS topic_id, t.slug, t.stage_id
         FROM lang_topics t
         JOIN lang_topic_profiles p ON p.topic_id = t.id
        WHERE p.profile = 'vibe' AND p.required = 1
          AND t.lang = ? AND t.kind = 'language'
        ORDER BY t.stage_id, t.id`,
    )
    .all(lang) as { topic_id: number; slug: string; stage_id: number }[]
  return rows.map((r) => ({ topicId: r.topic_id, slug: r.slug, stationNo: r.stage_id + 1 }))
}

/** 独立复算：该语言的站总数（distinct stage_id，只数语言级） */
function oracleStationCount(db: Db, lang: 'python' | 'go'): number {
  const r = db
    .prepare(
      `SELECT COUNT(DISTINCT stage_id) AS n FROM lang_topics WHERE lang = ? AND kind = 'language'`,
    )
    .get(lang) as { n: number }
  return r.n
}

/** 独立复算：某条资源在本模式下是不是「本模式必学」（直查 SQL） */
function oracleResourceIsRequired(db: Db, resourceId: number, profile: LangProfile): boolean {
  const r = db
    .prepare(
      `SELECT COUNT(*) AS n
         FROM lang_topic_resources tr
         JOIN lang_topic_profiles p ON p.topic_id = tr.topic_id
        WHERE tr.resource_id = ? AND p.profile = ? AND p.required = 1`,
    )
    .get(resourceId, profile) as { n: number }
  return r.n > 0
}

describe('M9 P1e · DL-37 转档映射（§3.18）', () => {
  it('① Python：映射与「已点亮速成必学 → 精通站位」逐条相等（集合相等，不是计数相等）', () => {
    const h = newDb()
    try {
      seedAll(h)
      const topics = readTopics(h.db)
      const profiles = readProfiles(h.db)
      // 自证：这一门真的有速成必学，否则下面只是查了个空集合
      const expected = oracleVibeMapping(h.db, 'python')
      expect(expected.length).toBe(15)

      const plan = computeTransferPlan({
        profile: 'vibe',
        lang: 'python',
        litTopicIds: new Set(expected.map((e) => e.topicId)),
        topics,
        profiles,
      })
      expect(findTransferPlanViolations(plan, expected)).toEqual([])
      expect(plan.litRequiredCount).toBe(15)
    } finally {
      h.close()
    }
  })

  it('② Go：同上；且站总数按语言实测（Python 8 站 / Go 6 站）', () => {
    const h = newDb()
    try {
      seedAll(h)
      const topics = readTopics(h.db)
      const profiles = readProfiles(h.db)
      const expected = oracleVibeMapping(h.db, 'go')
      expect(expected.length).toBe(16)

      const plan = computeTransferPlan({
        profile: 'vibe',
        lang: 'go',
        litTopicIds: new Set(expected.map((e) => e.topicId)),
        topics,
        profiles,
      })
      expect(findTransferPlanViolations(plan, expected)).toEqual([])
      expect(plan.totalStations).toBe(6)
      expect(oracleStationCount(h.db, 'go')).toBe(6)

      const py = computeTransferPlan({
        profile: 'vibe',
        lang: 'python',
        litTopicIds: new Set(),
        topics,
        profiles,
      })
      expect(py.totalStations).toBe(8)
      expect(oracleStationCount(h.db, 'python')).toBe(8)
    } finally {
      h.close()
    }
  })

  it('③ 点亮了**非必学**的条目 ⇒ 不得混进映射（转档只认「已点亮的速成必学」）', () => {
    const h = newDb()
    try {
      seedAll(h)
      const topics = readTopics(h.db)
      const profiles = readProfiles(h.db)
      const expected = oracleVibeMapping(h.db, 'python')

      // 把该门**所有**语言级知识点都点亮了（远超必学集）
      const allLit = new Set(
        topics.filter((t) => t.lang === 'python' && t.kind === 'language').map((t) => t.id),
      )
      expect(allLit.size).toBeGreaterThan(expected.length)

      const plan = computeTransferPlan({
        profile: 'vibe',
        lang: 'python',
        litTopicIds: allLit,
        topics,
        profiles,
      })
      expect(findTransferPlanViolations(plan, expected)).toEqual([])
      expect(plan.mapping).toHaveLength(expected.length)
    } finally {
      h.close()
    }
  })

  it('④ 一条都没点亮 ⇒ 站区间为 null、还剩 = 总站数（不许空白、不许 0）', () => {
    const h = newDb()
    try {
      seedAll(h)
      const plan = computeTransferPlan({
        profile: 'vibe',
        lang: 'python',
        litTopicIds: new Set(),
        topics: readTopics(h.db),
        profiles: readProfiles(h.db),
      })
      expect(plan.litRequiredCount).toBe(0)
      expect(plan.stationFrom).toBeNull()
      expect(plan.stationTo).toBeNull()
      expect(plan.mapping).toEqual([])
      expect(plan.remainingStations).toBe(8)
      expect(plan.remainingStations).toBeGreaterThan(0)
    } finally {
      h.close()
    }
  })

  it('⑤ 变异腿：抽掉任意一条映射 ⇒ 闸必报违规（逐条抽，不许只试一条）', () => {
    const h = newDb()
    try {
      seedAll(h)
      const topics = readTopics(h.db)
      const profiles = readProfiles(h.db)
      const expected = oracleVibeMapping(h.db, 'python')
      const plan = computeTransferPlan({
        profile: 'vibe',
        lang: 'python',
        litTopicIds: new Set(expected.map((e) => e.topicId)),
        topics,
        profiles,
      })
      expect(findTransferPlanViolations(plan, expected)).toEqual([])

      // ⚠️ **逐条抽**：DL-37 的原话是「抽掉**任意**一条映射 ⇒ 红」。
      //   只抽第一条的话，一条实现只丢「中间某条」的 bug 就溜过去了。
      expect(plan.mapping.length).toBeGreaterThan(1)
      for (const victim of plan.mapping) {
        const broken = { ...plan, mapping: plan.mapping.filter((m) => m !== victim) }
        expect(
          findTransferPlanViolations(broken, expected).length,
          `抽掉 ${victim.slug} 这条映射后闸没有报违规 —— 闸是摆设`,
        ).toBeGreaterThan(0)
      }
    } finally {
      h.close()
    }
  })
})

describe('M9 P1e · DL-39 资源模式标记（§3.20）', () => {
  it('① 只有两档：文案常量恰两条，且实现只会返回这两条', () => {
    expect(RESOURCE_MODE_LABELS).toEqual(['本模式必学', '仅扩展阅读'])
    expect(RESOURCE_MODE_LABELS).toHaveLength(2)
    // ⚠️ **反证腿**：不存在「熟悉用」这第三档（§3.20 第 2 条）
    expect(RESOURCE_MODE_LABELS).not.toContain('熟悉用')
  })

  it('② 库里每条资源的标记 == 独立 SQL 复算（89 条逐条）', () => {
    const h = newDb()
    try {
      seedAll(h)
      const profiles = readProfiles(h.db)
      const resources = readResources(h.db)
      expect(resources).toHaveLength(89)

      let required = 0
      let extension = 0
      for (const r of resources) {
        const topicIds = readAttachedTopicIds(h.db, r.id)
        const label = resourceModeLabel('master', topicIds, profiles)
        const oracle = oracleResourceIsRequired(h.db, r.id, 'master')
        expect(label, `资源「${r.name}」的标记与反查结果不符`).toBe(
          oracle ? '本模式必学' : '仅扩展阅读',
        )
        if (label === '本模式必学') required += 1
        else extension += 1
      }
      // ⚠️ **自证**：两档都得有实例，否则这 89 条只验了一档
      expect(required).toBe(28)
      expect(extension).toBe(61)
    } finally {
      h.close()
    }
  })

  it('③ 变异腿（真动数据）：清空某条资源的挂接 ⇒ 标记必须翻成「仅扩展阅读」并判红', () => {
    const h = newDb()
    try {
      seedAll(h)
      const profiles = readProfiles(h.db)
      const resources = readResources(h.db)

      // 先挑一条在 master 下是「本模式必学」的资源
      const victim = resources.find((r) => oracleResourceIsRequired(h.db, r.id, 'master'))
      expect(victim, '库里没有「本模式必学」的资源 ⇒ 变异腿打空了').toBeTruthy()
      const topicIds = readAttachedTopicIds(h.db, victim!.id)
      expect(resourceModeLabel('master', topicIds, profiles)).toBe('本模式必学')

      // ⚠️ **真动数据**：在临时库里把它的挂接清空
      h.db.prepare(`DELETE FROM lang_topic_resources WHERE resource_id = ?`).run(victim!.id)
      const after = readAttachedTopicIds(h.db, victim!.id)
      expect(after).toEqual([])
      expect(resourceModeLabel('master', after, profiles)).toBe('仅扩展阅读')

      // 闸：拿**变更前**的期望去对**变更后**的结果 ⇒ 必报违规
      expect(
        findResourceLabelViolations(h.db, 'master', { [victim!.id]: '本模式必学' }),
      ).not.toEqual([])
    } finally {
      h.close()
    }
  })

  it('④ 标记随模式切换即时重算（同一批挂接，两种模式给出不同结果，不需刷新）', () => {
    const h = newDb()
    try {
      seedAll(h)
      const profiles = readProfiles(h.db)
      const resources = readResources(h.db)

      // 自证：确实存在「在速成下是扩展、在精通下是必学」的资源
      let flipped = 0
      for (const r of resources) {
        const topicIds = readAttachedTopicIds(h.db, r.id)
        const vibe = resourceModeLabel('vibe', topicIds, profiles)
        const master = resourceModeLabel('master', topicIds, profiles)
        expect(oracleResourceIsRequired(h.db, r.id, 'vibe') ? '本模式必学' : '仅扩展阅读').toBe(
          vibe,
        )
        expect(oracleResourceIsRequired(h.db, r.id, 'master') ? '本模式必学' : '仅扩展阅读').toBe(
          master,
        )
        if (vibe !== master) flipped += 1
      }
      expect(flipped).toBeGreaterThan(0)
    } finally {
      h.close()
    }
  })
})

describe('M9 P1e · §3.18 第 2 条 · 映射是查表，不是维护', () => {
  it('① 计算层源码里零硬编码 slug（不建「速成 → 精通」对照表）', () => {
    const src = readFileSync(CALC_SRC_FILE, 'utf8')
    const slugs = new Set(readAllSlugs())
    expect(slugs.size).toBeGreaterThan(0)
    expect(findHardcodedSlugLiterals(src, slugs)).toEqual([])
  })

  it('② 变异腿（真改代码）：往源码副本里塞一条硬编码 slug ⇒ 闸必报', () => {
    const src = readFileSync(CALC_SRC_FILE, 'utf8')
    const slugs = new Set(readAllSlugs())
    const victim = [...slugs][0]!
    const mutated = `${src}\nconst MANUAL_MAP = { '${victim}': 1 }\n`
    expect(findHardcodedSlugLiterals(mutated, slugs)).toContain(victim)
  })
})

describe('M9 P1e · §3.20 第 3 条 · 反查口径只留一处', () => {
  it('① 计算层源码里「required === 1」只出现一次（注释里那句不算）', () => {
    const src = readFileSync(CALC_SRC_FILE, 'utf8')
    expect(countCodeOccurrences(src, 'required === 1')).toBe(1)
  })

  it('② 变异腿：再写一遍判定式 ⇒ 计数变 2，闸必须红', () => {
    const src = readFileSync(CALC_SRC_FILE, 'utf8')
    const mutated = `${src}\nconst again = (r: TopicProfileLite) => r.profile === 'vibe' && r.required === 1\n`
    expect(countCodeOccurrences(src, 'required === 1')).toBe(1)
    expect(countCodeOccurrences(mutated, 'required === 1')).toBe(2)
  })

  it('③ 两个反查入口必须逐行等价（isRequiredIn ≡ requiredTopicIds）', () => {
    const h = newDb()
    try {
      seedAll(h)
      const profiles = readProfiles(h.db)
      for (const profile of ['master', 'familiar', 'vibe'] as LangProfile[]) {
        const set = requiredTopicIds(profile, profiles)
        for (const row of profiles) {
          // ⚠️ **只取本模式的行** —— 主键是 (topic_id, profile) 复合键，
          //   一个知识点在三个模式下各有一行，拿别的模式的行去比就是拿错对象。
          if (row.profile !== profile) continue
          expect(isRequiredIn(profile, row.topic_id, profiles)).toBe(row.required === 1)
          expect(set.has(row.topic_id)).toBe(row.required === 1)
        }
      }
    } finally {
      h.close()
    }
  })
})

// ---------------------------------------------------------------------------
// 本文件内部的小工具
// ---------------------------------------------------------------------------

/** 库里真实存在的知识点 slug 全集（守卫的判据取自真实数据，不靠人眼扫） */
function readAllSlugs(): string[] {
  const h = newDb()
  try {
    seedAll(h)
    return (h.db.prepare(`SELECT slug FROM lang_topics`).all() as { slug: string }[]).map(
      (r) => r.slug,
    )
  } finally {
    h.close()
  }
}

/**
 * DL-39 的闸：某资源在某模式下的标记，是否等于「必学集合反查」的结果。
 *
 * @param expected 期望标记（键为 resource_id）
 */
function findResourceLabelViolations(
  db: Db,
  profile: LangProfile,
  expected: Record<number, '本模式必学' | '仅扩展阅读'>,
): string[] {
  const out: string[] = []
  const profiles = readProfiles(db)
  for (const [idStr, want] of Object.entries(expected)) {
    const id = Number(idStr)
    const topicIds = readAttachedTopicIds(db, id)
    const got = resourceModeLabel(profile, topicIds, profiles)
    if (got !== want) out.push(`资源 ${id} 的标记是「${got}」，期望「${want}」`)
  }
  return out
}

/** 让 `TopicProfileLite` 类型在变异腿里被引用（避免 unused 警告掩盖真实问题） */
export type { TopicProfileLite, TopicStageLite }
