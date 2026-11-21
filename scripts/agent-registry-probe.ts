import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

/**
 * `scripts/agent-registry-probe.ts` —— v0.3.0 FR-3.0-1 验收③的复算工具。
 *
 * ## 它挡什么
 *
 * 注册表里写着的旗标（`-p` / `exec` / `--output-format stream-json` …）是**声明**，
 * 声明会烂：CLI 换版本改旗标、改子命令、或根本不支持。这个脚本把声明与
 * **本机实际 `--help` 输出**对一遍，不一致就红。
 *
 * 查的是**多层 help**：顶层 `cmd --help` 之外，声明里出现的每一段子命令链
 * （`exec` / `exec resume` / `run`）也各查一层——实测 `codex --json`、
 * `opencode --format` 只在子命令 help 里出现。
 *
 * ## 三条「不算红」的情况（都显式打印，不是静默跳过）
 *
 * 1. `executable` 为 NULL —— 从未声明可执行名，无从比对（unverified）。
 * 2. 命令不在 PATH 上 —— 本机没装这个 agent，比对集里剔除。
 * 3. `json_flag` / `resume_flag` 为 NULL —— 报告未给出，按「未声明」处理（见 seed 注释）。
 *
 * 结论只在**本机已装**的条目上有意义；CI 机器若一个都没装，脚本会以 0 退出并打印
 * 「无可比对条目」——这不是验收通过，是验收不适用。README 交付说明里必须照此措辞。
 *
 * 用法：`pnpm exec tsx scripts/agent-registry-probe.ts [db-path]`
 */

interface Row {
  id: string
  executable: string | null
  headless_flag: string | null
  resume_flag: string | null
  json_flag: string | null
  archived: number
}

type LedgerState = 'verified' | 'mismatch' | 'unverified' | 'not-installed'

interface LedgerRow {
  id: string
  state: LedgerState
  missing: string[]
}

function dbPathOf(argvPath: string | undefined): string {
  if (argvPath) return argvPath
  const home = process.env.OPENVIBE_HOME ?? join(homedir(), '.openvibe')
  return join(home, 'data', 'openvibe.db')
}

type HelpCache = Map<string, string>

/** 取 `cmd <chain...> --help` 全文（stdout + stderr 合并，不同 CLI 输出流不同） */
function helpOf(executable: string, chain: string[], cache: HelpCache): string {
  const key = [executable, ...chain].join(' ')
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  const result = spawnSync(executable, [...chain, '--help'], {
    encoding: 'utf8',
    timeout: 20_000,
  })
  const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
  cache.set(key, text)
  return text
}

/**
 * 一个旗标算「在」的判据。
 *
 * `-p` 这类单字符旗标直接 `includes` 会误命中（如 `--profile`）。
 * 用边界正则：前面不是旗标字符、后面不是旗标字符。
 */
function flagPresent(help: string, flag: string): boolean {
  const escaped = flag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`).test(help)
}

/**
 * 从声明的子命令链（如 `exec resume`）推导要查的 help 层级。
 *
 * 起因是实测：`codex --json` 这类旗标**只出现在子命令 help 里**（`codex exec --help`），
 * 顶层 help 查不到。故把 headless / resume 声明里的每一段命令链都当作一层 help 来源。
 */
function helpLevels(row: Row): string[][] {
  const levels: string[][] = [[]]
  for (const decl of [row.headless_flag, row.resume_flag]) {
    if (!decl) continue
    const tokens = decl.trim().split(/\s+/)
    if ((tokens[0] ?? '').startsWith('-')) continue
    let chain: string[] = []
    for (const token of tokens) {
      chain = [...chain, token]
      if (!levels.some((l) => l.join(' ') === chain.join(' '))) levels.push(chain)
    }
  }
  return levels
}

/**
 * 声明值是否成立。两种形态分别处理：
 *
 * - **旗标形态**（首词带 `-`）：只验旗标本身，取值不要求在 help 里出现。
 *   `--output-format stream-json` 的 `stream-json` 是取值，不是旗标名。
 * - **子命令链形态**（如 `exec resume`）：逐层下钻，每段词必须在**上一层**的 help 里出现。
 */
function declPresent(
  executable: string,
  decl: string,
  levels: string[][],
  cache: HelpCache,
): boolean {
  const tokens = decl.trim().split(/\s+/)
  if ((tokens[0] ?? '').startsWith('-')) {
    const [flag = ''] = tokens
    return levels.some((chain) => flagPresent(helpOf(executable, chain, cache), flag))
  }
  let chain: string[] = []
  for (const token of tokens) {
    if (!flagPresent(helpOf(executable, chain, cache), token)) return false
    chain = [...chain, token]
  }
  return true
}

function main(): void {
  const dbPath = dbPathOf(process.argv[2])
  if (!existsSync(dbPath)) {
    console.log(`跳过：找不到 ${dbPath}。先跑一次服务（或 CLI）让注册表初始化，再复算。`)
    return
  }

  const db = new DatabaseSync(dbPath)
  const rows = db
    .prepare(
      `SELECT id, executable, headless_flag, resume_flag, json_flag, archived
         FROM agent_registry ORDER BY id ASC`,
    )
    .all() as unknown as Row[]

  if (rows.length === 0) {
    console.log('跳过：注册表为空（未播种）。')
    return
  }

  const ledger: LedgerRow[] = []
  for (const row of rows) {
    if (row.executable === null) {
      ledger.push({ id: row.id, state: 'unverified', missing: [] })
      continue
    }
    const exists = spawnSync('which', [row.executable], { stdio: 'ignore' }).status === 0
    if (!exists) {
      ledger.push({ id: row.id, state: 'not-installed', missing: [] })
      continue
    }
    const cache: HelpCache = new Map()
    const levels = helpLevels(row)
    const missing: string[] = []
    for (const decl of [row.headless_flag, row.resume_flag, row.json_flag]) {
      if (decl && !declPresent(row.executable, decl, levels, cache)) missing.push(decl)
    }
    ledger.push({ id: row.id, state: missing.length === 0 ? 'verified' : 'mismatch', missing })
  }

  console.log('id                 状态            不一致的旗标')
  for (const entry of ledger) {
    console.log(
      `${entry.id.padEnd(18)} ${entry.state.padEnd(15)} ${entry.missing.join(', ') || '-'}`,
    )
  }

  const comparable = ledger.filter((e) => e.state === 'verified' || e.state === 'mismatch')
  const mismatches = ledger.filter((e) => e.state === 'mismatch')
  console.log(
    `
可复算 ${comparable.length} 条；不一致 ${mismatches.length} 条；未安装 ${ledger.filter((e) => e.state === 'not-installed').length} 条；未声明 ${ledger.filter((e) => e.state === 'unverified').length} 条。`,
  )
  if (comparable.length === 0) {
    console.log('本机无可比对条目：验收不适用，不是通过。')
    return
  }
  if (mismatches.length > 0) {
    console.error('注册表声明与本机 CLI 不一致：修正种子或新增迁移，不要手改 DB。')
    process.exitCode = 1
  }
}

main()
