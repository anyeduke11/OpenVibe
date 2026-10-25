// `packages/core/src/db/m9-p1-6-concept-deltas.ts` —— M9 v1.6 P1.6（`m9-dev-plan-2026-10.md` §6.2）
//
// 把「语言差异层」落进 `lang_concept_deltas`（§3.12 · 迁移 0011 的第 2 张表）。
//
// ⚠️ **本 loader 装着 DL-24 的执行点**：
//   语言大版本变更时，按**生效区间与变更区间相交**挑出受影响的差异条目。
//   区间相交需要 since_version 与 until_version **两个字段同时参与** ——
//   漏掉 until_version 过滤会让**早已过期的条目被误报**。
//   判定逻辑本身在 `m9-concept-deltas.ts`（纯函数，便于单测直接发断言）。
//
// ⚠️ **supersedes 建链的两遍法**：
//   库里 `supersedes` 是 `REFERENCES id`（自增主键），而 seed 阶段只有
//   `supersedes_index`（同文件内的序号）⇒ 先把全部条目按 UNIQUE 键 upsert 拿到 id，
//   再回填 supersedes。**不删旧行** —— 删了会断掉别人指向它的外键。
//
// ⚠️ **不删旧条目**（§3.12）：语言加新特性时，老差异被打上 `until_version`
//   而不是删除，删掉就丢了「以前为什么没有」这段历史。
//
// ⚠️ **两门语言各自版本线**（§3.12 末段）：所有对外查询都先按 `lang` 过滤，
//   **绝不合并成一条时间线**。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sha256Hex } from '../repos/util'
import { nowIso } from './runner'
import { DELTA_ASPECTS, affectedDeltas, type ConceptDelta } from './m9-concept-deltas'
import type { SqliteDatabase } from './index'
import { seedRegistryUpsert } from './seed-registry'
import { mergeSeedRow, type SeedMergeSpec } from './seed-merge'

/** CS2 第二段：lang_concept_deltas 的行级三态合并规格 */
export const DELTAS_MERGE_SPEC: SeedMergeSpec = {
  table: 'lang_concept_deltas',
  keyColumns: ['concept_id', 'lang', 'aspect', 'since_version'],
  contentColumns: ['summary', 'until_version'],
}

export interface M9DeltaSeedResult {
  bundle: string
  status: 'skipped' | 'imported' | 'error'
  created: number
  updated: number
  /** CS2 三态合并的可见计数：未改过/用户改过而未覆盖的行数 */
  ignored?: number
  userModified?: number
  warnings: string[]
}

interface DeltaSeedItem {
  concept_slug: string
  lang: string
  aspect: string
  summary: string
  since_version: string
  until_version: string | null
  supersedes_index: number
}

interface DeltaSeed {
  schemaVersion: number
  collected_at: string
  items: DeltaSeedItem[]
}

const ASPECT_SET = new Set<string>(DELTA_ASPECTS)
const LANGS = new Set(['python', 'go'])
const VERSION_RE = /^\d+\.\d+$/

/**
 * 把语言差异条目幂等并入 `lang_concept_deltas`。
 *
 * 行为契约（与 P1.2/P1.3/P1.5 的 loader 同款）：
 * - 文件不存在或结构非法 ⇒ 报 error，**不抛**。
 * - 单条非法 ⇒ 计入 `warnings`，该 bundle 整体仍报 imported。
 * - 幂等：按 UNIQUE(concept_id, lang, aspect, since_version) upsert。
 *
 * @returns 一条结果。
 */
