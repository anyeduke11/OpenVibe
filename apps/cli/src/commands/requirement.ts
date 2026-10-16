import { createHash } from 'node:crypto'
import {
  REQUIREMENT_PRIORITIES,
  type AgentIngestBatchResult,
  type AgentIngestItemResult,
} from '@openvibe/shared'
import { ServerUnreachable, type ApiClient } from '../client'
import { ExitCode, type ExitCodeValue } from '../output'

/**
 * M8 · CLI 写面之二：`openvibe requirement add`（m8-agent-bridge.md FR-4.1 表格的延后项）。
 *
 * ## 为什么走 `POST /api/agent/ingest` 而不是「直接写 requirements 表」
 *
 * **这是本文件最要紧的一条**。`requirement` 这一类的处理在 FR-2.1.1 里写死了：
 * 转成一条 `agent_ingests` **待确认**记录，**发布时**才落 `requirements` 草稿；
 * 而 FR-2.5 的人工确认门对这一类**同样成立**（一律 `pending`，用户在 Web 点确认才转
 * `published` 并落业务表）。服务端那一半早已实现（`agentService.publishRequirement`，
 * `status` 硬编码 `'draft'`），所以本文件要做的只是**把入参封装成一条 ingest 项打给既有端点**——
 * 不新建端点、不引第二套校验与出参面，那才是「五套鉴权、五套校验」的病根。
 *
 * ## 风险档与 writesDisk
 *
 * `decision`（与 `session log` 同档同因：改服务端 DB 且 CLI 侧无确认闸）、
 * `writesDisk: false`。本文件**零文件系统调用**：不建文件、不写文件、不读本地项目树
 * （FR-4.4 红线）。唯一的内置模块 import 是 `node:crypto`，只用于算幂等键。
 */

/** 回流 kind（FR-2.1 的五项闭集之一，`AGENT_INGEST_KINDS` 里那一项） */
export const REQUIREMENT_INGEST_KIND = 'requirement' as const

/** 单一写端点：五类 kind 共用（FR-2.1「不按类型开五个端点」） */
export const AGENT_INGEST_PATH = '/api/agent/ingest'

/** `requirements.priority` 的闭集值来自 shared（FR-1.1a 的 CHECK），本文件只认它不重定义 */
export type RequirementPriority = (typeof REQUIREMENT_PRIORITIES)[number]

/** 缺省优先级：`requirements` 表的列默认值同样是 `P2`，两边一致 */
export const DEFAULT_REQUIREMENT_PRIORITY: RequirementPriority = 'P2'

/** 上报方平台标识的缺省值：`sourcePlatform` 是 `min(1)` 非空串，必须有个地板 */
export const DEFAULT_SOURCE_PLATFORM = 'cli'

export class RequirementAddError extends Error {
  readonly code: string
  readonly details?: unknown
  constructor(code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'RequirementAddError'
    this.code = code
    if (details !== undefined) this.details = details
  }
}

export interface RequirementAddOptions {
  project: string
  title: string
  detail?: string
  priority?: string
}

export interface RequirementAddDeps {
  client?: ApiClient
  /** 自报工作目录（`agent_ingests.cwd`，FR-1.2.2：只用于冲突判定与 Web 展示，不是安全凭据） */
  cwd?: string
  /** 上报方平台标识：取自 `OPENVIBE_AGENT`，缺省 `DEFAULT_SOURCE_PLATFORM` */
  platform?: string | null
}

/** 送进 `payload_json` 的载荷形状。键名照 `agentService.publishRequirement` 实际读的三个键 */
export interface RequirementPayload {
  title: string
  detail: string
  priority: RequirementPriority
}

export interface RequirementAddOutcome {
  project: string
  payload: RequirementPayload
  idempotencyKey: string
  sourcePlatform: string
  /** 服务端逐条结果（FR-2.7：本命令恒只送一条，故恒有） */
  item: AgentIngestItemResult
  exitCode: ExitCodeValue
  /** 仅 exitCode === error 时有：给 `printer.result` 的结构化失败面 */
  error?: { code: string; message: string }
  warnings: string[]
  hints: string[]
}

/**
 * 埋点：本命令**照常上报** `cli_agent_command_run`，与 `ask` / `status` / `session` 同一形状
 * （`status.ts` 的 `reportCommandRun` 是该埋点的唯一出口）。
 *
 * 此前这里是另一套 `{sent:false, reason:'unreported'}` 的专用形状，
 * 因为服务端 `commandRunService.CLI_COMMAND_RUN_COMMANDS` 只认 `ask|status|session` 三值，
 * 传 `requirement` 必 422。扩闭集属 **B 级改契约**，2026-10-16 由 owner 拍板授权后已补齐，
 * 那套专用形状随之删除。
 *
 * ⚠️ **当初没有拿 `session` 顶替是对的**：顶替会让台账里出现一条与真实执行不符的记录，
 * 比不记更坏 —— 台账一旦不可信，就没人再拿它做判断了。
 */

