import type { FastifyInstance } from 'fastify'
import { FlowTemplateCreateInput, FlowTemplateUpdateInput } from '@openvibe/shared'
import {
  createFlowTemplate,
  deleteFlowTemplate,
  duplicateFlowTemplate,
  listFlowTemplates,
  updateFlowTemplate,
  type SqliteDatabase,
} from '@openvibe/core'
import { parseOrThrow } from '../lib/validate'
import { reportRoute } from '../lib/route-source'
import { assetEventInput, resolveLedger, type LedgerDeps } from '../lib/ledger'

export interface FlowRouteDeps extends LedgerDeps {
  db: SqliteDatabase
}

/** dev-plan §3.4 四端点；内置模板的 403 由仓储层抛 BUILTIN_IMMUTABLE（错误码单一出处） */
export function registerFlowTemplateRoutes(app: FastifyInstance, deps: FlowRouteDeps): void {
  const ledger = resolveLedger(deps)

  app.get('/api/flow-templates', reportRoute('/api/flow-templates', 'db'), async () => {
    const items = listFlowTemplates({ db: deps.db })
    return { items, total: items.length }
  })

  app.post('/api/flow-templates', async (req, reply) => {
    const input = parseOrThrow(FlowTemplateCreateInput, req.body)
    // builtin 只能由种子写入，API 不接受该字段（创建入参里就没有）
    const created = createFlowTemplate({ db: deps.db }, input)
    ledger(assetEventInput('asset_created', 'flow_template', created.id))
    return reply.code(201).send(created)
  })

  app.patch('/api/flow-templates/:id', async (req) => {
    const { id } = req.params as { id: string }
    const patch = parseOrThrow(FlowTemplateUpdateInput, req.body)
    const updated = updateFlowTemplate({ db: deps.db }, id, patch)
    ledger(assetEventInput('asset_updated', 'flow_template', id))
    return updated
  })

  app.delete('/api/flow-templates/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    deleteFlowTemplate({ db: deps.db }, id)
    // U-11：删除成功后记 asset_deleted（W-1·F-3；builtin 不可删由 delete 内部抛错，不会走到这里）
    ledger(assetEventInput('asset_deleted', 'flow_template', id))
    return reply.code(204).send()
  })

  app.post('/api/flow-templates/:id/duplicate', async (req, reply) => {
    const { id } = req.params as { id: string }
    return reply.code(201).send(duplicateFlowTemplate({ db: deps.db }, id))
  })
}
