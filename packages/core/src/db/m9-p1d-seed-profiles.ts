// `packages/core/src/db/m9-p1d-seed-profiles.ts` —— M9 v1.6 **P1d · 三模式层的两个装载器**
// （`m9-dev-plan-2026-10.md` §6.5 ＋ `m9-dev-language-roadmap.md` §3.17 / §3.17.1）
//
// ⚠️ **两张表的来源完全不同，装载方式也必须不同**：
//
// | 表 | 行的来源 | 装载方式 |
// |---|---|---|
// | `lang_profile_phases` | **逐字照抄附件**（21 段 · §3.17.1 那张对照表） | 读种子 JSON 导入（`lang_profile_phases.json`） |
// | `lang_topic_profiles` | **由代码现算**（三模式的必学集/深度/顺序） | 调 `assignTopicProfiles()` 现算后落库 |
//
// ⚠️ **为什么 `lang_topic_profiles` 不落种子 JSON**（本轮踩过的坑，写在这里免得下一个人又补一份）：
//   ① **自然键不是 `topic_id`** —— `topic_id` 是 `lang_topics` 的自增行号，
//      **换个库（迁移顺序/插入顺序不同）它就不是同一个数** ⇒ 快照文件在别的库上是错的；
//      它的自然键是 `(lang, slug, profile)`，而 `lang_topics` 里没有 `(lang, slug)` 唯一约束
//      可以让快照脱离行号（要加就是 schema 契约改动）。
//   ② **口径只留一处** —— 必学集/深度/顺序的规则在 `m9-p1d-mode-assign.ts`；
//      再存一份物化快照就是**第二份事实**，迟早与规则分叉。
//   ⇒ 于是：**现算落库 ＋ 单测再算一遍逐行对账**（`m9-p1d-mode-profiles.test.ts`）。
//      「改了规则但没重跑装载器」这条漂移由对账那条腿抓住（它比的是规则，不是快照）。
//
// ⚠️ **与既有 seed 的同款纪律**：
//   1. 单条非法 ⇒ 计入 `warnings`，**不抛**（不阻塞其他条目）。
//   2. 幂等：重复装载不增行、不改值。
//   3. `updated_at` 取固定值（不取当前时间）—— 内容不变则时间戳也不变。
//   4. 登记到 `seed_registry`（contentHash 只作诊断用途）。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sha256Hex } from '../repos/util'
import { nowIso } from './runner'
import type { SqliteDatabase } from './index'
import { seedRegistryUpsert } from './seed-registry'
import { mergeSeedRow, type SeedMergeSpec } from './seed-merge'

/** CS2 第二段：lang_profile_phases 的行级三态合并规格（键 UNIQUE(profile,lang,ord)，0013 背书） */
export const PROFILE_PHASES_MERGE_SPEC: SeedMergeSpec = {
  table: 'lang_profile_phases',
  keyColumns: ['profile', 'lang', 'ord'],
  contentColumns: ['label', 'title', 'duration_label', 'points', 'outcome'],
}
/** CS2 第二段：lang_topic_profiles 的行级三态合并规格（键 ON CONFLICT(topic_id, profile)） */
export const TOPIC_PROFILES_MERGE_SPEC: SeedMergeSpec = {
  table: 'lang_topic_profiles',
  keyColumns: ['topic_id', 'profile'],
  contentColumns: ['depth', 'required', 'rank', 'est_minutes'],
}
import {
  assignTopicProfiles,
  type LangProfile,
  type ModeTopic,
  type TopicProfileRow,
} from './m9-p1d-mode-assign'

export interface M9ProfileSeedResult {
  bundle: string
  status: 'skipped' | 'imported' | 'error'
  created: number
  updated: number
  /** CS2 三态合并的可见计数：未改过/用户改过而未覆盖的行数（第二段起） */
  ignored?: number
  userModified?: number
  warnings: string[]
}

/** §3.17 的模式枚举（全局枚举，不逐条存表）。 */
const PROFILES = new Set<string>(['master', 'familiar', 'vibe'])
/** §3.1 的 lang 闭集。 */
const LANGS = new Set<string>(['python', 'go'])
/** §3.17 的 depth 闭集。 */
const DEPTHS = new Set<string>(['headline', 'concept', 'full'])

