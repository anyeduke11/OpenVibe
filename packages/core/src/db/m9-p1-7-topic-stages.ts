// `packages/core/src/db/m9-p1-7-topic-stages.ts` —— M9 v1.6 P1.7（`m9-dev-plan-2026-10.md` §6.2）
//
// P1.7 = **补上 M9-P1 期范围里漏掉的那一项**：「建前置边并过无环守卫」。
//
// 证据链：
//   - `m9-dev-plan-2026-10.md` §9 的 M9-P1 期范围写着「建前置边并过无环守卫」，
//     但 §6.2 的子任务列表只到 P1.6 —— 这一项**没有子任务**。
//   - DL-04（前置边无环）、DL-12（库级不进学习路线）、DL-26（§3.1 表数可复算）
//     三条判据都挂在 P1.1 名下，实质内容却无人产出。
//   - P1 出口明写「lang_topic_edges 不成环」＋「§3.1 表数复算 17 ✓」。
//
// 本文件做三件事：
//   ① **更新 `lang_topics.stage_id`**（8 站分站，§3.6）
//      ⚠️ 必须 UPDATE 而不是 INSERT —— P1.2/P1.3 的 loader 用 `INSERT OR IGNORE`，
//         已入库的 118 行 stage_id 全是 0，重跑不会变。分站是 P1.7 的产物，
//         所以由 P1.7 自己负责写回。
//   ② **把前置边写进 `lang_topic_edges`**
//   ③ 暴露 DL-04 / DL-12 的对外判定形态（读库 + 调 `m9-topic-dag.ts` 的纯函数）
//
// ⚠️ **DL-12：边只允许连接 `kind='language'` 的条目** ——
//   库级条目的前置是「任意语言 ＋ 按需用到」，几乎无序（§1.4），
//   接进 DAG 就是制造永久阻塞点。库里出现库级边 ⇒ 报错。
//   DL-12 的完整判定形态见本文件 `libraryLeakage`（四颗牙齿，每颗都能被变异腿打红）。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sha256Hex } from '../repos/util'
import { nowIso } from './runner'
import {
  edgesTouchingLibrary,
  edgesViolatingStageOrder,
  findCycle,
  libraryWithStageAssigned,
  rawStageGroups,
  stageHoles,
  stationGroups,
  type DagEdge,
  type DagNode,
} from './m9-topic-dag'
import { classifyKind } from './m9-classify-lang-topics'
import type { SqliteDatabase } from './index'
import { seedRegistryUpsert } from './seed-registry'

export interface M9EdgeSeedResult {
  bundle: string
  status: 'skipped' | 'imported' | 'error'
  created: number
  ignored: number
  warnings: string[]
}

interface EdgeSeedItem {
  lang: string
  topic_slug: string
  prereq_slug: string
}

interface EdgeSeed {
  schemaVersion: number
  collected_at: string
  items: EdgeSeedItem[]
}

function readJson<T>(seedDir: string, file: string): T {
  return JSON.parse(readFileSync(join(seedDir, file), 'utf8')) as T
}

/**
 * 把前置边幂等并入 `lang_topic_edges`，并把分站写回 `lang_topics.stage_id`。
 *
 * 行为契约（与 P1.2/P1.3/P1.5/P1.6 的 loader 同款）：
 * - 文件不存在或结构非法 ⇒ 报 error，**不抛**。
 * - 单条非法 ⇒ 计入 `warnings`，整体仍报 imported。
 * - 幂等：边走 `INSERT OR IGNORE`（PK 是 (topic_id, prereq_topic_id)）；
 *   stage_id 走 UPDATE（可重复执行，结果一致）。
 */
