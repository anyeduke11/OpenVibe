import { spawn, spawnSync } from 'node:child_process'
import { existsSync, writeFileSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { tempDir } from '../../packages/core/src/test-support/temp-dir'

/**
 * `scripts/v0-probes/run.ts` —— PRD §5.2 的 L1 真机探针，可复跑版本。
 *
 * ## 与 `agent-registry-probe.ts` 的分工
 *
 * 那个脚本只把「声明」与 `--help` 对账（不执行任务）；本脚本**真的派活**，
 * 检验四件必选能否在真机上站住：L1-1 无头执行 / L1-2 JSON 事件流 /
 * L1-3 会话续跑 / L1-4 双实例并行。
 *
 * ## 三条纪律
 *
 * 1. **命令由注册表声明拼出**，不在这里另存一份 argv 映射——否则注册表与探针会漂移，
 *    而「注册表是否可执行」本身就是要检验的东西。
 * 2. **失败必须带原文**：退出码、stderr 前几行、超时与否。不写「失败」二字了事。
 * 3. **每个 agent 在独立临时目录里跑**，仓内文件零触碰。
 *
 * ## 判据（每支探针都会打印实际 argv，便于复核）
 *
 * | 探针 | 通过条件 |
 * | --- | --- |
 * | L1-1 | exit 0 且 stdout 非空且含回显标记 |
 * | L1-2 | ≥1 行可解析为 JSON，能取到 session 标识，**且**回显出任务结果（坏行单独计数） |
 * | L1-3 | 续跑后回显出上一轮的 token；resume 摆放顺序未知，两发择优 |
 * | L1-4 | 两个并发实例各自回显自己的 token，且 session 标识不同 |
 *
 * 用法：`pnpm exec tsx scripts/v0-probes/run.ts [--out <md-path>] [--only <id>]`
 * 环境：
 *   - `V0_PROBE_TIMEOUT_MS`（单次调用超时，默认 180000）
 *   - `V0_PROBE_EXTRA`（JSON：`{"<agentId>": "<额外 argv 片段>"}`，注入到 headless 之后）。
 *     用途：机器特定的模型选择等**非协议能力**参数。注册表声明是机器无关的通用能力，
 *     模型选择属本机配置，不该污染 seed 声明——由探针按本机覆盖注入。例：
 *     `V0_PROBE_EXTRA='{"codebuddy":"--model custom-local:MiniMax-M3.1-Flash"}'`
 */

const TIMEOUT_MS = Number(process.env.V0_PROBE_TIMEOUT_MS ?? 180_000)

/** 本机覆盖：agent id → 注入到 headless 之后、prompt/resume 之前的额外 argv 片段。 */
const EXTRA_OVERRIDE: Record<string, string[]> = (() => {
  const raw = process.env.V0_PROBE_EXTRA
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Record<string, string[]> = {}
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'string' && value.trim()) {
        out[id] = value.trim().split(/\s+/).filter(Boolean)
      }
    }
    return out
  } catch {
    // 坏 JSON 不阻断探针：覆盖是可选增强，解析失败即视为无覆盖
    return {}
  }
})()

interface Row {
  id: string
  executable: string | null
  headless_flag: string | null
  resume_flag: string | null
  json_flag: string | null
  archived: number
}

type Verdict = 'pass' | 'fail' | 'skip'

interface ProbeResult {
  probe: 'L1-1' | 'L1-2' | 'L1-3' | 'L1-4'
  verdict: Verdict
  detail: string
  argv?: string
}

interface RunOutcome {
  exitCode: number | null
  stdout: string
  stderr: string
  timedOut: boolean
  durationMs: number
}

function dbPathOf(): string {
  const home = process.env.OPENVIBE_HOME ?? join(homedir(), '.openvibe')
  return join(home, 'data', 'openvibe.db')
}

