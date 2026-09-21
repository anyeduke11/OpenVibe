import type { FastifyInstance } from 'fastify'
import { FlowTemplateCreateInput, FlowTemplateUpdateInput } from '@openvibe/shared'
import { FlowTemplatesRepo, type SqliteDatabase } from '@openvibe/core'
import { parseOrThrow } from '../lib/validate'

export interface FlowRouteDeps {
  db: SqliteDatabase
}

/** dev-plan §3.4 四端点；内置模板的 403 由仓储层抛 BUILTIN_IMMUTABLE（错误码单一出处） */
export function registerFlowTemplateRoutes(app: FastifyInstance, deps: FlowRouteDeps): void {
  const flows = new FlowTemplatesRepo(deps.db)

  app.get('/api/flow-templates', async () => {
    const items = flows.list()
    return { items, total: items.length }
  })

  app.post('/api/flow-templates', async (req, reply) => {
    const input = parseOrThrow(FlowTemplateCreateInput, req.body)
    // builtin 只能由种子写入，API 不接受该字段（创建入参里就没有）
    return reply.code(201).send(flows.create(input))
  })

  app.patch('/api/flow-templates/:id', async (req) => {
    const { id } = req.params as { id: string }
    const patch = parseOrThrow(FlowTemplateUpdateInput, req.body)
    return flows.update(id, patch)
  })

  app.delete('/api/flow-templates/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    flows.delete(id)
    return reply.code(204).send()
  })

  app.post('/api/flow-templates/:id/duplicate', async (req, reply) => {
    const { id } = req.params as { id: string }
    return reply.code(201).send(flows.duplicate(id))
  })
}
