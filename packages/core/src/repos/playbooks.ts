import type { SqliteDatabase } from '../db'
import { nowIso } from '../db/runner'
import {
  AppError,
  compareCodeUnit,
  findMatchRanges,
  newId,
  renderPlaybooksMdTable,
  type DevLogEvidence,
  type PlaybookCreateInput,
  type PlaybookMatch,
  type PlaybookOut,
  type PlaybookSearchOut,
  type PlaybookUpdateInput,
  type RenderPlaybooksMdInput,
} from '@openvibe/shared'
import { parseJsonColumn, sha256Hex, stableJson } from './util'
import { searchPlaybookRowids } from '../search/fts'

type PlaybookRow = {
  id: string
  scenario: string
  problem: string
  practice: string
  anti_practice: string
  related_prompt_ids: string
  related_term_ids: string
  related_skill_ids: string
  verified: number
  evidence: string
  source: string
  tags: string
  status: string
  seed_hash: string | null
  created_at: string
  updated_at: string
}

function rowToPlaybook(row: PlaybookRow): PlaybookOut {
  return {
    id: row.id,
    scenario: row.scenario,
    problem: row.problem,
    practice: row.practice,
    antiPractice: row.anti_practice,
    relatedPromptIds: parseJsonColumn<string[]>(row.related_prompt_ids, []),
    relatedTermIds: parseJsonColumn<string[]>(row.related_term_ids, []),
    relatedSkillIds: parseJsonColumn<string[]>(row.related_skill_ids, []),
    verified: row.verified === 1,
    evidence: parseJsonColumn<DevLogEvidence[]>(row.evidence, []),
    source: row.source,
    tags: parseJsonColumn<string[]>(row.tags, []),
    status: row.status as PlaybookOut['status'],
    seedHash: row.seed_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** 命中区间（FR-2.2）：五个展示口径各算一遍，tags 按合并串（与 PLAYBOOKS.md 同口径） */
function playbookMatchRanges(playbook: PlaybookOut, q: string): PlaybookMatch[] {
  const fields: [PlaybookMatch['field'], string][] = [
    ['scenario', playbook.scenario],
    ['problem', playbook.problem],
    ['practice', playbook.practice],
    ['antiPractice', playbook.antiPractice],
    ['tags', playbook.tags.join('、')],
  ]
  const out: PlaybookMatch[] = []
  for (const [field, text] of fields) {
    for (const range of findMatchRanges(text, q)) {
      out.push({ field, start: range.start, end: range.end })
    }
  }
  return out
}

/**
 * related* 三道闸共用一把（m4 §6.2）：口径照 terms 的 validateRelatedIds——
 * 指向已删除资产一律拒、不静默丢；差别只是 M4 要查三张表。
 */
const RELATED_TABLES = [
  { field: 'relatedPromptIds', table: 'prompts', label: '提示词' },
  { field: 'relatedTermIds', table: 'terms', label: '词条' },
  { field: 'relatedSkillIds', table: 'skills', label: 'skill' },
] as const

function validateRelatedIds(db: SqliteDatabase, selfId: string, items: PlaybookOut): void {
  for (const { field, table, label } of RELATED_TABLES) {
    const ids = items[field]
    if (ids.length === 0) continue
    const unique = [...new Set(ids)]
    const found = new Set(
      (
        db
          .prepare(`SELECT id FROM ${table} WHERE id IN (${unique.map(() => '?').join(',')})`)
          .all(...unique) as { id: string }[]
      ).map((r) => r.id),
    )
    const invalid = unique.filter((id) => id === selfId || !found.has(id))
    if (invalid.length > 0) {
      throw new AppError(
        'VALIDATION_ERROR',
        `${field} 引用了自指或不存在的${label}: ${invalid.join(', ')}`,
      )
    }
  }
}

/**
 * PLAYBOOKS.md 排序键（FR-2.4 + §8.2 ⑤）：scenario 码点序、id 兜底。
 * 必须走 compareCodeUnit——禁 localeCompare，三平台 CI 字节一致性依赖它；
 * verified 不参与排序（确定性优先，「亲测有效」不是优先级信号）。
 */
function sortForMd(playbooks: PlaybookOut[]): PlaybookOut[] {
  return [...playbooks].sort(
    (a, b) => compareCodeUnit(a.scenario, b.scenario) || compareCodeUnit(a.id, b.id),
  )
}

export class PlaybooksRepo {
  constructor(private readonly db: SqliteDatabase) {}

  create(input: PlaybookCreateInput): PlaybookOut {
    const id = newId('playbook')
    // 先过闸再落库（与 terms 同序）：不存在或自指的引用不该留下半条记录
    const candidate: PlaybookOut = {
      id,
      scenario: input.scenario,
      problem: input.problem,
      practice: input.practice,
      antiPractice: input.antiPractice ?? '',
      relatedPromptIds: input.relatedPromptIds ?? [],
      relatedTermIds: input.relatedTermIds ?? [],
      relatedSkillIds: input.relatedSkillIds ?? [],
      verified: input.verified === true,
      evidence: input.evidence ?? [],
      source: input.source ?? 'manual',
      tags: input.tags ?? [],
      status: input.status ?? 'draft',
      seedHash: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }
    validateRelatedIds(this.db, id, candidate)
    const ts = candidate.createdAt
    this.db
      .prepare(
        `INSERT INTO playbooks (id, scenario, problem, practice, anti_practice,
           related_prompt_ids, related_term_ids, related_skill_ids,
           verified, evidence, source, tags, status, seed_hash, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      )
      .run(
        id,
        candidate.scenario,
        candidate.problem,
        candidate.practice,
        candidate.antiPractice,
        JSON.stringify(candidate.relatedPromptIds),
        JSON.stringify(candidate.relatedTermIds),
        JSON.stringify(candidate.relatedSkillIds),
        candidate.verified ? 1 : 0,
        JSON.stringify(candidate.evidence),
        candidate.source,
        JSON.stringify(candidate.tags),
        candidate.status,
        ts,
        ts,
      )
    const playbook = this.get(id)
    if (!playbook) throw new AppError('INTERNAL', '创建后读取失败')
    return playbook
  }

  update(id: string, patch: PlaybookUpdateInput): PlaybookOut {
    const existing = this.db.prepare('SELECT * FROM playbooks WHERE id = ?').get(id) as
      | PlaybookRow
      | undefined
    if (!existing) throw new AppError('NOT_FOUND', `技巧不存在: ${id}`)
    const before = rowToPlaybook(existing)
    // FR-4.2：置真是显式动作。schema 的 superRefine 只看得见本次请求的字段，
    // 「全量覆盖时顺手变 true」这种不带证据的写法要在这道仓库闸上被拒。
    if (patch.verified === true && !before.verified && (patch.evidence ?? []).length === 0) {
      throw new AppError(
        'VALIDATION_ERROR',
        'verified 由 false 改 true 必须在本次请求随带非空 evidence（m4 FR-4.2）',
      )
    }
    const next: PlaybookOut = {
      ...before,
      scenario: patch.scenario ?? before.scenario,
      problem: patch.problem ?? before.problem,
      practice: patch.practice ?? before.practice,
      antiPractice: patch.antiPractice ?? before.antiPractice,
      relatedPromptIds: patch.relatedPromptIds ?? before.relatedPromptIds,
      relatedTermIds: patch.relatedTermIds ?? before.relatedTermIds,
      relatedSkillIds: patch.relatedSkillIds ?? before.relatedSkillIds,
      verified: patch.verified ?? before.verified,
      evidence: patch.evidence ?? before.evidence,
      tags: patch.tags ?? before.tags,
      status: patch.status ?? before.status,
    }
    validateRelatedIds(this.db, id, next)
    this.db
      .prepare(
        `UPDATE playbooks SET scenario=?, problem=?, practice=?, anti_practice=?,
           related_prompt_ids=?, related_term_ids=?, related_skill_ids=?,
           verified=?, evidence=?, tags=?, status=?, seed_hash=NULL, updated_at=? WHERE id=?`,
      )
      .run(
        next.scenario,
        next.problem,
        next.practice,
        next.antiPractice,
        JSON.stringify(next.relatedPromptIds),
        JSON.stringify(next.relatedTermIds),
        JSON.stringify(next.relatedSkillIds),
        next.verified ? 1 : 0,
        JSON.stringify(next.evidence),
        JSON.stringify(next.tags),
        next.status,
        nowIso(),
        id,
      )
    const playbook = this.get(id)
    if (!playbook) throw new AppError('INTERNAL', '更新后读取失败')
    return playbook
  }

  /**
   * 删除技巧只动自身：不写引用清理腿。
   * related* 三列指向 prompts / terms / skills 三张表，谁都不是 playbooks ⇒ 删技巧
   * 不可能让任何 related* 悬挂；照 terms 抄一条清理循环在这里是永不触发的死代码。
   */
  delete(id: string): void {
    const info = this.db.prepare('DELETE FROM playbooks WHERE id = ?').run(id)
    if (info.changes === 0) throw new AppError('NOT_FOUND', `技巧不存在: ${id}`)
  }

  get(id: string): PlaybookOut | null {
    const row = this.db.prepare('SELECT * FROM playbooks WHERE id = ?').get(id) as
      | PlaybookRow
      | undefined
    return row ? rowToPlaybook(row) : null
  }

  list(): PlaybookOut[] {
    const rows = this.db
      .prepare('SELECT * FROM playbooks ORDER BY updated_at DESC, id ASC')
      .all() as PlaybookRow[]
    return rows.map(rowToPlaybook)
  }

  search(q: string): PlaybookSearchOut[] {
    const hits = searchPlaybookRowids(this.db, q)
    if (hits.length === 0) return []
    const placeholders = hits.map(() => '?').join(',')
    const rows = this.db
      .prepare(`SELECT rowid, * FROM playbooks WHERE rowid IN (${placeholders})`)
      .all(...hits.map((h) => h.rowid)) as (PlaybookRow & { rowid: number })[]
    const byRowid = new Map(rows.map((r) => [r.rowid, rowToPlaybook(r)]))
    return hits
      .map((h) => {
        const playbook = byRowid.get(h.rowid)
        return playbook
          ? { playbook, matchedFields: h.matchedFields, matches: playbookMatchRanges(playbook, q) }
          : null
      })
      .filter((x): x is PlaybookSearchOut => x !== null)
  }

  /** 生成 PLAYBOOKS.md（同一选集 → 字节级相同，FR-2.4）。published 过滤在 composer 侧 */
  renderMd(input: RenderPlaybooksMdInput): string {
    if (input.playbookIds.length === 0) {
      throw new AppError('EMPTY_SELECTION', '空选集不可渲染 PLAYBOOKS.md（m4 FR-6.3）')
    }
    const placeholders = input.playbookIds.map(() => '?').join(',')
    const rows = this.db
      .prepare(`SELECT * FROM playbooks WHERE id IN (${placeholders})`)
      .all(...input.playbookIds) as PlaybookRow[]
    const found = new Map(rows.map((r) => [r.id, rowToPlaybook(r)]))

    const missing = input.playbookIds.filter((id) => !found.has(id))
    if (missing.length > 0) {
      throw new AppError('STALE_SELECTION', `选集中 ${missing.length} 个技巧已删除（m6a §6.2 同源）`)
    }

    const playbooks = sortForMd(input.playbookIds.map((id) => found.get(id)) as PlaybookOut[])
    return renderPlaybooksMdTable(
      '选集',
      playbooks.map((p) => ({
        scenario: p.scenario,
        problem: p.problem,
        practice: p.practice,
        antiPractice: p.antiPractice,
        verified: p.verified,
      })),
    )
  }

  setSeedHash(id: string, seedHash: string): void {
    this.db.prepare('UPDATE playbooks SET seed_hash = ? WHERE id = ?').run(seedHash, id)
  }

  /** seed 通道：复合自然键 (scenario, problem)，同场景多条不同问题须共存（FR-2.3 / 裁定 ④） */
  findByNaturalKey(scenario: string, problem: string): PlaybookOut | null {
    const row = this.db
      .prepare('SELECT * FROM playbooks WHERE scenario = ? AND problem = ?')
      .get(scenario, problem) as PlaybookRow | undefined
    return row ? rowToPlaybook(row) : null
  }

  seedItemHash(item: {
    scenario: string
    problem: string
    practice: string
    antiPractice: string
    tags: string[]
  }): string {
    return sha256Hex(
      stableJson({
        scenario: item.scenario,
        problem: item.problem,
        practice: item.practice,
        antiPractice: item.antiPractice,
        tags: item.tags,
      }),
    )
  }
}