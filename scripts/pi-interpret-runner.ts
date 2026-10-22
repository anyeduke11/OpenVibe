#!/usr/bin/env tsx
/**
 * `scripts/pi-interpret-runner.ts` —— **Pi 的命令适配器包装脚本**
 * （`m9-dev-language-roadmap.md` §3.8 / §5.5 · **DL-08 / DL-09 / DL-18**）
 *
 * ## 契约（与 P4 的 Go 助手同款形状）
 *
 * - **stdin** 收 `SourceInterpretRequest` 的 JSON；
 * - **stdout** 出 `SourceInterpretResult` 的 JSON（**stdout 上只有它** —— 诊断信息一律走 stderr）；
 * - **退出码** 0 = 成功，非 0 = 失败。
 *
 * ⇒ 应用侧（`CommandInterpretRunner`）**不知道** Pi 的存在 ⇒
 *   换一家 agent CLI 只要也遵守这个契约就能当 runner（§5.5 的口径）。
 *
 * ## ⚠️ 为什么要**显式禁掉所有工具**（安全关键）
 *
 * Pi 是**带工具的 agent**（read / bash / edit / write）⇒
 * 一个「只做源码解读」的调用，一旦让工具开着，agent 就可能去读本机文件、
 * 执行命令、改文件 —— 而这些**都不是用户要求的**，且会扩大出网面。
 * ⇒ 本脚本**逐个显式关掉**：
 * `--no-tools`（内建与扩展工具全关）· `--no-mcp`（不接 MCP）
 * · `--no-extensions`（不发现扩展）· `--no-skills`（不加载技能）
 * · `--no-context-files`（不读 `AGENTS.md` / `CLAUDE.md` 等上下文文件）
 * · `--no-session`（不落会话）· `--no-approve`（不信任项目本地文件）。
 *
 * ⚠️ **还把工作目录设成系统临时目录** —— 纵深防御：
 *   万一某个开关的语义变了，Pi 也找不到项目里的上下文文件。
 *
 * ## ⚠️ 提示词走 **stdin**，不进 argv
 *
 * 提示词里装着**用户的源码片段** ⇒ 放 argv 就等于让它出现在 `ps` 的进程表里。
 * ⇒ 实测 Pi 在**不给位置参数**时从 stdin 读提示词 ⇒ 这里就那么用。
 *
 * ## ⚠️ 仓内**不硬编**任何 provider / model
 *
 * provider 与模型由**调用方**给（环境变量或命令行参数）⇒
 * 仓里没有「默认接哪一家」这件事，换一家不用改代码。
 *
 * ```bash
 * # 用法一：环境变量
 * OPENVIBE_M9_INTERPRETER_PROVIDER=sensenova \
 * OPENVIBE_M9_INTERPRETER_MODEL=deepseek-v4-flash \
 *   npx tsx scripts/pi-interpret-runner.ts < request.json
 *
 * # 用法二：命令行参数（优先于环境变量）
 * npx tsx scripts/pi-interpret-runner.ts --provider sensenova --model deepseek-v4-flash < request.json
 * ```
 *
 * ⚠️ **设置页里怎么配**（provider 的 `kind = command`）：
 * `cmd = "npx"`、`args = ["tsx", "<本仓绝对路径>/scripts/pi-interpret-runner.ts"]`。
 * ⚠️ 脚本的 provider/model **只影响 Pi 选了哪一家**；台账记的 model/provider
 * 来自**设置页里的那一份配置** ⇒ 两边不一致时，**以设置页为准**。
 */
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import {
  buildInterpretPrompt,
  digestPiEventStream,
  SOURCE_INTERPRET_SCHEMA_VERSION,
  SourceInterpretRequest,
  SourceInterpretResult,
  stripJsonFence,
} from '@openvibe/shared'

/** stdout 最多收这么多（防无界内存）。 */
const MAX_OUTPUT = 16 * 1024 * 1024

/** Pi 的可执行文件（默认 `pi`；用环境变量是为了让用户能指向别的安装位置）。 */
function piBin(): string {
  const raw = process.env['OPENVIBE_M9_PI_BIN']
  return raw !== undefined && raw.trim() !== '' ? raw.trim() : 'pi'
}

/** 超时（毫秒；默认 120s —— 解读比普通问答慢）。 */
function timeoutMs(): number {
  const raw = Number(process.env['OPENVIBE_M9_PI_TIMEOUT_MS'])
  return Number.isFinite(raw) && raw > 0 ? raw : 120_000
}

/** 解析命令行参数（只认 `--provider` / `--model`；**其余一律忽略**）。 */
function cliArgs(argv: readonly string[]): { provider: string | null; model: string | null } {
  let provider: string | null = null
  let model: string | null = null
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--provider' && argv[i + 1] !== undefined) {
      provider = argv[i + 1]!.trim()
      i += 1
    } else if (a === '--model' && argv[i + 1] !== undefined) {
      model = argv[i + 1]!.trim()
      i += 1
    }
  }
  return { provider: provider === '' ? null : provider, model: model === '' ? null : model }
}

/** provider / model：命令行参数优先于环境变量。 */
function resolveTarget(): { provider: string | null; model: string | null } {
  const cli = cliArgs(process.argv.slice(2))
  const envProvider = process.env['OPENVIBE_M9_INTERPRETER_PROVIDER']?.trim()
  const envModel = process.env['OPENVIBE_M9_INTERPRETER_MODEL']?.trim()
  return {
    provider: cli.provider ?? (envProvider !== undefined && envProvider !== '' ? envProvider : null),
    model: cli.model ?? (envModel !== undefined && envModel !== '' ? envModel : null),
  }
}

