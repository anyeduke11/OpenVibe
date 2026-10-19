// `packages/core/src/db/m9-p1-seed-lang-topics.ts` —— M9 v1.6 P1.2 + P1.3（`m9-dev-plan-2026-10.md` §6.2）
//
// 把两份 runoob inventory 整理后的 seed JSON 落进 `lang_topics`：
//   - `lang_topics_python3.json`（84 条）
//   - `lang_topics_go.json`（34 条）
//
// ⚠️ 与 `seed.ts`（terms / flows / prompts / playbooks）的四点关键差别：
//   1. **没有 user-modifiable 路径**：runoob 是采集来的清单，不是用户输入 ⇒ 没有
//      seed_hash 比对、没有「用户改过则跳过」分支。一次性 INSERT OR IGNORE。
//   2. **没有 stage_id 归类、kind 归类**：本轮全部 stage_id=0 / kind='language'，
//      P1d / P1.4 实测归类。详见 `seeds/lang_topics_python3.json` 的 `_notes`。
//   3. **正文不入仓**（DL-02）：seed 文件里只存标题与 URL。
//   4. **不写到 seed_registry 的 contentHash 跳过**：runoob 一旦入库就是终态，
//      用 INSERT OR IGNORE 自然幂等，registry 只用于"上次入库过"的诊断。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sha256Hex } from '../repos/util'
import { nowIso } from './runner'
import type { SqliteDatabase } from './index'

export interface M9SeedBundleResult {
  bundle: string
  status: 'skipped' | 'imported' | 'error'
  created: number
  ignored: number
  warnings: string[]
}

const BUNDLES = [
  { bundle: 'lang_topics_python3', file: 'lang_topics_python3.json' },
  { bundle: 'lang_topics_go', file: 'lang_topics_go.json' },
] as const

interface LangTopicsSeedItem {
  lang: 'python' | 'go'
  slug: string
  title: string
  summary: string
  stage_id: number
  ref_url: string | null
  ref_title: string | null
  source_kind: string
  source_checked_at: string
  kind: 'language' | 'library'
}

interface LangTopicsSeed {
  schemaVersion: number
  source_url: string
  collected_at: string
  items: LangTopicsSeedItem[]
}

const INSERT_SQL = `
INSERT OR IGNORE INTO lang_topics
  (lang, slug, title, summary, stage_id, ref_url, ref_title, source_kind, source_checked_at, kind)
VALUES
  (@lang, @slug, @title, @summary, @stage_id, @ref_url, @ref_title, @source_kind, @source_checked_at, @kind)
`

const EXPECTED_KINDS = new Set(['language', 'library'])
const EXPECTED_SOURCES = new Set([
  'runoob',
  'walter201230',
  'xinliangnote',
  'awesome_go',
  'awesome_python_cn',
  'owner_guide',
])
const EXPECTED_LANGS = new Set(['python', 'go'])

/**
 * 把 runoob 两份 seed JSON 幂等并入 `lang_topics`。
 *
 * 行为契约：
 * - 文件不存在或结构非法 ⇒ 该 bundle 报 error，**不抛**（与现有 seed.ts 的
 *   「单文件失败不阻塞」同款纪律）。
 * - 单条非 schema-level 非法（kind / source_kind / lang / slug 等越界）⇒ 计入
 *   `warnings`，**该 bundle 整体仍报 imported**。
 * - 已存在 (lang, slug) 行 ⇒ 自然被 `INSERT OR IGNORE` 跳过，计入 `ignored`。
 *
 * @returns 每份 bundle 一条结果，便于 `tests/` 里逐条断言。
 */
export function seedLangTopics(db: SqliteDatabase, seedDir: string): M9SeedBundleResult[] {
  const results: M9SeedBundleResult[] = []
  const insert = db.prepare(INSERT_SQL)
  for (const { bundle, file } of BUNDLES) {
    const result: M9SeedBundleResult = {
      bundle,
      status: 'skipped',
      created: 0,
      ignored: 0,
      warnings: [],
    }
    let raw: string
    let parsed: LangTopicsSeed
    try {
      raw = readFileSync(join(seedDir, file), 'utf8')
      parsed = JSON.parse(raw) as LangTopicsSeed
      if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.items)) {
        throw new Error('bundle 结构非法（期望 {schemaVersion:1, items:[]}）')
      }
    } catch (err) {
      result.status = 'error'
      result.warnings.push(`种子文件读取失败: ${file} — ${String(err)}`)
      results.push(result)
      continue
    }

    const contentHash = sha256Hex(raw)
    const runOne = db.transaction((item: LangTopicsSeedItem): 'created' | 'ignored' => {
      const info = insert.run(item)
      // better-sqlite3: info.changes === 0 ⇒ INSERT OR IGNORE 跳过
      return info.changes === 0 ? 'ignored' : 'created'
    })

    let created = 0
    let ignored = 0
    const warnings: string[] = []
    for (const it of parsed.items) {
      // ⭐ schema-level 校验：跑在 INSERT 前，不合法就 warn+跳过（不让 SQLite 抛）
      if (!EXPECTED_LANGS.has(it.lang)) {
        warnings.push(`lang 越界: ${it.lang} (${it.slug})`)
        continue
      }
      if (!EXPECTED_KINDS.has(it.kind)) {
        warnings.push(`kind 越界: ${it.kind} (${it.slug})`)
        continue
      }
      if (!EXPECTED_SOURCES.has(it.source_kind)) {
        warnings.push(`source_kind 越界: ${it.source_kind} (${it.slug})`)
        continue
      }
      if (typeof it.slug !== 'string' || it.slug === '') {
        warnings.push(`slug 空: ${JSON.stringify(it)}`)
        continue
      }
      if (typeof it.source_checked_at !== 'string' || it.source_checked_at === '') {
        // ⭐ DL-01 守卫：lang_topics.source_checked_at 不得 NULL
        warnings.push(`source_checked_at 空 (DL-01): ${it.slug}`)
        continue
      }
      if (typeof it.stage_id !== 'number' || it.stage_id < 0 || it.stage_id > 7) {
        warnings.push(`stage_id 越界 [0,7]: ${it.stage_id} (${it.slug})`)
        continue
      }
      try {
        const r = runOne(it)
        if (r === 'created') created += 1
        else ignored += 1
      } catch (err) {
        warnings.push(`单条 INSERT 失败: ${it.slug} — ${String(err)}`)
      }
    }
    result.created = created
    result.ignored = ignored
    result.warnings = warnings
    result.status = created > 0 ? 'imported' : 'skipped'
    // 登记到 seed_registry（不参与跳过逻辑；纯诊断用途）
    db.prepare(
      `INSERT INTO seed_registry (bundle, content_hash, imported_at) VALUES (?, ?, ?)
       ON CONFLICT(bundle) DO UPDATE SET content_hash = excluded.content_hash, imported_at = excluded.imported_at`,
    ).run(bundle, contentHash, nowIso())
    results.push(result)
  }
  return results
}