interface PhaseSeedItem {
  profile: string
  lang: string
  ord: number
  label: string
  title: string
  duration_label: string
  points: string[]
  outcome: string | null
}

interface PhaseSeed {
  schemaVersion: number
  collected_at: string
  items: PhaseSeedItem[]
}

// ============================================================================
// ① lang_profile_phases —— 21 段照抄附件
// ============================================================================

/**
 * 把附件分期路线的 21 段幂等并入 `lang_profile_phases`。
 *
 * ⚠️ **产出栏整串入库，一个前缀都不许剥**（§3.17.1 第 4 条 · DL-49）：
 *   「产出」＝可交付物 · 「练习」＝动作要求 · 「跳过」＝**本段明确不学什么**。
 *   三者若归一，界面会把「本段不学并发」显示成「本段产出并发模式」—— 方向完全相反。
 *
 * ⚠️ **7 段没有产出栏 ⇒ 显式写 NULL**（§3.17.1 第 5 条）：
 *   不许用「继续学习」「长期积累」这类自撰文案充数 —— 那是把附件没有的东西
 *   以附件的口吻说出来。装载器**不替它填**，缺就是缺。
 *
 * @returns 一条结果（21 段成一条 bundle 记录）。
 */
export function seedProfilePhases(db: SqliteDatabase, seedDir: string): M9ProfileSeedResult[] {
  const result: M9ProfileSeedResult = {
    bundle: 'lang_profile_phases',
    status: 'skipped',
    created: 0,
    updated: 0,
    warnings: [],
  }
  let raw: string
  let parsed: PhaseSeed
  try {
    raw = readFileSync(join(seedDir, 'lang_profile_phases.json'), 'utf8')
    parsed = JSON.parse(raw) as PhaseSeed
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.items)) {
      throw new Error('bundle 结构非法（期望 {schemaVersion:1, items:[]}）')
    }
  } catch (err) {
    result.status = 'error'
    result.warnings.push(`种子文件读取失败: lang_profile_phases.json — ${String(err)}`)
    return [result]
  }

  const runOne = db.transaction((it: PhaseSeedItem): string => {
    // CS2 第二段：三态合并取代无条件覆盖（用户手改过的段 reseed 不再被冲掉）
    return mergeSeedRow(db, PROFILE_PHASES_MERGE_SPEC, {
      profile: it.profile,
      lang: it.lang,
      ord: it.ord,
      label: it.label,
      title: it.title,
      duration_label: it.duration_label,
      // ⚠️ `points` 是 JSON 数组文本（SQLite 没有数组类型）；CHECK json_valid 兜住
      points: JSON.stringify(it.points ?? []),
      outcome: it.outcome ?? null,
    })
  })

  for (const it of parsed.items) {
    if (!PROFILES.has(it.profile)) {
      result.warnings.push(`profile 越界: ${it.profile} (${it.lang}/${it.ord})`)
      continue
    }
    if (!LANGS.has(it.lang)) {
      result.warnings.push(`lang 越界: ${it.lang} (${it.profile}/${it.ord})`)
      continue
    }
    if (typeof it.ord !== 'number' || !Number.isInteger(it.ord) || it.ord < 1) {
      result.warnings.push(`ord 越界（须为 ≥1 的整数）: ${String(it.ord)}`)
      continue
    }
    if (!it.label || !it.title || !it.duration_label) {
      result.warnings.push(`label/title/duration_label 有空: ${it.profile}/${it.lang}/${it.ord}`)
      continue
    }
    if (!Array.isArray(it.points)) {
      result.warnings.push(`points 不是数组: ${it.profile}/${it.lang}/${it.ord}`)
      continue
    }
    // ⚠️ `outcome` 可空，但**只能是字符串或 null** —— 不接受「空串当空」
    if (it.outcome !== null && typeof it.outcome !== 'string') {
      result.warnings.push(`outcome 既不是字符串也不是 null: ${it.profile}/${it.lang}/${it.ord}`)
      continue
    }
    try {
      const r = runOne(it)
      if (r === 'created') result.created += 1
      else if (r === 'updated') result.updated += 1
      else {
        result.ignored = (result.ignored ?? 0) + 1
        if (r === 'user-modified') result.userModified = (result.userModified ?? 0) + 1
      }
    } catch (err) {
      result.warnings.push(`单条 INSERT 失败: ${it.profile}/${it.lang}/${it.ord} — ${String(err)}`)
    }
  }
  result.status = result.created + result.updated > 0 ? 'imported' : 'skipped'
  seedRegistryUpsert(db, 'lang_profile_phases', sha256Hex(raw), nowIso())
  return [result]
}