/** 读干 stdin（**读干净** —— 后面要把它当 Pi 的输入通道再用）。 */
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
  }
  return Buffer.concat(chunks).toString('utf8')
}

/** 失败 ⇒ 往 stderr 写人话并退非 0（**stdout 上不许留半个 JSON**）。 */
function fail(message: string, code = 1): never {
  process.stderr.write(`${message}\n`)
  process.exit(code)
}

interface PiRun {
  stdout: string
  stderr: string
  code: number | null
  timedOut: boolean
  spawnError: string | null
}

/** 起 Pi，把提示词喂给它的 stdin，收它的 stdout（NDJSON 事件流）。 */
function runPi(args: readonly string[], input: string): Promise<PiRun> {
  return new Promise<PiRun>((resolve) => {
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let spawnError: string | null = null

    const child = spawn(piBin(), [...args], {
      // ⚠️ **工作目录设成临时目录**（纵深防御）：即便某个「禁工具」开关失效，
      //   Pi 也找不到项目里的上下文文件、更不会把结果落在项目里。
      cwd: tmpdir(),
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs())

    child.stdout.on('data', (d: Buffer) => {
      if (stdout.length < MAX_OUTPUT) stdout += d.toString('utf8')
    })
    child.stderr.on('data', (d: Buffer) => {
      if (stderr.length < MAX_OUTPUT) stderr += d.toString('utf8')
    })
    child.on('error', (err: Error) => {
      spawnError = err.message
    })
    child.on('close', (code: number | null) => {
      clearTimeout(timer)
      resolve({ stdout, stderr, code, timedOut, spawnError })
    })
    // ⚠️ 子进程提前退出时写 stdin 会 EPIPE ⇒ 忽略，别把它当致命错
    child.stdin.on('error', () => {
      /* noop */
    })
    child.stdin.end(input, 'utf8')
  })
}

async function main(): Promise<void> {
  const raw = await readStdin()
  if (raw.trim() === '') {
    fail('stdin 是空的（契约：stdin 收 SourceInterpretRequest 的 JSON）', 2)
  }

  let payload: unknown
  try {
    payload = JSON.parse(raw)
  } catch {
    fail('stdin 不是合法 JSON（契约：stdin 收 SourceInterpretRequest 的 JSON）', 2)
  }
  const request = SourceInterpretRequest.safeParse(payload)
  if (!request.success) {
    fail('stdin 的 JSON 不合 SourceInterpretRequest 契约', 2)
  }

  const target = resolveTarget()
  const args = [
    '--mode',
    'json',
    '-p',
    // ⚠️ **安全关键**：逐个显式关掉工具与一切本机上下文
    '--no-tools',
    '--no-mcp',
    '--no-extensions',
    '--no-skills',
    '--no-context-files',
    '--no-session',
    '--no-approve',
  ]
  if (target.provider !== null) args.push('--provider', target.provider)
  if (target.model !== null) args.push('--model', target.model)

  const prompt = buildInterpretPrompt(request.data)
  const run = await runPi(args, prompt)

  if (run.spawnError !== null) {
    fail(`起不来 Pi：${run.spawnError.slice(0, 300)}`)
  }
  if (run.timedOut) {
    fail(`Pi 超时（${String(timeoutMs())}ms）`)
  }
  if (run.code !== 0) {
    fail(`Pi 退出码 ${String(run.code ?? 'null')}：${run.stderr.slice(0, 400)}`)
  }

  const digest = digestPiEventStream(run.stdout)
  if (digest.aborted) {
    fail('Pi 这一轮被中止了（事件流里 `agent_settled.aborted` 为真）⇒ 结果不可信', 3)
  }
  if (digest.text === null) {
    fail(
      `Pi 的事件流里没有可读的正文（读到的事件类型：${digest.eventTypes.join(' → ') || '（空）'}）`,
      3,
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(stripJsonFence(digest.text))
  } catch {
    fail('Pi 的回答不是合法 JSON', 4)
  }

  // ⚠️ **先比版本，再谈字段**（增强 3：同 HTTP runner 与命令适配器）
  const version =
    typeof parsed === 'object' && parsed !== null
      ? (parsed as { schema_version?: unknown }).schema_version
      : undefined
  if (version !== SOURCE_INTERPRET_SCHEMA_VERSION) {
    fail(
      `解读契约版本对不上（期望 ${String(SOURCE_INTERPRET_SCHEMA_VERSION)}，收到 ${String(version ?? '缺失')}）`,
      5,
    )
  }

  // ⚠️ **model / provider 用「实际跑的那一家」覆盖模型的自述** ——
  //   台账要记的是事实；模型自报的名字是猜的。
  const merged = {
    ...(parsed as Record<string, unknown>),
    schema_version: SOURCE_INTERPRET_SCHEMA_VERSION,
    model: target.model ?? 'unknown',
    provider: target.provider ?? 'unknown',
  }
  const result = SourceInterpretResult.safeParse(merged)
  if (!result.success) {
    fail('Pi 的回答不合解读契约（SourceInterpretResult）', 6)
  }

  // ⚠️ **stdout 上只有契约 JSON** —— 诊断信息一律走 stderr
  process.stdout.write(JSON.stringify(result.data))
}

await main()
