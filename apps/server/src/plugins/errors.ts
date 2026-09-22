import type { FastifyInstance } from 'fastify'
import { AppError, type ErrorBody } from '@openvibe/shared'
import { zodIssuesToFieldErrors, type ZodIssueLike } from '../lib/validate'
import { hasWebBuild, SPA_INDEX } from './static'

/** 统一 JSON 404 体：SPA 回退（plugins/static）在非前端路由分支复用，避免两处文案漂移 */
export function notFoundBody(method: string, url: string): ErrorBody {
  return { code: 'NOT_FOUND', message: `路由不存在：${method} ${url}` }
}

/** dev-plan §4.4：AppError→HTTP 总表映射；zod→422；其余 4xx 透传码、未知 500 零堆栈 */
export function registerErrors(
  app: FastifyInstance,
  options: { spaFallbackRoot?: string } = {},
): void {
  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof AppError) {
      const body: ErrorBody = { code: error.code, message: error.message }
      if (error.details !== undefined) body.details = error.details
      return reply.code(error.httpStatus).send(body)
    }

    // 按 name 判定而非 instanceof：避免 server 与 shared 各自解析出不同 zod 副本
    const zodLike = error as unknown as { name?: string; issues?: ZodIssueLike[] }
    if (zodLike.name === 'ZodError' && Array.isArray(zodLike.issues)) {
      return reply.code(422).send({
        code: 'VALIDATION_ERROR',
        message: '请求参数校验失败',
        details: { fieldErrors: zodIssuesToFieldErrors(zodLike.issues) },
      } satisfies ErrorBody)
    }

    const statusCode = (error as unknown as { statusCode?: unknown }).statusCode
    if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
      return reply.code(statusCode).send({
        code: 'VALIDATION_ERROR',
        message: (error as unknown as Error).message,
      } satisfies ErrorBody)
    }

    app.log.error(error)
    return reply.code(500).send({ code: 'INTERNAL', message: '服务器内部错误' } satisfies ErrorBody)
  })

  app.setNotFoundHandler((req, reply) => {
    const path = req.url.split('?')[0] ?? ''
    const root = options.spaFallbackRoot
    // SPA 回退只管页面路由：/api 与非 GET 必须是 JSON 404，否则前端外壳会吞掉接口错误语义。
    // 逐请求查存在性：产物可能在启动后被清理，此时回 JSON 404 而不是让 sendFile 递归 callNotFound。
    if (
      root &&
      !path.startsWith('/api') &&
      (req.method === 'GET' || req.method === 'HEAD') &&
      hasWebBuild(root)
    ) {
      return reply.sendFile(SPA_INDEX, root)
    }
    return reply.code(404).send(notFoundBody(req.method, req.url))
  })
}
