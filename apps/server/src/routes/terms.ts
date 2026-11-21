import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { AppError, TERMS_ORDER_BY, TermCreateInput, TermUpdateInput } from '@openvibe/shared'
import {
  createTerm,
  deleteTerm,
  listTerms,
  renderTermsMd,
  searchTerms,
  updateTerm,
  type SqliteDatabase,
} from '@openvibe/core'
import { parseOrThrow } from '../lib/validate'
import { reportRoute } from '../lib/route-source'
import { assetEventInput, resolveLedger, type LedgerDeps } from '../lib/ledger'

export interface TermRouteDeps extends LedgerDeps {
  db: SqliteDatabase
}

/** 渲染入参放宽空数组：空选集需回 422 EMPTY_SELECTION 而非 VALIDATION_ERROR（m3 §6.3） */
const RenderMdBody = z.object({
  termIds: z.array(z.string()),
  orderBy: z.enum(TERMS_ORDER_BY).default('en-alpha'),
})

/** dev-plan §3.3 五端点 + render-terms-md */
export function registerTermRoutes(app: FastifyInstance, deps: TermRouteDeps): void {
  const ledger = resolveLedger(deps)

  app.get('/api/terms', reportRoute('/api/terms', 'db'), async () => {
    const items = listTerms({ db: deps.db })
    return { items, total: items.length }
  })

  app.post('/api/terms', async (req, reply) => {
    const input = parseOrThrow(TermCreateInput, req.body)
    const created = createTerm({ db: deps.db }, input)
    ledger(assetEventInput('asset_created', 'term', created.id))
    return reply.code(201).send(created)
  })

  // 静态段先于 :id 匹配（find-my-way 优先级）
  app.get('/api/terms/search', reportRoute('/api/terms/search', 'db'), async (req) => {
    const { q } = req.query as { q?: unknown }
    if (typeof q !== 'string' || q.trim() === '') {
      throw new AppError('VALIDATION_ERROR', 'q 为必填查询词（m3 FR-3）')
    }
    const items = searchTerms({ db: deps.db }, q.trim())
    return { items, total: items.length }
  })

  app.post('/api/terms/render-terms-md', async (req) => {
    const { termIds, orderBy } = parseOrThrow(RenderMdBody, req.body)
    // 缺失 id → STALE_SELECTION，两者均由仓储层抛出（错误码单一出处）
    return { content: renderTermsMd({ db: deps.db }, { termIds, orderBy }) }
  })

  app.patch('/api/terms/:id', async (req) => {
    const { id } = req.params as { id: string }
    const patch = parseOrThrow(TermUpdateInput, req.body)
    const updated = updateTerm({ db: deps.db }, id, patch)
    ledger(assetEventInput('asset_updated', 'term', id))
    return updated
  })

  app.delete('/api/terms/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    // F-1：删除编排（查引用 → 删）整体迁入服务层——路由只负责把引用名放进响应头
    const { referencedPackNames: names } = deleteTerm({ db: deps.db }, id)
    if (names.length > 0) reply.header('x-referenced-packs', names.join(','))
    // U-11：删除成功后记 asset_deleted（W-1·F-3；删除前被引用时仅置 header，删除仍执行 ⇒ 照记）
    ledger(assetEventInput('asset_deleted', 'term', id))
    return reply.code(204).send()
  })
}
