import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { AppError, TERMS_ORDER_BY, TermCreateInput, TermUpdateInput } from '@openvibe/shared'
import { TermsRepo, type SqliteDatabase } from '@openvibe/core'
import { parseOrThrow } from '../lib/validate'
import { referencedPackNames } from '../lib/refs'

export interface TermRouteDeps {
  db: SqliteDatabase
}

/** 渲染入参放宽空数组：空选集需回 422 EMPTY_SELECTION 而非 VALIDATION_ERROR（m3 §6.3） */
const RenderMdBody = z.object({
  termIds: z.array(z.string()),
  orderBy: z.enum(TERMS_ORDER_BY).default('en-alpha'),
})

/** dev-plan §3.3 五端点 + render-terms-md */
export function registerTermRoutes(app: FastifyInstance, deps: TermRouteDeps): void {
  const terms = new TermsRepo(deps.db)

  app.get('/api/terms', async () => {
    const items = terms.list()
    return { items, total: items.length }
  })

  app.post('/api/terms', async (req, reply) => {
    const input = parseOrThrow(TermCreateInput, req.body)
    return reply.code(201).send(terms.create(input))
  })

  // 静态段先于 :id 匹配（find-my-way 优先级）
  app.get('/api/terms/search', async (req) => {
    const { q } = req.query as { q?: unknown }
    if (typeof q !== 'string' || q.trim() === '') {
      throw new AppError('VALIDATION_ERROR', 'q 为必填查询词（m3 FR-3）')
    }
    const items = terms.search(q.trim())
    return { items, total: items.length }
  })

  app.post('/api/terms/render-terms-md', async (req) => {
    const { termIds, orderBy } = parseOrThrow(RenderMdBody, req.body)
    // 缺失 id → STALE_SELECTION，两者均由仓储层抛出（错误码单一出处）
    return { content: terms.renderMd({ termIds, orderBy }) }
  })

  app.patch('/api/terms/:id', async (req) => {
    const { id } = req.params as { id: string }
    const patch = parseOrThrow(TermUpdateInput, req.body)
    return terms.update(id, patch)
  })

  app.delete('/api/terms/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const names = referencedPackNames(deps.db, id, 'termIds')
    if (names.length > 0) reply.header('x-referenced-packs', names.join(','))
    terms.delete(id)
    return reply.code(204).send()
  })
}
