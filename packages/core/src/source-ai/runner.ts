/**
 * `packages/core/src/source-ai/runner.ts` —— **T2 的 runner 契约**（P5.1 · DL-08）
 * （`m9-dev-language-roadmap.md` §3.8 / §5.5 / §7 DL-08）
 *
 * ## 它是什么
 *
 * 一个**可注入的接口**：`interpret(request) → result`。
 *
 * ## ⚠️ 为什么是「注入」而不是「内置客户端」
 *
 * 三条理由，每条都有出处：
 *
 * 1. ~~本仓没有、也不该有模型客户端~~ —— ⚠️ **owner 2026-10-22 更新了这条口径**：
 *    原口径是「不直接接 LLM API，语义层通过 AI Agent 做」，
 *    而本轮裁决一明确「**增加手动调控设置**」且「**支持本地模型和 LLM API 接入**」
 *    ⇒ 现在有**两种** runner 形态：
 *    **命令适配器**（agent CLI，如 Pi 的包装脚本）＋
 *    **OpenAI 兼容 HTTP**（本机模型与云端 API **同一种协议**，见 `http-runner.ts`）。
 *    ⚠️ **但「可注入」这条一个字没改** —— 内置客户端只是**其中一种实现**；
 *    判据 DL-08 的「注入必失败的 runner」仍要有缝可注。
 * 2. **具体接哪家 provider 仍不在 M9 的人日内**（dev-plan §9 合计段落：
 *    「⚠️ 不含 Pi 接入本身」）⇒ M9 交付**契约 ＋ 降级 ＋ 台账 ＋ 界面**，
 *    provider 由用户在**设置页手动配**（或由宿主接）。
 * 3. **DL-08 的判据形态就是「注入必失败的 runner」** —— 只有存在可注入的缝，
 *    这条判据才**可执行**；内置客户端的话，「必失败的 runner」无处可注。
 *
 * ## ⚠️ 命令适配器为什么是「stdin JSON → stdout JSON」
 *
 * M3 的 FR-6.3.2 要求「**必须用结构化输出**（要求 JSON 并做 schema 校验），
 * 不解析自然语言里『提到了哪些词』」—— 那是不可测、不可复算的。
 * ⇒ 命令适配器与 P4 的 Go 助手同款形状：**stdin 收 JSON、stdout 出 JSON**，
 * 任何能遵守这个契约的东西（Mavis 的包装脚本、Pi 的 RPC 包装、别的 agent CLI）
 * 都能当 runner ⇒ **应用侧不依赖任何一家 provider**。
 *
 * ## ⚠️ 失败必须**降级**，不许把错误往上抛成「整个功能不可用」
 *
 * M3 FR-6.3.3 列了四种失败（未安装 / 起不来 / 超时 / 非法 JSON）⇒ 全部**只跑基线层**。
 * ⇒ 本文件把失败**归一**成 `InterpretRunnerError`（带 `reason`），
 *   上层据此写台账并**如实显示失败**，而不是让异常冒到界面。
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { runWithStdin } from '../source-scan/run-with-stdin'
import {
  schemaVersionMismatch,
  SourceInterpretRequest,
  SourceInterpretResult,
  type InterpretStatus,
} from '@openvibe/shared'

const execFileAsync = promisify(execFile)

/** runner 的失败原因（归一后的闭集 —— 台账的 `failureReason` 取它）。 */
export type InterpretFailureReason =
  | 'runner-not-found'
  | 'runner-timeout'
  | 'runner-invalid-json'
  | 'runner-invalid-schema'
  /** ⚠️ **契约版本对不上**（增强 3）—— 与「输出坏了」是**两件事**，要能分开 */
  | 'runner-version-mismatch'
  | 'runner-failed'

/** runner 抛出的错（**归一** ⇒ 上层只处理一种形状）。 */
export class InterpretRunnerError extends Error {
  constructor(
    public readonly reason: InterpretFailureReason,
    message: string,
  ) {
    super(message)
    this.name = 'InterpretRunnerError'
  }
}

/**
 * 校验 runner 的输出：**先比契约版本，再看字段**（命令适配器与 HTTP runner 同款）。
 *
 * ⚠️ 版本对不上归一成 `runner-version-mismatch`，而不是笼统的「不合 schema」——
 *   前者是「契约变了」，后者会让人误判成「工具坏了」。
 *
 * @param parsed 已 `JSON.parse` 的原始值
 * @param invalidSchemaMessage 字段不合契约时的错误文案（两个 runner 各自的措辞）
 */
export function decodeInterpretResult(
  parsed: unknown,
  invalidSchemaMessage: string,
): SourceInterpretResult {
  const mismatch = schemaVersionMismatch(parsed)
  if (mismatch !== null) {
    throw new InterpretRunnerError('runner-version-mismatch', mismatch)
  }
  const result = SourceInterpretResult.safeParse(parsed)
  if (!result.success) {
    throw new InterpretRunnerError('runner-invalid-schema', invalidSchemaMessage)
  }
  return result.data
}

/** 解读 runner（**可注入**）。 */
export interface SourceInterpretRunner {
  /** runner 标识（台账与能力端点用；不含任何本机路径） */
  readonly id: string
  /** 模型标识（台账用） */
  readonly model: string
  /** provider 标识（台账用） */
  readonly provider: string
  /** 解读一次 */
  interpret(request: SourceInterpretRequest): Promise<SourceInterpretResult>
}

/**
 * 探测一个命令是否存在（**只问「有没有」**，不装任何东西）。
 *
 * @param cmd 命令名或路径
 */
export async function commandExists(cmd: string): Promise<boolean> {
  try {
    await execFileAsync(cmd, ['--version'], { encoding: 'utf8', timeout: 10_000 })
    return true
  } catch {
    return false
  }
}

