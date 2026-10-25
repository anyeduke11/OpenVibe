// `packages/core/src/db/m9-p1b-seed-resources.ts` —— M9 v1.6 **P1b.2 + P1b.3 + P1b.5**
// （`m9-dev-plan-2026-10.md` §6.3 ＋ `m9-dev-language-roadmap.md` §1.6 / §1.7 / §3.15）
//
// 把三份资源层种子幂等并入库：
//   - `lang_resources.json`（89 条 · §1.6.1）
//   - `lang_vibe_resources.json`（11 条 · §1.7）
//   - `lang_topic_resources.json`（挂接 · §3.15，DL-31）
//
// ⚠️ **与 `m9-p1-seed-lang-topics.ts` 同款的四条纪律**：
//   1. **没有 user-modifiable 路径** —— 资源来自 owner 提供的指南，不是用户输入
//      ⇒ 没有 seed_hash 比对、没有「用户改过则跳过」分支；一次性 INSERT OR IGNORE。
//   2. **正文不入仓**（DL-02）：种子只存名称、URL 与元数据。
//   3. **不写到 seed_registry 的 contentHash 跳过**：registry 只用于「上次入库过」的诊断。
//   4. **单条非法 ⇒ warn + 跳过**，不让 SQLite 抛 ⇒ 与既有 seed.ts 的
//      「单文件失败不阻塞」同款纪律。
//
// ⚠️ **挂接表是自撰的**（§3.15）：附件给了 89 条资源，但没给「哪个知识点该去哪学」
//   ⇒ 映射由本仓逐条指派（`lang_topic_resources.json`）。
//   ⚠️ **方向只有「知识点 → 资源」** —— 资源侧**不写**「我覆盖哪些知识点」
//   （那会让无序清单定义路线，§3.15）。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sha256Hex } from '../repos/util'
import { nowIso } from './runner'
import type { SqliteDatabase } from './index'
import { seedRegistryUpsert } from './seed-registry'
import { mergeSeedRow, type SeedMergeSpec } from './seed-merge'

// CS2 第二段：三张表的行级三态合并规格（键 = 各自的 UNIQUE；is_fav/star/phase_id 是
// 用户态/登记列，仅 INSERT 写入、更新路径不触碰——收藏与星标不会被 reseed 冲掉）
export const RESOURCES_MERGE_SPEC: SeedMergeSpec = {
  table: 'lang_resources',
  keyColumns: ['lang', 'name'],
  contentColumns: ['url', 'category', 'tier', 'level_label', 'price', 'lang_label', 'summary', 'freshness', 'verified_by', 'source_checked_at'],
}
export const VIBE_RESOURCES_MERGE_SPEC: SeedMergeSpec = {
  table: 'lang_vibe_resources',
  keyColumns: ['group', 'name'],
  contentColumns: ['url', 'summary', 'freshness', 'verified_by', 'source_checked_at'],
}
export const TOPIC_RESOURCES_MERGE_SPEC: SeedMergeSpec = {
  table: 'lang_topic_resources',
  keyColumns: ['topic_id', 'resource_id'],
  contentColumns: ['role'],
}

export interface M9ResourceSeedResult {
  bundle: string
  status: 'skipped' | 'imported' | 'error'
  created: number
  ignored: number
  /** CS2 三态合并的可见计数：内容修订覆盖的行数（用户未改过的行；第二段起） */
  updated?: number
  /** CS2 三态合并的可见计数：用户手改过、reseed 永不覆盖的行数 */
  userModified?: number
  warnings: string[]
}

interface ResourceSeedItem {
  lang: string
  name: string
  url: string
  category: string
  tier: string
  level_label: string
  price: string
  lang_label: string
  is_fav: number
  star: string | null
  summary: string
  freshness: string
  phase_id: number | null
  verified_by: string
  source_checked_at: string | null
}

interface VibeSeedItem {
  group: string
  name: string
  url: string
  summary: string
  freshness: string
  verified_by: string
  source_checked_at: string | null
}

interface LinkSeedItem {
  lang: string
  topic_slug: string
  resource_name: string
  role: string
}

interface SeedFile<T> {
  schemaVersion: number
  collected_at: string
  items: T[]
}

const LANG_RESOURCE_BUNDLE = 'lang_resources'
const LANG_VIBE_BUNDLE = 'lang_vibe_resources'
const LANG_TOPIC_RESOURCE_BUNDLE = 'lang_topic_resources'

