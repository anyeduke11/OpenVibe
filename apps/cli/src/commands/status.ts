import { resolve, sep } from 'node:path'
import {
  compareCodeUnit,
  type ContextField,
  type ProjectContextOut,
  type ProjectOut,
  type TruncationNote,
} from '@openvibe/shared'
import { ServerUnreachable, type ApiClient } from '../client'
import { ExitCode, type ExitCodeValue } from '../output'

/**
 * M8 · CLI 只读面之二：`openvibe status`（m8-agent-bridge.md FR-4.1 第二行）。
 *
 * **本文件同时是三只 M8 新命令的共用件落点**（ask.ts / session.ts 只 import 这里，
 * 不反向 import，故三文件之间无环）：
 * - `resolveProjectByPath` —— 把「一个目录」解析成「一个已登记项目」。`status [<dir>]` 的
 *   缺省是 cwd，`ask` 缺省 `--project` 时也要走它（FR-4.1.2）。
 * - `reportCommandRun` —— FR-5.1.1 那条 `cli_agent_command_run` 埋点的唯一出口。
 *
 * 两处共用件都**只经 HTTP**（FR-4.4 红线）：CLI 侧从不 import DB 驱动，也从不读本地项目树
 * ——路径解析是纯字符串比较，比较对象是服务端 `GET /api/projects` 回传的 `localPath`。
 */

export class StatusError extends Error {
  readonly code: string
  readonly details?: unknown
  constructor(code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'StatusError'
    this.code = code
    if (details !== undefined) this.details = details
  }
}

/** `?status=all`：含归档项目。少写这个参数会让「目录只绑在已归档项目上」的用户查不到自己 */
export const PROJECTS_PATH = '/api/projects?status=all'

/** status 快照要的五段。assets 不在其中：那是 `openvibe ask assets` 的活儿，不混进进度快照 */
export const STATUS_FIELDS: readonly ContextField[] = [
  'stage',
  'checklist',
  'tasks',
  'logs',
  'pack',
]

/** 人读最近日志的条数上限。裁剪**必须留痕**（下方 truncated.note），不能静默少给 */
export const RECENT_LOGS = 5

/** FR-4.1.2 的候选名上限：提示是给人指路，不是把整个项目库倒出来 */
export const MAX_CANDIDATES = 5

type ProjectListItem = ProjectOut

/** 去掉结尾分隔符（`/a/b/` 与 `/a/b` 是同一个目录）；根目录 `/` 保留自身 */
function trimTrailingSep(p: string): string {
  const out = p.replace(/[\\/]+$/, '')
  return out === '' ? p : out
}

/** `/a/b` 命中 `/a/b` 与 `/a/b/…`；`/a/bb` **不**命中 `/a/b`（前缀比较要带分隔符） */
function covers(root: string, target: string): boolean {
  return target === root || target.startsWith(root.endsWith(sep) ? root : root + sep)
}

/**
 * 目录 → 项目。**最长前缀优先**：父子两个项目都登记了路径时，取更深的那个
 * （`/w/子项目` 优先于 `/w`），否则在子目录里跑 `openvibe status` 会拿到父项目的进度。
 *
 * 与 `pack-source.ts:283` 的 `findRegisteredPack` 的差别：那处是**精确匹配**（sync 只能对
 * 项目根目录操作）；本处允许目录落在项目内，因为 status 的缺省参数就是 cwd。
 */
export function matchProjectByPath(
  items: readonly ProjectListItem[],
  absDir: string,
): ProjectListItem | null {
  let best: ProjectListItem | null = null
  let bestLen = -1
  for (const p of items) {
    if (!p.localPath) continue
    const root = trimTrailingSep(resolve(p.localPath))
    if (!covers(root, absDir)) continue
    if (root.length <= bestLen) continue
    best = p
    bestLen = root.length
  }
  return best
}

/** 候选项目名：按码点序取前 N 条 ⇒ 同一份项目列表永远给出同一组提示 */
export function candidateNames(
  items: readonly ProjectListItem[],
  limit: number = MAX_CANDIDATES,
): string[] {
  return [...new Set(items.map((p) => p.name))].sort(compareCodeUnit).slice(0, limit)
}

export interface ResolvedProject {
  id: string
  name: string
  localPath: string
}

/**
 * 解析不出已登记项目 ⇒ 既有 `NOT_FOUND` + 候选项目名（FR-4.1.2）。
 * 候选放在 message 里（人读与 --json 都看得到），details 另存一份给程序读。
 */
export async function resolveProjectByPath(
  client: ApiClient,
  dir: string,
  cwd: string = process.cwd(),
): Promise<{ project: ResolvedProject; absDir: string }> {
  const list = await client.getJson<{ items: ProjectListItem[] }>(PROJECTS_PATH)
  const absDir = trimTrailingSep(resolve(cwd, dir))
  const project = matchProjectByPath(list.items, absDir)
  if (!project) {
    const candidates = candidateNames(list.items)
    throw new StatusError(
      'NOT_FOUND',
      `未找到与该路径匹配的项目：${absDir}。已登记项目（最多 ${String(MAX_CANDIDATES)} 条）：${
        candidates.join(' / ') || '(无)'
      }。用 \`openvibe ask --project <id>\` 或先在 Web 工作台绑定本机路径`,
      { path: absDir, candidates },
    )
  }
  return {
    project: {
      id: project.id,
      name: project.name,
      localPath: trimTrailingSep(resolve(project.localPath ?? '')),
    },
    absDir,
  }
}

