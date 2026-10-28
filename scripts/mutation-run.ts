/**
 * mutation:run —— 变异测试执行器（2026-10-16）。
 *
 * ## 它解决的不是「跑变异」，是「变异没红时告诉你该查哪三件事」
 *
 * 本仓的核心纪律是「**一条判据必须能红才算数**」。但一天内实测出现**三次「变异没红」**，
 * 三次根因全不同，而**默认的猜测「变异没打上」错了两次半**：
 *
 * | 次 | 表面现象 | 真因 |
 * |---|---|---|
 * | 1 | 日历校验弱化后全绿 | 用的非法样例（`2026-10-32`）**恰好落在两条校验支的交集**里，两支都拒 |
 * | 2 | 把 `drifted` 改成 `false` 不红 | 改动打在「锁存在但字段缺失」那条路径，**测试根本不走那里** |
 * | 3 | 幂等键掺 `Date.now()` 只红 2 支 | 两次调用**落在同一毫秒**，时间源碰巧相同 ⇒ 那条腿变永真 |
 *
 * 所以本脚本**第一件事就是排除「变异没打上」**：锚点替换后立刻断言命中次数，
 * 不满足就停腿、根本不去跑测试。剩下两种原因需要人的判断，脚本负责**按排查顺序列清楚**。
 *
 * ## 为什么还原一律走备份文件、绝不用 `git checkout --`
 *
 * `git checkout -- <file>` 的语义是「恢复到 HEAD」，**不管那些未提交改动是谁的**。
 * 本会话已因此把本会话自己在 `routes/prompts.ts` 的 4 处改动全部丢弃，
 * 且因为随后只看 `git status --porcelain`（该文件已与 HEAD 一致、不再出现），
 * 一度误判成「并行会话回退」。**判据是 diff 内容，不是文件是否出现在 status 里。**
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'

export interface MutationLeg {
  /** 可定位的说明文字：人看报告时靠它判断这条腿在验什么 */
  name: string
  /** 要变异的源文件（相对仓库根） */
  file: string
  /** 必须**唯一命中**的原文 */
  anchor: string
  /** 替换后的文本 */
  replacement: string
  /** 跑哪些测试，传给 vitest 的路径参数 */
  testCmd: string[]
  /** 期望红掉的支数（精确）。与 expectMin 二选一 */
  expect?: number
  /** 期望红掉的支数下限（≤该数即算通过） */
  expectMin?: number
  /** 反向变异：用于「把 null 当 true」这类方向性错误 */
  invert?: boolean
}

export interface LegResult {
  name: string
  file: string
  status: 'ok' | 'anchor-not-applied' | 'restore-mismatch' | 'vitest-crashed' | 'below-expectation'
  anchorHits: number
  failed: number
  passed: number
  /** 变异没红时的排查指引；status 非 below-expectation 时为空数组 */
  diagnosis: string[]
  /** vitest 输出尾部，供人直接看 */
  tail: string
  durationMs: number
}

export interface RunReport {
  legs: LegResult[]
  okCount: number
  failCount: number
}

const sha = (p: string): string => createHash('sha256').update(readFileSync(p)).digest('hex')

/**
 * 变异没红时的三因诊断。
 *
 * 第 1 条是**已排除**的（本脚本已断言锚点命中）；第 2、3 条是需要人判断的，按排查顺序排。
 * 「反向变异」单列，因为它不是第三种原因，而是**验证第 2、3 条是否查对**的手段。
 */
export function diagnosisFor(leg: MutationLeg, failed: number, passed: number): string[] {
  if (failed > 0) return []
  return [
    `已排除：变异没打上（锚点替换已断言唯一命中 ${leg.invert ? '（反向腿）' : ''}）。`,
    `待查 ①：测试未走到被改的分支 —— 本腿红 ${failed} 支、绿 ${passed} 支。` +
      `在被改分支里加一次性标记或计数器再跑一次，即可区分「分支没被执行」与「分支执行了但判据没盯它」。`,
    `待查 ②：判据本身太弱或已是永真 —— 构造一条**已知坏输入**直接喂进去。` +
      `本仓踩过的实例：非法样例恰好落在两条分支的交集里、两次调用落在同一毫秒。`,
    `手段：跑**反向变异**（把 null 当 true、把 0 当正常）验证 —— 正向能红不够，反向也要红。`,
    `注意：反向变异红 ${leg.invert ? '（本腿已是反向腿）' : '（需在清单里加 invert: true 的腿）'}。`,
  ]
}

