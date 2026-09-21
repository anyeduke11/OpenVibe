import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SqliteDatabase } from './index'
import { nowIso } from './runner'
import { sha256Hex, stableJson } from '../repos/util'
import { FlowTemplatesRepo } from '../repos/flows'
import { PromptsRepo } from '../repos/prompts'
import { TermsRepo } from '../repos/terms'
import type { FlowKind, PlatformMark, Stage } from '@openvibe/shared'

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
      }
    } catch (err) {
      result.skipped += 1
      result.warnings.push(`单条种子并入失败: ${String(err)}`)
    }
  }
}
