/**
 * scripts/check-orphan-workers.ts —— 查**孤儿 worker**（2026-11-02）。
 *
 * ## 它解决什么
 *
 * 2026-11-02 实测：跑完测试后，机器上留了 **9 个 `PPID=1` 的 `node (vitest N)` 进程**
 * （父进程已死、被 launchd 收养）。它们当时 CPU 为 0、总占用 97 MB ⇒ 无害；
 * 但**没有任何机制会发现它们** ⇒ 一旦某个卡在 CPU 密集态，就会持续拖慢机器，
 * 而现象是「测试莫名其妙变慢/变红」⇒ 极难归因。
 *
 * ⇒ 本脚本把「有没有孤儿 worker」变成**一条可随时问的命令**。
 *
 * ## 为什么「不自动 kill」
 *
 * 孤儿 worker 可能是**别的项目**的（同一台机器上可能同时跑着别家的 vitest）
 * ⇒ 自动 kill 会误伤别人的工作 ⇒ **默认只报数**，`--kill` 才动手，
 * 且动手前**逐个确认它的工作目录在本仓内**。
 *
 * ## 「本仓的」怎么认
 *
 * 光看命令行不够：`node (vitest 1)` 这行字**任何项目都一样**。
 * ⇒ 认的是**工作目录**（cwd）—— 本仓的 worker cwd 在仓库根目录下
 * ⇒ 用 `lsof -a -p <pid> -d cwd` 取。
 *
 * ## 判据口径
 *
 * - **孤儿** = `PPID == 1`（父进程已死，被 launchd 收养）。
 *   ⚠️ 正常跑着的 vitest worker，其 PPID 是 vitest 主进程 ⇒ 不是 1。
 * - **worker 候选** = 命令行含 `vitest` 或 `tsx scripts/`（本仓脚本的形态）。
 * - **本仓的** = 且 cwd 在仓库根目录内。
 *
 * ⚠️ 三条是**与**的关系：三者全中才算「本仓的孤儿 worker」。
 */
import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'

/** 孤儿数超过此值就提醒清理（低于此值不算问题）。 */
export const ORPHAN_WARN_THRESHOLD = 5

/** 一条进程记录 */
export interface ProcessRow {
  pid: number
  ppid: number
  command: string
}

/**
 * 解析 `ps -Ao pid,ppid,command` 的输出。
 *
 * ⚠️ **命令列里可能有空格**（`node (vitest 1)` 没有，但 `node --import tsx …` 有）
 *   ⇒ 只切前两列，**其余整段当命令**（不是 `split(' ')` 全切）。
 */
export function parsePsOutput(text: string): ProcessRow[] {
  const rows: ProcessRow[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.length === 0) continue
    const parts = trimmed.split(/\s+/)
    const pid = Number(parts[0])
    const ppid = Number(parts[1])
    if (!Number.isFinite(pid) || !Number.isFinite(ppid)) continue
    // 命令 = 去掉前两列（pid/ppid）之后的**整段**
    const command = trimmed.replace(/^\s*\d+\s+\d+\s+/, '')
    if (command.length === 0) continue
    rows.push({ pid, ppid, command })
  }
  return rows
}

/**
 * 这条命令是不是「worker 候选」。
 *
 * ⚠️ 两种形态：
 *   ① `node (vitest 1)` / `npm exec vitest run` —— vitest 改过进程标题；
 *   ② `node …/tsx/dist/cli.mjs …/scripts/xxx.ts` —— 本仓脚本的形态。
 *   ⚠️ ② 的匹配**不能写成 `tsx scripts/`**：真实命令里 `tsx` 与 `scripts/` 之间
 *   隔着 `dist/cli.mjs` ⇒ 那样写永远匹配不上（本轮判据实测抓到的真缺陷）。
 *   ⇒ 判据是「**同时**含 tsx 与 `scripts/`」。
 */
