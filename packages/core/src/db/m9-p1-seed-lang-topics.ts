// `packages/core/src/db/m9-p1-seed-lang-topics.ts` —— M9 v1.6 P1.2 + P1.3（`m9-dev-plan-2026-10.md` §6.2）
//
// 把三份知识点 seed 落进 `lang_topics`：
//   - `lang_topics_python3.json`（84 条 · runoob 清单）
//   - `lang_topics_go.json`（34 条 · runoob 清单）
//   - `lang_topics_advanced.json`（6 条 · **P1d 补建的冷门底层**，自撰）
//
// ⚠️ 与 `seed.ts`（terms / flows / prompts / playbooks）的四点关键差别：
//   1. **没有 user-modifiable 路径**：runoob 是采集来的清单，不是用户输入 ⇒ 没有
//      【v0.2.3 批次 C CS2 已推翻】本播种器现走 mergeSeedRow 行级三态合并
//   2. **stage_id 由 P1.7 的分站产物带进来**（P1.7 之前是全 0，§3.6「站数与每站
//      知识点数本轮不定死」）：分站的单源是 `seeds/_build/build-lang-topics-stages.py`，
//      它把 stage_id 写进这两份 seed JSON；本 loader 只负责把它带上 INSERT。
//      ⚠️ **库级条目（kind='library'）的 stage_id 恒为 0** —— 库级不进学习路线
//      （DL-12），站号对它们无语义占位。
//      【CS2 后】内容修订会在 reseed 时对「用户未改过的行」生效；老行（0019 前）按用户态对待
//      P1.7 之前建过库的机器，stage_id 仍是旧值，须由 P1.7 的 `seedTopicEdges` 回写。
//      ⚠️ **kind 已由 P1.4 归类完毕**（不是全 'language'）：按 §1.4 的可复算规则
//      打成 'language' / 'library'，Python 84 条里**严格库级 30 条 = 35.7%**（DL-13；
//      spec §1.4 第 100 行已于 2026-10-20 订正为 30 条 = 35.7%（与此处一致），见
//      `m9-classify-lang-topics.ts` 的 doc 与 `m9-p1-4-kind-classification.test.ts`）。
//      分类器单源在 `m9-classify-lang-topics.ts`，规则见 spec §1.4。
//   3. **正文不入仓**（DL-02）：seed 文件里只存标题与 URL。
//   4. **不写到 seed_registry 的 contentHash 跳过**：runoob 一旦入库就是终态，
//      用 INSERT OR IGNORE 自然幂等，registry 只用于"上次入库过"的诊断。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sha256Hex } from '../repos/util'
import { nowIso } from './runner'
import type { SqliteDatabase } from './index'
import { seedRegistryUpsert } from './seed-registry'
import { mergeSeedRow, type SeedMergeSpec } from './seed-merge'

export interface M9SeedBundleResult {
  bundle: string
  status: 'skipped' | 'imported' | 'error'
  created: number
  ignored: number
  /** CS2 三态合并的可见计数：内容修订覆盖的行数（用户未改过的行）。未接 mergeSeedRow 的播种器不带 */
  updated?: number
  /** CS2 三态合并的可见计数：用户手改过、reseed 永不覆盖的行数。未接 mergeSeedRow 的播种器不带 */
  userModified?: number
  warnings: string[]
}

/** M9 语言线种子的唯一目录（采集脚本写这里、reseed 重放读这里；打包面不含本目录——学习线在仓库侧运行） */
export const M9_SEEDS_DIR = fileURLToPath(new URL('./seeds', import.meta.url))

const BUNDLES = [
  { bundle: 'lang_topics_python3', file: 'lang_topics_python3.json' },
  { bundle: 'lang_topics_go', file: 'lang_topics_go.json' },
  // ⚠️ **P1d 增补的第三份**（owner 2026-10-20 裁定待裁 #6「精通与熟悉真正分开」）：
  //   6 类冷门底层条目（元类/描述符深挖 · runtime · 反射 · unsafe · cgo · pprof）。
  //   它们与前两份**不是同源**（前两份是 runoob 清单，这六条是自撰的知识点）⇒
  //   单独一份文件、单独一个 bundle，别混进 runoob 那两份里。
  { bundle: 'lang_topics_advanced', file: 'lang_topics_advanced.json' },
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
  /**
   * §3.11 的 `content_level`（'point' / 'full'）—— **可选字段，缺省 'point'**。
   *
   * ⚠️ **为什么允许缺省**：runoob 那两份是**采集来的清单**，采集时没有这个维度；
   *   §3.11 写的「默认 'point'」说的就是这个 ⇒ 缺省即 'point'，不是漏抄。
   *   而 P1d 的冷门六条**显式写 'full'**（它们有完整三段内容）。
   */
  content_level?: 'point' | 'full'
}

