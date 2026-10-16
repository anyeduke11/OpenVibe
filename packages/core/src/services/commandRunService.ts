import { AppError, AGENT_PAYLOAD_KEYS } from '@openvibe/shared'
import type { SqliteDatabase } from '../db'
import { LocalEventsRepo } from '../repos/localEvents'

/**
 * CLI 侧命令执行埋点服务（m8-agent-bridge.md FR-5 的 `cli_agent_command_run` 一类）。
 *
 * ## 为什么单开一个 service 文件，而不是并进 `agentService`
 *
 * FR-5.2 要求的是「台账写入**只发生在服务层**、不散落 route 与 repo」，
 * **不是**「M8 的写入必须塞进同一个文件」。本文件同样落在 `services/` 内、
 * 同样只经 `LocalEventsRepo.record` 写入，因此满足该条；
 * 而把 CLI 埋点与其余 M8 写入点放进同一个文件，会让「谁写台账」这件事的
 * 审查面从一个文件扩大到整条 M8 链路。分文件的隔离更干净。
 *
 * ## 为什么 CLI 不自己写库
 *
 * FR-4.4 红线：CLI 侧从不直接打开 DB（`apps/cli/src` 对 `openDb` / `better-sqlite3` 零命中是
 * 被 `GOLD-M8-01` 钉着的判据）。所以命令跑完只能**经 HTTP 上报**，由本服务落台账 ——
 * 这也是本服务存在的唯一理由。
 *
 * 三条服务层规则（service-layer.md FR-1）照既有服务：不建 class、不建 container、
 * `deps` 显式传入、不 import 任何传输层类型。
 */

/**
 * `command` 的闭集（FR-5.1.1）。**与 CLI 四只 agent 侧命令同名同值**
 * （`openvibe ask` / `status` / `session` / `requirement`）——故意只认这四个字面量：
 * 多认一个值就等于把台账口径与 CLI 命令面焊死，将来 CLI 加命令必须回来改这里，
 * 那正是我们要的「改动可见」而不是悄悄漂移。
 *
 * ⚠️ `requirement` 是 2026-10-16 由 owner 拍板扩进来的（B 级改契约授权）：
 * 此前它被刻意排除，CLI 侧如实输出 `{sent:false, reason:'unreported'}` 而**没有拿
 * `session` 顶替**——顶替会让台账里出现一条与真实执行不符的记录，比不记更坏。
 */
export const CLI_COMMAND_RUN_COMMANDS = ['ask', 'status', 'session', 'requirement'] as const
export type CliCommandRunCommand = (typeof CLI_COMMAND_RUN_COMMANDS)[number]

/**
 * 台账 `payload_json` 的允许键闭集（FR-5.1.1），**导出给测试断言用**。
 *
 * ⚠️ **命名口径说明（2026-10-15 parent 裁定，实现侧遵此）**：spec FR-5.1.1 原文写的是
 * snake_case（`exit_code` / `source_platform` / `reason_code`），但**仓内既有实现是 camelCase**
 * ——`agentService` 用 `reasonCode` / `sourcePlatform`，`contextService` 用 `fieldsCount`，
 * 台账既有 kind 用 `assetType` / `origin`。仓内惯例是 camelCase ⇒
 * 本类按 `exitCode` 实现（spec 文本由 parent 负责对齐实现，本文件不改 spec）。
 *
 * ⚠️ **2026-10-17 起改为从 `AGENT_PAYLOAD_KEYS` 派生**（单一出处在 `@openvibe/shared`），
 *   五类同表，避免本类与另两处各写各的、规格改键时谁都不红。
 */
export const CLI_COMMAND_RUN_PAYLOAD_KEYS = AGENT_PAYLOAD_KEYS.cli_agent_command_run

/** 入参原始形状：`unknown` 是有意的 —— 校验在本服务内做（见 `recordCommandRun` 注释） */
export interface CommandRunInput {
  command?: unknown
  exitCode?: unknown
  agent?: unknown
}

export interface CommandRunServiceDeps {
  db: SqliteDatabase
  /** 时间源显式注入：`day` 由它派生，测试里才能钉住（承 agentService 既有形制） */
  now: () => Date
}

/** 平台标识的长度上限。够放 `trae` / `codebuddy` / `claude-code`，不够放一句话 */
const AGENT_MAX_LEN = 64

