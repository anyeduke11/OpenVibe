/**
 * CLI 命令参考元数据（设置页「CLI 命令参考」表 + 未来 CLI 实验室的命令目录）。
 *
 * 归属 shared 的理由是依赖方向：apps/cli 依赖 @openvibe/shared，apps/server 也依赖 shared，
 * 所以这是一条「两侧都够得着、谁都不必依赖谁」的位置。apps/server 由 eslint R4 禁止 import
 * apps/cli（eslint.config.js:127），因此命令真相只能落在这里；apps/cli 侧本轮不改注册表，
 * 漂移由 apps/server/test/cli-commands.api.test.ts 从 apps/cli/src/index.ts 解析已注册名比对。
 *
 * 逐条字段的事实来源（不要凭印象改）：
 * - name / usage / flags：apps/cli/src/index.ts 的 buildProgram() 注册处（行号见各条注释）。
 * - risk / writesDisk：apps/cli/src/commands/*.ts 的真实行为（fs 调用与是否需要人拍板）。
 *
 * 全局旗标 `--server <url>` / `--token <token>` / `--json`（index.ts:446-448）挂在 program 上、
 * 对每条命令都生效，故**不在**各命令的 flags 里重复列出，只在本文件登记一次。
 */

import { ADAPTER_IDS, DEFAULT_PORT, DEVLOG_TYPES, REQUIREMENT_PRIORITIES } from './constants'

/** 风险三档（闭集，勿扩）：
 * - readonly  零写入：只读本地文件/只发 GET，不改任何持久状态
 * - decision  改状态但要人拍板或显式启动：交互确认后才落盘、只改服务端 DB、起监听服务
 * - destructive 删文件或不可逆覆盖本地树
 */
export const CLI_COMMAND_RISKS = ['readonly', 'decision', 'destructive'] as const
export type CliCommandRisk = (typeof CLI_COMMAND_RISKS)[number]

/** 无值旗标的 value 占位（与 commander 的声明写法对齐：布尔旗标不接值） */
export const CLI_FLAG_NO_VALUE = '<none>'

/**
 * 需要在描述里回显取值的旗标，直接插值 shared 的既有常量（ADAPTER_IDS / DEFAULT_PORT），
 * 免得这份快照与注册处各写一份字面量后悄悄漂移。
 * `--strategy` 的取值枚举 INJECT_DECISIONS 在 @openvibe/core，shared 不得依赖 core（R2），
 * 因此该条只写语义不枚举取值。
 */

export interface CliCommandFlag {
  /** 只登记长名；短别名（如 -p）随 usage 省略，避免表格里出现两列同义项 */
  name: string
  /** 取值占位；布尔旗标固定 CLI_FLAG_NO_VALUE */
  value: string
  /** 原文照抄 apps/cli/src/index.ts 的 option 描述 */
  summary: string
}

export interface CliCommandMeta {
  name: string
  /** 与注册处一致（含真实位置参数名：`<projectPath>` 不是 `<project-path>`） */
  usage: string
  summary: string
  flags: CliCommandFlag[]
  risk: CliCommandRisk
  /** 是否写本机磁盘（~/.openvibe 或目标项目树都算；只改服务端 DB 记 false） */
  writesDisk: boolean
}

const flag = (name: string, value: string, summary: string): CliCommandFlag => ({
  name,
  value,
  summary,
})

