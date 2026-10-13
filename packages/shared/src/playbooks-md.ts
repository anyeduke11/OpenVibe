/**
 * PLAYBOOKS.md 渲染契约（m4 FR-6）——纯函数，供 core 仓储、composer 与 seed:check 共用。
 * 与 TERMS.md 同纪律：转义只在渲染这一刻发生一次（条目原文保留裸 `|`），
 * 排序不在此处（走 core 的 sortForMd，码点序纪律在那边）。
 */

import { escapeMarkdownCell } from './terms-md'

export interface PlaybookTableRow {
  scenario: string
  problem: string
  practice: string
  /** 可空（FR-1.1）：空串 ⇒ 该单元格留空，不产「反例：」这类空标签 */
  antiPractice: string
  /** FR-4.3：用文字标注，不靠颜色单义 */
  verified: boolean
}

export const PLAYBOOKS_MD_TITLE_PREFIX = '技巧库'
export const PLAYBOOKS_MD_LEAD = '> 踩过的坑与绕对的做法；新技巧请先入库再使用。'
export const PLAYBOOKS_MD_HEADER = '| 场景 | 问题 | 正确做法 | 反例 | 亲测有效 |'
export const PLAYBOOKS_MD_DIVIDER = '|------|------|----------|------|------|'
/** 「亲测有效」列的唯一肯定字面量；未验证留空串（FR-4.3 文字口径） */
export const PLAYBOOK_MD_VERIFIED_MARK = '是'

/**
 * 固定表头 + 传入顺序的行序 → 字节级确定产物（不含时间戳，FR-6.2）。
 * subject 为标题后缀：独立预览传「选集」，组包传 `<packName>@<version>`。
 */
export function renderPlaybooksMdTable(subject: string, rows: readonly PlaybookTableRow[]): string {
  const lines = [
    `# ${PLAYBOOKS_MD_TITLE_PREFIX} · ${subject}`,
    '',
    PLAYBOOKS_MD_LEAD,
    '',
    PLAYBOOKS_MD_HEADER,
    PLAYBOOKS_MD_DIVIDER,
  ]
  for (const row of rows) {
    lines.push(
      `| ${escapeMarkdownCell(row.scenario)} | ${escapeMarkdownCell(row.problem)} | ` +
        `${escapeMarkdownCell(row.practice)} | ${escapeMarkdownCell(row.antiPractice)} | ` +
        `${row.verified ? PLAYBOOK_MD_VERIFIED_MARK : ''} |`,
    )
  }
  lines.push('')
  return lines.join('\n')
}