function contextPath(projectId: string, fields: readonly ContextField[]): string {
  return `/api/projects/${projectId}/context?fields=${fields.join(',')}`
}

function unreachable(e: unknown): never {
  const detail = e instanceof Error ? e.message : String(e)
  throw new StatusError(
    'SERVER_UNREACHABLE',
    `${detail}。进度快照只在服务端组装（CLI 不读本地 DB），先运行 \`openvibe serve\` 起本地服务（或用 --server 指定地址）`,
  )
}

export interface StatusOptions {
  /** 缺省即当前工作目录（FR-4.1.2） */
  dir?: string
}

export interface StatusDeps {
  client?: ApiClient
  cwd?: string
}

export interface StatusSnapshot {
  project: { id: string; name: string; status: string; localPath: string }
  stage: ProjectContextOut['stage']
  checklist: {
    stageName: string | null
    total: number
    checked: number
    /** 未完检查项：进度快照的主体，勾掉的项在这里不出现 */
    pending: { id: string; label: string }[]
  }
  tasks: { todo: number; doing: number; done: number }
  logs: { total: number; shown: number; recent: ProjectContextOut['logs']['items'] }
  pack: ProjectContextOut['pack']
  truncated: TruncationNote[]
}

export interface StatusOutcome {
  snapshot: StatusSnapshot
  /**
   * 三值退出码（`output.ts:9`）：包有漂移 ⇒ `drift(2)`，其余 `ok(0)`。
   *
   * **为什么 status 也要退 2**：m8 spec §7-p 要求三档都可断言，而漂移在本仓唯一的语义就是
   * 「项目树与 pack.lock.json 不一致」——既有 `diff`（drift.ts）/`clean` 已按此退 2。
   * `status` 的快照里本来就有 `pack.drifted`，判据齐了却恒退 0，脚本就没法用退出码判漂移。
   * ❗`drifted === null`（读不到 lock）**不算**漂移：那不是「已漂移」，是「判不了」（FR-3.2.1）。
   */
  exitCode: ExitCodeValue
  warnings: string[]
  hints: string[]
}

/** CLI 自己的裁剪也走 `truncated`：与 FR-3.4 同一条纪律，静默少给比报错更坏 */
function recentLogs(
  ctx: ProjectContextOut,
  projectId: string,
): { logs: StatusSnapshot['logs']; note: TruncationNote | null } {
  const all = ctx.logs.items
  const recent = all.slice(0, RECENT_LOGS)
  const note: TruncationNote | null =
    all.length > recent.length
      ? {
          section: 'logs',
          dropped: all.length - recent.length,
          reason: 'budget',
          detail: `CLI 只展示最近 ${String(RECENT_LOGS)} 条（共 ${String(all.length)} 条）；完整清单用 \`openvibe ask logs --project ${projectId}\``,
        }
      : null
  return { logs: { total: all.length, shown: recent.length, recent }, note }
}

export function buildStatusSnapshot(
  project: ResolvedProject,
  ctx: ProjectContextOut,
): StatusSnapshot {
  const items = ctx.checklist.items
  const pending = items.filter((i) => !i.checked).map((i) => ({ id: i.id, label: i.label }))
  const { logs, note } = recentLogs(ctx, project.id)
  return {
    project: {
      id: project.id,
      name: project.name,
      status: ctx.project.status,
      localPath: project.localPath,
    },
    stage: ctx.stage,
    checklist: {
      stageName: ctx.checklist.stageName,
      total: items.length,
      checked: items.length - pending.length,
      pending,
    },
    tasks: { todo: ctx.tasks.todo, doing: ctx.tasks.doing, done: ctx.tasks.done },
    logs,
    pack: ctx.pack,
    truncated: note ? [...ctx.truncated, note] : [...ctx.truncated],
  }
}

