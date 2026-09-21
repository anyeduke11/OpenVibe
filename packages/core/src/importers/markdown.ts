import type { PromptImportItem } from '@openvibe/shared'
import type { ImportFile } from './rule-files'

/** 单 md → title 取一级标题（无则文件名），content 为全文（m1 FR-6.2） */
export function parseMarkdownFile(file: ImportFile): PromptImportItem {
  const h1 = /^# +(?!#)(.+?)[ \t]*$/m.exec(file.content)
  const title = (h1?.[1] ?? file.filename).trim()
  return { title: title === '' ? file.filename : title, content: file.content }
}
