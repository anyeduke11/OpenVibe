// `packages/core/src/db/m9-p1-5-concept-content.ts` —— M9 v1.6 P1.5（`m9-dev-plan-2026-10.md` §6.2）
//
// 把「概念层 8 个共通概念 ＋ 24 段三段内容」落进 `lang_concepts` 与
// `lang_topic_content` 两张表（§3.1 的第 1 张与第 3 张）。
//
// ⚠️ **DL-15 的机器形态就在这个文件里**：
//   三段内容**只**挂概念（`ref_kind='concept'`），**不**复制到 topic 侧 ——
//   复制一次「函数」的概念层成 Python/Go 两份，就是 §3.7 减半机制被破坏。
//   本 loader **主动拒绝**任何 `ref_kind='topic'` 的三段内容入库（见下）。
//
// ⚠️ 与 P1.2/P1.3 的 `m9-p1-seed-lang-topics.ts` 同款纪律：
//   1. 单条非法 ⇒ 计入 warnings，**不抛**（不阻塞其他条目）。
//   2. 幂等：概念走 `ON CONFLICT(slug) DO UPDATE`；三段内容因表上**没有**
//      唯一键（`ref_kind, ref_id, kind` 只是逻辑唯一），走「先 UPDATE，无命中再 INSERT」。
//   3. `updated_at` 取 seed 文件里的 `collected_at`（**固定值**）—— 内容不变则
//      时间戳也不变，幂等重跑不会产生"看起来更新了"的假象。
//   4. 登记到 `seed_registry`（contentHash 只作诊断用途，runoob 侧同款）。
//
// ⚠️ **挂接的两处事实**（§3.1 的 17 张表里**没有** concept ↔ topic 关联表）：
//   ① 构建期：`lang_concepts.json` 的 `lang_topics` 字段（哪两门知识点挂这个概念）
//   ② 运行期：`lang_topics.summary` 里回写的一句概念摘要
//   loader 会**校验** ① 指向的 topic 真实存在且 lang 对得上（挂接不悬空）。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sha256Hex } from '../repos/util'
import { nowIso } from './runner'
import type { SqliteDatabase } from './index'
import { seedRegistryUpsert } from './seed-registry'
import { mergeSeedRow, type SeedMergeSpec } from './seed-merge'

/** CS2 第二段：lang_concepts 的行级三态合并规格（键 slug；updated_at 是记账列，不入哈希、仅 INSERT 写入） */
export const LANG_CONCEPTS_MERGE_SPEC: SeedMergeSpec = {
  table: 'lang_concepts',
  keyColumns: ['slug'],
  contentColumns: ['title', 'summary', 'content_level'],
}
/** CS2 第二段：lang_topic_content 的逻辑键（0020 唯一索引背书；updated_at 记账列同上） */
export const LANG_TOPIC_CONTENT_MERGE_SPEC: SeedMergeSpec = {
  table: 'lang_topic_content',
  keyColumns: ['ref_kind', 'ref_id', 'kind'],
  contentColumns: ['body_md', 'content_level'],
}

export interface M9ConceptSeedResult {
  bundle: string
  status: 'skipped' | 'imported' | 'error'
  created: number
  updated: number
  /** CS2 三态合并的可见计数：未改过/用户改过而未覆盖的行数（第二段起） */
  ignored?: number
  userModified?: number
  warnings: string[]
}

/** §3.7 的三段 —— 缺一不可，`lang_topic_content.kind` 的闭集 */
const CONTENT_KINDS = new Set(['steps', 'example', 'principle'])
/** §3.1 的 lang_concepts.content_level 闭集 */
const CONTENT_LEVELS = new Set(['headline', 'concept', 'full'])
/** §3.1 的 lang_topics.lang 闭集 */
const LANGS = new Set(['python', 'go'])

interface ConceptSeedItem {
  slug: string
  title: string
  summary: string
  content_level: string
  lang_topics: Record<string, string>
}

interface ConceptSeed {
  schemaVersion: number
  collected_at: string
  items: ConceptSeedItem[]
}

