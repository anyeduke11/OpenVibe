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
  INTERNAL: 500,
}

export class AppError extends Error {
  readonly code: ErrorCode
  readonly details?: unknown

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.details = details
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
}
