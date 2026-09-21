/**
 * TERMS.md 渲染契约（design §7.4 / m3 FR-4）——纯函数，供 core 仓储、seed:check 与
 * T6 组包器共用；排序不在此处（拼音排序依赖词典，留在 core）。
 * 转义只在渲染这一刻发生一次：词条原文保留裸 `|`。
 */

export interface TermTableRow {
  zh?: string | null
  en?: string | null
  aliases: string[]
  definition: string
}

export const TERMS_MD_TITLE_PREFIX = '术语表'
export const TERMS_MD_LEAD = '> AI 与团队共用的词汇标准；新词请先入库再使用。'
export const TERMS_MD_HEADER = '| 术语 | English | 别名 | 定义 |'
export const TERMS_MD_DIVIDER = '|------|---------|------|------|'

/** Markdown 表格单元：换行折成空格，裸 `|` 转义为 `\|`（m3 §6.5） */
export function escapeMarkdownCell(value: string): string {
  return value.replaceAll('\n', ' ').replaceAll('|', '\\|')
}

/**
 * 固定表头 + 传入顺序的行序 → 字节级确定产物（不含时间戳，m3 FR-4.2）。
 * subject 为标题后缀：独立预览传「选集」，组包传 `<packName>@<version>`（design §7.4）。
 */
export function renderTermsMdTable(subject: string, rows: readonly TermTableRow[]): string {
  const lines = [
    `# ${TERMS_MD_TITLE_PREFIX} · ${subject}`,
    '',
    TERMS_MD_LEAD,
    '',
    TERMS_MD_HEADER,
    TERMS_MD_DIVIDER,
  ]
  for (const row of rows) {
    lines.push(
      `| ${escapeMarkdownCell(row.zh ?? '')} | ${escapeMarkdownCell(row.en ?? '')} | ${escapeMarkdownCell(row.aliases.join('、'))} | ${escapeMarkdownCell(row.definition)} |`,
    )
  }
  lines.push('')
  return lines.join('\n')
}

/** 术语排序键（design §7.3）：`(en||zh).toLowerCase()`；调用方用 compareCodeUnit 比较 */
export function termSortKey(term: { zh?: string | null; en?: string | null }): string {
  return (term.en || term.zh || '').toLowerCase()
}

/** m3 §6.2：别名去空白、丢空串，英文按大小写无关去重，保留首次出现的写法 */
export function dedupeAliases(aliases: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of aliases) {
    const value = raw.trim()
    if (value === '') continue
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(value)
  }
  return out
}

/**
 * m3 FR-1.2：相关词双向展示的并集口径（A→B 则 B 的相关也含 A）。
 * 单向存储、双向取并集，按 id 码点序返回以保证渲染确定性；排除自指。
 */
export function bidirectionalRelatedIds<T extends { id: string; relatedTermIds: string[] }>(
  terms: readonly T[],
  id: string,
): string[] {
  const union = new Set<string>()
  for (const term of terms) {
    if (term.id === id) {
      for (const target of term.relatedTermIds) if (target !== id) union.add(target)
    } else if (term.relatedTermIds.includes(id)) {
      union.add(term.id)
    }
  }
  return [...union].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

export interface MatchRange {
  start: number
  end: number
}

/**
 * 大小写无关的子串命中区间（m3 FR-3.2 高亮）；长度不一致（特殊大小写折叠）时放弃该窗口。
 */
export function findMatchRanges(text: string, needle: string): MatchRange[] {
  if (text === '' || needle === '') return []
  const hay = text.toLowerCase()
  const aim = needle.toLowerCase()
  if (aim.length > hay.length || hay.length !== text.length) return []
  const ranges: MatchRange[] = []
  let from = 0
  for (;;) {
    const at = hay.indexOf(aim, from)
    if (at === -1) return ranges
    ranges.push({ start: at, end: at + aim.length })
    from = at + aim.length
  }
}
