/**
 * scripts/sweep-stale-temps.ts —— 清掉**陈旧的测试临时目录**（2026-11-01）。
 *
 * ## 它解决什么
 *
 * `packages/core/src/test-support/temp-dir.ts` 的退出兜底能覆盖三条退出路径
 * （正常结束 / SIGINT / SIGTERM）⇒ 但 **SIGKILL 救不了**（内核直接杀进程，
 * 用户态代码一律不跑）—— 那正是「CI 超时被 kill」「机器崩溃」的场景。
 *
 * ⇒ 实测事故（2026-10-31）：一次全量测试因磁盘满（`ENOSPC`）失败，
 *   而 `/var/folders/.../T` 下积了 **987 个** `ov-*` 目录 ⇒ `afterEach` 的清理
 *   在 ENOSPC 下也失败 ⇒ **自我放大**；人工清掉 942 个后可用空间从 440 MiB 回到 18 GiB。
 *
 * ⇒ 本脚本是那条「人工清理」的**自动化**：清掉**超过一定年龄**的残留目录。
 *
 * ## 为什么按「年龄」而不是「全清」
 *
 * 全清会误伤**正在跑**的测试的目录（别的进程正在用）⇒ 按年龄筛：
 * 默认只清 **24 小时以上**的（`--older-than-hours` 可调）。
 * ⚠️ 默认值偏保守：宁可多留一会儿，也不要删掉别人正在用的目录。
 *
 * ## 用法
 *
 * ```sh
 * pnpm temps:sweep                       # 默认：清 24 小时以上的
 * pnpm temps:sweep --older-than-hours 1  # 清 1 小时以上的（更激进）
 * pnpm temps:sweep --dry-run            # 只报不删
 * ```
 */
import { readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * 只清这些前缀的目录。
 *
 * ⚠️ **为什么用白名单而不是「所有看起来像临时目录的」**：
 *   `/tmp`（与 macOS 的 `$TMPDIR`）下有**别的工具**的临时目录
 *   （编辑器、构建工具、语言服务器的）⇒ 乱清会破坏别人的工作。
 *   ⇒ 只清本仓测试夹具的命名空间（`ov-` 前缀）。
 */
const OWNED_PREFIXES = [
  'ov-cli-home-',
  'ov-core-test-',
  'ov-verify-',
  'ov-matrix-',
  'ov-smoke-',
  'ov-s2-',
  'ov-pub-walk-',
  'ov-iso-',
  'ov-lazy-walk-',
  'ov-onb-walk-',
  'ov-tel-egress-',
  'ov-selftest-',
  'ov-probe-',
  'ov-tempdir-',
] as const

function parseHours(argv: string[]): number {
  const i = argv.indexOf('--older-than-hours')
  if (i < 0 || argv[i + 1] === undefined) return 24
  const n = Number(argv[i + 1])
  return Number.isFinite(n) && n >= 0 ? n : 24
}

const hours = parseHours(process.argv.slice(2))
const dryRun = process.argv.includes('--dry-run')
const root = tmpdir()
const cutoff = Date.now() - hours * 3_600_000

let removed = 0
let kept = 0
let skipped = 0

for (const name of readdirSync(root)) {
  if (!OWNED_PREFIXES.some((p) => name.startsWith(p))) continue
  const path = join(root, name)
  let st
  try {
    st = statSync(path)
  } catch {
    continue
  }
  if (!st.isDirectory()) continue
  if (st.mtimeMs > cutoff) {
    // 还在「保鲜期」内 ⇒ 可能正被某个测试用着 ⇒ 不动
    kept += 1
    continue
  }
  if (dryRun) {
    console.log(`[temps:sweep] （dry-run）将删：${path}`)
    removed += 1
    continue
  }
  try {
    rmSync(path, { recursive: true, force: true })
    removed += 1
  } catch (e) {
    skipped += 1
    console.error(`[temps:sweep] 删不掉：${path} —— ${e instanceof Error ? e.message : String(e)}`)
  }
}

console.log(
  `[temps:sweep] ${dryRun ? '（dry-run）将删' : '已删'} ${String(removed)} 个超过 ${String(hours)} 小时的测试临时目录；` +
    `保鲜期内 ${String(kept)} 个（未动）；删不掉 ${String(skipped)} 个`,
)
