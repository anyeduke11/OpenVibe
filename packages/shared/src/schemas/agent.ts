import { z } from 'zod'
import { AGENT_INGEST_KINDS, AGENT_INGEST_STATUSES } from '../constants'

/**
 * M8 回流写入面的入参/出参（m8-agent-bridge.md FR-2 / FR-5）。
 *
 * **单一端点 + 五项 kind 闭集**，不按类型开五个端点 —— 五个端点意味着五套鉴权、
 * 五套校验、五套出参断言，而五类数据的差异只在 `payload` 内部。
 */

/**
 * `payload_json` 的体量上限（FR-2.6，owner 裁③三值）。
 * 三值缺一即拒；写成独立 schema 而不是散在 handler 里，是为了让「超限」
 * 与「非法结构」走同一条 422 + fieldErrors 的既有出参面。
 */
export const AgentPayload = z.record(z.string(), z.unknown())

export const AgentIngestOne = z.object({
  /** 幂等键由调用方构造（FR-2.3）：服务端不生成、不校验格式 */
  idempotencyKey: z.string().min(1),
  kind: z.enum(AGENT_INGEST_KINDS),
  payload: AgentPayload,
  /** 上报方自报的平台标识，只入库不外发 */
  sourcePlatform: z.string().min(1),
  sourceSessionId: z.string().min(1).nullable().optional(),
  /** 自报路径：只用于冲突判定与 Web 展示，**不是安全凭据**（FR-1.2.2） */
  cwd: z.string().min(1).nullable().optional(),
})
export type AgentIngestOne = z.infer<typeof AgentIngestOne>

export const AgentIngestBatch = z.object({
  projectId: z.string().min(1),
  items: z.array(AgentIngestOne).min(1),
})
export type AgentIngestBatch = z.infer<typeof AgentIngestBatch>

/** 逐条结果（FR-2.7）：20 条里 3 条非法 ⇒ 其余照落，返回逐条结果 */
export const AgentIngestItemResult = z.object({
  index: z.number().int(),
  status: z.enum(['accepted', 'duplicate', 'conflict', 'rejected']),
  /** accepted / duplicate / conflict 时有；rejected 时为原样的幂等键，便于 agent 换键重试 */
  id: z.string().optional(),
  /** conflict 时才有：双方 sha 前 8 位，**不含完整载荷**（FR-7.1） */
  existingKeySha: z.string().optional(),
  incomingKeySha: z.string().optional(),
  reason: z.string().optional(),
})
export type AgentIngestItemResult = z.infer<typeof AgentIngestItemResult>

/** 整体恒为 200 —— 逐条结果在 body 内；全条失败也返回 200（FR-2.7） */
export const AgentIngestBatchResult = z.object({
  accepted: z.number().int(),
  duplicate: z.number().int(),
  conflict: z.number().int(),
  rejected: z.number().int(),
  items: z.array(AgentIngestItemResult),
})
export type AgentIngestBatchResult = z.infer<typeof AgentIngestBatchResult>

/** Web 的人工裁决入口（M8-E 的 conflict 处置；owner 裁⑥：合并交用户，不做自动策略） */
export const AgentIngestReviewInput = z.object({
  to: z.enum(['published', 'rejected']),
  reason: z.string().max(500).nullable().optional(),
})
export type AgentIngestReviewInput = z.infer<typeof AgentIngestReviewInput>

export const AgentIngestOut = z.object({
  id: z.string(),
  projectId: z.string(),
  kind: z.enum(AGENT_INGEST_KINDS),
  status: z.enum(AGENT_INGEST_STATUSES),
  sourcePlatform: z.string(),
  sourceSessionId: z.string().nullable(),
  cwd: z.string().nullable(),
  rejectReason: z.string().nullable(),
  createdAt: z.string(),
  reviewedAt: z.string().nullable(),
  payload: z.unknown(),
})
export type AgentIngestOut = z.infer<typeof AgentIngestOut>
