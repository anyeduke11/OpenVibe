/**
 * seed:review —— 从 content/seed 生成 owner 审校清单（seed-content 执行角色 D14）。
 * `pnpm seed:check` 只能保证结构与配额，语义质量要人过一遍，这里把「本轮新增了什么」摊开：
 * 术语按与 git 基线的自然键差集列出新增条目全文，提示词按 §3.4 配额逐条列用途。
 * 用法：pnpm seed:review（等价 tsx scripts/seed-review.ts，可加 --base-ref <ref>）
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SEED_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'content', 'seed')
const args = process.argv.slice(2)
const flagAt = args.indexOf('--base-ref')
const baseRef = flagAt >= 0 ? (args[flagAt + 1] ?? 'HEAD') : 'HEAD'

interface TermItem {
  zh?: string
  en?: string
  aliases?: string[]
  definition?: string
  example?: string
  tags?: string[]
}
interface PromptItem {
  title: string
  description?: string
  content: string
  tags?: string[]
  platformMarks?: string[]
  useAs?: string
}

function bundleAt(path: string, ref: string | null): unknown[] {
  const text = ref
    ? execFileSync('git', ['show', `${ref}:${path}`], { encoding: 'utf8' })
    : readFileSync(join(SEED_DIR, path.split('/').pop() as string), 'utf8')
  const items = (JSON.parse(text) as { items: unknown[] }).items
  return Array.isArray(items) ? items : []
}

const termKey = (t: TermItem): string => `${t.zh ?? ''}\u0000${t.en ?? ''}`
const varsOf = (content: string): string[] =>
  [...content.matchAll(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_-]*)\s*\}\}/g)].map((m) => m[1] as string)

const terms = bundleAt('content/seed/terms.json', null) as TermItem[]
const termsBase = new Set((bundleAt('content/seed/terms.json', baseRef) as TermItem[]).map(termKey))
const newTerms = terms.filter((t) => !termsBase.has(termKey(t)))

const prompts = bundleAt('content/seed/prompts.json', null) as PromptItem[]
const promptsBase = new Set(
  (bundleAt('content/seed/prompts.json', baseRef) as PromptItem[]).map((p) => p.title),
)
const newPrompts = prompts.filter((p) => !promptsBase.has(p.title))
const goneTerms = [...termsBase].filter((k) => !new Set(terms.map(termKey)).has(k))

const out: string[] = []
out.push(`# T8 种子内容审校清单（基线 ${baseRef}）`)
out.push('')
out.push(
  `生成方式：\`pnpm seed:review -- --base-ref ${baseRef}\`（可随时重放，事实源是 content/seed 与 git 基线）。`,
)
out.push('')
out.push(
  `口径：terms ${terms.length} 条（新增 ${newTerms.length} / 移除 ${goneTerms.length}）、prompts ${prompts.length} 条（新增 ${newPrompts.length}）。` +
    `结构门槛由 \`pnpm seed:check\` 把关（数量/别名/受控词表/定义长度/example 覆盖/§3.4 配额），` +
    `本清单只解决机器测不到的部分：**定义是否真的准确、措辞是否有 AI 腔、示例是否成立**。`,
)
out.push('')
if (goneTerms.length > 0) {
  out.push(`本轮移除（与既有词条重叠或价值偏低）：${goneTerms.map((k) => k.split('\u0000')[0]).join('、')}`)
  out.push('')
}
out.push(`## 术语（新增 ${newTerms.length} 条，逐条待校）`)
out.push('')
out.push('| # | zh | en | 标签 | 定义（待校：是否准确、有无夸大） | example（待校：是否成立） |')
out.push('| --- | --- | --- | --- | --- | --- |')
newTerms.forEach((t, i) => {
  const cell = (s: string | undefined): string => (s ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ')
  out.push(
    `| ${i + 1} | ${cell(t.zh)} | ${cell(t.en)} | ${(t.tags ?? []).join('/')} | ${cell(t.definition)} | ${cell(t.example) || '（无）'} |`,
  )
})
out.push('')
out.push(`## 精选提示词（${newPrompts.length} 条，逐条待校）`)
out.push('')
out.push('| # | title | useAs | 平台标记 | 变量 | 字节 | 意图（待校：指令是否可执行、有无空话） |')
out.push('| --- | --- | --- | --- | --- | --- | --- |')
newPrompts.forEach((p, i) => {
  const cell = (s: string | undefined): string => (s ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ')
  out.push(
    `| ${i + 1} | ${cell(p.title)} | ${p.useAs ?? 'reference'} | ${(p.platformMarks ?? []).join(' ')} | ${varsOf(p.content).join(', ') || '—'} | ${Buffer.byteLength(p.content, 'utf8')} | ${cell(p.description)} |`,
  )
})
out.push('')
out.push(`## 裁决记录（owner 填写）`)
out.push('')
out.push('| 条目 | 结论（留 / 改 / 删） | 备注 |')
out.push('| --- | --- | --- |')
out.push('| （待填） | | |')
out.push('')
process.stdout.write(`${out.join('\n')}\n`)
