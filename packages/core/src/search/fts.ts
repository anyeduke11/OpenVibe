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

/** 技巧搜索命中：与术语同一形状（rowid + 命中字段清单），故复用同一类型 */
export type PlaybookSearchHit = TermSearchHit

/** m4 FR-2.2：分流与分词器都照术语那条线——只换检索列，不自造口径 */
export function searchPlaybookRowids(db: SqliteDatabase, q: string): PlaybookSearchHit[] {
  const lower = q.toLowerCase()
  const fieldsOf = (row: {
    scenario: string
    problem: string
    practice: string
    anti_practice: string
    tags: string
  }) => {
    const fields: string[] = []
    if (row.scenario.toLowerCase().includes(lower)) fields.push('scenario')
    if (row.problem.toLowerCase().includes(lower)) fields.push('problem')
    if (row.practice.toLowerCase().includes(lower)) fields.push('practice')
    if (row.anti_practice.toLowerCase().includes(lower)) fields.push('antiPractice')
    if (parseCsvIncludes(row.tags, lower)) fields.push('tags')
    return fields
  }

  const cols = 'scenario, problem, practice, anti_practice, tags'
  // join 分支必须带表前缀：两个表都有同名列，不限定就是 ambiguous column
  const joined = 'p.scenario, p.problem, p.practice, p.anti_practice, p.tags'

  if (q.length >= 3) {
    const rows = db
      .prepare(
        `SELECT p.rowid AS rowid, ${joined}
           FROM fts_playbooks f JOIN playbooks p ON p.rowid = f.rowid
          WHERE fts_playbooks MATCH ? ORDER BY rank, p.rowid ASC`,
      )
      .all(ftsPhrase(q)) as PlaybookFtsRow[]
    return rows.map((r) => ({ rowid: r.rowid, matchedFields: fieldsOf(r) }))
  }

  const like = `%${q}%`
  const rows = db
    .prepare(
      `SELECT rowid, ${cols} FROM playbooks
        WHERE scenario LIKE ? OR problem LIKE ? OR practice LIKE ?
           OR anti_practice LIKE ? OR tags LIKE ?
        ORDER BY updated_at DESC, id ASC`,
    )
    .all(like, like, like, like, like) as PlaybookFtsRow[]
  return rows.map((r) => ({ rowid: r.rowid, matchedFields: fieldsOf(r) }))
}

interface PlaybookFtsRow {
  rowid: number
  scenario: string
  problem: string
  practice: string
  anti_practice: string
  tags: string
}

function parseCsvIncludes(aliasesJson: string, lower: string): boolean {
  try {
    const arr = JSON.parse(aliasesJson) as string[]
    return arr.some((a) => a.toLowerCase().includes(lower))
  } catch {
    return aliasesJson.toLowerCase().includes(lower)
  }
}
