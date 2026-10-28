import { z } from 'zod'

/**
 * `GET /api/projects/:id/context` 的出参契约（m8-agent-bridge.md FR-3.2）。
 *
 * **只读**：该面只有 GET。任何 agent 侧写操作必须走 `POST /api/agent/ingest`
 * 单一写面（FR-3.1）——写面单一才可审计。
 *
 * **`truncated` 不是可选字段，是本契约的重点**：agent 会把「被砍掉的检查项」
 * 当成「不存在」，那比报错更坏（FR-3.4）。所以每次裁剪都必须留痕，
 * 且**禁止静默截断**。
 */

export const CONTEXT_FIELDS = ['stage', 'checklist', 'tasks', 'logs', 'pack', 'assets'] as const
export type ContextField = (typeof CONTEXT_FIELDS)[number]

/** FR-3.4 的裁剪顺序写死在规格里，因为**它决定 agent 看到什么** */
export const CONTEXT_TRUNCATION_ORDER = ['logs', 'assets', 'checklist'] as const
export type ContextSection = (typeof CONTEXT_TRUNCATION_ORDER)[number] | 'pack'

export const TruncatedReason = z.enum([
  /** 预算不够，先砍 logs 条数 */
  'budget',
  /** 读不到 pack.lock.json ⇒ drift 判不了。承 m6b「假零禁止」 */
  'no_lock_file',
])
export type TruncatedReason = z.infer<typeof TruncatedReason>

export const TruncationNote = z.object({
  section: z.enum([...CONTEXT_TRUNCATION_ORDER, 'pack']),
  /** 丢了多少条（列表段）或多少项（清单段） */
  dropped: z.number().int().min(0),
  reason: TruncatedReason,
  /** 人读的说明，直接可展示 */
  detail: z.string(),
})
export type TruncationNote = z.infer<typeof TruncationNote>

/** 阶段进度 */
export const ContextStage = z.object({
  current: z.string().nullable(),
  total: z.number().int().min(0),
  completed: z.number().int().min(0),
})

/** 检查项：只有 id / label / checked，**不含任何自由文本字段** */
export const ContextChecklist = z.object({
  stageName: z.string().nullable(),
  items: z.array(z.object({ id: z.string(), label: z.string(), checked: z.boolean() })),
})

export const ContextTasks = z.object({
  todo: z.number().int().min(0),
  doing: z.number().int().min(0),
  done: z.number().int().min(0),
  items: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      status: z.enum(['todo', 'doing', 'done']),
      stageName: z.string().nullable(),
    }),
  ),
})

/**
 * 日志段：**刻意不含 `body`**（FR-3.2.2）。
 * 本端点的消费者是 agent、上下文体积敏感；正文由单独的日志查询取。
 */
export const ContextLogs = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      type: z.enum(['DEV', 'CHECK']),
      entryNo: z.number().int(),
      title: z.string(),
      evidence: z.unknown().nullable(),
      createdAt: z.string(),
    }),
  ),
})

/**
 * pack 段：`drifted` / `outdated` **只在能读 lock 时为真值**，读不到为 `null`
 * 且必须在 `truncated` 里说明（FR-3.2.1，假零禁止）。
 */
export const ContextPack = z.object({
  id: z.string().nullable(),
  name: z.string().nullable(),
  version: z.string().nullable(),
  drifted: z.boolean().nullable(),
  outdated: z.boolean().nullable(),
})

/** 资产计数，各段可空（未注入标准包时为 0 而不是 null —— 0 是真事实） */
export const ContextAssets = z.object({
  prompts: z.number().int().min(0),
  skills: z.number().int().min(0),
  terms: z.number().int().min(0),
  playbooks: z.number().int().min(0),
})

export const ProjectContextOut = z.object({
  project: z.object({
    id: z.string(),
    name: z.string(),
    status: z.string(),
    currentStage: z.string().nullable(),
    flowTemplateId: z.string().nullable(),
    updatedAt: z.string(),
  }),
  stage: ContextStage,
  checklist: ContextChecklist,
  tasks: ContextTasks,
  logs: ContextLogs,
  pack: ContextPack,
  assets: ContextAssets,
  /** 永远存在（可为数组）—— 调用方不必判 undefined */
  truncated: z.array(TruncationNote),
  /** 本次实际返回的字段，便于调用方确认 `?fields=` 生效 */
  fields: z.array(z.enum(CONTEXT_FIELDS)),
})
export type ProjectContextOut = z.infer<typeof ProjectContextOut>

/** `?fields=` 的解析结果；非法值抛 VALIDATION_ERROR 并**列出合法值**，不静默忽略（FR-3.3） */
export function parseContextFields(raw: string | undefined): ContextField[] {
  if (raw === undefined) return [...CONTEXT_FIELDS]
  const trimmed = raw.trim()
  // 空串是**非法**而不是「全选」：调用方拼错了字段名却拿到全量上下文，
  // 不会报错也不会察觉，比直接报错更坏。
  if (trimmed === '') {
    throw new z.ZodError([
      {
        code: z.ZodIssueCode.custom,
        path: ['fields'],
        message: `fields 不能为空串；合法值：${CONTEXT_FIELDS.join(', ')}`,
      },
    ])
  }
  const parts = trimmed.split(',').map((s) => s.trim())
  const bad = parts.filter((p) => !(CONTEXT_FIELDS as readonly string[]).includes(p))
  if (bad.length > 0) {
    throw new z.ZodError([
      {
        code: z.ZodIssueCode.custom,
        path: ['fields'],
        message: `fields 非法值：${bad.join(', ')}；合法值：${CONTEXT_FIELDS.join(', ')}`,
      },
    ])
  }
  return [...new Set(parts)] as ContextField[]
}