/**
 * 拒绝「看起来像路径」的 `agent` 值 —— FR-5.1.2 禁列（绝对路径 / 项目名 / 用户名）
 * 在**写入点**的兜底。
 *
 * **为什么要这一层，而不能只靠白名单构造**：本 payload 其余两键都是闭集枚举，
 * 白名单构造天然安全；**只有 `agent` 是调用方给的自由文本**（取自环境变量
 * `OPENVIBE_AGENT`，见 `recordCommandRun`）。一个人把 `OPENVIBE_AGENT` 写成
 * `/Users/<用户名>` 或 `~/work/<项目名>` 就会把禁列直接写进台账，
 * 而白名单构造对它完全无感。
 *
 * **为什么按「含路径分隔符」而不是「匹配绝对路径正则」**：本仓是跨平台仓，
 * 在 core 里读 `os.userInfo()` / `os.homedir()` 会把**本机身份**引入领域层
 * （且既有生产 service 无一 import `node:os`）。路径分隔符是无状态的形态判据，
 * 能同时挡住 `/Users/x` / `C:\Users\x` / `~/work/x` 三种真实写法，且不会
 * 把「用户名恰好叫 `agent`」这类合法值误伤。
 *
 * **为什么是拒而不是洗**：静默截断/替换会让调用方以为记成功了，
 * 真出问题时反而查不出来；直接 422 + 说清怎么改，调用方能立刻纠正。
 */
function agentViolation(value: string): string | null {
  if (value.length > AGENT_MAX_LEN) return `agent 超过 ${AGENT_MAX_LEN} 字符`
  if (/[/\\~]/.test(value)) return 'agent 不得含路径分隔符（绝对路径 / 项目名 / 用户名属 FR-5.1.2 禁列）'
  return null
}

export function createCommandRunService(deps: CommandRunServiceDeps) {
  const ledger = new LocalEventsRepo(deps.db)

  /**
   * 记一次 CLI 命令执行。
   *
   * **为什么校验放在服务层而不是路由的 `parseOrThrow`**：① `command` 的三值闭集是
   * **本服务的业务契约**（白名单构造的另一半），离开服务层就没有守卫；② 这样本服务
   * 可被单测直接覆盖，不必起 app；③ 本轮不新增 `packages/shared` 的 zod schema
   * （该目录非本任务独占面），少一处跨包改动就少一处冲突面。
   * 路由仍只做「调服务 + 序列化」，与本仓既有路由形态一致。
   */
  function recordCommandRun(input: CommandRunInput): void {
    const fieldErrors: Record<string, string[]> = {}

    // ---- command：闭集四值，缺省不算（宁可 422，也不要一条语义不明的台账行）----
    if (typeof input.command !== 'string' || !isCliCommand(input.command)) {
      fieldErrors.command = [`command 必须是 ${CLI_COMMAND_RUN_COMMANDS.join(' / ')} 之一`]
    }

    // ---- exitCode：整数。刻意不收窄到 ExitCode 三值——
    // 入参契约写的是 number，而真实 CLI 可能被信号打断落到别的码上；
    // 把观测面卡死在三值会让「异常退出」这类最该被看见的情况反而记不下来。----
    if (typeof input.exitCode !== 'number' || !Number.isInteger(input.exitCode)) {
      fieldErrors.exitCode = ['exitCode 必须是整数']
    }

    // ---- agent：缺省 / null ⇒ 「人跑的」（本轮 parent 选定，spec 未定义）----
    let agent: string | null = null
    if (input.agent !== undefined && input.agent !== null) {
      if (typeof input.agent !== 'string') {
        fieldErrors.agent = ['agent 必须是字符串或 null']
      } else if (input.agent.trim() === '') {
        fieldErrors.agent = ['agent 不得为空串；缺省请传 null（表示「人跑的」）']
      } else {
        const why = agentViolation(input.agent)
        if (why) fieldErrors.agent = [why]
        else agent = input.agent
      }
    }

    if (Object.keys(fieldErrors).length > 0) {
      throw new AppError('VALIDATION_ERROR', '请求参数校验失败', { fieldErrors })
    }

    // ⚠️ `input.agent` 在上面对 null/undefined 归一成了 `agent`，这里只读归一后的值——
    // 白名单构造：三键写死，不 spread 入参（spread 会把任意多余键带进 payload）。
    ledger.record(
      {
        kind: 'cli_agent_command_run',
        // 入参契约里没有 projectId（`session log --project` 的项目上下文不在上报面内），
        // 故 projectId 落 null。**不猜、不从 cwd 反推**——FR-5.1.2 把 cwd 列为禁列。
        payload: { command: input.command, exitCode: input.exitCode, agent },
      },
      deps.now(),
    )
  }

  return { recordCommandRun }
}

function isCliCommand(v: string): v is CliCommandRunCommand {
  return (CLI_COMMAND_RUN_COMMANDS as readonly string[]).includes(v)
}
