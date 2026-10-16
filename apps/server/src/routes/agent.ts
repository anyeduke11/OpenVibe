import type { FastifyInstance } from 'fastify'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AppError, AgentIngestBatch, AgentIngestReviewInput, parseContextFields } from '@openvibe/shared'
import { createAgentService, createCommandRunService, createContextService, PACK_LOCK_REL, type SqliteDatabase } from '@openvibe/core'
import { parseOrThrow } from '../lib/validate'

export interface AgentRouteDeps {
  db: SqliteDatabase
  /** 时间源与 DB 一起传，避免路由里隐式取 `new Date()` 变成第二条时间线 */
  now?: () => Date
}

/**
 * `POST /api/agent/ingest` 的**按端点**请求体上限（m8-agent-bridge.md FR-2.6.2）。
 *
 * **为什么不设全局**：Fastify 不设 `bodyLimit` 时用内建默认 1 MB，那是**整个 server 面**的口径；
 * 改成全局值等于让**所有**端点都接受更大的请求体，超出「让 agent 能推大载荷」这一件事的范围。
 * Fastify 5 的路由简写签名支持 `{ bodyLimit }` 覆盖（`fastify/types/route.d.ts`），
 * 实测：同实例内被覆盖的端点吃 3 MiB、**未被覆盖**的端点仍在 1 MiB 处 413。
 *
 * **为什么是 8 MiB**：域内总量上限 `AGENT_INGEST_LIMITS.requestTotalMaxBytes` = 2 MiB，
 * 而 Fastify 量的 `content-length` 是**整个序列化请求包**，比域内口径（各条 payload 之和）大：
 * ① 包封层（`projectId` / `items` 数组 / 每条的 `kind` + `idempotencyKey` + `sourcePlatform` 键名与引号）；
 * ② `idempotencyKey` 的 schema 只有 `min(1)` 没有上限（`packages/shared/src/schemas/agent.ts`），
 * 调用方给的键可以任意长。实测一组 20 条、每条 ~104 KB、键长 70 字符的批次：包封层开销 **2,932 B**。
 * 8 MiB = 域内 2 MiB 的 **4 倍**，相对实测开销留约 2800 倍余量，同时仍是**有界**的
 * ——10 MiB 的请求照样 413，判据「仍有上限在挡」因此可测（而不是变成永真）。
 *
 * **抬到这里的净效果**：FR-2.6 的 2 MB 总量上限**经 HTTP 第一次真正可达**——
 * 它此前被 1 MB 的传输层上限整个挡在服务层之前，永远吃不到。
 */
export const AGENT_INGEST_BODY_LIMIT = 8 * 1024 * 1024

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
  // CLI 埋点服务与上面那个**分开持有**：台账写入点按 kind 各归各的服务，
  // 不在这里合并成一个「万能 service」（FR-5.2 只要求写入在服务层，不要求同文件）。
  const commandRun = createCommandRunService({ db: deps.db, now: deps.now ?? (() => new Date()) })
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

  /**
   * 批量回流：20 条里 3 条非法 ⇒ 17 条照落，返回逐条结果。
   *
   * `bodyLimit` **只挂这一个端点**——它是大载荷回流的唯一入口，其余端点保持 Fastify 默认的 1 MB。
   */
  app.post('/api/agent/ingest', { bodyLimit: AGENT_INGEST_BODY_LIMIT }, async (req) => {
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

  /**
   * CLI 命令执行埋点（FR-5 的 `cli_agent_command_run`）。
   *
   * **为什么它必须走 HTTP**：FR-4.4 红线——CLI 侧从不直接开 DB，
   * 所以命令跑完只能上报，由服务端落台账。
   *
   * **为什么回 `{ ok: true }` 这么少**：CLI 侧不需要读任何统计结果，
   * 出参越少，CLI 与服务端的耦合面越小（少一个将来会变的字段）。
   *
   * **鉴权不在这里**：全局 `preHandler` 罩住所有 `/api/*`（`plugins/auth.ts`），
   * 本路由不重复写一遍——重复写会让「无 token ⇒ 401」这条判据测的不再是全局插件。
   */
  app.post('/api/agent/command-run', async (req) => {
    commandRun.recordCommandRun((req.body ?? {}) as Record<string, unknown>)
    return { ok: true }
  })
}
