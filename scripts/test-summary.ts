/**
 * scripts/test-summary.ts —— `pnpm test` 的**四数汇总**（2026-10-31 · v0.2.4 R0 · F13 / X3）。
 *
 * ## 它解决什么
 *
 * 旧口径「全量 2439 条中 1 条失败，其余 2438 条计为通过」里，混着**根本没跑**的用例
 * （环境门控写成裸 `if (!hasGo) return` ⇒ 框架记为 passed）⇒ 环境缺失被读作覆盖率。
 *
 * ⇒ PRD F13 / X3 要求：`pnpm test` 的输出要**同时给出 passed / failed / skipped / todo
 *   四个数**，且 `todo` **不得计入 passed**（必须单列）。
 *
 * ## 为什么用「解析 vitest 输出」而不是「自定义 reporter」
 *
 * vitest 自己的汇总行**已经**把四数分开给了（实测形态：
 * `Tests  1 passed | 1 skipped | 1 todo (3)`）⇒ 缺的只是「四数单独成行、显式命名」。
 * ⇒ 做法：跑 vitest（原样转发输出）⇒ 抓它的汇总行 ⇒ 打出一行**显式命名**的四数汇总。
 *   自定义 reporter 需要依赖 vitest 的内部 API（`onTestRunEnd` 的 reason 只有三态，
 *   计数要从测试模块树里自己遍历）⇒ 那样更脆，且升级 vitest 就可能坏。
 *
 * ## 判据口径
 *
 * - **passed / failed / skipped / todo** 四数都取 vitest 汇总行里的值。
 * - ⚠️ **todo 不计入 passed**（X3 明写）：vitest 已单列 ⇒ 本脚本原样保留。
 * - ⚠️ **没抓到汇总行 ⇒ 明确报「未取到」并给出非 0 退出码**，绝不假装成功
 *   （那会让「汇总脚本本身坏了」被读成「测试全绿」）。
 */
import { spawn } from 'node:child_process'
import { DEFAULT_WORKERS, decideWorkers, readMemoryPressure } from './machine-preflight'

const ROOT = process.cwd()

/** 剥掉 ANSI 转义序列（vitest 的彩色输出会污染正则匹配） */
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\[[0-9;]*m/g, '')
}

/** 从 vitest 输出里解析四数 */
export function parseSummary(output: string): {
  passed: number
  failed: number
  skipped: number
  todo: number
} | null {
  const plain = stripAnsi(output)
  // vitest 的汇总行形如：` Tests  1 passed | 1 skipped | 1 todo (3)`
  // ⚠️ 各段之间是 ` | ` 分隔，且**没有的段直接不出现**（如 0 failed 时没有 failed 段）。
  const line = plain
    .split('\n')
    .reverse()
    .find((l) => /^\s*Tests\s/.test(l) && /\(/.test(l))
  if (line === undefined) return null
  const body = line.slice(line.indexOf('Tests') + 'Tests'.length)
  const num = (word: string): number => {
    const m = new RegExp(`(\\d+)\\s+${word}`).exec(body)
    return m === null ? 0 : Number(m[1])
  }
  return {
    passed: num('passed'),
    failed: num('failed'),
    skipped: num('skipped'),
    todo: num('todo'),
  }
}

/**
 * 跑 vitest 前的**机器适配**：扛不住就把并发降下来。
 *
 * ⚠️ **为什么要在这里做**（2026-11-02 实测）：全量跑先后两轮超时红，
 *   而两轮机器负载完全不同（509 与 73）⇒ 负载不是原因，**换页**才是
 *   （`vm.swapusage` used 15.9/17.4 GB、可用内存仅 117 MB ⇒ 耗时操作放大 10 倍）。
 *   ⇒ 跑之前读一次内存压力 ⇒ 扛不住就降并发 ⇒ 少假红。
 *
 * ⚠️ **用户显式给了 `--maxWorkers` 就听用户的**（显式意图 > 自动判断）。
 */
function preflightWorkers(userArgs: string[]): number | undefined {
  const explicit = userArgs.some(
    (a) =>
      a === '--maxWorkers' ||
      a.startsWith('--maxWorkers=') ||
      a === '--max-workers' ||
      a.startsWith('--max-workers='),
  )
  if (explicit) return undefined

  // 默认并发取自 `vitest.config.ts`（本仓是 2）⇒ **单源在配置文件**，这里只读不改。
  const decision = decideWorkers(readMemoryPressure(), DEFAULT_WORKERS)
  console.log(`[preflight] ${decision.reason}`)
  if (!decision.degraded) return undefined
  console.log(
    '[preflight] ⚠️ 这是**环境问题**不是代码问题：机器内存吃紧时，超时闸会误判成「功能回归」。',
  )
  return decision.workers
}

const userArgs = process.argv.slice(2)
const preflight = preflightWorkers(userArgs)
const vitestArgs = ['vitest', 'run', ...userArgs]
if (preflight !== undefined) vitestArgs.push(`--maxWorkers=${String(preflight)}`)

const child = spawn('npx', vitestArgs, {
  cwd: ROOT,
  stdio: ['inherit', 'pipe', 'pipe'],
  shell: false,
})

let captured = ''
child.stdout.on('data', (d: Buffer) => {
  const s = d.toString()
  captured += s
  process.stdout.write(d)
})
child.stderr.on('data', (d: Buffer) => {
  const s = d.toString()
  captured += s
  process.stderr.write(d)
})

child.on('exit', (code, signal) => {
  const summary = parseSummary(captured)
  if (summary === null) {
    console.error('⚠️ 未取到 vitest 的汇总行 ⇒ 四数汇总无法给出（测试本身的退出码见上）')
    process.exitCode = code ?? (signal !== null ? 1 : 0)
    return
  }
  console.log('─'.repeat(64))
  console.log(
    `[test:summary] passed=${String(summary.passed)}  failed=${String(summary.failed)}  ` +
      `skipped=${String(summary.skipped)}  todo=${String(summary.todo)}`,
  )
  // ⚠️ **todo 不计入 passed**（X3）：单独提示，避免「总数 = passed」被误读成全覆盖。
  if (summary.todo > 0) {
    console.log(`[test:summary] ⚠️ ${String(summary.todo)} 条 todo **未执行**（不计入 passed）`)
  }
  if (summary.skipped > 0) {
    console.log(
      `[test:summary] ⚠️ ${String(summary.skipped)} 条 skipped（环境门控；报告里显式出现，未计入 passed）`,
    )
  }
  console.log('─'.repeat(64))
  process.exitCode = code ?? (signal !== null ? 1 : 0)
})