/** 把声明拆成 argv 片段；`-p` 与 `exec` 在拼命令时是同一种东西。 */
function tokensOf(decl: string | null): string[] {
  return decl ? decl.trim().split(/\s+/).filter(Boolean) : []
}

/** 每个 agent 一个干净目录，只放一份 4 行 README，并初始化为 git 仓。
 *  实测 codex 在非 git 目录里直接拒跑（`Not inside a trusted directory`），
 *  工作区不建仓会把「环境缺省」误报成「协议缺失」。 */
function makeWorkspace(id: string): string {
  // 统一出口（tests/temp-dir.test.ts 的唯一性闸）：tempDir 自带退出兜底清理登记
  const dir = tempDir(`ov-v0-${id}-`)
  writeFileSync(
    join(dir, 'README.md'),
    '# Probe Target\n\nThe lunar archive stores exactly three copper keys.\n',
  )
  spawnSync('git', ['init', '-q'], { cwd: dir, stdio: 'ignore' })
  return dir
}

function run(argv: string[], cwd: string): Promise<RunOutcome> {
  const started = Date.now()
  return new Promise((resolve) => {
    const child = spawn(argv[0] as string, argv.slice(1), {
      cwd,
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, TIMEOUT_MS)
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => {
      stderr += `${error.message}\n`
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({
        exitCode: code,
        stdout,
        stderr,
        timedOut,
        durationMs: Date.now() - started,
      })
    })
  })
}

/** 从 JSON 事件里找会话标识：键名含 session / thread，值为非空字符串。 */
function sessionIdOf(event: Record<string, unknown>): string | null {
  for (const [key, value] of Object.entries(event)) {
    if (typeof value === 'string' && value.length >= 8 && /session|thread/i.test(key)) return value
  }
  return null
}

/** 逐行容错解析：实测 qwen 的 stream-json 会混入非 JSON 告警行，整段 parse 会炸。 */
function parseJsonl(text: string): {
  valid: number
  bad: number
  sessionId: string | null
  badSample: string
} {
  let valid = 0
  let bad = 0
  let sessionId: string | null = null
  let badSample = ''
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>
      valid += 1
      sessionId ??= sessionIdOf(parsed)
    } catch {
      bad += 1
      if (!badSample) badSample = trimmed.slice(0, 120)
    }
  }
  return { valid, bad, sessionId, badSample }
}

/** error 类行优先，其次跳过已知噪声行。实测 codex 首行是 `Reading additional input from stdin...`，会把第二行的真错遮住。 */
const ERROR_LINE = /error|fatal|not available|unauthorized|denied|invalid|trusted|401|403|429/i
const NOISE_LINE = /^INFO|^otel|^rmcp|Reading additional input from stdin/i

function firstStderrLine(stderr: string): string {
  const lines = stderr
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !NOISE_LINE.test(l))
  return (lines.find((l) => ERROR_LINE.test(l)) ?? lines[0] ?? '').slice(0, 200)
}

/** 从事件流里捞错误消息：实测 codex 把真错写在 stdout 的 {"type":"error","message":...}，stderr 全是 otel 噪声。 */
function errorEventOf(stdout: string): string {
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{')) continue
    try {
      const event = JSON.parse(trimmed) as Record<string, unknown>
      const type = String(event.type ?? '')
      const message = event.message
      if (typeof message === 'string' && /error|fail/i.test(type)) return message.slice(0, 200)
    } catch {
      continue
    }
  }
  return ''
}

