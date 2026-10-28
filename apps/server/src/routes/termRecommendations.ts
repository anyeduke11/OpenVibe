import type { FastifyInstance } from 'fastify'
import { createTermRecommendService, type SqliteDatabase } from '@openvibe/core'

export interface TermRecommendationRouteDeps {
  db: SqliteDatabase
}

/**
 * M3-T · FR-6 「本项目该掌握哪些术语」。
 *
 * ⚠️ **本文件只有基线层一个端点**：P3 不依赖 Pi（spec §6 硬约束 1）。
 * P4 落地时在这里加 query 参数 `?ai=1`，并在**降级时如实把 source 留在 'baseline'**
 * —— FR-6.3.3 最后一行：不得把基线结果包装成 AI 的输出。
 */
export function registerTermRecommendationRoutes(
  app: FastifyInstance,
  deps: TermRecommendationRouteDeps,
): void {
  const service = createTermRecommendService({ db: deps.db })

  app.get('/api/projects/:id/term-recommendations', async (req) => {
    const { id } = req.params as { id: string }
    return service.recommend(id)
  })
}