const EXPECTED_LANGS = new Set(['python', 'go'])
const EXPECTED_CATEGORIES = new Set(['official', 'github', 'course', 'book', 'video', 'practice'])
const EXPECTED_LEVELS = new Set(['0', '1', '2', '3'])
const EXPECTED_PRICES = new Set(['free', 'paid', 'mix'])
const EXPECTED_LANG_LABELS = new Set(['zh', 'en', 'bi'])
const EXPECTED_GROUPS = new Set(['tools', 'tuts'])
const EXPECTED_ROLES = new Set(['primary', 'backup', 'practice'])
/** §1.6.1 的 TIER 档位（主清单五档；v 专属于速成专区那张表）。 */
const EXPECTED_TIERS = new Set(['a', 'b', 'c', 'd', 'e'])

function emptyResult(bundle: string): M9ResourceSeedResult {
  return { bundle, status: 'skipped', created: 0, ignored: 0, warnings: [] }
}

function readSeed<T>(seedDir: string, file: string): { parsed: SeedFile<T> | null; raw: string; error?: string } {
  try {
    const raw = readFileSync(join(seedDir, file), 'utf8')
    const parsed = JSON.parse(raw) as SeedFile<T>
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.items)) {
      return { parsed: null, raw, error: `bundle 结构非法（期望 {schemaVersion:1, items:[]}）` }
    }
    return { parsed, raw }
  } catch (err) {
    return { parsed: null, raw: '', error: `种子文件读取失败: ${file} — ${String(err)}` }
  }
}

function registerBundle(db: SqliteDatabase, bundle: string, raw: string): void {
  seedRegistryUpsert(db, bundle, sha256Hex(raw), nowIso())
}

/**
 * 落 `lang_resources`（89 条）。
 *
 * ⚠️ **主键是 `(lang, name)` 不是 `url`**（§1.6.1 的实测结论）：
 *   89 条资源只有 87 个去重 URL —— `leetcode.cn` 与 `7days-golang` 各被两条资源共用。
 *   按 url 建主键会**静默丢掉 2 条** ⇒ DL-47 钉住这一点。
 */
export function seedLangResources(db: SqliteDatabase, seedDir: string): M9ResourceSeedResult {
  const result = emptyResult(LANG_RESOURCE_BUNDLE)
  const { parsed, raw, error } = readSeed<ResourceSeedItem>(seedDir, 'lang_resources.json')
  if (parsed === null) {
    result.status = 'error'
    result.warnings.push(error ?? '未知错误')
    return result
  }
  const runOne = db.transaction((it: ResourceSeedItem): string =>
    mergeSeedRow(db, RESOURCES_MERGE_SPEC, { ...it }),
  )
  let created = 0
  let ignored = 0
  for (const it of parsed.items) {
    if (!EXPECTED_LANGS.has(it.lang)) {
      result.warnings.push(`lang 越界: ${it.lang} (${it.name})`)
      continue
    }
    if (!EXPECTED_CATEGORIES.has(it.category)) {
      result.warnings.push(`category 越界: ${it.category} (${it.name})`)
      continue
    }
    // ⚠️ tier 是**必要性矩阵的轴**（§1.6.1）—— 缺了它，DL-48 的矩阵就没法落到具体资源上
    if (!EXPECTED_TIERS.has(it.tier)) {
      result.warnings.push(`tier 越界: ${it.tier} (${it.name})`)
      continue
    }
    if (!EXPECTED_LEVELS.has(it.level_label)) {
      result.warnings.push(`level_label 越界: ${it.level_label} (${it.name})`)
      continue
    }
    if (!EXPECTED_PRICES.has(it.price)) {
      result.warnings.push(`price 越界: ${it.price} (${it.name})`)
      continue
    }
    if (!EXPECTED_LANG_LABELS.has(it.lang_label)) {
      result.warnings.push(`lang_label 越界: ${it.lang_label} (${it.name})`)
      continue
    }
    // ⚠️ DL-29：核实主体只能是 owner（§1.6 第 1 点）⇒ 值域由表的 CHECK 兜住，这里再挡一道。
    if (it.verified_by !== 'owner_guide') {
      result.warnings.push(`verified_by 越界（DL-29）: ${it.verified_by} (${it.name})`)
      continue
    }
    try {
      const r = runOne(it)
      if (r === 'created') created += 1
      else if (r === 'updated') result.updated = (result.updated ?? 0) + 1
      else {
        ignored += 1
        if (r === 'user-modified') result.userModified = (result.userModified ?? 0) + 1
      }
    } catch (err) {
      result.warnings.push(`单条 INSERT 失败: ${it.name} — ${String(err)}`)
    }
  }
  result.created = created
  result.ignored = ignored
  result.status = created > 0 || (result.updated ?? 0) > 0 ? 'imported' : 'skipped'
  registerBundle(db, LANG_RESOURCE_BUNDLE, raw)
  return result
}

/**
 * 落 `lang_vibe_resources`（11 条 · VIBE_TOOLS 6 ＋ VIBE_TUTS 5）。
 *
 * ⚠️ **刻意不带** 分类 / 费用 / 阶段 / 精选 / 星数 —— 附件里这 11 条根本没有这些维度。
 */