export function seedTopicEdges(db: SqliteDatabase, seedDir: string): M9EdgeSeedResult {
  const result: M9EdgeSeedResult = {
    bundle: 'lang_topic_edges',
    status: 'skipped',
    created: 0,
    ignored: 0,
    warnings: [],
  }

  // ---------- ① stage_id 回写（分站，§3.6） ----------
  // ⚠️ 站分配的单源在 `seeds/_build/build-lang-topics-stages.py`；
  //    那份脚本已把 stage_id 写进两份 `lang_topics_*.json`，
  //    这里从**同一份 seed JSON** 读回，避免两处站分配漂移。
  const stageUpdates: Array<{ slug: string; stage_id: number }> = []
  for (const file of ['lang_topics_python3.json', 'lang_topics_go.json']) {
    let parsed: { items?: Array<{ slug: string; stage_id: number; kind: string }> }
    try {
      parsed = readJson<typeof parsed>(seedDir, file)
    } catch (err) {
      result.warnings.push(`站分配读取失败: ${file} — ${String(err)}`)
      continue
    }
    for (const it of parsed.items ?? []) {
      // 库级条目不进站列表（DL-12）⇒ stage_id 无语义，恒为 0
      stageUpdates.push({ slug: it.slug, stage_id: it.kind === 'library' ? 0 : it.stage_id })
    }
  }
  const updateStage = db.prepare(`UPDATE lang_topics SET stage_id = ? WHERE slug = ?`)
  for (const u of stageUpdates) {
    updateStage.run(u.stage_id, u.slug)
  }

  // ---------- ② 前置边入库 ----------
  let raw: string
  let parsed: EdgeSeed
  try {
    raw = readFileSync(join(seedDir, 'lang_topic_edges.json'), 'utf8')
    parsed = JSON.parse(raw) as EdgeSeed
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.items)) {
      throw new Error('bundle 结构非法（期望 {schemaVersion:1, items:[]}）')
    }
  } catch (err) {
    result.status = 'error'
    result.warnings.push(`种子文件读取失败: lang_topic_edges.json — ${String(err)}`)
    return result
  }

  const findTopic = db.prepare(`SELECT id, lang, kind FROM lang_topics WHERE slug = ?`)
  const insertEdge = db.prepare(
    `INSERT OR IGNORE INTO lang_topic_edges (topic_id, prereq_topic_id) VALUES (?, ?)`,
  )

  for (const it of parsed.items) {
    const topic = findTopic.get(it.topic_slug) as
      { id: number; lang: string; kind: string } | undefined
    const prereq = findTopic.get(it.prereq_slug) as
      { id: number; lang: string; kind: string } | undefined
    if (!topic) {
      result.warnings.push(`边的 topic 不存在: ${it.topic_slug}`)
      continue
    }
    if (!prereq) {
      result.warnings.push(`边的 prereq 不存在: ${it.prereq_slug}`)
      continue
    }
    if (topic.lang !== it.lang || prereq.lang !== it.lang) {
      result.warnings.push(
        `边的 lang 不匹配: ${it.topic_slug}(${topic.lang}) / ${it.prereq_slug}(${prereq.lang}) 声明 ${it.lang}`,
      )
      continue
    }
    // ⚠️ DL-12：库级条目不进 DAG
    if (topic.kind !== 'language' || prereq.kind !== 'language') {
      result.warnings.push(
        `边接到了库级条目（DL-12）: ${it.topic_slug}(${topic.kind}) ← ${it.prereq_slug}(${prereq.kind})`,
      )
      continue
    }
    if (topic.id === prereq.id) {
      result.warnings.push(`自环: ${it.topic_slug}`)
      continue
    }
    const info = insertEdge.run(topic.id, prereq.id)
    if (info.changes > 0) result.created += 1
    else result.ignored += 1
  }

  seedRegistryUpsert(db, 'lang_topic_edges', sha256Hex(raw), nowIso())

  result.status = result.created + result.ignored > 0 ? 'imported' : 'skipped'
  return result
}

/** 读出某语言的 DAG 节点（含库级 —— 判定时才能查"库级有没有混进站列表"）。 */
export function listDagNodes(db: SqliteDatabase, lang?: string): DagNode[] {
  const rows = lang
    ? (db
        .prepare(
          `SELECT id, lang, slug, title, stage_id, kind FROM lang_topics WHERE lang = ? ORDER BY id`,
        )
        .all(lang) as DagNode[])
    : (db
        .prepare(`SELECT id, lang, slug, title, stage_id, kind FROM lang_topics ORDER BY id`)
        .all() as DagNode[])
  return rows
}

/**
 * 读出某语言的前置边。
 *
 * ⚠️ **排序放 JS，不放 SQL** ——
 *   `lang_topic_edges` 的主键是**复合键** (topic_id, prereq_topic_id)，两个列单独都不唯一
 *   ⇒ 仓内静态守卫 `tests/order-determinism.test.ts` 的兜底键白名单
 *   （id / rowid / entry_no / version_no）认不出它，SQL 里写 ORDER BY 会被判红。
 *   在 JS 里按同一对键做全序排序，确定性等价，且不必改那条仓级契约。
 */
export function listDagEdges(db: SqliteDatabase, lang?: string): DagEdge[] {
  const sql = lang
    ? `SELECT e.topic_id, e.prereq_topic_id FROM lang_topic_edges e
       JOIN lang_topics t ON t.id = e.topic_id WHERE t.lang = ?`
    : `SELECT e.topic_id, e.prereq_topic_id FROM lang_topic_edges e`
  const rows = (lang ? db.prepare(sql).all(lang) : db.prepare(sql).all()) as DagEdge[]
  return rows.sort((a, b) => a.topic_id - b.topic_id || a.prereq_topic_id - b.prereq_topic_id)
}

