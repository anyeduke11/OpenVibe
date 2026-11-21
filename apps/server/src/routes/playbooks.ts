import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { AppError, PlaybookCreateInput, PlaybookUpdateInput } from '@openvibe/shared'
import {
  createPlaybook,
  deletePlaybook,
  listPlaybooks,
  renderPlaybooksMd,
  searchPlaybooks,
  updatePlaybook,
  type SqliteDatabase,
} from '@openvibe/core'
import { parseOrThrow } from '../lib/validate'
import { reportRoute } from '../lib/route-source'
import { assetEventInput, resolveLedger, type LedgerDeps } from '../lib/ledger'

export interface PlaybookRouteDeps extends LedgerDeps {
  db: SqliteDatabase
}

/** 渲染入参放宽空数组：空选集需回 422 EMPTY_SELECTION 而非 VALIDATION_ERROR（m4 FR-6.3） */
const RenderMdBody = z.object({
  playbookIds: z.array(z.string()),
})

/** m4 FR-3.1：六端点，命名与动词律逐条对齐 routes/terms.ts */
export function registerPlaybookRoutes(app: FastifyInstance, deps: PlaybookRouteDeps): void {
  const ledger = resolveLedger(deps)

  app.get('/api/playbooks', reportRoute('/api/playbooks', 'db'), async () => {
    const items = listPlaybooks({ db: deps.db })
    return { items, total: items.length }
  })

  app.post('/api/playbooks', async (req, reply) => {
    const input = parseOrThrow(PlaybookCreateInput, req.body)
    const created = createPlaybook({ db: deps.db }, input)
    ledger(assetEventInput('asset_created', 'playbook', created.id))
    return reply.code(201).send(created)
  })

  // 静态段先于 :id 匹配（find-my-way 优先级）
  app.get('/api/playbooks/search', reportRoute('/api/playbooks/search', 'db'), async (req) => {
    const { q } = req.query as { q?: unknown }
    if (typeof q !== 'string' || q.trim() === '') {
      throw new AppError('VALIDATION_ERROR', 'q 为必填查询词（m4 FR-3）')
    }
    const items = searchPlaybooks({ db: deps.db }, q.trim())
    return { items, total: items.length }
  })

  app.post('/api/playbooks/render-playbooks-md', async (req) => {
    const { playbookIds } = parseOrThrow(RenderMdBody, req.body)
    // 缺失 id → STALE_SELECTION，两者均由仓储层抛出（错误码单一出处）
    return { content: renderPlaybooksMd({ db: deps.db }, { playbookIds }) }
  })

  app.patch('/api/playbooks/:id', async (req) => {
    const { id } = req.params as { id: string }
    const patch = parseOrThrow(PlaybookUpdateInput, req.body)
    const updated = updatePlaybook({ db: deps.db }, id, patch)
    ledger(assetEventInput('asset_updated', 'playbook', id))
    return updated
  })

  app.delete('/api/playbooks/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const { referencedPackNames: names } = deletePlaybook({ db: deps.db }, id)
    if (names.length > 0) reply.header('x-referenced-packs', names.join(','))
    // U-11：删除成功后记 asset_deleted（W-1·F-3）
    ledger(assetEventInput('asset_deleted', 'playbook', id))
    return reply.code(204).send()
  })
}