export function seedLangVibeResources(db: SqliteDatabase, seedDir: string): M9ResourceSeedResult {
  const result = emptyResult(LANG_VIBE_BUNDLE)
  const { parsed, raw, error } = readSeed<VibeSeedItem>(seedDir, 'lang_vibe_resources.json')
  if (parsed === null) {
    result.status = 'error'
    result.warnings.push(error ?? '未知错误')
    return result
  }
  const runOne = db.transaction((it: VibeSeedItem): string =>
    mergeSeedRow(db, VIBE_RESOURCES_MERGE_SPEC, { ...it }),
  )
  let created = 0
  let ignored = 0
  for (const it of parsed.items) {
    if (!EXPECTED_GROUPS.has(it.group)) {
      result.warnings.push(`group 越界: ${it.group} (${it.name})`)
      continue
    }
    if (it.verified_by !== 'owner_guide') {
      result.warnings.push(`verified_by 越界（DL-29）: ${it.verified_by} (${it.name})`)
      continue
    }
    try {
      const r = runOne(it)
      if (r === 'created') created += 1
      else if (r === 'updated') result.updated = (result.updated ?? 0) + 1
      else {
        ignored += 1
        if (r === 'user-modified') result.userModified = (result.userModified ?? 0) + 1
      }
    } catch (err) {
      result.warnings.push(`单条 INSERT 失败: ${it.name} — ${String(err)}`)
    }
  }
  result.created = created
  result.ignored = ignored
  result.status = created > 0 ? 'imported' : 'skipped'
  registerBundle(db, LANG_VIBE_BUNDLE, raw)
  return result
}

/**
 * 落 `lang_topic_resources`（挂接 · §3.15 · DL-31）。
 *
 * ⚠️ **挂接表引用的 slug / name 必须都能在库里找到** ——
 *   找不到 ⇒ warn + 跳过（不静默建一条指向不存在行的挂接）。
 *   「知识点有去处」这条判据（DL-31）由**行数**保证，不是由「引用能解析」保证。
 */
export function seedLangTopicResources(db: SqliteDatabase, seedDir: string): M9ResourceSeedResult {
  const result = emptyResult(LANG_TOPIC_RESOURCE_BUNDLE)
  const { parsed, raw, error } = readSeed<LinkSeedItem>(seedDir, 'lang_topic_resources.json')
  if (parsed === null) {
    result.status = 'error'
    result.warnings.push(error ?? '未知错误')
    return result
  }
  const findTopic = db.prepare('SELECT id FROM lang_topics WHERE lang = ? AND slug = ?')
  const findResource = db.prepare('SELECT id FROM lang_resources WHERE lang = ? AND name = ?')
  const runOne = db.transaction(
    (topicId: number, resourceId: number, role: string): string =>
      mergeSeedRow(db, TOPIC_RESOURCES_MERGE_SPEC, {
        topic_id: topicId,
        resource_id: resourceId,
        role,
      }),
  )
  let created = 0
  let ignored = 0
  for (const it of parsed.items) {
    if (!EXPECTED_ROLES.has(it.role)) {
      result.warnings.push(`role 越界: ${it.role} (${it.topic_slug})`)
      continue
    }
    const topic = findTopic.get(it.lang, it.topic_slug) as { id: number } | undefined
    if (!topic) {
      result.warnings.push(`知识点不存在: ${it.lang}/${it.topic_slug}`)
      continue
    }
    const resource = findResource.get(it.lang, it.resource_name) as { id: number } | undefined
    if (!resource) {
      result.warnings.push(`资源不存在: ${it.lang}/${it.resource_name}`)
      continue
    }
    try {
      const r = runOne(topic.id, resource.id, it.role)
      if (r === 'created') created += 1
      else if (r === 'updated') result.updated = (result.updated ?? 0) + 1
      else {
        ignored += 1
        if (r === 'user-modified') result.userModified = (result.userModified ?? 0) + 1
      }
    } catch (err) {
      result.warnings.push(`单条 INSERT 失败: ${it.topic_slug} → ${it.resource_name} — ${String(err)}`)
    }
  }
  result.created = created
  result.ignored = ignored
  result.status = created > 0 ? 'imported' : 'skipped'
  registerBundle(db, LANG_TOPIC_RESOURCE_BUNDLE, raw)
  return result
}

/** 三个 bundle 一起落库（顺序：资源 → 挂接，挂接引用资源）。 */
export function seedLangResourceLayer(db: SqliteDatabase, seedDir: string): M9ResourceSeedResult[] {
  const results: M9ResourceSeedResult[] = []
  results.push(seedLangResources(db, seedDir))
  results.push(seedLangVibeResources(db, seedDir))
  results.push(seedLangTopicResources(db, seedDir))
  return results
}
