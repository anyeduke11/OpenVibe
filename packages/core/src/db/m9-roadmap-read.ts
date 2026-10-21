// `packages/core/src/db/m9-roadmap-read.ts` —— M9 v1.6 **P3 的路线读端**
// （`m9-dev-language-roadmap.md` §3.5 / §3.7 / §3.12 / §3.15 · dev-plan §6.9 P3.2 / P3.3）
//
// ## 它做什么
//
// 把库里已经有的东西（**P1 的知识点与拓扑 ＋ P1b 的资源挂接 ＋ P1d 的概念层 ＋ P2 的三态**）
// 读成页面要的形状：站列 ＋ 当前层 ＋ 详情页。
//
// ## ⚠️ 站列只收 `kind='language'` 的条目
//
// DL-12（§1.4 实测库级占 35.7%）：库级条目**不进学习路线**，它们只是「按需查阅」。
// ⇒ 站列按 `kind='language'` 过滤 ⇒ 库里那些库级条目不会变成永久阻塞点。
//
// ## ⚠️ 概念挂接在库里的落法是**知识点 summary 的前缀**
//
// P1.5 的装载器把概念摘要回写成 `【概念层】<概念标题>：<摘要>`（`lang_topics.summary`）。
// ⇒ 知识点 → 概念的挂接**只能**从这个前缀还原（`lang_concepts` 表里没有挂接列，
//   §3.1 也没列 ⇒ 不主动加列）。⚠️ **只认这一个前缀**，别在别处再造一份挂接。
//
// ## ⚠️ 详情页的**三段**是 `lang_topic_content` 的三种 kind
//
// `kind ∈ ('steps','example','principle')`（§3.7 的「步骤 / 样例 / 原理解析」）。
// ⚠️ **缺哪段就是 null** —— 不许填自撰文案充数（§3.17 第 5 条的同款纪律：
//   源里没有的东西不许自撰填充）。
import type { SqliteDatabase } from '../db'
import { STAGE_NAMES } from './m9-topic-dag'
import {
  deriveCurrentStage,
  stageNoOf,
  type LangCode,
  type MasteryState,
  type RoadmapStation,
  type RoadmapTopic,
  type RoadmapView,
  type TopicContentOut,
  type TopicDeltaOut,
  type TopicResourceOut,
  type TopicTermOut,
} from '@openvibe/shared'

/** 概念挂接在知识点 summary 里的前缀（P1.5 装载器写的）。 */
export const CONCEPT_MOUNT_PREFIX = '【概念层】'

interface TopicRow {
  id: number
  lang: string
  slug: string
  title: string
  summary: string
  stage_id: number
}

/**
 * 读一门的路线视图（站列 ＋ 当前层 ＋ 三态）。
 *
 * @param db 数据库
 * @param lang 语言
 * @param projectId 项目 id（不传 ⇒ 全库汇总，同一知识点取最高档）
 */
export function readRoadmap(
  db: SqliteDatabase,
  lang: LangCode,
  projectId?: string,
): RoadmapView {
  // ⚠️ **只收 kind='language'**（DL-12：库级条目不进学习路线）
  const rows = db
    .prepare(
      `SELECT id, lang, slug, title, summary, stage_id
         FROM lang_topics
        WHERE lang = ? AND kind = 'language'`,
    )
    .all(lang) as TopicRow[]

  const states = readStates(db, lang, projectId)
  const topics: RoadmapTopic[] = rows
    .map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      summary: r.summary,
      stage_id: r.stage_id,
      state: states.get(r.id) ?? 'unused',
    }))
    .sort((a, b) => a.stage_id - b.stage_id || a.id - b.id)

  const byStage = new Map<number, RoadmapTopic[]>()
  for (const t of topics) {
    const list = byStage.get(t.stage_id) ?? []
    list.push(t)
    byStage.set(t.stage_id, list)
  }

  const stations: RoadmapStation[] = [...byStage.keys()]
    .sort((a, b) => a - b)
    .map((stageId) => ({
      stage_id: stageId,
      stage_no: stageNoOf(stageId),
      name: STAGE_NAMES[stageId] ?? `第 ${String(stageNoOf(stageId))} 站`,
      topics: byStage.get(stageId) ?? [],
    }))

  return {
    lang,
    topic_count: topics.length,
    current_stage: deriveCurrentStage(topics),
    station_count: stations.length,
    stations,
  }
}

/**
 * 读某项目已落库的掌握度（`lang_topic_state`）。
 *
 * ⚠️ **没有行的知识点是「未涉及」**（§3.3 的零证据档）—— 不是「未知」。
 *
 * @param db 数据库
 * @param lang 语言
 * @param projectId 项目 id（不传 ⇒ 全库按知识点归并，跨项目取最高档）
 */
export function readStates(
  db: SqliteDatabase,
  lang: LangCode,
  projectId?: string,
): Map<number, MasteryState> {
  const out = new Map<number, MasteryState>()
  const params: unknown[] = projectId === undefined ? [lang] : [lang, projectId]
  const where =
    projectId === undefined
      ? `s.state IN ('active','mastered')
           AND t.lang = ?`
      : `s.state IN ('active','mastered')
           AND t.lang = ? AND s.project_id = ?`
  const rows = db
    .prepare(
      `SELECT s.topic_id AS topic_id, s.state AS state
         FROM lang_topic_state s
         JOIN lang_topics t ON t.id = s.topic_id
        WHERE ${where}`,
    )
    .all(...params) as { topic_id: number; state: MasteryState }[]
  for (const r of rows) {
    // ⚠️ **跨项目取最高档**：`mastered` > `active` > `unused`（只在同项目内才有意义，
    //   这里只是给「没选项目」的页面一个可显示的汇总）
    const prev = out.get(r.topic_id)
    if (prev === 'mastered') continue
    out.set(r.topic_id, r.state)
  }
  return out
}

