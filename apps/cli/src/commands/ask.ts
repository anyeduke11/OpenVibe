import { type ContextField, type ProjectContextOut, type TruncationNote } from '@openvibe/shared'
import { ServerUnreachable, type ApiClient } from '../client'
import { resolveProjectByPath } from './status'

/**
 * M8 · CLI 只读面之一：`openvibe ask <question>`（m8-agent-bridge.md FR-4.1 第一行）。
 *
 * **不接 LLM（FR-4.1.1）**：问题词是七项闭集关键词，自由文本一律拒。
 * 理由写在这里而不是注释里：agent 要的是**确定性输出**，本地模型既随机又要联网，
 * 那让「解析 stdout 里的 JSON」这件事失去前提。
 *
 * 七个关键词各自只取 `GET /api/projects/:id/context` 的**一段**（`?fields=`），
 * 服务端没被要的段根本不组装——上下文体积敏感，这是消费端就该做的裁剪。
 */

/** FR-4.1.1 的问题词闭集。顺序即报错文案与文档里的展示顺序 */
export const ASK_KEYWORDS = ['status', 'next', 'checklist', 'assets', 'terms', 'playbook', 'logs'] as const
export type AskKeyword = (typeof ASK_KEYWORDS)[number]

/**
 * 关键词 → context 的哪一段。
 *
 * ⚠️ `terms` / `playbook` 只能取到 `assets` 段里的**计数**（该端点没有术语/玩法条目列表，
 * 见 `context.ts:103` 的 ContextAssets）——这不是取错片，是这个面本来就没有那一段。
 * 要条目得走 Web 资产库或 `GET /api/terms`。
 */
export const ASK_FIELDS: Record<AskKeyword, readonly ContextField[]> = {
  status: ['stage'],
  next: ['checklist', 'tasks'],
  checklist: ['checklist'],
  assets: ['assets'],
  terms: ['assets'],
  playbook: ['assets'],
  logs: ['logs'],
}

export class AskError extends Error {
  readonly code: string
  readonly details?: unknown
  constructor(code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'AskError'
    this.code = code
    if (details !== undefined) this.details = details
  }
}

/** 闭集判定：trim + 小写后必须逐字命中（大小写不敏感是有意的，`STATUS` 是人写的，不是自由文本） */
export function parseQuestion(raw: string): AskKeyword {
  const q = raw.trim().toLowerCase()
  const hit = (ASK_KEYWORDS as readonly string[]).find((k) => k === q)
  if (!hit) {
    throw new AskError(
      'UNKNOWN_QUERY',
      `问题词只能是闭集关键词（不接 LLM、不接受自由文本）：${ASK_KEYWORDS.join(' | ')}；收到：${raw}`,
      { keywords: [...ASK_KEYWORDS], received: raw },
    )
  }
  return hit as AskKeyword
}

export interface AskOptions {
  question: string
  /** 缺省取当前工作目录匹配到的项目（FR-4.1 的 `[--project <id>]`） */
  project?: string
}

export interface AskDeps {
  client?: ApiClient
  cwd?: string
}

export interface AskOutcome {
  question: AskKeyword
  projectId: string
  projectName: string
  /** 本次向服务端要的那几段，回显给调用方确认 `?fields=` 生效 */
  fields: readonly ContextField[]
  answer: Record<string, unknown>
  truncated: TruncationNote[]
  warnings: string[]
  hints: string[]
}

/** 答案塑形。每一支只读自己被允许的那段，缺段一律报错而不是造零（假零禁止） */
export function answerOf(keyword: AskKeyword, ctx: ProjectContextOut): Record<string, unknown> {
  switch (keyword) {
    case 'status':
      return {
        stage: { current: ctx.stage.current, total: ctx.stage.total, completed: ctx.stage.completed },
        projectStatus: ctx.project.status,
      }
    case 'next': {
      const pending = ctx.checklist.items.filter((i) => !i.checked).map((i) => ({ id: i.id, label: i.label }))
      const tasks = ctx.tasks.items.filter((t) => t.status !== 'done')
      return {
        pendingChecklist: pending,
        taskCounts: { todo: ctx.tasks.todo, doing: ctx.tasks.doing, done: ctx.tasks.done },
        openTasks: tasks.map((t) => ({ id: t.id, title: t.title, status: t.status })),
      }
    }
    case 'checklist': {
      const items = ctx.checklist.items
      const pending = items.filter((i) => !i.checked).map((i) => ({ id: i.id, label: i.label }))
      return {
        checklist: {
          stageName: ctx.checklist.stageName,
          total: items.length,
          checked: items.length - pending.length,
          pending,
        },
      }
    }
    case 'assets':
      return { assets: ctx.assets }
    case 'terms':
      return { terms: { count: ctx.assets.terms } }
    case 'playbook':
      return { playbook: { count: ctx.assets.playbooks } }
    case 'logs':
      return {
        logs: {
          total: ctx.logs.items.length,
          items: ctx.logs.items.map((l) => ({
            id: l.id,
            type: l.type,
            entryNo: l.entryNo,
            title: l.title,
            createdAt: l.createdAt,
          })),
        },
      }
  }
}

