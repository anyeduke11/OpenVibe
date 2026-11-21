/** 统一错误码（dev-plan §3.0 总表；HTTP 映射与 spec 出处在此单一维护） */
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'EMPTY_SELECTION',
  'STALE_SELECTION',
  'VERSION_IMMUTABLE',
  'BUILTIN_IMMUTABLE',
  'NOT_FOUND',
  'UNAUTHORIZED',
  'FORBIDDEN_ORIGIN',
  'NAME_CONFLICT',
  'REMOTE_UNREACHABLE',
  /**
   * 幂等键冲突：同一 idempotency_key 重放了**不同的载荷**（m8-agent-bridge.md FR-6.1，owner 裁②）。
   *
   * 为什么不用 STALE_SELECTION / NAME_CONFLICT：前者语义是「你手上这份选择已过期」，
   * 后者是「同名实体撞了」——用在同键异载荷上都会让调用方误判。正确处置是「换幂等键重试」。
   *
   * 为什么取 422 不取 409：本仓信封**已有** 409 先例（VERSION_IMMUTABLE），但那是
   * 「资源当前状态不允许该操作」；幂等冲突是「你重放的不是同一件事」，属调用方键构造有歧义，
   * 不是服务端资源态冲突。用 409 会让调用方按「重新 GET」处理，而正确处理是换键重试。
   */
  'IDEMPOTENCY_CONFLICT',
  /**
   * 状态迁移非法：`rejected → published` 之类（m8-agent-bridge.md FR-5.1，v0.2.4 F1）。
   *
   * 为什么用 409 不沿用 422：409 的语义是「资源当前状态不允许该操作」——
   * 被拒过的记录要重新发布，正确做法是**重新 ingest**（新幂等键），不是重试同一条。
   * 422 会让调用方以为是入参格式问题而反复改字段。
   */
  'INVALID_TRANSITION',
  'INTERNAL',
] as const
export type ErrorCode = (typeof ERROR_CODES)[number]

export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 422,
  EMPTY_SELECTION: 422,
  STALE_SELECTION: 422,
  NAME_CONFLICT: 422,
  VERSION_IMMUTABLE: 409,
  BUILTIN_IMMUTABLE: 403,
  NOT_FOUND: 404,
  UNAUTHORIZED: 401,
  FORBIDDEN_ORIGIN: 403,
  REMOTE_UNREACHABLE: 502,
  IDEMPOTENCY_CONFLICT: 422,
  INVALID_TRANSITION: 409,
  INTERNAL: 500,
}

export class AppError extends Error {
  readonly code: ErrorCode
  readonly details?: unknown
  /**
   * 诊断原文（允许英文：Node 的 errno 消息、第三方库的英文原文）。
   *
   * 与 `message` 分通道：`message` 只写中文一句话（说清哪里坏了），
   * `detail` 承接排障原文。⚠️ 与 `details` 是两件事：`details` 是**结构化**数据
   * （供程序判断），`detail` 是**给人看的原文**（供排障）。混用会让「机器读」
   * 与「人读」互相污染。
   */
  readonly detail?: string

  constructor(code: ErrorCode, message: string, details?: unknown, detail?: string) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.details = details
    if (detail !== undefined) this.detail = detail
  }

  get httpStatus(): number {
    return ERROR_HTTP_STATUS[this.code]
  }
}

/** 统一错误响应体 `{code, message, details?}`（design §6） */
export interface ErrorBody {
  code: ErrorCode
  message: string
  details?: unknown
  /**
   * 诊断原文（允许英文：Node 的 errno 消息、第三方库的英文原文）。
   *
   * 与 `message` 分通道：`message` 是中文人话，`detail` 是排障原文。
   * 缺省即不产生该字段——无诊断信息的错误不必多写一个字段。
   */
  detail?: string
}