// ============================================================================
// ② lang_topic_profiles —— 234 行现算
// ============================================================================

/** 读库里全部知识点（模式层要按 lang 分组排序）。 */
function readModeTopics(db: SqliteDatabase): ModeTopic[] {
  const rows = db
    .prepare(
      `SELECT id, lang, slug, stage_id, kind, content_level
       FROM lang_topics
       ORDER BY id`,
    )
    .all() as ModeTopic[]
  return rows
}

/**
 * 把三模式的「知识点 × 模式」那一份**现算**并落进 `lang_topic_profiles`。
 *
 * ⚠️ **现算，不是导入**：口径在 `m9-p1d-mode-assign.ts`，本函数只是把它展开成行。
 *   改了规则 ⇒ 重跑本函数即刷新（单测会逐行对账，改了不重跑会被抓住）。
 *
 * ⚠️ **会清掉本表里的陈旧行**：口径变了（例如某个知识点不再是必学）时，
 *   旧行留在表里就是脏数据 ⇒ 本函数是「全量替换」语义，不是「只增不改」。
 *   ⚠️ 但它**只管这三张模式表的行**（本表目前只有这三类），不动别的表。
 *
 * @returns 一条结果。
 */
export function seedTopicProfiles(db: SqliteDatabase): M9ProfileSeedResult[] {
  const result: M9ProfileSeedResult = {
    bundle: 'lang_topic_profiles',
    status: 'skipped',
    created: 0,
    updated: 0,
    warnings: [],
  }
  const topics = readModeTopics(db)
  if (topics.length === 0) {
    result.warnings.push('库里没有知识点 ⇒ 无从算起（先装载 lang_topics）')
    return [result]
  }
  const desired = assignTopicProfiles(topics)

  const del = db.prepare(`DELETE FROM lang_topic_profiles WHERE topic_id = ? AND profile = ?`)

  const runOne = db.transaction((row: TopicProfileRow): string => {
    // CS2 第二段：三态合并取代无条件覆盖（est_minutes/rank 的手改 reseed 不再被冲掉）
    return mergeSeedRow(db, TOPIC_PROFILES_MERGE_SPEC, {
      topic_id: row.topic_id,
      profile: row.profile,
      depth: row.depth,
      required: row.required,
      rank: row.rank,
      est_minutes: row.est_minutes,
    })
  })

  const keep = new Set(desired.map((r) => `${String(r.topic_id)}/${r.profile}`))
  for (const row of desired) {
    if (!DEPTHS.has(row.depth)) {
      result.warnings.push(`depth 越界: ${row.depth} (${String(row.topic_id)}/${row.profile})`)
      continue
    }
    try {
      const r = runOne(row)
      if (r === 'created') result.created += 1
      else if (r === 'updated') result.updated += 1
      else {
        result.ignored = (result.ignored ?? 0) + 1
        if (r === 'user-modified') result.userModified = (result.userModified ?? 0) + 1
      }
    } catch (err) {
      result.warnings.push(
        `单条 INSERT 失败: ${String(row.topic_id)}/${row.profile} — ${String(err)}`,
      )
    }
  }

  // 清陈旧行：表里存在、但现算结果里没有的组合
  const stale = db.prepare(`SELECT topic_id, profile FROM lang_topic_profiles`).all() as {
    topic_id: number
    profile: string
  }[]
  for (const row of stale) {
    if (!keep.has(`${String(row.topic_id)}/${row.profile}`)) {
      del.run(row.topic_id, row.profile)
      result.updated += 1
    }
  }

  result.status = result.created + result.updated > 0 ? 'imported' : 'skipped'
  return [result]
}

/** 一次装载两张表（顺序不可换：先阶段，后模式层）。 */
export function seedProfiles(db: SqliteDatabase, seedDir: string): M9ProfileSeedResult[] {
  return [...seedProfilePhases(db, seedDir), ...seedTopicProfiles(db)]
}

export type { LangProfile, TopicProfileRow }
