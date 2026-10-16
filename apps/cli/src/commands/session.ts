import { DEVLOG_TYPES, type DevLogCreateInput, type DevLogOut, type DevLogType } from '@openvibe/shared'
import { ServerUnreachable, type ApiClient } from '../client'

/**
 * M8 · CLI 写面：`openvibe session log`（m8-agent-bridge.md FR-4.1 第三行）。
 *
 * **它写的是服务端 DB，不是本机**（`writesDisk: false`）：一条命令 = 一次 HTTP POST，
 * 本进程不建文件、不写文件、不留任何本地痕迹（m6b 的「注入才落盘」纪律在 agent 侧的同一形状）。
 * 风险档因此是 `decision`——与既有 `scan` 同档同因：改服务端 DB 且无确认闸（FR-4.3.2）。
 *
 * 端点复用既有 `POST /api/projects/:id/devlog`（`routes/devlog.ts:31`），
 * 入参走既有 `DevLogCreateInput`，**不新增一套 CLI 专属的服务端形制**。
 */

/**
 * `--evidence <text>` 只有一个值，而服务端的 `DevLogEvidence` 有 `command` 与 `resultSummary` 两项。
 * 缺口只能由 CLI 补，且补的是**本命令自身**这个固定值——调用方给的那一段进 `resultSummary`。
 */
export const SESSION_LOG_EVIDENCE_COMMAND = 'openvibe session log'

export class SessionLogError extends Error {
  readonly code: string
  readonly details?: unknown
  constructor(code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'SessionLogError'
    this.code = code
    if (details !== undefined) this.details = details
  }
}

export interface SessionLogOptions {
  project: string
  type: string
  title?: string
  body?: string
  evidence?: string
  /** 允许重复给（commander 的累积式选项）；保序去重 */
  related?: string[]
}

export interface SessionLogDeps {
  client?: ApiClient
}

export interface SessionLogOutcome {
  entry: DevLogOut
  warnings: string[]
  hints: string[]
}

/** `--type` 的闭集校验：与 `DEVLOG_TYPES`（既有 `dev_log_entries.type` 的 CHECK）逐字同源 */
export function parseLogType(raw: string): DevLogType {
  const t = raw.trim().toUpperCase()
  const hit = DEVLOG_TYPES.find((x) => x === t)
  if (!hit)
    throw new SessionLogError(
      'BAD_TYPE',
      `日志类型只能是 ${DEVLOG_TYPES.join(' | ')}：${raw}`,
      { types: [...DEVLOG_TYPES], received: raw },
    )
  return hit
}

/** 空串与重复项直接丢：relatedFiles 是「相关文件清单」，塞空串只会污染 Web 的展示 */
export function normalizeRelated(raw: readonly string[] | undefined): string[] {
  const out: string[] = []
  for (const item of raw ?? []) {
    const p = item.trim()
    if (p !== '' && !out.includes(p)) out.push(p)
  }
  return out
}

export function devlogPath(projectId: string): string {
  return `/api/projects/${projectId}/devlog`
}

function unreachable(e: unknown): never {
  const detail = e instanceof Error ? e.message : String(e)
  throw new SessionLogError(
    'SERVER_UNREACHABLE',
    `${detail}。日志回流只经 HTTP 写服务端，本机不落任何文件：先运行 \`openvibe serve\` 起本地服务（或用 --server 指定地址）`,
  )
}

/** `displayNo` 自带 `DEV-`/`CHECK-` 前缀（`DevLogRepo` 的 padEntryNo 口径），别再拼一次类型 */
function headline(entry: DevLogOut): string {
  return `已回流 ${entry.displayNo}${entry.title === '' ? '（无标题）' : ` ${entry.title}`}`
}

export async function sessionLogAction(
  options: SessionLogOptions,
  deps: SessionLogDeps = {},
): Promise<SessionLogOutcome> {
  const project = options.project.trim()
  if (project === '')
    throw new SessionLogError('USAGE', 'openvibe session log 需要 --project <id>（项目 id，不是目录）')
  const type = parseLogType(options.type)
  const client = deps.client
  if (!client) {
    throw new SessionLogError(
      'SERVER_REQUIRED',
      '日志回流要写服务端数据库（entry_no 也由服务端分配），没有离线模式：' +
        '先运行 `openvibe serve`，或用 --server/--token 指定可用的服务端',
    )
  }
  const evidence = options.evidence?.trim()
  const payload: DevLogCreateInput = {
    type,
    title: options.title ?? '',
    body: options.body ?? '',
    relatedFiles: normalizeRelated(options.related),
    ...(evidence ? { evidence: { command: SESSION_LOG_EVIDENCE_COMMAND, resultSummary: evidence } } : {}),
  }
  const warnings: string[] = []
  try {
    const entry = await client.postJson<DevLogOut>(devlogPath(project), payload)
    return {
      entry,
      warnings,
      hints: [headline(entry), `回看全部日志：\`openvibe ask logs --project ${project}\``],
    }
  } catch (e) {
    if (e instanceof ServerUnreachable) unreachable(e)
    throw e
  }
}

export function sessionLines(outcome: SessionLogOutcome): string[] {
  const e = outcome.entry
  return [
    `${headline(e)}（id ${e.id}）`,
    ...(e.relatedFiles.length > 0 ? [`相关文件 ${e.relatedFiles.join(' / ')}`] : []),
  ]
}