export function seedConceptDeltas(db: SqliteDatabase, seedDir: string): M9DeltaSeedResult {
  const result: M9DeltaSeedResult = {
    bundle: 'lang_concept_deltas',
    status: 'skipped',
    created: 0,
    updated: 0,
    warnings: [],
  }
  let raw: string
  let parsed: DeltaSeed
  try {
    raw = readFileSync(join(seedDir, 'lang_concept_deltas.json'), 'utf8')
    parsed = JSON.parse(raw) as DeltaSeed
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.items)) {
      throw new Error('bundle 结构非法（期望 {schemaVersion:1, items:[]}）')
    }
  } catch (err) {
    result.status = 'error'
    result.warnings.push(`种子文件读取失败: lang_concept_deltas.json — ${String(err)}`)
    return result
  }

  const findConcept = db.prepare(`SELECT id FROM lang_concepts WHERE slug = ?`)
  // CS2 第二段：第一遍的 upsert 改行级三态合并（键 = concept_id+lang+aspect+since_version；
  // 内容列 = summary/until_version；supersedes 是第二遍按 id 回填的**链路数据**，不在内容列）。
  const findDeltaId = db.prepare(
    `SELECT id FROM lang_concept_deltas
     WHERE concept_id = ? AND lang = ? AND aspect = ? AND since_version = ?`,
  )
  const setSupersedes = db.prepare(`UPDATE lang_concept_deltas SET supersedes = ? WHERE id = ?`)

  // ---- 第一遍：upsert 全部条目，先不管 supersedes ----
  const idByIndex = new Map<number, number>()
  const validIndexes: number[] = []
  parsed.items.forEach((it, idx) => {
    if (!LANGS.has(it.lang)) {
      result.warnings.push(`lang 越界: ${it.lang} (${it.concept_slug})`)
      return
    }
    if (!ASPECT_SET.has(it.aspect)) {
      result.warnings.push(`aspect 越界: ${it.aspect} (${it.concept_slug}) —— §3.12 词表: ${DELTA_ASPECTS.join('/')}`)
      return
    }
    if (!VERSION_RE.test(it.since_version)) {
      result.warnings.push(`since_version 格式非法: ${it.since_version} (${it.concept_slug})`)
      return
    }
    if (it.until_version !== null && !VERSION_RE.test(it.until_version)) {
      result.warnings.push(`until_version 格式非法: ${it.until_version} (${it.concept_slug})`)
      return
    }
    if (typeof it.summary !== 'string' || it.summary.trim() === '') {
      result.warnings.push(`summary 空: ${it.concept_slug}/${it.lang}/${it.aspect}`)
      return
    }
    const concept = findConcept.get(it.concept_slug) as { id: number } | undefined
    if (!concept) {
      result.warnings.push(`concept 不存在（P1.5 未入库?）: ${it.concept_slug}`)
      return
    }
    const action = mergeSeedRow(db, DELTAS_MERGE_SPEC, {
      concept_id: concept.id,
      lang: it.lang,
      aspect: it.aspect,
      summary: it.summary,
      since_version: it.since_version,
      until_version: it.until_version,
      supersedes: null,
    })
    if (action === 'created') result.created += 1
    else if (action === 'updated') result.updated += 1
    else result.ignored = (result.ignored ?? 0) + 1
    const row = findDeltaId.get(concept.id, it.lang, it.aspect, it.since_version) as { id: number }
    idByIndex.set(idx, row.id)
    validIndexes.push(idx)
  })

  // ---- 第二遍：回填 supersedes（两遍法：先拿 id 再建链） ----
  parsed.items.forEach((it, idx) => {
    if (!validIndexes.includes(idx)) return
    if (it.supersedes_index < 0) return
    const targetId = idByIndex.get(it.supersedes_index)
    const selfId = idByIndex.get(idx)
    if (targetId === undefined || selfId === undefined) {
      result.warnings.push(`supersedes_index 悬空: ${idx} → ${it.supersedes_index}`)
      return
    }
    if (targetId === selfId) {
      result.warnings.push(`supersedes 自指: ${idx}`)
      return
    }
    setSupersedes.run(targetId, selfId)
  })

  seedRegistryUpsert(db, 'lang_concept_deltas', sha256Hex(raw), nowIso())

  result.status = result.created + result.updated > 0 ? 'imported' : 'skipped'
  return result
}

/** 读出全部语言差异条目（供 DL-24 判定用）。 */
export function listConceptDeltas(db: SqliteDatabase): ConceptDelta[] {
  return db
    .prepare(
      `SELECT id, concept_id, lang, aspect, summary, since_version, until_version, supersedes
       FROM lang_concept_deltas
       ORDER BY id`,
    )
    .all() as ConceptDelta[]
}

/**
 * DL-24 的对外形态：语言从 `fromVersion` 变到 `toVersion` 时，受影响的差异条目。
 *
 * ⚠️ **先按 lang 过滤**（§3.12：两门语言各自版本线，不合并）。
 */
export function affectedConceptDeltas(
  db: SqliteDatabase,
  lang: 'python' | 'go',
  fromVersion: string,
  toVersion: string,
): ConceptDelta[] {
  return affectedDeltas(listConceptDeltas(db), lang, fromVersion, toVersion)
}
