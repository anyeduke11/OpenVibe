import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SqliteDatabase } from './index'
import { nowIso } from './runner'
import { sha256Hex, stableJson } from '../repos/util'
import { FlowTemplatesRepo } from '../repos/flows'
import { PromptsRepo } from '../repos/prompts'
import { TermsRepo } from '../repos/terms'
import { PlaybooksRepo } from '../repos/playbooks'
import type { DevLogEvidence, FlowKind, PlatformMark, Stage } from '@openvibe/shared'
import { TERM_DOMAINS } from '@openvibe/shared'

/**
 * 种子幂等加载（design §15 / dev-plan §7.4）：
 * 逐 bundle（terms → flow-templates → prompts）比对 contentHash，未变跳过；
 * 内容变更时逐条并入——新条目插入（记 seed_hash）、seed_hash 一致的更新、
 * 用户改过（seed_hash NULL）的跳过并 warning；单文件失败不阻塞。
 */
export interface SeedBundleResult {
  bundle: string
  status: 'skipped' | 'imported' | 'error'
  created: number
  updated: number
  skipped: number
  warnings: string[]
}

const BUNDLES = [
  { bundle: 'terms', file: 'terms.json' },
  { bundle: 'flow-templates', file: 'flow-templates.json' },
  { bundle: 'prompts', file: 'prompts.json' },
  { bundle: 'playbooks', file: 'playbooks.json' },
] as const

interface TermsSeedItem {
  zh?: string
  en?: string
  aliases: string[]
  definition: string
  example: string
  tags: string[]
}

interface FlowSeedItem {
  name: string
  kind: FlowKind
  stages: Stage[]
}

interface PromptsSeedItem {
  title: string
  description: string
  content: string
  tags: string[]
  folderPath: string
  platformMarks: PlatformMark[]
  useAs: 'rule' | 'reference'
}

interface PlaybooksSeedItem {
  scenario: string
  problem: string
  practice: string
  antiPractice?: string
  tags: string[]
  verified?: boolean
  evidence?: DevLogEvidence[]
}

export function runSeed(db: SqliteDatabase, seedDir: string): SeedBundleResult[] {
  const results: SeedBundleResult[] = []
  for (const { bundle, file } of BUNDLES) {
    const result: SeedBundleResult = {
      bundle,
      status: 'skipped',
      created: 0,
      updated: 0,
      skipped: 0,
      warnings: [],
    }
    try {
      const raw = readFileSync(join(seedDir, file), 'utf8')
      const contentHash = sha256Hex(raw)
      const registry = db
        .prepare('SELECT content_hash FROM seed_registry WHERE bundle = ?')
        .get(bundle) as { content_hash: string } | undefined
      if (registry?.content_hash === contentHash) {
        results.push(result)
        continue
      }

      const parsed = JSON.parse(raw) as { schemaVersion: number; items: unknown[] }
      if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.items)) {
        throw new Error('bundle 结构非法（期望 {schemaVersion:1, items:[]}）')
      }
      result.status = 'imported'
      mergeBundle(db, bundle, parsed.items, result)
      db.prepare(
        `INSERT INTO seed_registry (bundle, content_hash, imported_at) VALUES (?, ?, ?)
         ON CONFLICT(bundle) DO UPDATE SET content_hash = excluded.content_hash, imported_at = excluded.imported_at`,
      ).run(bundle, contentHash, nowIso())
    } catch (err) {
      result.status = 'error'
      result.warnings.push(`种子文件处理失败，已跳过: ${file} — ${String(err)}`)
    }
    results.push(result)
  }
  // 学习化标注回填：每轮无条件跑（理由见 applyTermAnnotations 的注释）
  results.push(applyTermAnnotations(db, seedDir))
  return results
}

