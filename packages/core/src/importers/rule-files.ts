import type { PromptImportItem } from '@openvibe/shared'

/** Web 导入与 CLI `scan --project` 的统一文件形状（m1 FR-6.3 落同一 API） */
export interface ImportFile {
  filename: string
  content: string
}

const RULE_BASENAMES: Record<string, PromptImportItem['platformMarks']> = {
  'claude.md': ['claude-code'],
  'agents.md': ['generic'],
}

function ruleItem(
  filename: string,
  content: string,
  platformMarks: PromptImportItem['platformMarks'],
  description = '',
): PromptImportItem {
  return { title: filename, content, description, useAs: 'rule', platformMarks }
}

/** `.mdc` 的 YAML frontmatter 剥离：description/summary 键入 description，正文入 content（m1 FR-6.4） */
export function stripFrontmatter(text: string): { description: string; body: string } {
  const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/.exec(text)
  if (!m) return { description: '', body: text }
  let description = ''
  for (const line of (m[1] ?? '').split(/\r?\n/)) {
    const kv = /^(?:description|summary)[ \t]*:[ \t]*(.*)$/.exec(line)
    if (kv?.[1]) {
      description = kv[1].trim().replace(/^["']|["']$/g, '')
      break
    }
  }
  return { description, body: text.slice(m[0].length) }
}

/** dev-plan §7.3 解析表：`.cursorrules` / `.mdc` / `CLAUDE.md` / `AGENTS.md` → useAs=rule */
export function isRuleFile(filename: string): boolean {
  const lower = filename.toLowerCase()
  const base = lower.split('/').pop() ?? lower
  return base in RULE_BASENAMES || base.endsWith('.cursorrules') || base.endsWith('.mdc')
}

export function parseRuleFile(file: ImportFile): PromptImportItem {
  const base = (file.filename.toLowerCase().split('/').pop() ?? '').trim()
  const marks = RULE_BASENAMES[base]
  if (marks) return ruleItem(file.filename, file.content, marks)
  if (base.endsWith('.cursorrules')) return ruleItem(file.filename, file.content, ['cursor'])
  if (base.endsWith('.mdc')) {
    const { description, body } = stripFrontmatter(file.content)
    return ruleItem(file.filename, body, ['cursor'], description)
  }
  throw new Error(`非规则文件: ${file.filename}`)
}
