import type { ZodTypeAny } from 'zod'
import { AppError } from '@openvibe/shared'

export interface ZodIssueLike {
  path: (string | number)[]
  message: string
}

export function zodIssuesToFieldErrors(issues: ZodIssueLike[]): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {}
  for (const issue of issues) {
    const key = issue.path.join('.') || '_'
    const list = fieldErrors[key] ?? []
    list.push(issue.message)
    fieldErrors[key] = list
  }
  return fieldErrors
}

/** API 边界统一解析入口（dev-plan §3.0：zod 失败 → 422 VALIDATION_ERROR + fieldErrors） */
export function parseOrThrow<T extends ZodTypeAny>(schema: T, data: unknown): T['_output'] {
  const parsed = schema.safeParse(data)
  if (!parsed.success) {
    throw new AppError('VALIDATION_ERROR', '请求参数校验失败', {
      fieldErrors: zodIssuesToFieldErrors(parsed.error.issues as ZodIssueLike[]),
    })
  }
  return parsed.data
}
