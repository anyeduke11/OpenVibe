import { z } from 'zod'

/**
 * M10/D 批次 · LLM 候选提取的对外契约（spec `v023-d-ai-extract.md` FR-3）。
 *
 * 形状刻意窄：LLM 只产出「候选草稿」，一切身份/入库字段（id、status、来源反链）
 * 由服务端在 pending → 确认 → 分发的管道里补——**载荷值不接受 AI 的判断**
 * （「内部 AI 按外部 agent 待遇」红线 7）。`quote` 是锚定校验的凭据：必须逐字
 * 命中源日志原文，否则服务端直接丢弃（QG3）。
 */

export const EXTRACT_CANDIDATE_KINDS = ['term', 'prompt', 'playbook'] as const
export type ExtractCandidateKind = (typeof EXTRACT_CANDIDATE_KINDS)[number]

/** 单条候选（LLM 输出侧；服务端再校验 quote 锚定） */
export const ExtractCandidateItem = z.object({
  kind: z.enum(EXTRACT_CANDIDATE_KINDS),
  /** 术语词 / 提示词标题 / 技巧标题 */
  title: z.string().min(1).max(200),
  /** 定义 / 正文 */
  body: z.string().min(1).max(8000),
  /** 逐字引自源日志的原文句（锚定校验凭据） */
  quote: z.string().min(1).max(2000),
  /** 引用第几条输入日志（0 起，对应请求 log_ids 下标） */
  log_index: z.number().int().min(0),
})
export type ExtractCandidateItem = z.infer<typeof ExtractCandidateItem>

export const ExtractRequestInput = z.object({
  project_id: z.string().min(1),
  log_ids: z.array(z.string().min(1)).min(1).max(20),
  /** 本次出网确认（无同意记忆时必填） */
  confirm: z.boolean().optional(),
  /** 确认并记住本项目（写 ai_extract_consent） */
  remember: z.boolean().optional(),
  provider_id: z.string().optional(),
})
export type ExtractRequestInput = z.infer<typeof ExtractRequestInput>

/** 提取结果（web/CLI 消费）。status 非 ok 时 ingested 为空、原因在 warnings */
export const ExtractOut = z.object({
  status: z.enum(['ok', 'error', 'unavailable', 'consent-required', 'gate-closed', 'budget-exhausted']),
  provider: z.string().nullable(),
  candidateCount: z.number().int(),
  passedCount: z.number().int(),
  droppedCount: z.number().int(),
  /** 已落 pending 的候选（agent_ingests 行） */
  ingested: z.array(z.object({ id: z.string(), kind: z.string(), title: z.string() })),
  /** 锚定校验丢弃明细（QG3：幻觉候选不进人工视野） */
  dropped: z.array(z.object({ title: z.string(), reason: z.string() })),
  warnings: z.array(z.string()),
})
export type ExtractOut = z.infer<typeof ExtractOut>

/** 出网同意视图（设置页 / 提取前确认框） */
export const ExtractConsentOut = z.object({
  consents: z.array(
    z.object({
      project_id: z.string(),
      remember_all: z.boolean(),
      remembered_at: z.string().nullable(),
    }),
  ),
})
export type ExtractConsentOut = z.infer<typeof ExtractConsentOut>

/** AN5 采纳率面板（影子门槛 QG1 的数据面；全部从 agent_ingests review 结果现算） */
export const AdoptionOut = z.object({
  kinds: z.array(
    z.object({
      kind: z.string(),
      published: z.number().int(),
      rejected: z.number().int(),
      /** published ÷ (published+rejected)；分母 0 为 null（面板显示待采集） */
      rate: z.number().nullable(),
      /** 采纳率低于门槛（连续窗口判定由面板说明，不在此做时间序列） */
      belowThreshold: z.boolean(),
    }),
  ),
  /** 门槛值（QG1 预判 25%，owner 可改——常量单源在 core/extract/adoption.ts） */
  threshold: z.number(),
})
export type AdoptionOut = z.infer<typeof AdoptionOut>

/* ────────────────────────── AN2 · discuss 问答（批次 E） ────────────────────────── */

export const DiscussRequestInput = z.object({
  question: z.string().min(1).max(4000),
  /** 可选：只要这些 context 段（缺省全部；合法段名单 = CONTEXT_FIELDS） */
  fields: z.array(z.string()).optional(),
  /** 可选：字符预算（context API 既有纪律；截断如实透出） */
  budget: z.number().int().positive().optional(),
  confirm: z.boolean().optional(),
  remember: z.boolean().optional(),
  provider_id: z.string().optional(),
})
export type DiscussRequestInput = z.infer<typeof DiscussRequestInput>

export interface DiscussSegment {
  text: string
  /** 指向 sources 下标；null = 无来源段（LLM 未标注且校验不出处） */
  source_ref: number | null
}

/**
 * 问答结果。sources 是服务端组装的上下文段名单（真实存在的来源，编号由服务端定，
 * LLM 只能在回答里引用编号——红线 9：不从 LLM 输出解析来源）。status 非 ok 时
 * answer 为空、原因在 warnings。
 */
export const DiscussOut = z.object({
  status: z.enum(['ok', 'error', 'unavailable', 'consent-required', 'gate-closed', 'budget-exhausted']),
  provider: z.string().nullable(),
  answer: z.string(),
  segments: z.array(z.object({ text: z.string(), source_ref: z.number().nullable() })),
  /** 服务端组装的来源段名单（与 context fields 对应） */
  sources: z.array(z.string()),
  truncated: z.boolean(),
  warnings: z.array(z.string()),
})
export type DiscussOut = z.infer<typeof DiscussOut>