export function isWorkerCandidate(command: string): boolean {
  return /vitest/.test(command) || (/tsx/.test(command) && /scripts\//.test(command))
}

/**
 * 这条记录是不是孤儿（父进程已死）。
 *
 * ⚠️ macOS 上 PID 1 是 launchd ⇒ 父进程死掉的进程会被它收养 ⇒ PPID 变 1。
 *   正常跑着的 worker 其 PPID 是 vitest 主进程 ⇒ 不是 1。
 */
export function isOrphan(row: ProcessRow): boolean {
  return row.ppid === 1
}

/**
 * 取进程的工作目录（取不到就返回 null）。
 *
 * ⚠️ 用 `lsof` 而非 `ps`：macOS 的 `ps` **不输出 cwd**，
 *   而 cwd 是区分「本仓的」与「别人项目的」的唯一可靠依据。
 */
export function readCwd(pid: number): string | null {
  try {
    const out = execFileSync('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    // 输出形如：p12345\nfcwd\nn/Users/duke/Documents/OpenVibe
    const m = /^n(.+)$/m.exec(out)
    const path = m?.[1]
    return path === undefined ? null : path.trim()
  } catch {
    return null
  }
}

/**
 * cwd 是否在仓库根目录**之内**。
 *
 * ⚠️ 用「路径前缀 + 分隔符」判断，而不是裸 `startsWith` ——
 *   否则 `/Users/duke/Documents/OpenVibe-other` 会被误判成「在仓内」。
 */
export function isInsideRepo(cwd: string | null, repoRoot: string): boolean {
  if (cwd === null) return false
  const normalized = cwd.endsWith('/') ? cwd.slice(0, -1) : cwd
  const root = repoRoot.endsWith('/') ? repoRoot.slice(0, -1) : repoRoot
  return normalized === root || normalized.startsWith(root + '/')
}

/** 查出来的一条本仓孤儿 worker */
export interface OrphanWorker {
  pid: number
  command: string
  cwd: string
}

/**
 * 挑选的结果：**命中的** + **无法判定的**。
 *
 * ⚠️ 为什么要分开记「无法判定」：cwd 取不到（如 Windows 没有 `lsof`）⇒
 *   无法判断那个孤儿是不是本仓的 ⇒ 若静默当成「不是」⇒ 报告会显示「0 个 ⇒ 干净」，
 *   而真相是「**判不了**」⇒ 这会把「没测到」读成「没问题」。
 *   ⇒ 单独记一条 `undetermined`，报告里如实说出来。
 */
export interface OrphanScan {
  workers: OrphanWorker[]
  /** 候选里 cwd 取不到、无法判定归属的（pid + 命令） */
  undetermined: { pid: number; command: string }[]
}

/**
 * 从进程表里挑出**本仓的孤儿 worker**。
 *
 * @param rows 进程表
 * @param repoRoot 仓库根目录
 * @param excludePids 要排除的 pid（脚本自己与它的祖先 ⇒ 别把自己算成孤儿）
 * @param cwdOf 取 cwd 的函数（可注入 ⇒ 判据测试不必真起进程）
 */
export function scanOrphans(
  rows: ProcessRow[],
  repoRoot: string,
  excludePids: number[] = [],
  cwdOf: (pid: number) => string | null = readCwd,
): OrphanScan {
  const excluded = new Set(excludePids)
  const workers: OrphanWorker[] = []
  const undetermined: { pid: number; command: string }[] = []
  for (const row of rows) {
    if (excluded.has(row.pid)) continue
    if (!isOrphan(row)) continue
    if (!isWorkerCandidate(row.command)) continue
    const cwd = cwdOf(row.pid)
    if (cwd === null) {
      // ⚠️ 判不了归属 ⇒ 如实记为「无法判定」，**不**当成「不是本仓的」
      undetermined.push({ pid: row.pid, command: row.command })
      continue
    }
    if (!isInsideRepo(cwd, repoRoot)) continue
    workers.push({ pid: row.pid, command: row.command, cwd })
  }
  return { workers, undetermined }
}

/**
 * 从进程表里挑出**本仓的孤儿 worker**（只要命中的那部分）。
 */
export function findOrphanWorkers(
  rows: ProcessRow[],
  repoRoot: string,
  excludePids: number[] = [],
  cwdOf: (pid: number) => string | null = readCwd,
): OrphanWorker[] {
  return scanOrphans(rows, repoRoot, excludePids, cwdOf).workers
}

/**
 * 该不该提醒清理。
 *
 * ⚠️ **低于阈值不算问题**：机器上常年可能有一两个残留（上一轮跑崩了就留下）
 *   ⇒ 见到 1 个就报警是噪音 ⇒ 真要提醒，得**攒够一批**。
 */
export function shouldWarn(count: number, threshold: number = ORPHAN_WARN_THRESHOLD): boolean {
  return count > threshold
}

/**
 * 汇总报告的结论（供 CLI 与判据共用）。
 */
export interface OrphanReport {
  workers: OrphanWorker[]
  /** 候选里 cwd 取不到、无法判定归属的 */
  undetermined: { pid: number; command: string }[]
  warn: boolean
  message: string
}

/**
 * 生成报告。
 *
 * ⚠️ **「无法判定」必须出现在消息里**：若 cwd 取不到（Windows 无 `lsof`），
 *   而报告只说「0 个 ⇒ 干净」⇒ 会把「**没测到**」读成「**没问题**」⇒ 掩盖问题。
 */
export function buildReport(
  workers: OrphanWorker[],
  threshold: number = ORPHAN_WARN_THRESHOLD,
  undetermined: { pid: number; command: string }[] = [],
): OrphanReport {
  const warn = shouldWarn(workers.length, threshold)
  const undeterminedText =
    undetermined.length === 0
      ? ''
      : `\n[orphans] ⚠️ 另有 ${String(undetermined.length)} 个候选**无法判定归属**（取不到工作目录，如 Windows 无 lsof）⇒ 不计入上面那个数：\n` +
        undetermined.map((u) => `  · pid ${String(u.pid)}  ${u.command.slice(0, 90)}`).join('\n')

  if (workers.length === 0) {
    return {
      workers,
      undetermined,
      warn: false,
      message: `[orphans] 本仓孤儿 worker 0 个 ⇒ 干净` + undeterminedText,
    }
  }
  const lines = workers.map((w) => `  · pid ${String(w.pid)}  ${w.command.slice(0, 90)}`)
  const message =
    `[orphans] 本仓孤儿 worker ${String(workers.length)} 个（父进程已死，被 launchd 收养）：\n` +
    lines.join('\n') +
    undeterminedText +
    (warn
      ? `\n[orphans] ⚠️ 超过阈值 ${String(threshold)} 个 ⇒ 建议清理（它们会持续占资源）：\n` +
        `[orphans]    pnpm orphans:clean   # 只杀「本仓 cwd 内」的这些`
      : `\n[orphans] （未超过阈值 ${String(threshold)} ⇒ 先不动；它们当前无占用，等攒够再清）`)
  return { workers, undetermined, warn, message }
}

/** 本进程及其祖先的 pid 集合（别把自己和祖先算成孤儿）。 */
export function ancestorPids(): number[] {
  const pids: number[] = [process.pid]
  try {
    const out = execFileSync('ps', ['-Ao', 'pid,ppid'], { encoding: 'utf8' })
    const map = new Map<number, number>()
    for (const row of parsePsOutput(out)) map.set(row.pid, row.ppid)
    let cur = process.ppid
    // 上溯到根（防环：最多 32 层）
    for (let i = 0; i < 32 && cur > 1; i += 1) {
      pids.push(cur)
      const next = map.get(cur)
      if (next === undefined) break
      cur = next
    }
  } catch {
    // 取不到祖先就只用自己（宁可少排除，也别把自己算进去）
  }
  return pids
}

/** 命令行入口。 */
export function main(argv: string[]): number {
  const repoRoot = resolve(dirname(new URL(import.meta.url).pathname), '..')
  const kill = argv.includes('--kill')
  let rows: ProcessRow[] = []
  try {
    rows = parsePsOutput(execFileSync('ps', ['-Ao', 'pid,ppid,command'], { encoding: 'utf8' }))
  } catch (e) {
    console.error(`[orphans] 取不到进程表：${e instanceof Error ? e.message : String(e)}`)
    return 1
  }

  const scan = scanOrphans(rows, repoRoot, ancestorPids())
  const report = buildReport(scan.workers, ORPHAN_WARN_THRESHOLD, scan.undetermined)
  console.log(report.message)

  if (kill && scan.workers.length > 0) {
    for (const w of scan.workers) {
      try {
        process.kill(w.pid, 'SIGTERM')
        console.log(`[orphans] 已发 SIGTERM 给 pid ${String(w.pid)}`)
      } catch (e) {
        console.error(
          `[orphans] 杀不掉 pid ${String(w.pid)}：${e instanceof Error ? e.message : String(e)}`,
        )
      }
    }
  }
  // ⚠️ **「无法判定」的候选一律不杀**（归属不明 ⇒ 可能属于别的项目）。
  if (kill && scan.undetermined.length > 0) {
    console.log(
      `[orphans] （${String(scan.undetermined.length)} 个归属不明的候选**未动**：归属不明 ⇒ 不杀）`,
    )
  }
  // ⚠️ 报告本身**不算失败** ⇒ 退出码 0（它是一份体检报告，不是门禁闸口）。
  return 0
}

if (process.argv[1] !== undefined && process.argv[1].endsWith('check-orphan-workers.ts')) {
  process.exitCode = main(process.argv.slice(2))
}
