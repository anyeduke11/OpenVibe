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
