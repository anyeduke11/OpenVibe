/**
 * scripts/barrel-snapshot.ts —— 主出口面快照（v0.2.3 批次 C，owner 增强项②）。
 *
 * `packages/core/src/index.ts` 的导出面是 0.2.3 tarball 的**对外契约**：
 * 每个增删都应被审阅，而不是静默溜进包里。本脚本把面快照落档
 * `tests/core-main-exports.txt`（逐行一个符号、码点序）；
 * `tests/main-face-snapshot.test.ts` 在 unit 面（三平台 CI 每轮）比对现值，
 * 不一致即红——重新生成用 `pnpm barrel:snapshot`，快照的 diff 就是契约变更清单。
 */
import { writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { exportedNames } from '../tests/support/barrel-parse'

const ROOT = process.cwd()
const INDEX = join(ROOT, 'packages', 'core', 'src', 'index.ts')
const OUT = join(ROOT, 'tests', 'core-main-exports.txt')

const names = exportedNames(INDEX)
writeFileSync(OUT, `${names.join('\n')}\n`, 'utf8')
console.log(`主出口快照：${names.length} 符号 → ${relative(ROOT, OUT)}`)
