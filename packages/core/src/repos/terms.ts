import type { SqliteDatabase } from '../db'
import { nowIso } from '../db/runner'
import {
  AppError,
  compareCodeUnit,
  dedupeAliases,
  findMatchRanges,
  newId,
  renderTermsMdTable,
  termSortKey,
  type RenderTermsMdInput,
  type TermCreateInput,
  type TermMatch,
  type TermOut,
  type TermSearchOut,
  type TermUpdateInput,
  type TermsOrderBy,
} from '@openvibe/shared'
import { pinyinKey, parseJsonColumn, sha256Hex, stableJson } from './util'
import { searchTermRowids } from '../search/fts'

type TermRow = {
  id: string
  zh: string | null
  en: string | null
  aliases: string
  definition: string
  example: string
  related_term_ids: string
  source: string
  tags: string
  status: string
  seed_hash: string | null
  created_at: string
  updated_at: string
}

function rowToTerm(row: TermRow): TermOut {
  return {
    id: row.id,
    zh: row.zh ?? undefined,
    en: row.en ?? undefined,
    aliases: parseJsonColumn<string[]>(row.aliases, []),
    definition: row.definition,
    example: row.example,
    relatedTermIds: parseJsonColumn<string[]>(row.related_term_ids, []),
    source: row.source,
    tags: parseJsonColumn<string[]>(row.tags, []),
    status: row.status as TermOut['status'],
    seedHash: row.seed_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** 命中区间（m3 FR-3.2）：四个展示口径各算一遍，别名按合并串（与 TERMS.md 同口径） */
function termMatchRanges(term: TermOut, q: string): TermMatch[] {
  const fields: [TermMatch['field'], string][] = [
    ['zh', term.zh ?? ''],
    ['en', term.en ?? ''],
    ['aliases', term.aliases.join('、')],
    ['definition', term.definition],
  ]
  const out: TermMatch[] = []
  for (const [field, text] of fields) {
    for (const range of findMatchRanges(text, q)) {
      out.push({ field, start: range.start, end: range.end })
    }
  }
  return out
}

/** m3 FR-1.1：relatedTermIds 只能引用存在且非自指的词条 */
function validateRelatedIds(db: SqliteDatabase, selfId: string, ids: string[]): void {
  if (ids.length === 0) return
  const unique = [...new Set(ids)]
  const found = new Set(
    (
      db
        .prepare(
          `SELECT id FROM terms WHERE id IN (${unique.map(() => '?').join(',')})`,
        )
        .all(...unique) as { id: string }[]
    ).map((r) => r.id),
  )
  const invalid = unique.filter((id) => id === selfId || !found.has(id))
  if (invalid.length > 0) {
    throw new AppError(
      'VALIDATION_ERROR',
      `relatedTermIds 引用了自指或不存在的词条: ${invalid.join(', ')}`,
    )
  }
}

/**
 * TERMS.md 排序键（design §7.3 + m3 FR-4.2）：
 * en-alpha 用 (en||zh) 小写码点序；pinyin 用词典拼音键；manual 保留选集顺序。
 * 同键依次以名称码点序、id 兜底，确保任意输入顺序下产物字节一致。
 */
function sortForMd(terms: TermOut[], orderBy: TermsOrderBy): TermOut[] {
  if (orderBy === 'manual') return terms
  const keyOf = (t: TermOut): string =>
    orderBy === 'pinyin' ? pinyinKey(t.zh || t.en || '') : termSortKey(t)
  return [...terms].sort(
    (a, b) =>
      compareCodeUnit(keyOf(a), keyOf(b)) ||
      compareCodeUnit(
        (a.en || a.zh || '').toLowerCase(),
        (b.en || b.zh || '').toLowerCase(),
      ) ||
      compareCodeUnit(a.id, b.id),
  )
}

export class TermsRepo {
  constructor(private readonly db: SqliteDatabase) {}

  create(input: TermCreateInput): TermOut {
    const id = newId('term')
    const aliases = dedupeAliases(input.aliases ?? [])
    const relatedTermIds = input.relatedTermIds ?? []
    validateRelatedIds(this.db, id, relatedTermIds)
    const ts = nowIso()
    this.db
      .prepare(
        `INSERT INTO terms (id, zh, en, aliases, definition, example, related_term_ids,
           source, tags, status, seed_hash, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      )
      .run(
        id,
        input.zh ?? null,
        input.en ?? null,
        JSON.stringify(aliases),
        input.definition,
        input.example ?? '',
        JSON.stringify(relatedTermIds),
        input.source ?? 'manual',
        JSON.stringify(input.tags ?? []),
        input.status ?? 'draft',
        ts,
        ts,
      )
    const term = this.get(id)
    if (!term) throw new AppError('INTERNAL', '创建后读取失败')
    return term
  }

  update(id: string, patch: TermUpdateInput): TermOut {
    const existing = this.db.prepare('SELECT * FROM terms WHERE id = ?').get(id) as
      | TermRow
      | undefined
    if (!existing) throw new AppError('NOT_FOUND', `词条不存在: ${id}`)
    const before = rowToTerm(existing)
    const zh = patch.zh !== undefined ? patch.zh : before.zh
    const en = patch.en !== undefined ? patch.en : before.en
    if ((zh ?? '') === '' && (en ?? '') === '') {
      throw new AppError('VALIDATION_ERROR', 'zh 与 en 不得同时置空（m3 §6.1）')
    }
    const aliases = dedupeAliases(patch.aliases ?? before.aliases)
    const relatedTermIds = patch.relatedTermIds ?? before.relatedTermIds
    validateRelatedIds(this.db, id, relatedTermIds)
    this.db
      .prepare(
        `UPDATE terms SET zh=?, en=?, aliases=?, definition=?, example=?, related_term_ids=?,
           tags=?, status=?, seed_hash=NULL, updated_at=? WHERE id=?`,
      )
      .run(
        zh ?? null,
        en ?? null,
        JSON.stringify(aliases),
        patch.definition ?? before.definition,
        patch.example ?? before.example,
        JSON.stringify(relatedTermIds),
        JSON.stringify(patch.tags ?? before.tags),
        patch.status ?? before.status,
        nowIso(),
        id,
      )
    const term = this.get(id)
    if (!term) throw new AppError('INTERNAL', '更新后读取失败')
    return term
  }

  /** 删除词条 → 其他词条的 relatedTermIds 自动剔除该 id（引用清理，非级联，m3 FR-1.3） */
  delete(id: string): void {
    const info = this.db.transaction(() => {
      const res = this.db.prepare('DELETE FROM terms WHERE id = ?').run(id)
      const candidates = this.db
        .prepare(`SELECT id, related_term_ids FROM terms WHERE related_term_ids LIKE ?`)
        .all(`%${id}%`) as { id: string; related_term_ids: string }[]
      for (const c of candidates) {
        const related = parseJsonColumn<string[]>(c.related_term_ids, [])
        if (!related.includes(id)) continue
        this.db
          .prepare('UPDATE terms SET related_term_ids = ? WHERE id = ?')
          .run(JSON.stringify(related.filter((r) => r !== id)), c.id)
      }
      return res
    })()
    if (info.changes === 0) throw new AppError('NOT_FOUND', `词条不存在: ${id}`)
  }

  get(id: string): TermOut | null {
    const row = this.db.prepare('SELECT * FROM terms WHERE id = ?').get(id) as TermRow | undefined
    return row ? rowToTerm(row) : null
  }

  list(): TermOut[] {
    const rows = this.db
      .prepare('SELECT * FROM terms ORDER BY updated_at DESC')
      .all() as TermRow[]
    return rows.map(rowToTerm)
  }

  search(q: string): TermSearchOut[] {
    const hits = searchTermRowids(this.db, q)
    if (hits.length === 0) return []
    const placeholders = hits.map(() => '?').join(',')
    const rows = this.db
      .prepare(`SELECT rowid, * FROM terms WHERE rowid IN (${placeholders})`)
      .all(...hits.map((h) => h.rowid)) as (TermRow & { rowid: number })[]
    const byRowid = new Map(rows.map((r) => [r.rowid, rowToTerm(r)]))
    return hits
      .map((h) => {
        const term = byRowid.get(h.rowid)
        return term
          ? { term, matchedFields: h.matchedFields, matches: termMatchRanges(term, q) }
          : null
      })
      .filter((x): x is TermSearchOut => x !== null)
  }

  /** 生成 TERMS.md（确定性输出：同一选集+排序 → 字节级相同，m3 FR-4.2） */
  renderMd(input: RenderTermsMdInput): string {
    if (input.termIds.length === 0) {
      throw new AppError('EMPTY_SELECTION', '空选集不可渲染 TERMS.md（m3 §6.3）')
    }
    const placeholders = input.termIds.map(() => '?').join(',')
    const rows = this.db
      .prepare(`SELECT * FROM terms WHERE id IN (${placeholders})`)
      .all(...input.termIds) as TermRow[]
    const found = new Map(rows.map((r) => [r.id, rowToTerm(r)]))

    const missing = input.termIds.filter((id) => !found.has(id))
    if (missing.length > 0) {
      throw new AppError('STALE_SELECTION', `选集中 ${missing.length} 个词条已删除（m6a §6.2 同源）`)
    }

    const terms = input.termIds.map((id) => found.get(id)) as TermOut[]
    return renderTermsMdTable('选集', sortForMd(terms, input.orderBy ?? 'en-alpha'))
  }

  setSeedHash(id: string, seedHash: string): void {
    this.db.prepare('UPDATE terms SET seed_hash = ? WHERE id = ?').run(seedHash, id)
  }

  /** seed 通道：按 zh+en 定位（bundle 无 id） */
  findByNaturalKey(zh?: string, en?: string): TermOut | null {
    const row = this.db
      .prepare('SELECT * FROM terms WHERE zh IS ? AND en IS ?')
      .get(zh ?? null, en ?? null) as TermRow | undefined
    return row ? rowToTerm(row) : null
  }

  seedItemHash(item: { zh?: string; en?: string; aliases: string[]; definition: string; example: string }): string {
    return sha256Hex(
      stableJson({
        zh: item.zh ?? null,
        en: item.en ?? null,
        aliases: item.aliases,
        definition: item.definition,
        example: item.example,
      }),
    )
  }
}