/**
 * 站列表（DL-12 的执行点）：`kind='language'` 的条目按 stage_id 分组。
 *
 * ⚠️ **恒带 kind 过滤** —— 库级条目在 `lang_topics` 里 stage_id 恒为 0，
 *   裸查 `GROUP BY stage_id` 会看到它们，那**不是站列表**。
 */
export function stationList(db: SqliteDatabase, lang: string): Map<number, DagNode[]> {
  return stationGroups(listDagNodes(db, lang))
}

/**
 * DL-04 的对外形态：检出该语言 DAG 里的环。
 *
 * @returns 环上的节点 id 序列；无环 ⇒ null
 */
export function detectDagCycle(db: SqliteDatabase, lang: string): number[] | null {
  return findCycle(listDagNodes(db, lang), listDagEdges(db, lang))
}

/**
 * DL-12 的对外形态：**四颗牙齿**，每颗都能被变异腿打红。
 *
 * ⚠️ **首版这里是个同义反复**（已修）：初版写成「站列表里不得出现 kind='library'」，
 *   而站列表本身就是 kind 过滤后的结果 ⇒ 该检查恒绿，是摆设。
 *   现在的四颗牙：
 *   - `listed` vs `languageOnly`：站列表条目数（生产路径）与**独立 SQL** 查出的
 *     `kind='language'` 条数。kind 过滤一旦被删，站 0 会多出全部库级条目 ⇒ 立刻不等 ⇒ 红。
 *   - `misclassified`：库里每条目的 kind 与 §1.4 分类规则**重算**结果不一致的条目。
 *     「库级被误标成 language」是最真实的泄漏路径（它直接让库级条目坐进学习路线）⇒ 红。
 *   - `assignedStages`：库级条目被指派了非 0 站号（约定恒为 0）⇒ 红。
 *   - `onEdges`：边连接了库级条目 ⇒ 红。
 */
export interface LibraryLeakage {
  /** 站列表（生产路径，带 kind 过滤）的条目总数 */
  listed: number
  /** 库里 `kind='language'` 的条目总数（独立 SQL，不经站列表函数） */
  languageOnly: number
  /** 库里 `kind='library'` 的条目总数 */
  libraryCount: number
  /** kind 与 §1.4 规则重算不一致的条目 */
  misclassified: DagNode[]
  /** 被指派了非 0 站号的库级条目 */
  assignedStages: DagNode[]
  /** 接了库级条目的边 */
  onEdges: DagEdge[]
}

export function libraryLeakage(db: SqliteDatabase, lang: string): LibraryLeakage {
  const nodes = listDagNodes(db, lang)
  const edges = listDagEdges(db, lang)

  // 站列表（生产路径）
  const groups = stationGroups(nodes)
  let listed = 0
  for (const arr of groups.values()) listed += arr.length

  // 独立 SQL 口径（**不**经站列表函数）—— 两侧不等即说明 kind 过滤失效或数据被改
  const counts = db
    .prepare(
      `SELECT
         SUM(CASE WHEN kind = 'language' THEN 1 ELSE 0 END) AS language_only,
         SUM(CASE WHEN kind = 'library'  THEN 1 ELSE 0 END) AS library_count
       FROM lang_topics WHERE lang = ?`,
    )
    .get(lang) as { language_only: number | null; library_count: number | null }

  return {
    listed,
    languageOnly: counts.language_only ?? 0,
    libraryCount: counts.library_count ?? 0,
    misclassified: nodes.filter((n) => n.kind !== classifyKind(n.title)),
    assignedStages: libraryWithStageAssigned(nodes),
    onEdges: edgesTouchingLibrary(nodes, edges),
  }
}

/**
 * 反证用：站列表**若不过滤**会长什么样。
 *
 * ⚠️ 不是站列表 —— 是「kind 过滤被删掉之后」的世界。
 *   它的存在是为了让 DL-12 的纯度闸（`listed === languageOnly`）
 *   能在单测里被证伪，而不必改生产源码。
 */
export function unfilteredStationPreview(db: SqliteDatabase, lang: string): Map<number, DagNode[]> {
  return rawStageGroups(listDagNodes(db, lang))
}

/** 站号结构性检查：连续无空洞。 */
export function stationHoles(db: SqliteDatabase, lang: string): number[] {
  return stageHoles(stationGroups(listDagNodes(db, lang)))
}

/** 前置站不得晚于后继站（路线能自上而下走的必要条件）。 */
export function stageOrderViolations(db: SqliteDatabase, lang: string): DagEdge[] {
  return edgesViolatingStageOrder(listDagNodes(db, lang), listDagEdges(db, lang))
}