/**
 * 剥除 ANSI 转义码。
 *
 * ⚠️ 这不是洁癖，是实测踩到的真缺陷：`defaultRunner` 设了 `CI=1`，子进程 vitest 因此**强制上色**，
 * 汇总行变成 `ESC[2m      Tests ESC[22m …`。而 `^\s*Tests` 要求行首是空白 —— 行首是转义码不是空白，
 * 于是**每一条真跑的变异腿都会被误报成 `vitest-crashed`**。
 * 注入假 runner 的测试永远看不到这个（假输出是干净文本），所以解析层必须自己扛。
 */
export function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
}

/** 解析 vitest 汇总行。返回 null 表示没跑到汇总（崩溃/无测试文件） */
export function parseVitestSummary(stdout: string): { failed: number; passed: number } | null {
  const m = stripAnsi(stdout).match(/^\s*Tests\s+(.+)$/m)
  if (!m) return null
  const line = m[1]!
  const failed = Number(line.match(/(\d+)\s+failed/)?.[1] ?? 0)
  const passed = Number(line.match(/(\d+)\s+passed/)?.[1] ?? 0)
  if (Number.isNaN(failed) || Number.isNaN(passed)) return null
  return { failed, passed }
}

/** 默认执行器：真跑 vitest。`--no-color` 保证输出尾部人类可读（诊断报告要贴给人看） */
const defaultRunner: LegRunner = (testCmd, repoRoot) => {
  const proc = spawnSync('npx', ['vitest', 'run', '--no-color', ...testCmd], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, CI: '1' },
  })
  return { stdout: `${proc.stdout ?? ''}\n${proc.stderr ?? ''}` }
}

function tailOf(stdout: string, n = 30): string {
  return stripAnsi(stdout).trimEnd().split('\n').slice(-n).join('\n')
}

/**
 * 测试执行的注入点。**缺省真跑 `npx vitest run`**。
 * 注入只为让「备份／还原／锚点断言／诊断」这些真正要验的逻辑能在测试里被覆盖，
 * 而不必在测试套件里再起一次 vitest（慢且可能递归）。
 * ⚠️ 它是逃逸口：默认路径必须仍是真跑。
 */
export type LegRunner = (testCmd: string[], repoRoot: string) => { stdout: string }

export function runLeg(
  leg: MutationLeg,
  repoRoot: string,
  run: LegRunner = defaultRunner,
): LegResult {
  const started = Date.now()
  // 用 resolve 而非 join：join 遇绝对路径会拼出垃圾路径。允许 leg.file 传绝对路径，
  // 是为了让测试能在**真仓库 cwd 下**变异一个临时文件 —— 既能验「默认路径真跑 vitest」，
  // 又不必在测试套件里改动仓库文件（并行跑时改仓库文件会让别的用例读到中间态）。
  const abs = resolve(repoRoot, leg.file)
  const before = sha(abs)
  const backupDir = mkdtempSync(join(tmpdir(), 'mutation-run-'))
  const backup = join(backupDir, basename(leg.file))
  copyFileSync(abs, backup)

  const finish = (r: Omit<LegResult, 'durationMs'>): LegResult => ({
    ...r,
    durationMs: Date.now() - started,
  })

  // ⚠️ 不要在 `finally` 里抛异常：`finally` 中的抛会**顶掉并吞掉**正在传播的原始异常
  // （eslint 的 no-unsafe-finally 正是这条规则）。所以这里把「结果 / 原始异常 / 还原失败」
  // 三件事分别记下来，`finally` 只做纯还原动作，之后再按优先级上报：
  // **还原失败 > 原始异常 > 正常结果**。还原失败最严重，因为它意味着源文件状态不可信。
  const compute = (): Omit<LegResult, 'durationMs'> => {
    // ① 先替换，并断言锚点唯一命中 —— 这是排除「变异没打上」的唯一依据
    const source = readFileSync(abs, 'utf8')
    const hits = source.split(leg.anchor).length - 1
    if (hits !== 1) {
      return {
        name: leg.name,
        file: leg.file,
        status: 'anchor-not-applied',
        anchorHits: hits,
        failed: 0,
        passed: 0,
        diagnosis: [
          `❌ 锚点命中 ${hits} 次（要求恰好 1 次）⇒ 本腿未执行，不跑测试。`,
          '锚点写错、重复、或该文本已被上游改动 —— 先修锚点，别把这腿当「判据太弱」。',
        ],
        tail: '',
      }
    }
    writeFileSync(abs, source.replace(leg.anchor, leg.replacement), 'utf8')

    // ② 跑测试
    const stdout = run(leg.testCmd, repoRoot).stdout
    const summary = parseVitestSummary(stdout)
    if (!summary) {
      return {
        name: leg.name,
        file: leg.file,
        status: 'vitest-crashed',
        anchorHits: 1,
        failed: 0,
        passed: 0,
        diagnosis: [
          '❌ 没跑到 vitest 汇总行 —— 可能是命令写错、配置文件语法错、或测试文件不存在。',
          '这**不是**判据问题；先看下面的输出尾部。',
        ],
        tail: tailOf(stdout),
      }
    }

    const meets =
      leg.expect !== undefined
        ? summary.failed === leg.expect
        : summary.failed >= (leg.expectMin ?? 1)
    return {
      name: leg.name,
      file: leg.file,
      status: meets ? 'ok' : 'below-expectation',
      anchorHits: 1,
      failed: summary.failed,
      passed: summary.passed,
      diagnosis: meets ? [] : diagnosisFor(leg, summary.failed, summary.passed),
      tail: meets ? '' : tailOf(stdout),
    }
  }

  let result: Omit<LegResult, 'durationMs'> | null = null
  let thrown: unknown = null
  let restoreError: string | null = null
  try {
    result = compute()
  } catch (e) {
    thrown = e
  } finally {
    // ③ 还原：先 cp 回去，再断言与备份逐字节一致。finally 里只做纯还原，不抛。
    copyFileSync(backup, abs)
    if (sha(abs) !== before) {
      restoreError = `还原校验失败：${leg.file} —— 还原后与变异前不一致，请立刻人工检查该文件`
    }
    rmSync(backupDir, { recursive: true, force: true })
  }
  if (restoreError) throw new Error(restoreError)
  if (thrown) throw thrown
  return finish(result as Omit<LegResult, 'durationMs'>)
}