/** `--priority` 闭集校验：与 shared 的 `REQUIREMENT_PRIORITIES` 逐字同源，服务端不扩列 */
export function parsePriority(raw: string): RequirementPriority {
  const p = raw.trim().toUpperCase()
  const hit = REQUIREMENT_PRIORITIES.find((x) => x === p)
  if (!hit)
    throw new RequirementAddError(
      'BAD_PRIORITY',
      `优先级只能是 ${REQUIREMENT_PRIORITIES.join(' | ')}：${raw}`,
      { priorities: [...REQUIREMENT_PRIORITIES], received: raw },
    )
  return hit
}

/**
 * ## 幂等键的构造口径（FR-2.3：由调用方构造，服务端不生成、不校验格式）
 *
 * spec 的推荐式是 `sha256(project_id + kind + external_session_id + 本地序号)`。
 * **本命令取不到 `external_session_id`**：`agent_sessions` 表全仓无任何写入路径
 * （`INSERT INTO agent_sessions` 实测命中 0，服务端 `publishRequirement` 也正因为查不到
 * 该会话而把 `source_session_id` 落 NULL），CLI 侧也无从构造一个平台侧的会话 id——
 * **编一个出来会让重试变成新条目**，正是 FR-2.3 要防的那件事。
 * 同一个「本地序号」也拿不到：本命令是一次性进程，没有跨调用的本地计数。
 *
 * 故取**内容寻址**：`sha256(project + kind + title + detail + priority)`。
 * 理由与代价都写在这里：
 * - 好处：同一条命令重试 ⇒ 同键 ⇒ 服务端判 `duplicate`（FR-2.2），**不重复落库**；
 *   真要再送一条不同的需求，改任一字段即得新键 ⇒ `accepted`。不需要进程间状态。
 * - 代价：想送两条**逐字相同**的需求做不到（第二条恒 `duplicate`）——用 `--detail` 区分即可。
 *   这条限制对用户可见，故 `hints` 里明写。
 * - 由此推出：`conflict`（同键异载荷）从本命令**构造上不可达**，因为载荷是键的函数。
 *   仍按失败处理，是防「别的调用方（agent 侧 skill）用了同一条公式但载荷键集不同」。
 *
 * 字段之间用 `\n` 分隔：分隔符让拼接**无歧义**（否则 `ab`+`c` 与 `a`+`bc` 会撞键）。
 */
export function requirementIdempotencyKey(input: {
  project: string
  kind?: string
  title: string
  detail: string
  priority: string
}): string {
  const canonical = [
    input.project,
    input.kind ?? REQUIREMENT_INGEST_KIND,
    input.title,
    input.detail,
    input.priority,
  ].join('\n')
  return `cli-requirement-${createHash('sha256').update(canonical, 'utf8').digest('hex')}`
}

function unreachable(e: unknown): never {
  const detail = e instanceof Error ? e.message : String(e)
  throw new RequirementAddError(
    'SERVER_UNREACHABLE',
    `${detail}。需求回流只经 HTTP 写服务端的待确认队列，本机不落任何文件：先运行 \`openvibe serve\` 起本地服务（或用 --server 指定地址）`,
  )
}

/**
 * 入参组装（可单测的纯函数）：项目 id 与标题必填且不得为空。
 * 标题为空时**本地就拒**：服务端 `publishRequirement` 也会拒，但那要等一次白跑的网络往返，
 * 而 `--title ""` 是 agent 最容易犯的错（拼接出空串），早失败能给到可执行的提示。
 */
export function buildRequirement(
  options: RequirementAddOptions,
): { project: string; payload: RequirementPayload } {
  const project = options.project.trim()
  if (project === '')
    throw new RequirementAddError(
      'USAGE',
      'openvibe requirement add 需要 --project <id>（项目 id，不是目录）',
    )
  const title = (options.title ?? '').trim()
  if (title === '')
    throw new RequirementAddError('BAD_TITLE', '需求标题不能为空：--title <text> 必填且不得只有空白')
  const priority = options.priority === undefined ? DEFAULT_REQUIREMENT_PRIORITY : parsePriority(options.priority)
  return { project, payload: { title, detail: options.detail ?? '', priority } }
}

/** 请求体：一个命令 = 一条 ingest 项（FR-2.7 的逐条结果因此恒有一条） */
export function requirementIngestBody(
  project: string,
  payload: RequirementPayload,
  idempotencyKey: string,
  sourcePlatform: string,
  cwd: string,
): { projectId: string; items: unknown[] } {
  return {
    projectId: project,
    items: [
      {
        kind: REQUIREMENT_INGEST_KIND,
        idempotencyKey,
        payload,
        sourcePlatform,
        // FR-1.2.2：自报路径只用于冲突判定与 Web 展示，**不进 payload_json**，
        // 因此它既不影响幂等判定、也不会随载荷进业务表。
        // 缺省**不给这个键**而不是给空串：schema 是 `z.string().min(1).nullable().optional()`，
        // 空串会被服务端 422 整条拒掉。
        ...(cwd === '' ? {} : { cwd }),
        // ⚠️ 刻意**不给** sourceSessionId：agent_sessions 全仓无写入路径（见幂等键注释），
        // 编一个 id 只会让服务端查不到后落 NULL，且看起来像是「关联到了某个会话」
      },
    ],
  }
}