function mergeBundle(
  db: SqliteDatabase,
  bundle: string,
  items: unknown[],
  result: SeedBundleResult,
): void {
  const terms = new TermsRepo(db)
  const flows = new FlowTemplatesRepo(db)
  const prompts = new PromptsRepo(db)
  const playbooks = new PlaybooksRepo(db)

  for (const item of items) {
    try {
      if (bundle === 'terms') {
        const t = item as TermsSeedItem
        const seedHash = terms.seedItemHash(t)
        const existing = terms.findByNaturalKey(t.zh, t.en)
        if (!existing) {
          const created = terms.create({
            zh: t.zh,
            en: t.en,
            aliases: t.aliases ?? [],
            definition: t.definition,
            example: t.example ?? '',
            relatedTermIds: [],
            source: 'openvibe-seed',
            tags: t.tags ?? [],
            status: 'active',
          })
          terms.setSeedHash(created.id, seedHash)
          result.created += 1
        } else if (existing.seedHash === null) {
          result.skipped += 1
          result.warnings.push(`词条已被用户修改，跳过升级: ${t.zh ?? t.en ?? ''}`)
        } else {
          terms.update(existing.id, {
            zh: t.zh,
            en: t.en,
            aliases: t.aliases ?? [],
            definition: t.definition,
            example: t.example ?? '',
            tags: t.tags ?? [],
          })
          terms.setSeedHash(existing.id, seedHash)
          result.updated += 1
        }
      } else if (bundle === 'flow-templates') {
        const f = item as FlowSeedItem
        const seedHash = flows.seedItemHash(f)
        const existing = flows.findByName(f.name)
        if (!existing) {
          const created = flows.create(
            { name: f.name, kind: f.kind, stages: f.stages },
            { builtin: true },
          )
          flows.setSeedHash(created.id, seedHash)
          result.created += 1
        } else if (!existing.builtin || existing.seedHash === null) {
          result.skipped += 1
          result.warnings.push(`模板为自定义或已被用户修改，跳过: ${f.name}`)
        } else {
          db.prepare(
            'UPDATE flow_templates SET stages=?, seed_hash=?, updated_at=? WHERE id=?',
          ).run(JSON.stringify(f.stages), seedHash, nowIso(), existing.id)
          result.updated += 1
        }
      } else if (bundle === 'prompts') {
        const p = item as PromptsSeedItem
        const seedHash = sha256Hex(stableJson(p))
        const existing = db
          .prepare('SELECT id, seed_hash FROM prompts WHERE title = ?')
          .get(p.title) as { id: string; seed_hash: string | null } | undefined
        if (!existing) {
          const created = prompts.create({
            title: p.title,
            description: p.description ?? '',
            content: p.content,
            tags: p.tags ?? [],
            folderPath: p.folderPath ?? '/精选',
            platformMarks: p.platformMarks ?? [],
            useAs: p.useAs ?? 'reference',
            status: 'active',
          })
          prompts.setSeedHash(created.prompt.id, seedHash)
          result.created += 1
        } else if (existing.seed_hash === null) {
          result.skipped += 1
          result.warnings.push(`提示词已被用户修改，跳过升级: ${p.title}`)
        } else {
          prompts.update(existing.id, {
            description: p.description ?? '',
            content: p.content,
            tags: p.tags ?? [],
            folderPath: p.folderPath ?? '/精选',
            platformMarks: p.platformMarks ?? [],
            useAs: p.useAs ?? 'reference',
            status: 'active',
          })
          prompts.setSeedHash(existing.id, seedHash)
          result.updated += 1
        }
      } else if (bundle === 'playbooks') {
        // 技巧腿与 terms 腿同纪律：自然键定位 → seed_hash 比对 → 用户改过则 skipped + warning
        const b = item as PlaybooksSeedItem
        const body = {
          scenario: b.scenario,
          problem: b.problem,
          practice: b.practice,
          antiPractice: b.antiPractice ?? '',
          tags: b.tags ?? [],
        }
        const seedHash = playbooks.seedItemHash(body)
        const existing = playbooks.findByNaturalKey(body.scenario, body.problem)
        if (!existing) {
          const created = playbooks.create({
            ...body,
            relatedPromptIds: [],
            relatedTermIds: [],
            relatedSkillIds: [],
            source: 'openvibe-seed',
            // seed 直接落 published：draft 只进不了包（M4 FR-6.2 只渲染 published），
            // 预置技巧若全是 draft 等于「有模块没内容」
            status: 'published',
            verified: b.verified === true,
            evidence: b.evidence ?? [],
          })
          playbooks.setSeedHash(created.id, seedHash)
          result.created += 1
        } else if (existing.seedHash === null) {
          result.skipped += 1
          result.warnings.push(`技巧已被用户修改，跳过升级: ${body.scenario}`)
        } else {
          // verified 与 evidence 随同一次请求下发，绕不开 FR-4.2 的「置真须带证据」
          playbooks.update(existing.id, {
            ...body,
            verified: b.verified === true,
            evidence: b.evidence ?? [],
          })
          playbooks.setSeedHash(existing.id, seedHash)
          result.updated += 1
        }
      }
    } catch (err) {
      result.skipped += 1
      result.warnings.push(`单条种子并入失败: ${String(err)}`)
    }
  }
}