export function runLegs(legs: MutationLeg[], repoRoot: string): RunReport {
  const results = legs.map((l) => runLeg(l, repoRoot))
  return {
    legs: results,
    okCount: results.filter((l) => l.status === 'ok').length,
    failCount: results.filter((l) => l.status !== 'ok').length,
  }
}

export function renderReport(report: RunReport): string {
  const out: string[] = []
  out.push(
    `mutation:run —— 共 ${report.legs.length} 腿，按期望红 ${report.okCount}，未达 ${report.failCount}`,
  )
  out.push('')
  for (const l of report.legs) {
    const mark = l.status === 'ok' ? '✅' : '❌'
    out.push(`${mark} ${l.name}`)
    out.push(
      `   ${l.file} · 锚点命中 ${l.anchorHits} · 红 ${l.failed} / 绿 ${l.passed} · ${l.status} · ${l.durationMs}ms`,
    )
    for (const d of l.diagnosis) out.push(`   ${d}`)
    if (l.tail) {
      out.push('   ── vitest 输出尾部 ──')
      for (const line of l.tail.split('\n')) out.push(`   │ ${line}`)
    }
    out.push('')
  }
  if (report.failCount > 0) {
    out.push('💡 「变异没红」的三种真因与排查顺序：')
    out.push('   1. 变异没打上 —— 本脚本已自动排除（锚点命中数已断言）')
    out.push('   2. 测试未走到被改分支 —— 加一次性标记或计数器验证')
    out.push('   3. 判据太弱或永真 —— 喂一条已知坏输入验证')
    out.push('   4. 手段：反向变异。正向能红不够，反向也要红。')
  }
  return out.join('\n')
}

/* ------------------------------------------------------------------ CLI 入口 */
function main(argv: string[]): number {
  const args = argv.slice(2)
  const asJson = args.includes('--json')
  const manifestPath = args.find((a) => !a.startsWith('--'))
  if (!manifestPath) {
    process.stderr.write('用法：pnpm mutation:run <清单.json|清单.ts> [--json]\n')
    return 2
  }
  let legs: MutationLeg[]
  try {
    legs = JSON.parse(readFileSync(manifestPath, 'utf8')) as MutationLeg[]
  } catch (e) {
    process.stderr.write(`读清单失败：${(e as Error).message}\n`)
    return 2
  }
  const report = runLegs(legs, process.cwd())
  process.stdout.write(
    asJson ? `${JSON.stringify(report, null, 2)}\n` : `${renderReport(report)}\n`,
  )
  return report.failCount > 0 ? 1 : 0
}

// 仅在被直接执行时进 CLI（被 import 做测试时不进）
if (process.argv[1] && basename(process.argv[1]).startsWith('mutation-run')) {
  process.exitCode = main(process.argv)
}