/** 人读行。pack 段的三种态分别给不同的**可执行**下一步，`null` ≠ `false` 不许混 */
export function statusLines(snapshot: StatusSnapshot): string[] {
  const lines = [
    `项目 ${snapshot.project.name}（${snapshot.project.id}）· ${snapshot.project.status}`,
    `阶段 ${snapshot.stage.current ?? '(未开始)'}（第 ${String(snapshot.stage.completed)}/${String(snapshot.stage.total)} 阶段）`,
    `检查项 ${String(snapshot.checklist.checked)}/${String(snapshot.checklist.total)} 已勾，未完 ${String(snapshot.checklist.pending.length)}`,
  ]
  for (const item of snapshot.checklist.pending) lines.push(`  未完 ${item.label}`)
  lines.push(
    `任务 待办 ${String(snapshot.tasks.todo)} 进行中 ${String(snapshot.tasks.doing)} 已完成 ${String(snapshot.tasks.done)}`,
  )
  lines.push(
    `最近日志 ${String(snapshot.logs.shown)}/${String(snapshot.logs.total)} 条` +
      (snapshot.logs.shown < snapshot.logs.total ? '（更早的用 `openvibe ask logs` 看全量）' : ''),
  )
  for (const l of snapshot.logs.recent)
    lines.push(`  ${l.type}-${String(l.entryNo).padStart(4, '0')} ${l.title}`)
  const pack = snapshot.pack
  if (pack.drifted === null && pack.outdated === null) {
    lines.push('包 未绑定或读不到 pack.lock.json ⇒ 漂移态不可判定（**不是「没漂移」**）')
  } else {
    lines.push(`包 ${pack.name ?? '(未登记)'}@${pack.version ?? '?'}`)
    if (pack.drifted === true) lines.push('  已漂移：跑 `openvibe diff <dir>` 看逐文件明细')
    if (pack.outdated === true)
      lines.push('  服务端有更新版本：跑 `openvibe diff <dir>` 看建议命令')
  }
  // 裁剪留痕**不**在这里再打一遍：printer.warn 已经把它送给人读了（--json 下折进
  // summary.warnings），而 summary.truncated 里还有一份给机器读。同一件事打两次只是噪声。
  return lines
}

export function statusHints(snapshot: StatusSnapshot): string[] {
  const hints: string[] = []
  if (snapshot.checklist.pending.length > 0)
    hints.push(
      `下一步：先清 ${String(snapshot.checklist.pending.length)} 项未完检查项（\`openvibe ask checklist --project ${snapshot.project.id}\`）`,
    )
  if (snapshot.pack.drifted === true || snapshot.pack.outdated === true)
    hints.push(`包状态异常：\`openvibe diff ${snapshot.project.localPath}\``)
  if (snapshot.truncated.length > 0)
    hints.push('本次上下文被裁剪过，截断项见 summary.truncated（不是「不存在」）')
  return hints
}

export async function statusAction(
  options: StatusOptions,
  deps: StatusDeps = {},
): Promise<StatusOutcome> {
  const client = deps.client
  if (!client) {
    throw new StatusError(
      'SERVER_REQUIRED',
      '进度快照依赖服务端（项目登记、任务、日志、锁文件都只在服务端可读），没有离线模式：' +
        '先运行 `openvibe serve`，或用 --server/--token 指定可用的服务端',
    )
  }
  const warnings: string[] = []
  try {
    const { project } = await resolveProjectByPath(client, options.dir ?? '.', deps.cwd)
    const ctx = await client.getJson<ProjectContextOut>(contextPath(project.id, STATUS_FIELDS))
    const snapshot = buildStatusSnapshot(project, ctx)
    for (const t of snapshot.truncated)
      warnings.push(`上下文裁剪 ${t.section}（${t.reason}）：${t.detail}`)
    return {
      snapshot,
      exitCode: snapshot.pack.drifted === true ? ExitCode.drift : ExitCode.ok,
      warnings,
      hints: statusHints(snapshot),
    }
  } catch (e) {
    if (e instanceof ServerUnreachable) unreachable(e)
    throw e
  }
}

// ---------------------------------------------------------------------------
// FR-5.1.1 的 `cli_agent_command_run` 埋点：每条命令结束时 POST 一次。
// ---------------------------------------------------------------------------

export const COMMAND_RUN_PATH = '/api/agent/command-run'

/** FR-5.1.1 的 `command` 枚举：闭集四值，与服务端 `CLI_COMMAND_RUN_COMMANDS` 逐字对齐 */
export type CommandRunName = 'ask' | 'status' | 'session' | 'requirement'

export type CommandRunReason = 'sent' | 'offline' | 'error'

export interface CommandRunReport {
  sent: boolean
  reason: CommandRunReason
  /** 失败原话（URL / 状态码），只在未发出或失败时存在 */
  detail?: string
}

/** agent 名的上限：超长就截断，避免有人把整段路径塞进环境变量后随埋点落进台账（FR-5.1.2 禁列） */
export const AGENT_NAME_MAX = 64

export function agentName(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = (env.OPENVIBE_AGENT ?? '').trim()
  if (raw === '') return null
  return raw.slice(0, AGENT_NAME_MAX)
}

/**
 * 上报出口。**任何失败都收敛成 reason，不抛**：埋点永远不该让一条已经成功的命令变成失败，
 * 也不该往 stderr 打噪声（遥测那套同型纪律，`telemetry.ts:8`）。无客户端（离线）时连请求都不发。
 */
export async function reportCommandRun(
  client: ApiClient | undefined,
  command: CommandRunName,
  exitCode: number,
  agent: string | null,
): Promise<CommandRunReport> {
  if (!client) return { sent: false, reason: 'offline' }
  try {
    await client.postJson(COMMAND_RUN_PATH, { command, exitCode, agent })
    return { sent: true, reason: 'sent' }
  } catch (e) {
    return { sent: false, reason: 'error', detail: e instanceof Error ? e.message : String(e) }
  }
}
