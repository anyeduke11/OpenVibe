import type { ContextField, DiscussOut, ProjectContextOut, TruncationNote } from '@openvibe/shared'
import { ServerUnreachable, type ApiClient } from '../client'
import { resolveProjectByPath } from './status'

/**
 * `openvibe discuss "<问题>"`（v0.2.3 批次 E / AN2，spec `v023-e-ai-assistant.md` FR-2）。
 *
 * 与 ask 的分工（FR-4.1.1 不修订）：ask = 确定性七词，stdout JSON 给外部 agent；
 * discuss = AI 通道，自由文本给人——回答逐段标注来源。本命令只做传输与渲染，
 * 业务全在服务端（薄客户端红线）；问答零写库零写盘。
 */

export class DiscussError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'DiscussError'
    this.code = code
  }
}

export interface DiscussOptions {
  question: string
  /** 项目 id 或本地目录（缺省按 cwd 解析，同 ask） */
  project?: string
  fields?: string[]
  budget?: number
  confirm?: boolean
  remember?: boolean
}

export interface DiscussDeps {
  client?: ApiClient
  cwd?: string
}

export interface DiscussOutcome {
  projectId: string
  question: string
  status: DiscussOut['status']
  provider: string | null
  answer: string
  segments: DiscussOut['segments']
  sources: string[]
  truncated: boolean
  warnings: string[]
  hints: string[]
  /** 状态映射的退出码：0 ok / 2 需要行动（开闸/同意/预算/不可用）/ 1 实现错误 */
  exitCode: 0 | 1 | 2
}

const EXIT_BY_STATUS: Record<DiscussOut['status'], 0 | 1 | 2> = {
  ok: 0,
  error: 1,
  unavailable: 2,
  'consent-required': 2,
  'gate-closed': 2,
  'budget-exhausted': 2,
}

export async function discussAction(
  options: DiscussOptions,
  deps: DiscussDeps = {},
): Promise<DiscussOutcome> {
  const question = options.question.trim()
  if (question === '') {
    throw new DiscussError(
      'EMPTY_QUESTION',
      '问题不能为空：openvibe discuss "<问题>" --project <id|目录>',
    )
  }
  const client = deps.client
  if (!client) {
    throw new DiscussError(
      'SERVER_REQUIRED',
      '问答依赖服务端（上下文组装与推理都在服务端），没有离线模式：先运行 `openvibe serve`，' +
        '或用 --server/--token 指定可用的服务端',
    )
  }
  // 项目解析：id 直用；路径/缺省走 ask 同款反查（resolveProjectByPath 的第一参是 client）
  const projectId = await resolveProjectId(options.project, client, deps.cwd ?? process.cwd())

  let out: DiscussOut
  try {
    out = await client.postJson<DiscussOut>(`/api/projects/${projectId}/discuss`, {
      question,
      ...(options.fields !== undefined ? { fields: options.fields } : {}),
      ...(options.budget !== undefined ? { budget: options.budget } : {}),
      ...(options.confirm !== undefined ? { confirm: options.confirm } : {}),
      ...(options.remember !== undefined ? { remember: options.remember } : {}),
    })
  } catch (e) {
    if (e instanceof ServerUnreachable) {
      throw new DiscussError(
        'SERVER_UNREACHABLE',
        `服务端不可达（${e.detail}）：先运行 openvibe serve`,
      )
    }
    throw e
  }

  const hints: string[] = []
  if (out.status === 'gate-closed')
    hints.push('AI 出网总闸未开：设置页「AI 提取（M10）」区打开总闸')
  if (out.status === 'consent-required')
    hints.push('本项目尚未同意上下文出网：加 --confirm 显式确认（--remember 记住本项目）')
  if (out.status === 'unavailable')
    hints.push('推理服务未配置：设置页「解读服务」区配置端点（与提取共用同一份）')
  if (out.status === 'budget-exhausted') hints.push('今日问答配额用完，明天再来')
  if (out.status === 'ok' && out.truncated) hints.push('上下文超预算已裁剪（见 truncated 段）')

  return {
    projectId,
    question,
    status: out.status,
    provider: out.provider,
    answer: out.answer,
    segments: out.segments,
    sources: out.sources,
    truncated: out.truncated,
    warnings: out.warnings,
    hints,
    exitCode: EXIT_BY_STATUS[out.status],
  }
}

/** 人读输出（--json 下不用）；来源名列表来自服务端 */
export function discussLines(out: DiscussOutcome): string[] {
  const lines: string[] = []
  if (out.status !== 'ok') {
    lines.push(`状态 ${out.status}：${out.warnings.join('；') || '见提示'}`)
    return [...lines, ...out.hints.map((h) => `提示 ${h}`)]
  }
  for (const seg of out.segments) {
    const ref =
      seg.source_ref === null
        ? '（无来源标注）'
        : `<来源:${seg.source_ref} ${out.sources[seg.source_ref] ?? '?'}>`
    lines.push(`${seg.text} ${ref}`)
  }
  for (const w of out.warnings) lines.push(`警告 ${w}`)
  for (const h of out.hints) lines.push(`提示 ${h}`)
  return lines
}

export type { ContextField, ProjectContextOut, TruncationNote }

async function resolveProjectId(
  arg: string | undefined,
  client: ApiClient,
  cwd: string,
): Promise<string> {
  if (arg !== undefined && /^prj_/.test(arg)) return arg
  const { project } = await resolveProjectByPath(client, arg ?? '.', cwd)
  return project.id
}
