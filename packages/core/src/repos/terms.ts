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
import { pinyinDisplay, pinyinKey, parseJsonColumn, sha256Hex, stableJson } from './util'
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
  level: string
  starter: number
  domain: string | null
  scenario: string | null
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
    // FR-1.4：DB 的 0/1 在 repo 边界转 boolean，不让 0/1 泄漏到 API 与前端。
    // 用 `=== 1` 而不是 `Boolean(...)`：后者会把任何非 1 的脏值（如 2）当成真，
    // 而这一列上挂着 CHECK，唯一的真值就是 0 与 1。
    level: row.level as TermOut['level'],
    starter: row.starter === 1,
    domain: row.domain ?? null,
    // 列可空（未写即走「定义直出」），但对外一律给字符串 ''，不让 null 漏到前端
    scenario: row.scenario ?? '',
    seedHash: row.seed_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    pinyin: pinyinDisplay(row.zh ?? ''),
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
        .prepare(`SELECT id FROM terms WHERE id IN (${unique.map(() => '?').join(',')})`)
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
      compareCodeUnit((a.en || a.zh || '').toLowerCase(), (b.en || b.zh || '').toLowerCase()) ||
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
           source, tags, status, seed_hash, level, starter, domain, scenario,
           created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
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
        input.level ?? 'L2',
        input.starter === true ? 1 : 0,
        input.domain ?? null,
        input.scenario ?? '',
        ts,
        ts,
      )
    const term = this.get(id)
    if (!term) throw new AppError('INTERNAL', '创建后读取失败')
    return term
  }

  update(id: string, patch: TermUpdateInput): TermOut {
    const existing = this.db.prepare('SELECT * FROM terms WHERE id = ?').get(id) as
      TermRow | undefined
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
           tags=?, status=?, level=?, starter=?, domain=?, scenario=?, seed_hash=NULL,
           updated_at=? WHERE id=?`,
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
        patch.level ?? before.level,
        patch.starter === undefined ? (before.starter ? 1 : 0) : patch.starter ? 1 : 0,
        patch.domain === undefined ? before.domain : patch.domain,
        patch.scenario ?? before.scenario,
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
      .prepare('SELECT * FROM terms ORDER BY updated_at DESC, id ASC')
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
      throw new AppError(
        'STALE_SELECTION',
        `选集中 ${missing.length} 个词条已删除（m6a §6.2 同源）`,
      )
    }

    const terms = input.termIds.map((id) => found.get(id)) as TermOut[]
    return renderTermsMdTable('选集', sortForMd(terms, input.orderBy ?? 'en-alpha'))
  }

  setSeedHash(id: string, seedHash: string): void {
    this.db.prepare('UPDATE terms SET seed_hash = ? WHERE id = ?').run(seedHash, id)
  }

  /**
   * seed 通道：回填学习化四列（level / starter / domain / scenario）。
   *
   * ⚠️ **刻意不走 `update()`**：那条路径会写 `seed_hash = NULL`，而 seed_hash 为 NULL 的
   * 语义是「用户改过这条词条」⇒ 下次 `terms.json` 升级时这条会被整条跳过并 warning。
   * 难度标注是**派生数据**，不是用户编辑；用它把 441 条标成「已改」等于一次性冻结整个
   * 词库的种子升级通道，且不留任何痕迹。同理不碰 `updated_at` —— 回填不该把词条顶到
   * 列表最前面（`list()` 按 updated_at DESC 排序）。
   *
   * 只写传了的字段（`undefined` 表示不改），所以 level/starter、domain、scenario
   * 可以分多次回填。scenario 同样走这条路径而非 update()：它由 `term-scenarios.json`
   * 回填，走 update() 会把 441 条标成「用户改过」，理由与 level/starter 完全相同。
   * 返回 false 表示 id 不存在，调用方负责计数与告警。
   */
  setLearning(
    id: string,
    meta: {
      level?: TermOut['level']
      starter?: boolean
      domain?: string | null
      scenario?: string
    },
  ): boolean {
    const sets: string[] = []
    const params: (string | number | null)[] = []
    if (meta.level !== undefined) {
      sets.push('level = ?')
      params.push(meta.level)
    }
    if (meta.starter !== undefined) {
      sets.push('starter = ?')
      params.push(meta.starter ? 1 : 0)
    }
    if (meta.domain !== undefined) {
      sets.push('domain = ?')
      params.push(meta.domain)
    }
    if (meta.scenario !== undefined) {
      sets.push('scenario = ?')
      params.push(meta.scenario)
    }
    if (sets.length === 0) return false
    const info = this.db
      .prepare(`UPDATE terms SET ${sets.join(', ')} WHERE id = ?`)
      .run(...params, id)
    return info.changes > 0
  }

  /** seed 通道：按 zh+en 定位（bundle 无 id）。`WHERE zh IS ?` 形参，正确命中 en 为 NULL 的词条 */
  findByNaturalKey(zh?: string | null, en?: string | null): TermOut | null {
    const row = this.db
      .prepare('SELECT * FROM terms WHERE zh IS ? AND en IS ?')
      .get(zh ?? null, en ?? null) as TermRow | undefined
    return row ? rowToTerm(row) : null
  }

  /**
   * seed 通道：按 zh+en 定位并返回**全部**命中。
   *
   * ⚠️ 存在的理由：`findByNaturalKey` 用 `.get()`，多行命中时静默只取第一行。当前 441 条
   * 实测自然键唯一（`COUNT(DISTINCT quote(zh)||char(31)||quote(en))` = 441），所以那条路径够用；
   * 但 vibe-hub 是外部来源，若将来上游送来一条与既有词条同名的词，回填会**静默少写一条**。
   * 回填是「宁可吵闹也不静默」的通道，故只此路径用多行版并把多命中交调用方告警。
   */
  findAllByNaturalKey(zh?: string | null, en?: string | null): TermOut[] {
    const rows = this.db
      .prepare('SELECT * FROM terms WHERE zh IS ? AND en IS ?')
      .all(zh ?? null, en ?? null) as TermRow[]
    return rows.map(rowToTerm)
  }

  seedItemHash(item: {
    zh?: string
    en?: string
    aliases: string[]
    definition: string
    example: string
  }): string {
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
