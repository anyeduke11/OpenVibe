import type { FastifyInstance } from 'fastify'
import { createAgentRegistryService, type SqliteDatabase } from '@openvibe/core'
import { whichProbe } from '../lib/agent-probe'
import { reportRoute } from '../lib/route-source'

export interface AgentRegistryRouteDeps {
  db: SqliteDatabase
  /** 时间源与 DB 一起传，避免路由里隐式取 `new Date()` 变成第二条时间线 */
  now?: () => Date
  /** 探测实现可注入：默认 `which`，测试里换假实现即可覆盖全分支 */
  probe?: (executable: string) => boolean
}

/**
 * agent 注册表（v0.3.0 FR-3.0-1）。
 *
 * 只读语义：这两个端点都不创建/删除派发任务，也不启动 agent。
 * `POST .../health` 虽然写 DB，但只写 health / archived / last_checked_at 三列，
 * 是探测结果的回写，不是业务写入——不构成派发能力（派发须等 owner 裁定 + design §8）。
 */
export function registerAgentRegistryRoutes(
  app: FastifyInstance,
  deps: AgentRegistryRouteDeps,
): void {
  const now = deps.now
  const service = createAgentRegistryService(deps.db, {
    now: now ? () => now().toISOString() : undefined,
    probe: deps.probe ?? whichProbe,
  })

  app.get('/api/agents/registry', reportRoute('/api/agents/registry', 'db'), async (req) => {
    const { includeArchived } = req.query as { includeArchived?: unknown }
    const agents = service.listAgents(includeArchived === 'false' ? false : true)
    return { agents, total: agents.length }
  })

  app.post(
    '/api/agents/registry/health',
    reportRoute('/api/agents/registry/health', 'db'),
    async () => service.checkHealth(),
  )
}