/** 详情页的出参（core 侧的行形态，与 shared 的 zod 契约同形）。 */
export interface TopicDetailRow {
  id: number
  slug: string
  title: string
  summary: string
  lang: LangCode
  stage_id: number
  stage_no: number
  state: MasteryState
  content: TopicContentOut
  deltas: TopicDeltaOut[]
  resources: TopicResourceOut[]
  terms: TopicTermOut[]
}

/**
 * 读一个知识点的详情（三段 ＋ 差异 ＋ 外链 ＋ 术语挂接）。
 *
 * @param db 数据库
 * @param topicId 知识点 id
 * @param projectId 项目 id（决定三态；不传 ⇒ 汇总）
 */
export function readTopicDetail(
  db: SqliteDatabase,
  topicId: number,
  projectId?: string,
): TopicDetailRow | null {
  const row = db
    .prepare(
      `SELECT id, lang, slug, title, summary, stage_id
         FROM lang_topics
        WHERE id = ?`,
    )
    .get(topicId) as TopicRow | undefined
  if (row === undefined) return null

  const lang = row.lang as LangCode
  const states = readStates(db, lang, projectId)

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    lang,
    stage_id: row.stage_id,
    stage_no: stageNoOf(row.stage_id),
    state: states.get(row.id) ?? 'unused',
    content: readContent(db, 'topic', row.id),
    deltas: readDeltas(db, row.summary, lang),
    resources: readResources(db, row.id),
    terms: readTerms(db, row.id),
  }
}

/** 读三段内容（缺哪段就是 null）。 */
function readContent(
  db: SqliteDatabase,
  refKind: 'topic' | 'concept',
  refId: number,
): TopicContentOut {
  const rows = db
    .prepare(
      `SELECT kind, body_md FROM lang_topic_content
        WHERE ref_kind = ? AND ref_id = ?`,
    )
    .all(refKind, refId) as { kind: string; body_md: string }[]
  const pick = (kind: string): string | null => {
    const hit = rows.find((r) => r.kind === kind)
    return hit === undefined ? null : hit.body_md
  }
  return {
    steps: pick('steps'),
    example: pick('example'),
    principle: pick('principle'),
  }
}

/**
 * 读语言差异（§3.12）。
 *
 * ⚠️ **靠知识点 summary 的「【概念层】标题：」前缀**还原概念（P1.5 装载器的落法）。
 *   还原不出概念 ⇒ 没有差异条目（**不编**）。
 */
function readDeltas(db: SqliteDatabase, summary: string, lang: LangCode): TopicDeltaOut[] {
  if (!summary.startsWith(CONCEPT_MOUNT_PREFIX)) return []
  const title = summary.slice(CONCEPT_MOUNT_PREFIX.length).split('：')[0]?.trim() ?? ''
  if (title === '') return []
  const concept = db
    .prepare('SELECT id FROM lang_concepts WHERE title = ?')
    .get(title) as { id: number } | undefined
  if (concept === undefined) return []
  const rows = db
    .prepare(
      `SELECT aspect, summary, since_version, until_version
         FROM lang_concept_deltas
        WHERE concept_id = ? AND lang = ?`,
    )
    .all(concept.id, lang) as {
    aspect: string
    summary: string
    since_version: string
    until_version: string | null
  }[]
  return rows
    .map((r) => ({
      aspect: r.aspect,
      summary: r.summary,
      since_version: r.since_version,
      until_version: r.until_version,
    }))
    .sort((a, b) => a.aspect.localeCompare(b.aspect))
}

/** 读挂接的资源（§3.15）。 */
function readResources(db: SqliteDatabase, topicId: number): TopicResourceOut[] {
  const rows = db
    .prepare(
      `SELECT r.name AS name, r.url AS url, tr.role AS role, r.tier AS tier
         FROM lang_topic_resources tr
         JOIN lang_resources r ON r.id = tr.resource_id
        WHERE tr.topic_id = ?`,
    )
    .all(topicId) as { name: string; url: string; role: TopicResourceOut['role']; tier: string }[]
  const roleOrder: Record<TopicResourceOut['role'], number> = { primary: 0, backup: 1, practice: 2 }
  return rows.sort(
    (a, b) => roleOrder[a.role] - roleOrder[b.role] || a.name.localeCompare(b.name),
  )
}

/** 读挂接的术语（§3.4 · 只读）。 */
function readTerms(db: SqliteDatabase, topicId: number): TopicTermOut[] {
  const rows = db
    .prepare(
      `SELECT t.id AS id, t.zh AS zh, t.en AS en
         FROM lang_topic_terms tt
         JOIN terms t ON t.id = tt.term_id
        WHERE tt.topic_id = ?`,
    )
    .all(topicId) as { id: string; zh: string; en: string }[]
  return rows.map((r) => ({ term_id: r.id, zh: r.zh, en: r.en }))
}