/** 人读行。与 answerOf 同源：两处各写一套就会漂 */
export function askLines(outcome: AskOutcome): string[] {
  const head = `项目 ${outcome.projectName}（${outcome.projectId}）· 问题 ${outcome.question}`
  const lines = [head]
  const a = outcome.answer
  switch (outcome.question) {
    case 'status': {
      const s = a.stage as { current: string | null; total: number; completed: number }
      lines.push(`阶段 ${s.current ?? '(未开始)'}（第 ${s.completed}/${s.total} 阶段）· 项目状态 ${a.projectStatus as string}`)
      break
    }
    case 'next': {
      const pending = a.pendingChecklist as { label: string }[]
      const counts = a.taskCounts as { todo: number; doing: number; done: number }
      lines.push(`未完检查项 ${pending.length}：${pending.map((i) => i.label).join('、') || '(无)'}`)
      lines.push(`未完任务 待办 ${counts.todo} 进行中 ${counts.doing}（已完成 ${counts.done}）`)
      for (const t of a.openTasks as { title: string; status: string }[])
        lines.push(`  ${t.status} ${t.title}`)
      break
    }
    case 'checklist': {
      const c = a.checklist as { stageName: string | null; total: number; checked: number; pending: { label: string }[] }
      lines.push(`阶段 ${c.stageName ?? '(无)'}：${c.checked}/${c.total} 已勾`)
      for (const i of c.pending) lines.push(`  未完 ${i.label}`)
      break
    }
    case 'assets': {
      const as = a.assets as { prompts: number; skills: number; terms: number; playbooks: number }
      lines.push(`资产 提示词 ${as.prompts} 技能 ${as.skills} 术语 ${as.terms} 玩法 ${as.playbooks}`)
      break
    }
    case 'terms':
      lines.push(`术语 ${(a.terms as { count: number }).count} 条（该端点只给计数，条目在 Web 资产库）`)
      break
    case 'playbook':
      lines.push(`玩法 ${(a.playbook as { count: number }).count} 条（同上，只给计数）`)
      break
    case 'logs': {
      const l = a.logs as { total: number; items: { type: string; entryNo: number; title: string }[] }
      lines.push(`日志 ${l.total} 条：`)
      for (const i of l.items) lines.push(`  ${i.type}-${String(i.entryNo).padStart(4, '0')} ${i.title}`)
      break
    }
  }
  for (const t of outcome.truncated) lines.push(`已裁剪 ${t.section}（${t.reason}）：${t.detail}`)
  return lines
}

export function askHints(outcome: AskOutcome): string[] {
  const hints: string[] = []
  if (outcome.truncated.length > 0)
    hints.push('本次上下文被裁剪过，截断项见 summary.truncated（不是「不存在」）')
  if (outcome.question === 'next') hints.push('清完未完检查项后再问一次，进度以服务端为准')
  return hints
}

function unreachable(e: unknown): never {
  const detail = e instanceof Error ? e.message : String(e)
  throw new AskError(
    'SERVER_UNREACHABLE',
    `${detail}。上下文只在服务端组装（CLI 不读本地 DB），先运行 \`openvibe serve\` 起本地服务（或用 --server 指定地址）`,
  )
}

export async function askAction(options: AskOptions, deps: AskDeps = {}): Promise<AskOutcome> {
  const keyword = parseQuestion(options.question)
  const client = deps.client
  if (!client) {
    throw new AskError(
      'SERVER_REQUIRED',
      '问答依赖服务端上下文（阶段/任务/日志/资产计数都只在服务端可读），没有离线模式：' +
        '先运行 `openvibe serve`，或用 --server/--token 指定可用的服务端',
    )
  }
  const fields = ASK_FIELDS[keyword]
  const warnings: string[] = []
  try {
    let projectId: string
    if (options.project !== undefined) {
      projectId = options.project.trim()
      if (projectId === '') throw new AskError('USAGE', '--project 给了空串：请给项目 id，或省略以按当前目录解析')
    } else {
      const resolved = await resolveProjectByPath(client, '.', deps.cwd)
      projectId = resolved.project.id
    }
    const ctx = await client.getJson<ProjectContextOut>(
      `/api/projects/${projectId}/context?fields=${fields.join(',')}`,
    )
    for (const t of ctx.truncated)
      warnings.push(`上下文裁剪 ${t.section}（${t.reason}）：${t.detail}`)
    const outcome: AskOutcome = {
      question: keyword,
      projectId,
      projectName: ctx.project.name,
      fields,
      answer: answerOf(keyword, ctx),
      truncated: ctx.truncated,
      warnings,
      hints: [],
    }
    outcome.hints = askHints(outcome)
    return outcome
  } catch (e) {
    if (e instanceof ServerUnreachable) unreachable(e)
    throw e
  }
}
