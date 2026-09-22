import type { SqliteDatabase } from '../db'

/**
 * 查询路由（design §12 / dev-plan §7.5）：
 * len(q) >= 3 → FTS5 trigram MATCH（q 作为短语，BM25 排序）
 * len(q) < 3  → LIKE 降级（中文两字词靠此路径，updatedAt 排序）
 */
export function ftsPhrase(q: string): string {
  return `"${q.replaceAll('"', '""')}"`
}

export function searchPromptRowids(db: SqliteDatabase, q: string): number[] {
  if (q.length >= 3) {
    const rows = db
      .prepare('SELECT rowid FROM fts_prompts WHERE fts_prompts MATCH ? ORDER BY rank, rowid ASC')
      .all(ftsPhrase(q)) as { rowid: number }[]
    return rows.map((r) => r.rowid)
  }
  const like = `%${q}%`
  const rows = db
    .prepare(
      `SELECT rowid FROM prompts
        WHERE title LIKE ? OR content LIKE ? OR tags LIKE ?
        ORDER BY updated_at DESC, id ASC`,
    )
    .all(like, like, like) as { rowid: number }[]
  return rows.map((r) => r.rowid)
}

export interface TermSearchHit {
  rowid: number
  matchedFields: string[]
}

export function searchTermRowids(db: SqliteDatabase, q: string): TermSearchHit[] {
  const lower = q.toLowerCase()
  const fieldsOf = (row: { zh: string | null; en: string | null; aliases: string; definition: string }) => {
    const fields: string[] = []
    if (row.zh?.toLowerCase().includes(lower)) fields.push('zh')
    if (row.en?.toLowerCase().includes(lower)) fields.push('en')
    if (parseCsvIncludes(row.aliases, lower)) fields.push('aliases')
    if (row.definition.toLowerCase().includes(lower)) fields.push('definition')
    return fields
  }

  if (q.length >= 3) {
    const rows = db
      .prepare(
        `SELECT t.rowid AS rowid, t.zh AS zh, t.en AS en, t.aliases AS aliases, t.definition AS definition
           FROM fts_terms f JOIN terms t ON t.rowid = f.rowid
          WHERE fts_terms MATCH ? ORDER BY rank, t.rowid ASC`,
      )
      .all(ftsPhrase(q)) as {
      rowid: number
      zh: string | null
      en: string | null
      aliases: string
      definition: string
    }[]
    return rows.map((r) => ({ rowid: r.rowid, matchedFields: fieldsOf(r) }))
  }

  const like = `%${q}%`
  const rows = db
    .prepare(
      `SELECT rowid, zh, en, aliases, definition FROM terms
        WHERE zh LIKE ? OR en LIKE ? OR aliases LIKE ? OR definition LIKE ?
        ORDER BY updated_at DESC, id ASC`,
    )
    .all(like, like, like, like) as {
    rowid: number
    zh: string | null
    en: string | null
    aliases: string
    definition: string
  }[]
  return rows.map((r) => ({ rowid: r.rowid, matchedFields: fieldsOf(r) }))
}

function parseCsvIncludes(aliasesJson: string, lower: string): boolean {
  try {
    const arr = JSON.parse(aliasesJson) as string[]
    return arr.some((a) => a.toLowerCase().includes(lower))
  } catch {
    return aliasesJson.toLowerCase().includes(lower)
  }
}