/**
 * 四态 → 退出码（FR-2.2 的判定三态 ＋ FR-2.7 的 rejected）。
 *
 * - `accepted` → 0：落库成功，待人工确认。
 * - `duplicate` → **0**：同键同载荷的幂等重放，「已存在」正是重试想要的结果。
 *   退 1 会让 `for` 循环里的重试把整轮脚本判失败。`summary.item.status` 仍如实报 duplicate。
 * - `rejected` / `conflict` → 1：服务端明说这条没进去，且**不会**有人在 Web 上看到它。
 * - drift(2) **不可达**：本命令无本地可比对状态（漂移在本仓唯一语义是「项目树 vs pack.lock.json」），
 *   回流响应里也没有漂移概念。详见 `requirement-add.test.ts` 里钉这条的用例。
 */
export function requirementExitCode(status: AgentIngestItemResult['status']): ExitCodeValue {
  switch (status) {
    case 'accepted':
    case 'duplicate':
      return ExitCode.ok
    case 'rejected':
    case 'conflict':
      return ExitCode.error
  }
}

/** 四态各自的下一步：每一态都给**可执行**的命令，不给「请检查」 */
export function requirementLines(outcome: RequirementAddOutcome): string[] {
  const lines = [
    `已送一条需求进待确认队列：${outcome.payload.title}（${outcome.project} · ${outcome.payload.priority}）`,
    `幂等键 ${outcome.idempotencyKey} · 回流记录 ${outcome.item.id ?? '(服务端未给 id)'}`,
  ]
  if (outcome.item.status === 'accepted')
    lines.push('状态 pending：需求要你在 Web 工作台点「确认」之后才会落 requirements 表（draft）')
  if (outcome.item.status === 'duplicate')
    lines.push('状态 duplicate：这条幂等键已存在，服务端未重复落库（内容逐字相同）')
  if (outcome.item.status === 'rejected')
    lines.push(`状态 rejected：服务端拒收（${outcome.item.reason ?? '(未给理由)'}）`)
  if (outcome.item.status === 'conflict')
    lines.push(
      `状态 conflict：同一幂等键已存在但载荷不同（既有 ${outcome.item.existingKeySha ?? '?'} / 传来 ${outcome.item.incomingKeySha ?? '?'}），` +
        '既有那条的内容一个字节都没改；请改 --detail 或 --title 后重试以换键',
    )
  return lines
}

export function requirementHints(project: string): string[] {
  return [
    `看待确认队列：Web 工作台的 Agent 回流面板（项目 ${project}）`,
    '幂等键按内容构造（项目 + kind + 标题 + 说明 + 优先级），重复执行同一条只会判 duplicate；' +
      '要再送一条不同需求，改 --detail 或 --priority 即可换键',
  ]
}

export async function requirementAddAction(
  options: RequirementAddOptions,
  deps: RequirementAddDeps = {},
): Promise<RequirementAddOutcome> {
  const { project, payload } = buildRequirement(options)
  const client = deps.client
  if (!client) {
    throw new RequirementAddError(
      'SERVER_REQUIRED',
      '需求回流要写服务端的待确认队列（幂等判定与人工确认门都在服务端），没有离线模式：' +
        '先运行 `openvibe serve`，或用 --server/--token 指定可用的服务端',
    )
  }
  const idempotencyKey = requirementIdempotencyKey({ project, ...payload })
  const sourcePlatform = (deps.platform ?? '').trim() || DEFAULT_SOURCE_PLATFORM
  const cwd = (deps.cwd ?? '').trim()
  const body = requirementIngestBody(project, payload, idempotencyKey, sourcePlatform, cwd)
  try {
    const res = await client.postJson<AgentIngestBatchResult>(AGENT_INGEST_PATH, body)
    const item = res.items[0]
    // 协议守卫：请求恒送一条，服务端恒回一条。回空数组说明两侧对不上，
    // 此时**不能**默认按成功收工——那会把「没落库」报成 ok。
    if (!item)
      throw new RequirementAddError(
        'BAD_RESPONSE',
        `${AGENT_INGEST_PATH} 未回传逐条结果（items 为空），本条需求是否落库无法判定，请重试`,
        { response: res },
      )
    const exitCode = requirementExitCode(item.status)
    const failed = exitCode !== ExitCode.ok
    return {
      project,
      payload,
      idempotencyKey,
      sourcePlatform,
      item,
      exitCode,
      ...(failed
        ? {
            error: {
              code: item.status === 'conflict' ? 'INGEST_CONFLICT' : 'INGEST_REJECTED',
              message: item.reason ?? `服务端逐条结果为 ${item.status}`,
            },
          }
        : {}),
      warnings: failed ? [`服务端逐条结果为 ${item.status}：${item.reason ?? '(未给理由)'}`] : [],
      hints: requirementHints(project),
    }
  } catch (e) {
    if (e instanceof ServerUnreachable) unreachable(e)
    throw e
  }
}