/** 退出码之外还要看输出：实测 codebuddy 未登录时 exit 0 且 stdout 为空（假绿）。 */
function judgeBasic(outcome: RunOutcome, expect: string): { ok: boolean; detail: string } {
  const eventError = errorEventOf(outcome.stdout)
  const tail = `${firstStderrLine(outcome.stderr) || '(空)'}${eventError ? `；事件流错误: ${eventError}` : ''}`
  if (outcome.timedOut) {
    return {
      ok: false,
      detail: `${TIMEOUT_MS}ms 超时——可能停在交互式确认上（注册表未声明非交互开关）`,
    }
  }
  if (outcome.exitCode !== 0) {
    return { ok: false, detail: `exit ${outcome.exitCode}；stderr: ${tail}` }
  }
  if (!outcome.stdout.trim()) {
    return { ok: false, detail: `exit 0 但 stdout 为空——退出码不可信；stderr: ${tail}` }
  }
  if (!outcome.stdout.includes(expect)) {
    return {
      ok: false,
      detail: `stdout 未回显 ${expect}：${outcome.stdout.trim().slice(0, 120)}${eventError ? `；事件流错误: ${eventError}` : ''}`,
    }
  }
  return { ok: true, detail: `${outcome.durationMs}ms，回显 ${expect}` }
}

/**
 * resume 的摆放位置因 CLI 而异，而注册表里没有「位置」这一列：
 *
 * - **子命令链形态**（`resume[0] === headless[0]`，如 codex 的 `exec resume`）：
 *   整条已自带 headless，再拼一次会变成 `exec resume <id> exec "..."`，故只拼一次。
 * - **旗标形态**：位置未知，两发——先 `headless + resume + id`，再 `resume + id + headless`。
 *   实测 opencode 的 `--session` 放在 `run` 之前无效；qwen 的 `--resume` 放前面可用。
 *   两种顺序都试，取第一种解释成功的，并在 detail 里写明是哪一种。
 */
function resumeCandidates(
  executable: string,
  headless: string[],
  resume: string[],
  sessionId: string,
  prompt: string,
  json: string[],
): string[][] {
  if (resume[0] === headless[0]) {
    return [[executable, ...resume, sessionId, prompt, ...json]]
  }
  return [
    [executable, ...headless, ...resume, sessionId, prompt, ...json],
    [executable, ...resume, sessionId, ...headless, prompt, ...json],
  ]
}