// ============ 学习化标注回填（m3-terms-learning FR-2.3 / FR-3.2）============

interface TermLevelItem {
  zh: string | null
  en: string | null
  level: 'L1' | 'L2' | 'L3'
  starter: boolean
}

interface TermDomainMapItem {
  tag: string
  domain: string
}

function readSeedBundle(file: string, warn: (msg: string) => void): unknown[] | null {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as {
      schemaVersion: number
      items: unknown
    }
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.items)) {
      warn(`标注文件结构非法（期望 {schemaVersion:1, items:[]}）: ${file}`)
      return null
    }
    return parsed.items
  } catch (err) {
    warn(`标注文件读取失败，已跳过: ${file} — ${String(err)}`)
    return null
  }
}

/**
 * 回填学习化三列。**不抛异常** —— 与 bundle 同纪律：单个标注文件坏掉不该拦住词条导入。
 *
 * ⚠️ 与 bundle 的一个关键差别：runSeed 里 term-levels/term-domain-map **不受 contentHash
 * 跳过控制**。bundle 跳过是因为内容没变；而 332 条 vibe-hub 词条是**脚本导入**的，
 * 发生在 runSeed 之后 ⇒ 那次 runSeed 会因 terms.json 未变而全部 skipped。若标注回填跟着
 * 一起跳过，vibe-hub 的难度标注将永远落不进去。故每次 runSeed 都无条件回填（幂等）。
 *
 * 幂等靠**只写真正变了的行**兑现：SQLite 的 `changes` 统计的是「被 UPDATE 语句命中的行数」，
 * 值没变也算命中。若照直调 setLearning，每次启动都会报 updated>0，`status` 永远不会是
 * `skipped`，而「二次启动全 skipped」是既有的可观察契约（terms.api IT-SEED-REAL-01）。
 */