interface ContentSeedItem {
  concept_slug: string
  kind: string
  content_level: string
  body_md: string
}

interface ContentSeed {
  schemaVersion: number
  collected_at: string
  items: ContentSeedItem[]
}

/**
 * 把概念层 8 个概念 ＋ 24 段三段内容幂等并入 `lang_concepts` / `lang_topic_content`。
 *
 * 行为契约：
 * - 文件不存在或结构非法 ⇒ 该 bundle 报 error，**不抛**。
 * - 单条非 schema-level 非法 ⇒ 计入 `warnings`，该 bundle 整体仍报 imported。
 * - 三段内容里出现 `ref_kind='topic'` 的 ⇒ **拒绝入库**（DL-15 的执行点）。
 * - 挂接的 topic 不存在或 lang 对不上 ⇒ 该 concept 计入 warnings，**不入库**
 *   （避免「挂接悬空」这种查不出来的脏数据）。
 *
 * @returns 每份 bundle 一条结果。
 */
export function seedConceptContent(db: SqliteDatabase, seedDir: string): M9ConceptSeedResult[] {
  const results: M9ConceptSeedResult[] = []
  const warnings: string[] = []

  // ---------- bundle 1 · lang_concepts ----------
  const conceptResult: M9ConceptSeedResult = {
    bundle: 'lang_concepts',
    status: 'skipped',
    created: 0,
    updated: 0,
    warnings,
  }
  let concepts: ConceptSeed
  let conceptUpdatedAt = '2026-10-19'
  try {
    const raw = readFileSync(join(seedDir, 'lang_concepts.json'), 'utf8')
    const parsed = JSON.parse(raw) as ConceptSeed
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.items)) {
      throw new Error('bundle 结构非法（期望 {schemaVersion:1, items:[]}）')
    }
    concepts = parsed
    conceptUpdatedAt = parsed.collected_at || conceptUpdatedAt
    conceptResult.bundle = 'lang_concepts'
    // contentHash 登记（诊断用途）
    seedRegistryUpsert(db, 'lang_concepts', sha256Hex(raw), nowIso())
  } catch (err) {
    conceptResult.status = 'error'
    conceptResult.warnings.push(`种子文件读取失败: lang_concepts.json — ${String(err)}`)
    results.push(conceptResult)
    return results
  }

  const findTopic = db.prepare(`SELECT id, lang FROM lang_topics WHERE slug = ?`)

  const conceptIds = new Map<string, number>()
  for (const it of concepts.items) {
    if (typeof it.slug !== 'string' || it.slug === '') {
      warnings.push(`slug 空: ${JSON.stringify(it)}`)
      continue
    }
    if (typeof it.title !== 'string' || it.title === '') {
      warnings.push(`title 空: ${it.slug}`)
      continue
    }
    if (!CONTENT_LEVELS.has(it.content_level)) {
      warnings.push(`content_level 越界: ${it.content_level} (${it.slug})`)
      continue
    }
    // ⚠️ 挂接必须命中真实 topic 且 lang 对得上（挂接不悬空）
    const mounts = Object.entries(it.lang_topics ?? {})
    if (mounts.length === 0) {
      warnings.push(`lang_topics 挂接为空: ${it.slug}`)
      continue
    }
    let mountBad = false
    for (const [lang, slug] of mounts) {
      if (!LANGS.has(lang)) {
        warnings.push(`挂接 lang 越界: ${lang} (${it.slug})`)
        mountBad = true
        continue
      }
      const row = findTopic.get(slug) as { id: number; lang: string } | undefined
      if (!row) {
        warnings.push(`挂接 topic 不存在: ${it.slug} → ${lang}/${slug}`)
        mountBad = true
        continue
      }
      if (row.lang !== lang) {
        warnings.push(`挂接 lang 不匹配: ${it.slug} → 声明 ${lang} 实为 ${row.lang}（${slug}）`)
        mountBad = true
      }
    }
    if (mountBad) continue

    const action = mergeSeedRow(db, LANG_CONCEPTS_MERGE_SPEC, {
      slug: it.slug,
      title: it.title,
      summary: it.summary ?? '',
      content_level: it.content_level,
      updated_at: conceptUpdatedAt,
    })
    if (action === 'created') conceptResult.created += 1
    else if (action === 'updated') conceptResult.updated += 1
    else conceptResult.ignored = (conceptResult.ignored ?? 0) + 1
    if (action === 'user-modified') conceptResult.userModified = (conceptResult.userModified ?? 0) + 1

    const after = db.prepare(`SELECT id FROM lang_concepts WHERE slug = ?`).get(it.slug) as {
      id: number
    }
    conceptIds.set(it.slug, after.id)

    // ---------- 运行期挂接：把概念摘要回写进 lang_topics.summary ----------
    // ⚠️ 这里写的是**挂接信息**（一句话摘要 ＋ 指向概念的线索），**不是**三段内容 ——
    //    三段内容一旦复制到 topic 侧，DL-15 就红了。summary 允许重复。
    for (const [lang, slug] of mounts) {
      db.prepare(
        `UPDATE lang_topics SET summary = ? WHERE slug = ? AND lang = ?`,
      ).run(`【概念层】${it.title}：${it.summary ?? ''}`.trim(), slug, lang)
    }
  }
  conceptResult.status = conceptResult.created + conceptResult.updated > 0 ? 'imported' : 'skipped'
  results.push(conceptResult)

  // ---------- bundle 2 · lang_topic_content ----------
  const contentResult: M9ConceptSeedResult = {
    bundle: 'lang_topic_content',
    status: 'skipped',
    created: 0,
    updated: 0,
    warnings,
  }
  let contents: ContentSeed
  let contentUpdatedAt = '2026-10-19'
  try {
    const raw = readFileSync(join(seedDir, 'lang_topic_content.json'), 'utf8')
    const parsed = JSON.parse(raw) as ContentSeed
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.items)) {
      throw new Error('bundle 结构非法（期望 {schemaVersion:1, items:[]}）')
    }
    contents = parsed
    contentUpdatedAt = parsed.collected_at || contentUpdatedAt
    seedRegistryUpsert(db, 'lang_topic_content', sha256Hex(raw), nowIso())
  } catch (err) {
    contentResult.status = 'error'
    contentResult.warnings.push(`种子文件读取失败: lang_topic_content.json — ${String(err)}`)
    results.push(contentResult)
    return results
  }

  for (const it of contents.items) {
    if (!CONTENT_KINDS.has(it.kind)) {
      warnings.push(`kind 越界: ${it.kind} (${it.concept_slug})`)
      continue
    }
    if (!CONTENT_LEVELS.has(it.content_level)) {
      warnings.push(`content_level 越界: ${it.content_level} (${it.concept_slug}/${it.kind})`)
      continue
    }
    if (typeof it.body_md !== 'string' || it.body_md.trim() === '') {
      warnings.push(`body_md 空: ${it.concept_slug}/${it.kind}`)
      continue
    }
    const refId = conceptIds.get(it.concept_slug)
    if (refId === undefined) {
      warnings.push(`concept 未入库（content 引用了不存在的 concept_slug）: ${it.concept_slug}`)
      continue
    }
    const action = mergeSeedRow(db, LANG_TOPIC_CONTENT_MERGE_SPEC, {
      ref_kind: 'concept',
      ref_id: refId,
      kind: it.kind,
      body_md: it.body_md,
      content_level: it.content_level,
      updated_at: contentUpdatedAt,
    })
    if (action === 'created') contentResult.created += 1
    else if (action === 'updated') contentResult.updated += 1
    else {
      contentResult.ignored = (contentResult.ignored ?? 0) + 1
      if (action === 'user-modified') {
        contentResult.userModified = (contentResult.userModified ?? 0) + 1
      }
    }
  }
  contentResult.status = contentResult.created + contentResult.updated > 0 ? 'imported' : 'skipped'
  results.push(contentResult)
  return results
}
