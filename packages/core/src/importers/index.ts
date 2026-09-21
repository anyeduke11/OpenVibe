import { AppError, PromptImportItem } from '@openvibe/shared'
import type { PromptImportItem as PromptImportItemType } from '@openvibe/shared'
import { parseMarkdownFile } from './markdown'
import { parsePromptJsonExport } from './json-import'
import { isRuleFile, parseRuleFile, type ImportFile } from './rule-files'

export type { ImportFile }
export { isRuleFile, parseRuleFile, stripFrontmatter } from './rule-files'
export { parseMarkdownFile } from './markdown'
export { parsePromptJsonExport } from './json-import'

function validate(file: ImportFile, item: PromptImportItemType): PromptImportItemType {
  const parsed = PromptImportItem.safeParse(item)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    throw new AppError(
      'VALIDATION_ERROR',
      `文件 ${file.filename} 非法：${first ? first.message : 'schema 校验失败'}（m1 §6.5 整批拒绝）`,
    )
  }
  return parsed.data
}

/** 按扩展名分发四解析器（dev-plan §7.3）；任一条目非法即抛 AppError 整批 422 */
export function parseImportFiles(files: ImportFile[]): PromptImportItemType[] {
  const items: PromptImportItemType[] = []
  for (const file of files) {
    if (typeof file?.filename !== 'string' || typeof file?.content !== 'string') {
      throw new AppError('VALIDATION_ERROR', 'files[] 每项须为 {filename, content} 字符串对')
    }
    const lower = file.filename.toLowerCase()
    if (lower.endsWith('.json')) {
      items.push(...parsePromptJsonExport(file.content).map((i) => validate(file, i)))
      continue
    }
    if (isRuleFile(file.filename)) {
      items.push(validate(file, parseRuleFile(file)))
      continue
    }
    if (lower.endsWith('.md')) {
      items.push(validate(file, parseMarkdownFile(file)))
      continue
    }
    throw new AppError(
      'VALIDATION_ERROR',
      `不支持的文件类型：${file.filename}（接受 .json / .md / .mdc / .cursorrules / CLAUDE.md / AGENTS.md）`,
    )
  }
  return items
}
