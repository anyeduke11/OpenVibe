/**
 * scripts/barrel-audit.ts —— 主出口零消费符号审计（v0.2.3 批次 C CS5 的工具面）。
 *
 * 只审计、不改写：列出 `packages/core/src/index.ts` 主出口的每个符号及其
 * 「barrel 之外的消费者数」，零消费者清单就是 CS5 分批收敛的工作清单
 * （spec：每批 ≤80、先清纯类型/常量、不设一次清零死线）。
 *
 * 消费判定口径：`\b<name>\b` 出现在**除主出口自身与该符号定义模块之外**的任何
 * 仓内 .ts 文件（apps/ packages/ scripts/ tests/）即算有消费者——字符串命中有
 * 误报可能（同名注释/文案），只会**低估**零消费清单，宁可漏报不可误删。
 *
 * 用法：tsx scripts/barrel-audit.ts [--markdown]
 *
 * 解析器单源在 `tests/support/barrel-parse.ts`（tooling-face 闸与主出口快照共用同一份，
 * 谁也不得自带一份「按行数猜符号」的正则）。本脚本只多做一件事：**消费面扫描**。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { parseExportsOfFile, type ExportedName } from '../tests/support/barrel-parse'

const ROOT = process.cwd()
const INDEX = join(ROOT, 'packages/core/src/index.ts')

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.git' || entry.startsWith('.')) continue
    const abs = join(dir, entry)
    if (statSync(abs).isDirectory()) out.push(...walk(abs))
    else if (abs.endsWith('.ts') || abs.endsWith('.tsx')) out.push(abs)
  }
  return out
}

const exported = parseExportsOfFile(INDEX)
const files = walk(ROOT).filter((f) => relative(ROOT, f) !== relative(ROOT, INDEX))
const fileTexts = new Map<string, string>(files.map((f) => [f, readFileSync(f, 'utf8')]))

const zero: ExportedName[] = []
for (const e of exported) {
  const defModule = join(ROOT, 'packages/core/src', e.module)
  let consumers = 0
  for (const [f, text] of fileTexts) {
    if (f === defModule) continue
    if (new RegExp(`\\b${e.name}\\b`).test(text)) {
      consumers += 1
      break
    }
  }
  if (consumers === 0) zero.push(e)
}

const types = zero.filter((e) => e.isType)
const values = zero.filter((e) => !e.isType)
const markdown = process.argv.includes('--markdown')

if (markdown) {
  console.log(`## 主出口零消费符号审计（${new Date().toISOString().slice(0, 10)}）`)
  console.log('')
  console.log(`导出符号共 **${exported.length}**；零消费 **${zero.length}**（类型 ${types.length} / 值 ${values.length}）。`)
  console.log('')
  console.log('| 符号 | 类别 | 定义模块 |')
  console.log('|---|---|---|')
  for (const e of zero) console.log(`| \`${e.name}\` | ${e.isType ? 'type' : 'value'} | ${e.module} |`)
} else {
  console.log(`主出口符号：${exported.length}；零消费：${zero.length}（类型 ${types.length} / 值 ${values.length}）`)
  console.log('CS5 建议批次：先清类型（批一），值符号逐个复核后清（批二/三）。')
  for (const e of zero) console.log(`  ${e.isType ? 'type' : 'value'}  ${e.name}  (${e.module})`)
}