/** 命令适配器的选项。 */
export interface CommandRunnerOptions {
  /** 命令（**不含参数**，参数一律由 `--version` 探测后省略） */
  cmd: string
  /**
   * 命令的参数（**逐个给，不是一整串 shell 命令**）。
   *
   * ⚠️ **为什么参数要分开**（owner 2026-10-22 裁决一「手动调控」带来的）：
   *   Pi 这类 CLI 通常要 `pi run --json` 之类 ⇒ 光有命令名不够。
   *   ⚠️ **但绝不接受整串命令行** —— 那样等于开了命令注入的口子
   *   （一串 `; rm -rf …` 就能被当参数执行）。
   */
  args?: string[]
  /** 模型标识 */
  model: string
  /** provider 标识 */
  provider: string
  /** 超时（毫秒；默认 30s —— 与 M3 FR-6.3.3 的初始超时一致） */
  timeoutMs?: number
}

/**
 * 命令适配器：**stdin 收 JSON、stdout 出 JSON**。
 *
 * ⚠️ 契约（**宿主侧照这个写就行**）：
 * - stdin：`SourceInterpretRequest` 的 JSON；
 * - stdout：`SourceInterpretResult` 的 JSON。
 *
 * ⚠️ **不合契约 ⇒ 归一成失败**，绝不把半个结果当成功：
 * - 进程起不来 ⇒ `runner-not-found`；
 * - 超时 ⇒ `runner-timeout`；
 * - stdout 不是合法 JSON ⇒ `runner-invalid-json`；
 * - JSON 合法但**不合 schema** ⇒ `runner-invalid-schema`（FR-6.3.2 的「做 schema 校验」）。
 */
export class CommandInterpretRunner implements SourceInterpretRunner {
  readonly id: string
  readonly model: string
  readonly provider: string
  private readonly cmd: string
  private readonly args: string[]
  private readonly timeoutMs: number

  constructor(opts: CommandRunnerOptions) {
    this.cmd = opts.cmd
    this.args = opts.args ?? []
    this.model = opts.model
    this.provider = opts.provider
    this.timeoutMs = opts.timeoutMs ?? 30_000
    // ⚠️ **id 里不许带绝对路径**（台账会被禁列扫描器扫）⇒ 只取命令的**基名**
    this.id = opts.cmd.split('/').pop() ?? opts.cmd
  }

  async interpret(request: SourceInterpretRequest): Promise<SourceInterpretResult> {
    const payload = JSON.stringify(request)
    let stdout = ''
    let stderr = ''
    let code: number | null = null
    let timedOut = false
    try {
      // ⚠️ **必须用 `runWithStdin`**（不是 `execFile`）——
      //   `execFile` **没有 `input` 选项**（那是 `execFileSync` 才有的）⇒
      //   子进程会收到**空 stdin**，契约就成了「只出不进」。
      const res = await runWithStdin(this.cmd, this.args, payload, {
        timeoutMs: this.timeoutMs,
        maxBuffer: 8 * 1024 * 1024,
      })
      stdout = res.stdout
      stderr = res.stderr
      code = res.code
      timedOut = res.timedOut
    } catch (err) {
      const e = err as { code?: string | number; message?: string }
      if (e.code === 'ENOENT') {
        throw new InterpretRunnerError('runner-not-found', `找不到解读命令：${this.id}`)
      }
      throw new InterpretRunnerError(
        'runner-failed',
        `解读命令起不来：${(e.message ?? '').slice(0, 400)}`,
      )
    }
    if (timedOut) {
      throw new InterpretRunnerError(
        'runner-timeout',
        `解读命令超时（${String(this.timeoutMs)}ms）`,
      )
    }
    if (code !== 0) {
      throw new InterpretRunnerError(
        'runner-failed',
        `解读命令失败（退出码 ${String(code ?? 'null')}）：${stderr.slice(0, 400)}`,
      )
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(stdout)
    } catch {
      throw new InterpretRunnerError('runner-invalid-json', '解读命令的输出不是合法 JSON')
    }
    // ⚠️ **先比版本，再谈字段**（增强 3）——
    //   版本对不上 ⇒ 归一成**自己的**失败原因，而不是笼统的「不合 schema」
    //   （后者会让人误判成「工具坏了」，实际是「契约变了」）。
    return decodeInterpretResult(parsed, '解读命令的输出不合契约')
  }
}

/**
 * 解析环境变量里的 runner 配置（**没有就是不可用** —— DL-08 的下限）。
 *
 * ⚠️ **刻意不在仓内硬编任何 provider**：配置来源是环境变量
 *   `OPENVIBE_M9_INTERPRETER`（命令路径）＋ `OPENVIBE_M9_INTERPRETER_MODEL`
 *   ＋ `OPENVIBE_M9_INTERPRETER_PROVIDER`。
 * ⇒ **没配 = AI 不可用 = 确定性层照常**（DL-08），而不是「配错了就崩」。
 */
export function runnerFromEnv(env: NodeJS.ProcessEnv = process.env): SourceInterpretRunner | null {
  const cmd = env['OPENVIBE_M9_INTERPRETER']
  if (cmd === undefined || cmd.trim() === '') return null
  return new CommandInterpretRunner({
    cmd: cmd.trim(),
    model: env['OPENVIBE_M9_INTERPRETER_MODEL'] ?? 'unknown',
    provider: env['OPENVIBE_M9_INTERPRETER_PROVIDER'] ?? 'unknown',
  })
}

/** 状态的中文文案（界面用；**三档不混**）。 */
export const INTERPRET_STATUS_LABELS: Record<InterpretStatus, string> = {
  ok: '已解读',
  failed: '解读失败',
  unavailable: '解读不可用',
}