interface LangTopicsSeed {
  schemaVersion: number
  source_url?: string
  collected_at: string
  items: LangTopicsSeedItem[]
}

/**
 * lang_topics 的行级三态合并规格（v0.2.3 批次 C CS2，seed-merge.ts 单源）。
 * 业务键 = (lang, slug)；内容列 = 参与哈希与覆盖的九列（键列与其余列不在其列）。
 */
export const LANG_TOPICS_MERGE_SPEC: SeedMergeSpec = {
  table: 'lang_topics',
  keyColumns: ['lang', 'slug'],
  contentColumns: [
    'title',
    'summary',
    'stage_id',
    'ref_url',
    'ref_title',
    'source_kind',
    'source_checked_at',
    'kind',
    'content_level',
  ],
}

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
/** §3.11 的 `lang_topics.content_level` 闭集 —— 缺省 'point'（见 item 接口的 doc）。 */
const EXPECTED_CONTENT_LEVELS = new Set(['point', 'full'])

/**
 * 把三份知识点 seed 幂等并入 `lang_topics`（84 + 34 + 6 = 124 行）。
 *
 * 行为契约：
 * - 文件不存在或结构非法 ⇒ 该 bundle 报 error，**不抛**（与现有 seed.ts 的
 *   「单文件失败不阻塞」同款纪律）。
 * - 单条非 schema-level 非法（kind / source_kind / lang / slug 等越界）⇒ 计入
 *   `warnings`，**该 bundle 整体仍报 imported**。
 * - 已存在 (lang, slug) 行 ⇒ mergeSeedRow 三态：未改过则跳过（unchanged/legacy-adopted），
 *   内容修订则覆盖（updated），用户手改过则永不覆盖（user-modified）；后三类均计入 `ignored`。
 *
 * @returns 每份 bundle 一条结果，便于 `tests/` 里逐条断言。
 */
export function seedLangTopics(db: SqliteDatabase, seedDir: string): M9SeedBundleResult[] {
  const results: M9SeedBundleResult[] = []
  for (const { bundle, file } of BUNDLES) {
    const result: M9SeedBundleResult = {
      bundle,
      status: 'skipped',
      created: 0,
      ignored: 0,
      updated: 0,
      userModified: 0,
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
    let created = 0
    let ignored = 0
    let updated = 0
    let userModified = 0
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
      // ⚠️ `content_level` 缺省即 'point'（§3.11）—— 只有**显式写了且越界**才算非法。
      const contentLevel = it.content_level ?? 'point'
      if (!EXPECTED_CONTENT_LEVELS.has(contentLevel)) {
        warnings.push(`content_level 越界: ${contentLevel} (${it.slug})`)
        continue
      }
      try {
        const record = { ...it, content_level: contentLevel }
        const action = mergeSeedRow(db, LANG_TOPICS_MERGE_SPEC, record)
        if (action === 'created') created += 1
        else if (action === 'updated') updated += 1
        else if (action === 'user-modified') userModified += 1
        else ignored += 1 // unchanged / legacy-adopted：既有「已存在即跳过」的口径
      } catch (err) {
        warnings.push(`单条合并失败: ${it.slug} — ${String(err)}`)
      }
    }
    result.created = created
    result.ignored = ignored
    result.updated = updated
    result.userModified = userModified
    result.warnings = warnings
    result.status = created + updated > 0 ? 'imported' : 'skipped'
    // 登记到 seed_registry（不参与跳过逻辑；纯诊断用途）
    seedRegistryUpsert(db, bundle, contentHash, nowIso())
    results.push(result)
  }
  return results
}