async function probeAgent(row: Row): Promise<ProbeResult[]> {
  const executable = row.executable
  if (!executable) {
    return [{ probe: 'L1-1', verdict: 'skip', detail: '未声明 executable' }]
  }
  if (!row.headless_flag) {
    return [{ probe: 'L1-1', verdict: 'skip', detail: '未声明 headless 旗标（黑盒档，无从派活）' }]
  }

  const dir = makeWorkspace(row.id)
  const headless = tokensOf(row.headless_flag)
  const json = tokensOf(row.json_flag)
  const resume = tokensOf(row.resume_flag)
  // 本机覆盖注入到 headless 之后：模型选择等非协议能力参数，不污染机器无关的注册表声明
  const headlessWithExtra = [...headless, ...(EXTRA_OVERRIDE[row.id] ?? [])]
  const results: ProbeResult[] = []

  // L1-1 无头最小任务
  const argv1 = [executable, ...headlessWithExtra, 'Reply with exactly: V0-OK']
  const out1 = await run(argv1, dir)
  const j1 = judgeBasic(out1, 'V0-OK')
  results.push({
    probe: 'L1-1',
    verdict: j1.ok ? 'pass' : 'fail',
    detail: j1.detail,
    argv: argv1.join(' '),
  })

  // L1-2 结构化事件流
  if (json.length === 0) {
    results.push({ probe: 'L1-2', verdict: 'skip', detail: '未声明 JSON 旗标' })
  } else {
    const argv2 = [executable, ...headlessWithExtra, 'Reply with exactly: V0-OK', ...json]
    const out2 = await run(argv2, dir)
    const parsed = parseJsonl(out2.stdout)
    if (out2.timedOut) {
      results.push({
        probe: 'L1-2',
        verdict: 'fail',
        detail: `${TIMEOUT_MS}ms 超时`,
        argv: argv2.join(' '),
      })
    } else if (out2.exitCode !== 0 && parsed.valid === 0) {
      results.push({
        probe: 'L1-2',
        verdict: 'fail',
        detail: `exit ${out2.exitCode}；stderr: ${firstStderrLine(out2.stderr) || '(空)'}`,
        argv: argv2.join(' '),
      })
    } else if (parsed.valid === 0) {
      results.push({
        probe: 'L1-2',
        verdict: 'fail',
        detail: `0 行可解析为 JSON；首行样本: ${parsed.badSample || '(空)'}`,
        argv: argv2.join(' '),
      })
    } else {
      // 光有 JSON 不够：实测 codebuddy 未登录时只吐出 init 事件、5 行合法 JSON，看着像通过。
      // 必须同时回显出任务结果，才能证明「事件流里有活干过的证据」。
      const echoed = out2.stdout.includes('V0-OK')
      const eventError = errorEventOf(out2.stdout)
      results.push({
        probe: 'L1-2',
        verdict: parsed.sessionId && echoed ? 'pass' : 'fail',
        detail: `${parsed.valid} 行有效${parsed.bad > 0 ? ` / ${parsed.bad} 行非 JSON（已容错）` : ''}；session 标识${parsed.sessionId ? '可取' : '取不到'}；回显 V0-OK ${echoed ? '有' : '无'}${eventError ? `；事件流错误: ${eventError}` : ''}`,
        argv: argv2.join(' '),
      })
    }

    // L1-3 会话续跑：先给一个 token，再续跑问回去。没有 session 标识就无从续跑。
    if (!parsed.sessionId) {
      results.push({ probe: 'L1-3', verdict: 'skip', detail: 'L1-2 未取到 session 标识，无法续跑' })
    } else if (resume.length === 0) {
      results.push({ probe: 'L1-3', verdict: 'skip', detail: '未声明 resume 旗标' })
    } else {
      const token = `V0-SEED-${row.id.toUpperCase()}`
      const argv3a = [executable, ...headlessWithExtra, `Reply with exactly: ${token}`, ...json]
      const out3a = await run(argv3a, dir)
      // 必须续**第一轮那个** session：拿 L1-2 的 id 去续，那轮根本没给过 token，属于自证陷阱
      const seedSession = parseJsonl(out3a.stdout).sessionId
      if (!seedSession) {
        results.push({
          probe: 'L1-3',
          verdict: 'fail',
          detail: `第一轮未回显 session 标识，无法定位要续的会话；exit ${out3a.exitCode}`,
          argv: argv3a.join(' '),
        })
      } else {
        const prompt = 'What token did you just give me? Reply with only that token.'
        const candidates = resumeCandidates(
          executable,
          headlessWithExtra,
          resume,
          seedSession,
          prompt,
          json,
        )
        const failures: string[] = []
        let hit: { argv: string[]; detail: string; order: number } | null = null
        for (const [order, argv] of candidates.entries()) {
          const out3 = await run(argv, dir)
          const j3 = judgeBasic(out3, token)
          if (j3.ok) {
            hit = { argv, detail: j3.detail, order }
            break
          }
          failures.push(`摆放${order + 1}：${j3.detail}`)
        }
        results.push(
          hit
            ? {
                probe: 'L1-3',
                verdict: 'pass',
                detail: `续跑记住 ${token}（摆放${hit.order + 1} 成立：${hit.detail}）`,
                argv: hit.argv.join(' '),
              }
            : {
                probe: 'L1-3',
                verdict: 'fail',
                detail: failures.join('；'),
                argv: candidates.map((c) => c.join(' ')).join('  ‖  '),
              },
        )
      }
    }

    // L1-4 双实例并行：各自回显自己的 token，session 标识必须不同
    const argvA = [executable, ...headlessWithExtra, 'Reply with exactly: ALPHA-1', ...json]
    const argvB = [executable, ...headlessWithExtra, 'Reply with exactly: BETA-2', ...json]
    const [outA, outB] = await Promise.all([run(argvA, dir), run(argvB, dir)])
    const a = parseJsonl(outA.stdout)
    const b = parseJsonl(outB.stdout)
    const bothAnswered = outA.stdout.includes('ALPHA-1') && outB.stdout.includes('BETA-2')
    const distinct = a.sessionId && b.sessionId && a.sessionId !== b.sessionId
    results.push({
      probe: 'L1-4',
      verdict: bothAnswered && distinct ? 'pass' : 'fail',
      detail: bothAnswered
        ? distinct
          ? '双实例各自回显、session 标识不同'
          : '双实例回显正常但 session 标识相同或缺失'
        : `回显不全（A exit ${outA.exitCode} / B exit ${outB.exitCode}，超时 ${outA.timedOut || outB.timedOut}）`,
      argv: `${argvA.join(' ')}  ‖  ${argvB.join(' ')}`,
    })
  }

  rmSync(dir, { recursive: true, force: true })
  return results
}