export function applyTermAnnotations(db: SqliteDatabase, seedDir: string): SeedBundleResult {
  // ⚠️ 本条目的计数器语义**与 bundle 不同**，别按 bundle 的直觉读：
  //   created = 本次写入标注的行数（含首刷与改标）· updated 恒为 0 · skipped = 未命中/未归类的条目数。
  // 标注没有「升级」概念 —— 它每轮都是从源文件全量对齐，不是增量合并。之所以仍借
  // SeedBundleResult 这个形状，是为了让调用方（/api/settings/reseed 的响应、台账、测试）
  // 不必为它单开一套类型；若把它记成 updated，既有断言「空库首启全部为新增、不允许 updated」
  // 就会红，而那个断言守的是**种子内容**的语义，与标注无关。

  const repo = new TermsRepo(db)
  const result: SeedBundleResult = {
    bundle: 'term-annotations',
    status: 'skipped',
    created: 0,
    updated: 0,
    skipped: 0,
    warnings: [],
  }
  /** 告警封顶：坏文件可能产生成百上千条，逐条打印会把启动日志淹掉 */
  const MAX_WARNINGS = 20
  const warn = (msg: string): void => {
    if (result.warnings.length < MAX_WARNINGS) result.warnings.push(msg)
  }

  // ---- 1) 难度 / 入门必需：按 zh+en 自然键定位 ----
  const rawLevels = readSeedBundle(join(seedDir, 'term-levels.json'), warn)
  if (rawLevels) {
    for (const raw of rawLevels) {
      const it = raw as TermLevelItem
      if (
        typeof it?.zh !== 'string' ||
        !['L1', 'L2', 'L3'].includes(it?.level) ||
        typeof it?.starter !== 'boolean' ||
        (it?.en !== null && typeof it?.en !== 'string')
      ) {
        result.skipped += 1
        warn(`难度标注条目非法，已跳过: ${JSON.stringify(raw).slice(0, 80)}`)
        continue
      }
      const hits = repo.findAllByNaturalKey(it.zh, it.en)
      if (hits.length === 0) {
        // 只计数、不逐条告警：`term-levels.json` 覆盖的是**两批**词条的并集，而其中 332 条
        // vibe-hub 词条由 scripts/import-vibehub.ts 单独导入。未跑过该脚本的安装里，
        // 这 332 条「未命中」是**正常初态**而不是配错 —— 逐条告警等于每次首启刷 332 行，
        // 那只会训练人忽略告警。真配错（上游改名）由导入脚本那次回填再暴露。
        result.skipped += 1
        continue
      }
      if (hits.length > 1) {
        // 当前实测自然键唯一（441/441），走到这里说明上游送来了重名词条。
        // 全部回填而不是只填第一条 —— 少填的那条不会报错、只会静默停在 L2。
        warn(`难度标注命中 ${hits.length} 条同键词条，已全部回填: ${it.zh}`)
      }
      for (const hit of hits) {
        if (hit.level === it.level && hit.starter === it.starter) continue
        if (repo.setLearning(hit.id, { level: it.level, starter: it.starter })) {
          result.created += 1
        }
      }
    }
  }

  // ---- 2) 领域：统一取 tags[0]，两批同一口径 ----
  const rawMap = readSeedBundle(join(seedDir, 'term-domain-map.json'), warn)
  const tagToDomain = new Map<string, string>()
  if (rawMap) {
    for (const raw of rawMap) {
      const it = raw as TermDomainMapItem
      if (typeof it?.tag !== 'string' || !TERM_DOMAINS.includes(it?.domain as never)) {
        result.skipped += 1
        warn(`领域映射条目非法，已跳过: ${JSON.stringify(raw).slice(0, 80)}`)
        continue
      }
      tagToDomain.set(it.tag, it.domain)
    }
  }
  // 只要映射文件**读得到**就跑领域回填，即便它一条映射也没有 ——
  // vibe-hub 那批的领域就是 tags[0] 本身，走的是下面 `?? primary` 的兜底，不依赖映射表。
  // ⚠️ 早前这里写成 `if (tagToDomain.size > 0)`，结果是「映射表为空 ⇒ 连 vibe-hub 的
  // 直取也一起关掉」，让「文件能读但内容为空」与「文件不存在」变成同一种行为，测不出来。
  if (rawMap !== null) {
    for (const term of repo.list()) {
      const primary = term.tags[0]
      // vibe-hub 的 tags[0] 本身就是领域；自建那批经映射表换一手。同一规则覆盖两批。
      const domain = primary === undefined ? undefined : (tagToDomain.get(primary) ?? primary)
      if (domain === undefined || !TERM_DOMAINS.includes(domain as never)) {
        // 同上：词表外的 tags[0] 在上游新增领域时会出现，计入 skipped 即可，不逐条刷屏
        result.skipped += 1
        continue
      }
      if (term.domain === domain) continue
      if (repo.setLearning(term.id, { domain })) result.created += 1
    }
  }

  // 两个标注文件都读不到 ⇒ 与 bundle 同样口径报 error（种子目录整个缺失的情形）；
  // 否则**只看有没有真的写进去**：有写入 imported，没写入 skipped。
  //
  // ⚠️ 刻意不看 `skipped`：未跑过 import-vibehub 的安装恒有 332 条未命中，若把它计入状态，
  // 二次启动就永远不是 skipped，「二次启动全 skipped」这条既有可观察契约（IT-SEED-REAL-01）
  // 会静默失效。未命中数仍在 `skipped` 计数里可查。
  if (rawLevels === null && rawMap === null) {
    result.status = 'error'
  } else if (result.created > 0) {
    result.status = 'imported'
  }
  return result
}
