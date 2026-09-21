import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { AppError, DEVLOG_TYPES, DevLogCreateInput, type DevLogType } from '@openvibe/shared'
import { DevLogRepo, ProjectsRepo, type SqliteDatabase } from '@openvibe/core'
import { parseOrThrow } from '../lib/validate'

export interface DevLogRouteDeps {
  db: SqliteDatabase
}

const TypeQuery = z.object({ type: z.enum(DEVLOG_TYPES).default('DEV') })
const LinkBody = z.object({ assetId: z.string().min(1) })

/** dev-plan §3.7 两端点 + 回流写链（link）与读链（reflow-origin） */
export function registerDevLogRoutes(app: FastifyInstance, deps: DevLogRouteDeps): void {
  const logs = new DevLogRepo(deps.db)
  const projects = new ProjectsRepo(deps.db)

  app.get('/api/projects/:id/devlog', async (req) => {
    const { id } = req.params as { id: string }
    if (!projects.get(id)) throw new AppError('NOT_FOUND', `项目不存在: ${id}`)
    const { type } = req.query as { type?: unknown }
    const filter =
      typeof type === 'string' && (DEVLOG_TYPES as readonly string[]).includes(type)
        ? (type as DevLogType)
        : undefined
    const items = logs.list(id, filter)
    return { items, total: items.length }
  })

  app.post('/api/projects/:id/devlog', async (req, reply) => {
    const { id } = req.params as { id: string }
    if (!projects.get(id)) throw new AppError('NOT_FOUND', `项目不存在: ${id}`)
    const input = parseOrThrow(DevLogCreateInput, req.body)
    // entryNo 由服务端按「同项目同类型 max+1」事务分配（m5 FR-5.1），客户端不传
    return reply.code(201).send(logs.create(id, input))
  })

  app.get('/api/projects/:id/devlog/export', async (req, reply) => {
    const { id } = req.params as { id: string }
    if (!projects.get(id)) throw new AppError('NOT_FOUND', `项目不存在: ${id}`)
    const { type } = parseOrThrow(TypeQuery, req.query)
    const fileName = type === 'DEV' ? 'DEV_LOG.md' : 'CHECK_LOG.md'
    return reply
      .header('content-type', 'text/markdown; charset=utf-8')
      .header('content-disposition', `attachment; filename="${fileName}"`)
      .send(logs.export(id, type))
  })

  /** 回流动作第二跳：术语/提示词已建好，把资产 id 记进日志 linkedAssetIds */
  app.post('/api/projects/:id/devlog/:logId/assets', async (req) => {
    const { id, logId } = req.params as { id: string; logId: string }
    const { assetId } = parseOrThrow(LinkBody, req.body)
    const log = logs.get(logId)
    // 日志必须属于路径里的项目，否则跨项目挂链会污染反链（m5 FR-7.1）
    if (!log || log.projectId !== id) throw new AppError('NOT_FOUND', `日志不存在: ${logId}`)
    logs.linkAsset(logId, assetId)
    return { log: logs.get(logId) }
  })

  /** 反查：资产详情页显示「来源：项目 X 的 DEV-0007」（m5 FR-7.2） */
  app.get('/api/reflow-origin/:assetId', async (req) => {
    const { assetId } = req.params as { assetId: string }
    return { origin: logs.reflowOriginFor(assetId) }
  })
}
