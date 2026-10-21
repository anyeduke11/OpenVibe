/**
 * `packages/core/src/source-ai/ledger.ts` —— **解读调用的台账**（P5.4 · DL-16 · DL-08）
 * （`m9-dev-language-roadmap.md` §3.8 三条线第 1 条 / §7 DL-16 ·
 *   `m3-terms-learning.md` FR-9.1 / FR-9.3）
 *
 * ## 它做什么
 *
 * 每一次**真的出了网**的解读，写一行 `local_events`（kind = `ai_recommend_call`），
 * payload **只存指纹与计数**。
 *
 * ## ⚠️ 为什么是 `local_events` 而不是 M9 自己的表
 *
 * §3.1 的十七张表里**没有**「AI 调用台账」—— 那张表的归属是 M3 的 FR-9.1
 * （`ai_recommend_call` 已经在迁移 0010 的 CHECK 闭集里，且是**声明态、写入点属 P4**）。
 * ⇒ P5 **不新增表**（表数仍是十七张），而是**把那个已声明的 kind 真正用起来**。
 *
 * ## ⚠️ 「只存指纹与计数」怎么在代码上成立
 *
 * payload **按白名单构造**（不 spread 任何来路不明的对象）⇒
 * 9 个键**逐个写出来**：`aiModel` / `aiProvider` / `inputHash` /
 * `candidateCount` / `passedCount` / `droppedCount` / `result` /
 * `failureReason` / `durationMs`（**与 `AGENT_PAYLOAD_KEYS` 逐字一致**）。
 *
 * ⚠️ **没有** `content` / `text` / `fragments` / `path` 这类容器 ⇒
 * 源码正文**在类型上就进不来**（DL-16：片段不得进台账）。
 * ⇒ 片段进了台账的唯一途径是「有人往白名单里加一个键」⇒ 键闭集守卫会红。
 *
 * ## ⚠️ 失败**也要记**
 *
 * 「AI 不可用」**不记**（没出网 ⇒ 没有调用）；但「**调用了、失败了**」**必须记**
 * （`result='error'` ＋ `failureReason`）—— 否则「不可复算的东西不可追责」（FR-9 开篇）。
 */
import { createHash } from 'node:crypto'
import { LocalEventsRepo } from '../repos/localEvents'
import type { SqliteDatabase } from '../db'
import type { SourceInterpretRequest } from '@openvibe/shared'

/** 台账里的一次解读调用。 */
export interface InterpretCallRecord {
  projectId: string
  /** 模型标识 */
  model: string
  /** provider 标识 */
  provider: string
  /** 入参指纹（**不含正文**） */
  inputHash: string
  /** 送出去的片段条数 */
  candidateCount: number
  /** 解读回来的条数 */
  passedCount: number
  /** 被丢掉的条数（回来的 − 送的 ≥ 0） */
  droppedCount: number
  /** 结果（`ok` / `error`） */
  result: 'ok' | 'error'
  /** 失败原因（成功时为空串） */
  failureReason: string
  /** 耗时（毫秒） */
  durationMs: number
}

/**
 * 算入参指纹（**sha256 前 16 位十六进制**）。
 *
 * ⚠️ **指纹里含正文，但台账里只有指纹** —— 正文进哈希、不进台账。
 * ⇒ 「同一份入参 ⇒ 同一指纹」可用来对账；「台账里能不能还原出正文」不能。
 *
 * @param request 送出去的请求
 */
export function fingerprintRequest(request: SourceInterpretRequest): string {
  return createHash('sha256').update(JSON.stringify(request)).digest('hex').slice(0, 16)
}

/**
 * 写一行解读调用的台账（**只存指纹与计数**）。
 *
 * @param db 数据库
 * @param record 这一笔调用
 * @param now 参照时刻（**注入** ⇒ 测试可钉住）
 * @returns 台账行 id
 */
export function recordInterpretCall(
  db: SqliteDatabase,
  record: InterpretCallRecord,
  now: Date,
): number {
  // ⚠️ **按白名单逐键构造**（不 spread）⇒ 台账里不可能出现正文容器
  const payload = {
    aiModel: record.model,
    aiProvider: record.provider,
    inputHash: record.inputHash,
    candidateCount: record.candidateCount,
    passedCount: record.passedCount,
    droppedCount: record.droppedCount,
    result: record.result,
    failureReason: record.failureReason,
    durationMs: record.durationMs,
  }
  return new LocalEventsRepo(db).record(
    {
      kind: 'ai_recommend_call',
      subjectType: 'lang_source_interpret',
      subjectId: record.projectId,
      projectId: record.projectId,
      payload,
    },
    now,
  )
}
