/**
 * bundle:check —— Web 产物体积门禁（T8f；dev-plan §5.4「CodeMirror 仅抽屉内懒加载」的机器版）。
 *
 * 读 apps/web/dist（先 `pnpm --filter @openvibe/web build`），断言两条：
 * 入口 chunk ≤ 300kB、任一 chunk ≤ 500kB。
 * 基线（2026-09-23 拆包后）：入口 291.01kB / gzip 95.27kB，最大 chunk 347.45kB（CodeMirror 渲染层）。
 * 拆包前是单个 1,155.62kB 入口——一次 barrel 或 `sideEffects` 回归就能滑回去（zod 曾静默占掉入口
 * 360kB 源码），所以把这行数写成门禁而不是走查笔记。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const BUDGET = { entryMaxKb: 300, chunkMaxKb: 500 } as const

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(REPO, 'apps', 'web', 'dist')

/** 与 vite 同口径（1kB = 1000B），否则同一份产物两处报数对不上（vite 报 291.01，按 KiB 会算成 284.19） */
const kb = (bytes: number): number => Math.round((bytes / 1000) * 100) / 100

function fail(msg: string): never {
  console.error(`[bundle:check] ${msg}`)
  process.exit(1)
}

let html: string
let chunks: { name: string; kb: number }[]
try {
  html = readFileSync(join(DIST, 'index.html'), 'utf8')
  chunks = readdirSync(join(DIST, 'assets'))
    .filter((f) => f.endsWith('.js'))
    .map((f) => ({ name: f, kb: kb(statSync(join(DIST, 'assets', f)).size) }))
    .sort((a, b) => b.kb - a.kb)
} catch {
  fail('读不到 apps/web/dist —— 先跑 pnpm --filter @openvibe/web build')
}

const scripts = [...html.matchAll(/<script[^>]+src="\/?([^"]+\.js)"/g)].map(
  (m) => String(m[1]).split('/').pop() ?? '',
)
if (scripts.length === 0) fail('index.html 里没有 <script src="…js">，产物形状变了')
if (scripts.length > 1)
  fail(`index.html 挂了 ${String(scripts.length)} 个 script：${scripts.join(' ')}`)

const entry = chunks.find((c) => c.name === scripts[0])
if (entry === undefined) fail(`index.html 指向的 ${scripts[0] ?? ''} 不在 assets/ 里`)

const problems: string[] = []
if (entry.kb > BUDGET.entryMaxKb) {
  problems.push(
    `入口 ${entry.name} ${String(entry.kb)}kB 超 ${String(BUDGET.entryMaxKb)}kB` +
      ' —— 查是不是有页面或重库被静态引回 AppShell/入口',
  )
}
for (const chunk of chunks) {
  if (chunk.kb > BUDGET.chunkMaxKb) {
    problems.push(`chunk ${chunk.name} ${String(chunk.kb)}kB 超 ${String(BUDGET.chunkMaxKb)}kB`)
  }
}

if (problems.length > 0) {
  for (const p of problems) console.error(`[bundle:check] ✗ ${p}`)
  console.error(`  入口 ${String(entry.kb)}kB / 共 ${String(chunks.length)} 个 chunk`)
  process.exit(1)
}

const biggest = chunks[0]
console.log(
  `[bundle:check] 通过 — 入口 ${String(entry.kb)}kB ≤ ${String(BUDGET.entryMaxKb)}kB / ` +
    `${String(chunks.length)} 个 chunk，最大 ${String(biggest?.kb ?? 0)}kB ≤ ${String(BUDGET.chunkMaxKb)}kB`,
)
for (const c of chunks.slice(0, 5)) console.log(`  · ${c.name} ${String(c.kb)}kB`)