/**
 * 当前条数已注册命令的快照（apps/cli/src/index.ts 的注册处，顺序与注册处一致）。
 * risk 依据：
 * - serve  = decision     ：mkdirSync 建 ~/.openvibe 三目录 + writeConfigFile 落令牌（serve.ts:89,105），
 *                           起监听服务且 --open 会拉系统浏览器（serve.ts:115-116）；不碰用户项目树、不删任何文件
 * - sync   = decision     ：写目标文件（sync.ts:402）、覆盖前逐字节备份（sync.ts:399）、
 *                           CONFLICT/DRIFT 需交互 select 拍板（sync.ts:327）；全文件无 unlinkSync ⇒ 不算 destructive
 * - scan   = decision     ：零磁盘写（scan.ts:1 只 import 读类 fs），但 POST /api/skills/scan 与
 *                           /api/prompts/import 改服务端 DB（scan.ts:158,193）且无确认闸 ⇒ 归中间档
 * - diff   = readonly     ：只 readFileSync/statSync（diff.ts:1）+ 一次 GET 探测（diff.ts:96），零写入
 * - clean  = destructive  ：unlinkSync 删受管文件与 pack.lock.json（clean.ts:372,395）
 * - ask    = readonly     ：只 GET /api/projects（含 :id/context）。零 POST（埋点那一次除外，见下），
 *                           且三只命令都不 import node:fs，路径解析是纯字符串比较（status.ts:63）
 * - status = readonly     ：同上，只 GET（status.ts:statusAction 只调 getJson）
 * - session= decision     ：POST /api/projects/:id/devlog 改服务端 DB 且无确认闸，与 scan 同档同因
 *                           （FR-4.3.2）。本机零写入：不 import node:fs、不建文件
 * - requirement=decision  ：POST /api/agent/ingest 改服务端 DB（agent_ingests 一条 pending 行）且 CLI 侧
 *                           无确认闸，与 session/scan 同档同因（FR-4.3.2）。本机零写入：不 import node:fs、
 *                           不建文件；只 import node:crypto 算幂等键（requirement.ts）
 *
 * ⚠️ `ask` / `status` / `session` / `requirement` 结束时各 POST 一次 `/api/agent/command-run`
 * 埋点（FR-5.1.1 的 `cli_agent_command_run`）。它只写台账、不改项目状态、失败静默收敛，
 * 故不改变本表的 risk 判定；实现见 `commands/status.ts:reportCommandRun`。
 *
 * ⚠️ `requirement` 是 2026-10-16 由 owner 拍板扩进埋点闭集的（B 级改契约授权）。
 * 此前服务端 `commandRunService.CLI_COMMAND_RUN_COMMANDS` 只有 `ask|status|session` 三值，
 * CLI 侧因此如实输出 `{sent:false, reason:'unreported'}`，**没有拿 `session` 顶替** ——
 * 顶替会让台账里出现与真实执行不符的记录。扩闭集后四只命令的埋点形状已完全一致。
 */
