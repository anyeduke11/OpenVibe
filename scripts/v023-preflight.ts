/**
 * scripts/v023-preflight.ts —— v0.2.3 提交前预检（owner 增强项①）。
 *
 * 三件事：
 * ① 清单对账：提交清单（docs/devlog-evidence/v023-commit-manifest.md）里的文件 vs
 *    工作树实际改动——清单漏项（工作树有、清单无）逐个列出并标注是否并行会话在编；
 * ② 存在性：清单内每个文件当前真实存在（被误删/移动即报）；
 * ③ 闸门提示：不代跑三闸（lint/typecheck/test 由 owner 随提交批次跑），只打印建议命令。
 *
 * 用法：pnpm v023:preflight；退出码 0=对账干净，1=有清单外改动或清单内缺文件。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const MANIFEST = join(ROOT, 'docs/devlog-evidence/v023-commit-manifest.md')

const manifest = readFileSync(MANIFEST, 'utf8')
const allRows = [...manifest.matchAll(/^- `([^`]+)`(.*)$/gm)]
const listed = allRows.map((m) => m[1]!)
const deletedMarked = new Set(
  allRows.filter((m) => (m[2] ?? '').includes('删除态')).map((m) => m[1]!),
)

const status = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' })
// porcelain：XY 两字符状态 + 空格 + 路径（与 manifest 生成端同一解析；rename 行取新路径）
const changed = status
  .split('\n')
  .map((l) => l.replace(/\n$/, ''))
  .filter((l) => l.length > 3)
  .map((l) => {
    let path = l.slice(3)
    if (path.includes(' -> ')) path = path.split(' -> ')[1] ?? path
    return path
  })

const PARALLEL =
  /(docs-check|section-ref-audit|langRoadmap|restore-link-check|dev-plan\.md|export-agent-memory|concurrency-guard|probe-raw-check)/
const listedSet = new Set(listed)

const missing = listed.filter((f) => !deletedMarked.has(f) && !existsSync(join(ROOT, f)))
const unlisted = changed.filter(
  (f) => !listedSet.has(f) && !f.startsWith('demo/') && !f.startsWith('redesign/'),
)

console.log(
  `清单：${String(listed.length)} 个文件；工作树改动（含未跟踪）：${String(changed.length)} 个`,
)
if (missing.length > 0) {
  console.error(`⛔ 清单内文件不存在（被误删/移动？）：`)
  for (const f of missing) console.error(`  · ${f}`)
}
if (unlisted.length > 0) {
  console.log(
    `⚠ 清单外的工作树改动 ${String(unlisted.length)} 个（应全部是并行会话在编；有本会话文件则先补清单）：`,
  )
  for (const f of unlisted) {
    console.log(`  · ${PARALLEL.test(f) ? '[并行在编-预期]' : '[需人工判断]'} ${f}`)
  }
}
if (missing.length === 0 && unlisted.every((f) => PARALLEL.test(f))) {
  console.log('✓ 对账干净：清单覆盖本会话全部改动，清单外仅并行会话在编文件')
  console.log(
    '提交前建议：pnpm lint && pnpm typecheck && pnpm test && pnpm docs:check && pnpm ownership:check',
  )
  process.exit(0)
}
process.exit(1)
