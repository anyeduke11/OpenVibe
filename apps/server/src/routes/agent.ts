import type { FastifyInstance } from 'fastify'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AppError, AgentIngestBatch, AgentIngestReviewInput, parseContextFields } from '@openvibe/shared'
import { createAgentService, createContextService, PACK_LOCK_REL, type SqliteDatabase } from '@openvibe/core'
import { parseOrThrow } from '../lib/validate'

export interface AgentRouteDeps {
  db: SqliteDatabase
  /** 时间源与 DB 一起传，避免路由里隐式取 `new Date()` 变成第二条时间线 */
  now?: () => Date
}

/**
 * M8 · Agent 接入层的回流写入面与待确认队列（m8-agent-bridge.md FR-2 / FR-5）。
 *
 * **路由只做三件事**：解析入参 → 调服务层 → 序列化。
 * 台账写入、幂等判定、体量裁决一律在 `agentService` 里（service-layer.md FR-3）。
 *
 * **整体恒返回 200**：逐条成败在 body 内（FR-2.7）。全条失败也返回 200 ——
 * 那会让 agent 读不到「哪条错了」，只能靠数 accepted。
 */
export function registerAgentRoutes(app: FastifyInstance, deps: AgentRouteDeps): void {
  const service = createAgentService({ db: deps.db, now: deps.now ?? (() => new Date()) })
  const context = createContextService({
    db: deps.db,
    // 读 lock 的能力**注入**而不是直读文件系统：让「读不到 lock」这条分支在测试里可控
    readLock: (localPath) => {
      try {
        return JSON.parse(readFileSync(join(localPath, PACK_LOCK_REL), 'utf8'))
      } catch {
        return null
      }
    },
  })

  /** 批量回流：20 条里 3 条非法 ⇒ 17 条照落，返回逐条结果 */
  app.post('/api/agent/ingest', async (req) => {
    const input = parseOrThrow(AgentIngestBatch, req.body)
    return service.ingestBatch(input)
  })

  /** 待确认队列：pending 与 conflict 都要人看（M8-E 的数据源） */
  app.get('/api/projects/:id/agent-ingests', async (req) => {
    const { id } = req.params as { id: string }
    const { limit } = req.query as { limit?: unknown }
    const items = service.listPending(id, typeof limit === 'number' ? limit : undefined)
    return { items, total: items.length }
  })

  /**
   * 聚合查询面（M8-D）。**只读**：写面只有上面那一个 POST（FR-3.1）。
   *
   * `?fields=` 的非法值在这里就拒 —— 不静默忽略（FR-3.3）；
   * 裁剪留痕由服务层负责，本路由不加工。
   */
  app.get('/api/projects/:id/context', async (req) => {
    const { id } = req.params as { id: string }
    const { fields, budget } = req.query as { fields?: unknown; budget?: unknown }
    const wanted = parseContextFields(typeof fields === 'string' ? fields : undefined)
    const cap = typeof budget === 'string' ? Number(budget) : undefined
    return context.build(id, wanted, Number.isFinite(cap) ? cap : undefined)
  })

  /** 人工裁决：owner 裁⑥「合并交给用户在 Web 裁决」，服务层不给自动策略 */
  app.post('/api/agent/ingests/:id/review', async (req) => {
    const { id } = req.params as { id: string }
    const input = parseOrThrow(AgentIngestReviewInput, req.body)
    const item = service.getIngest(id)
    if (!item) throw new AppError('NOT_FOUND', `回流记录不存在: ${id}`)
    return service.reviewIngest(id, input.to, input.reason ?? null)
  })
}