export const CLI_COMMANDS: readonly CliCommandMeta[] = [
  {
    name: 'serve',
    usage: 'openvibe serve [flags]',
    summary: '启动本地服务（API + Web UI），首启生成配置与令牌',
    flags: [
      flag('--port', '<port>', `监听端口（默认 ${DEFAULT_PORT}）`),
      flag('--open', CLI_FLAG_NO_VALUE, '启动后自动打开系统浏览器'),
    ],
    risk: 'decision',
    writesDisk: true,
  },
  {
    name: 'sync',
    usage: 'openvibe sync <projectPath> [flags]',
    summary: '把标准包注入项目（三重保护：默认预览+确认，覆盖前自动备份）',
    flags: [
      flag('--pack', '<name[@version]>', '服务端标准包（缺省取该项目登记的包）'),
      flag('--file', '<bundle>', '离线注入：单个 bundle JSON 文件'),
      flag('--dir', '<packDir>', '离线注入：目录导出（openvibe.pack.json + files/）'),
      flag('--dry-run', CLI_FLAG_NO_VALUE, '只打印计划表，零写入零备份'),
      flag('--yes', CLI_FLAG_NO_VALUE, '跳过交互确认（配合 --strategy 批量处置冲突）'),
      flag('--strategy', '<strategy>', 'CONFLICT/DRIFT 批量处置（取值见 core 的 INJECT_DECISIONS）'),
      flag('--target', '<adapter>', `只写入指定平台产物（可重复）：${ADAPTER_IDS.join(' / ')}`),
    ],
    risk: 'decision',
    writesDisk: true,
  },
  {
    name: 'scan',
    usage: 'openvibe scan (--skills | --project <path>) [flags]',
    summary: '扫描 skill 目录 / 项目规则文件并登记进服务端（无离线模式）',
    flags: [
      flag('--skills', CLI_FLAG_NO_VALUE, '调服务端 skill 扫描（默认扫描标准 skill 目录）'),
      flag('--roots', '<dir>', 'skill 扫描根目录（可重复，或用逗号分隔）'),
      flag(
        '--project',
        '<path>',
        '探测并导入项目规则文件（.cursorrules / .cursor/rules/*.mdc / CLAUDE.md / AGENTS.md）',
      ),
    ],
    risk: 'decision',
    writesDisk: false,
  },
  {
    name: 'diff',
    usage: 'openvibe diff <projectPath> [flags]',
    summary: '比对项目产物与 pack.lock.json，并探测是否有更新的导出版本',
    flags: [],
    risk: 'readonly',
    writesDisk: false,
  },
  {
    name: 'verify',
    usage: 'openvibe verify <projectPath> [flags]',
    summary:
      '三方一致性核验：包版本 / lock / 磁盘（只读，输出 CONSISTENT / PARTIAL / ORPHAN / DISK_DRIFT / STALE_LOCK / UNMANAGED 之一）',
    flags: [],
    risk: 'readonly',
    writesDisk: false,
  },
  {
    name: 'discuss',
    usage: 'openvibe discuss <question> [flags]',
    summary: '向 AI 问本项目的问题（回答逐段标注来源：每段都可追溯到项目的真实数据）',
    flags: [
      flag('--project', '<id|dir>', '目标项目（id 或本地目录；缺省按当前目录解析）'),
      flag('--fields', '<list>', '只要这些上下文段（逗号分隔）'),
      flag('--budget', '<n>', '上下文字符预算上限'),
      flag('--confirm', CLI_FLAG_NO_VALUE, '显式同意本次上下文出网（首次必带）'),
      flag('--remember', CLI_FLAG_NO_VALUE, '记住本项目同意（配合 --confirm）'),
    ],
    risk: 'decision',
    writesDisk: false,
  },
  {
    name: 'mcp',
    usage: 'openvibe mcp [flags]',
    summary: '以 stdio 形态运行 MCP 服务（AI IDE 的只读上下文工具面：project_context / search_assets / pack_diff）',
    flags: [],
    risk: 'readonly',
    writesDisk: false,
  },
  {
    name: 'clean',
    usage: 'openvibe clean <projectPath> [flags]',
    summary: '退场：删除当前 lock 登记且未被改动的受管文件（删除前一律备份）',
    flags: [
      flag('--dry-run', CLI_FLAG_NO_VALUE, '只打印三态计划表，零写入零删除'),
      flag('--yes', CLI_FLAG_NO_VALUE, '确认默认动作（不升级为全删：要连改过的文件一起删得给 --force）'),
      flag('--force', CLI_FLAG_NO_VALUE, '连 DRIFT（用户注入后改过）的文件一并删除，改后内容先进备份目录'),
    ],
    risk: 'destructive',
    writesDisk: true,
  },
  {
    name: 'ask',
    usage: 'openvibe ask <question> [flags]',
    summary: '按闭集关键词问项目上下文（只读服务端，不接 LLM）',
    flags: [flag('--project', '<id>', '目标项目 id（缺省按当前工作目录解析）')],
    risk: 'readonly',
    writesDisk: false,
  },
  {
    name: 'status',
    usage: 'openvibe status [dir] [flags]',
    summary: '单项目进度快照：阶段/完成度/未完检查项/任务/最近日志/包漂移（只读）',
    flags: [],
    risk: 'readonly',
    writesDisk: false,
  },
  {
    name: 'requirement',
    usage: 'openvibe requirement add --project <id> --title <text> [flags]',
    summary: 'agent 侧需求动作（当前只有 add：把一条需求送进服务端待确认队列）',
    flags: [
      flag('--project', '<id>', '目标项目 id'),
      flag('--title', '<text>', '需求标题（必填，不得只有空白）'),
      flag('--detail', '<text>', '补充说明（缺省空串）'),
      flag('--priority', '<P0|P1|P2>', `优先级：${REQUIREMENT_PRIORITIES.join(' | ')}（缺省 P2）`),
    ],
    risk: 'decision',
    writesDisk: false,
  },
  {
    name: 'session',
    usage: 'openvibe session log --project <id> --type <DEV|CHECK> [flags]',
    summary: 'agent 会话侧动作（当前只有 log：把一条开发日志回流到服务端）',
    flags: [
      flag('--project', '<id>', '目标项目 id'),
      flag('--type', '<DEV|CHECK>', `日志类型：${DEVLOG_TYPES.join(' | ')}`),
      flag('--title', '<text>', '标题（缺省空串）'),
      flag('--body', '<text>', '正文（缺省空串）'),
      flag('--evidence', '<text>', '证据摘要（落到 DevLogEvidence.resultSummary）'),
      flag('--related', '<path>', '相关文件（可重复，保序去重）'),
    ],
    risk: 'decision',
    writesDisk: false,
  },
] as const

/** 命令名 → 元数据（同名重复即数据错误，构造期就该炸） */
export function cliCommandByName(name: string): CliCommandMeta | undefined {
  return CLI_COMMANDS.find((c) => c.name === name)
}