function parseArgs(argv: string[]): { out: string | null; only: string | null } {
  let out: string | null = null
  let only: string | null = null
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--out') out = argv[i + 1] ?? null
    if (argv[i] === '--only') only = argv[i + 1] ?? null
  }
  return { out, only }
}

function renderMarkdown(ledger: Map<string, ProbeResult[]>): string {
  const lines: string[] = []
  lines.push('| agent | 探针 | 判定 | 说明 | 实际 argv |')
  lines.push('| --- | --- | --- | --- | --- |')
  for (const [id, results] of ledger) {
    for (const r of results) {
      const verdict =
        r.verdict === 'pass' ? '✅ 通过' : r.verdict === 'fail' ? '❌ 失败' : '⭕ 跳过'
      const argv = r.argv ? '`' + r.argv.replace(/\|/g, '\\|') + '`' : '-'
      lines.push(
        `| ${id} | ${r.probe} | ${verdict} | ${r.detail.replace(/\|/g, '\\|')} | ${argv} |`,
      )
    }
  }
  return lines.join('\n')
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const dbPath = dbPathOf()
  if (!existsSync(dbPath)) {
    console.log(`跳过：找不到 ${dbPath}。先跑一次服务让注册表初始化，再跑探针。`)
    return
  }

  const db = new DatabaseSync(dbPath)
  const rows = db
    .prepare(
      `SELECT id, executable, headless_flag, resume_flag, json_flag, archived
         FROM agent_registry ORDER BY id ASC`,
    )
    .all() as unknown as Row[]

  const installed: Row[] = []
  for (const row of rows) {
    if (row.archived) continue
    if (!row.executable) continue
    const which = spawn('which', [row.executable])
    const exists = await new Promise<boolean>((resolve) => {
      which.on('close', (code) => resolve(code === 0))
      which.on('error', () => resolve(false))
    })
    if (!exists) continue
    installed.push(row)
  }

  console.log(
    `注册表 ${rows.length} 条；未归档且本机已装 ${installed.length} 条：${installed.map((r) => r.id).join(', ') || '(无)'}\n`,
  )
  if (installed.length === 0) {
    console.log('本机无可用 agent：探针不适用，不是通过。')
    return
  }

  const ledger = new Map<string, ProbeResult[]>()
  for (const row of installed) {
    if (args.only && row.id !== args.only) continue
    console.log(`跑 ${row.id} …`)
    ledger.set(row.id, await probeAgent(row))
  }

  const markdown = renderMarkdown(ledger)
  console.log(`\n${markdown}`)
  if (args.out) {
    writeFileSync(args.out, `${markdown}\n`)
    console.log(`\n已写入 ${args.out}`)
  }

  const failed = [...ledger.values()].flat().filter((r) => r.verdict === 'fail')
  const passed = [...ledger.values()].flat().filter((r) => r.verdict === 'pass')
  console.log(`\n通过 ${passed.length} 项，失败 ${failed.length} 项。`)
  if (failed.length > 0) {
    console.error(
      '失败项见上表「说明」列——凭据/配额/交互确认三类原因需分别处置，不要当成协议缺失。',
    )
    process.exitCode = 1
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
