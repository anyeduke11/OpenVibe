import {
  AGENT_INGEST_LIMITS,
  AppError,
  type AgentIngestItemResult,
  type AgentIngestOne,
  type AgentIngestStatus,
  type LocalEventKind,
} from '@openvibe/shared'
import type { SqliteDatabase } from '../db'
import { AgentIngestRepo, type AgentIngest } from '../repos/agentIngest'
import { LocalEventsRepo } from '../repos/localEvents'

/**
 * M8 Agent 接入层服务（service-layer.md 的第五个服务，owner 2026-10-14 裁）。
 *
 * **为什么这一层必须存在**：台账的写入点唯一性（local-event-ledger.md FR-3）要求
 * 「写入只发生在服务层内一处，不散落 repo 与 route」。没有这层，路由每加一个 M8 端点
 * 就会多一个 `localEvents.record` 调用点，写入点集中名存实亡。
 *
 * 三条服务层规则（service-layer.md FR-1）：
 * - **不建 class、不建 container**：对外只暴露「一次用户意图」级的入口函数；
 * - **`deps` 显式传入**：repo 工厂与时间源在签名里，不在函数体内隐式取全局；
 * - **不 import 任何传输层类型**：本文件不认识 `FastifyRequest`，也不认识 `@clack/*`。
 */

export interface AgentServiceDeps {
  db: SqliteDatabase
  /** 时间源。显式注入是为了让「同秒写入」在测试里可控，也是 FR-1.2 的要求 */
  now: () => Date
}

export interface IngestBatchInput {
  projectId: string
  items: AgentIngestOne[]
}

export interface IngestBatchResult {
  accepted: number
  duplicate: number
  conflict: number
  rejected: number
  items: AgentIngestItemResult[]
}

const PAYLOAD_LIMIT = AGENT_INGEST_LIMITS.singleEntryMaxBytes
const BATCH_LIMIT = AGENT_INGEST_LIMITS.maxEntries
const TOTAL_LIMIT = AGENT_INGEST_LIMITS.requestTotalMaxBytes

/** 规范化后的载荷字节数（与 repo 的 canonicalJson 同一套键排序口径） */
function payloadBytes(payload: unknown): number {
  return Buffer.byteLength(JSON.stringify(payload ?? {}), 'utf8')
}

/**
 * ⚠️ **这里曾有一处把约束套错层的实现，已移除（2026-10-15）**：
 * 最初对 agent 上报的 `payload` 扫了一遍「台账禁列」（`body` / `cwd` / `user` …），
 * 结果 `dev_log` 这类**正文本就该叫 body** 的 kind 被整条拒掉 —— 五种 kind 全军覆没。
 *
 * **错在哪**：FR-5.1.2 的禁列约束的是**台账事件的 `payload_json`**（那是要聚合统计、
 * 会长期留在本机库里的东西），不是 agent 上报给 `agent_ingests` 的载荷 ——
 * 后者**本来就是这个功能要存的内容**。拿聚合层的隐私规则去筛业务层的输入，
 * 等于用错误的规则杀掉正确的数据。
 *
 * **正确做法**：台账那侧靠**白名单构造**保证（`LEDGER_PAYLOAD_*` 显式列键），
 * 而不是靠黑名单扫描业务载荷。上报侧只管体量，不管内容。
 */

/** 台账事件 payload 的允许键闭集（FR-5.1.1）—— 白名单构造，不是黑名单过滤 */
export const LEDGER_PAYLOAD_KEYS = {
  agent_ingest_accepted: ['kind', 'sourcePlatform'] as const,
  agent_ingest_rejected: ['kind', 'reasonCode'] as const,
}

export function createAgentService(deps: AgentServiceDeps) {
  const ingests = new AgentIngestRepo(deps.db)
  const ledger = new LocalEventsRepo(deps.db)

  /** 校验单条，产出「为什么被拒」；null 表示放行 */
  function rejectReasonOf(item: AgentIngestOne, runningTotal: number): string | null {
    const bytes = payloadBytes(item.payload)
    if (bytes > PAYLOAD_LIMIT) {
      return `payload ${bytes} B 超单条上限 ${PAYLOAD_LIMIT} B`
    }
    if (runningTotal + bytes > TOTAL_LIMIT) {
      return `本次累计 ${runningTotal + bytes} B 超总量上限 ${TOTAL_LIMIT} B`
    }
    return null
  }

  /**
   * 批量回流（FR-2.7）。
   *
   * **逐条成败互不影响**：3 条非法 ⇒ 其余照落，返回逐条结果，整体恒 200。
   * 不整包回滚，是因为 agent 需要知道**哪条**能重试；不为「全失败」单独造 4xx，
   * 也是因为那会让 agent 无法读到哪条错了。
   */
  function ingestBatch(input: IngestBatchInput): IngestBatchResult {
    const now = deps.now()
    const stamp = now.toISOString()

    if (input.items.length > BATCH_LIMIT) {
      throw new AppError('VALIDATION_ERROR', `单次最多 ${BATCH_LIMIT} 条，本次 ${input.items.length} 条`, {
        field: 'items',
        limit: BATCH_LIMIT,
      })
    }

    const result: IngestBatchResult = { accepted: 0, duplicate: 0, conflict: 0, rejected: 0, items: [] }
    let runningTotal = 0

    input.items.forEach((item, index) => {
      const reason = rejectReasonOf(item, runningTotal)
      if (reason !== null) {
        result.rejected += 1
        result.items.push({ index, status: 'rejected', reason, id: undefined })
        ledger.record(
          { kind: 'agent_ingest_rejected', projectId: input.projectId, payload: { kind: item.kind, reasonCode: reasonCodeOf(reason) } },
          now,
        )
        return
      }

      runningTotal += payloadBytes(item.payload)

      // 项目不存在等属于**整批级别**的结构性失败（每条都会撞），不吞成逐条 rejected：
      // 那是调用方的错（传了不存在的 projectId），报 404 让它一次看清，
      // 而不是收到 20 条 rejected 再自己猜。逐条校验失败才是「部分成功」的语义。
      const outcome = ingests.ingest(
        {
          projectId: input.projectId,
          kind: item.kind,
          idempotencyKey: item.idempotencyKey,
          payload: item.payload,
          sourcePlatform: item.sourcePlatform,
          sourceSessionId: item.sourceSessionId ?? null,
          cwd: item.cwd ?? null,
        },
        stamp,
      )

      if (outcome.status === 'accepted') {
        result.accepted += 1
        result.items.push({ index, status: 'accepted', id: outcome.id })
        ledger.record({ kind: 'agent_ingest_accepted', projectId: input.projectId, payload: { kind: item.kind, sourcePlatform: item.sourcePlatform } }, now)
      } else if (outcome.status === 'duplicate') {
        result.duplicate += 1
        result.items.push({ index, status: 'duplicate', id: outcome.id })
      } else {
        result.conflict += 1
        result.items.push({
          index,
          status: 'conflict',
          id: outcome.id,
          existingKeySha: outcome.existingKeySha,
          incomingKeySha: outcome.incomingKeySha,
        })
      }
    })

    return result
  }

  /** Web 的人工裁决（owner 裁⑥：合并策略交给用户，服务层不给自动策略） */
  function reviewIngest(id: string, to: Extract<AgentIngestStatus, 'published' | 'rejected'>, reason: string | null): AgentIngest {
    return ingests.review(id, to, reason, deps.now().toISOString())
  }

  function listPending(projectId: string, limit?: number): AgentIngest[] {
    return ingests.listPending(projectId, limit)
  }

  function getIngest(id: string): AgentIngest | null {
    return ingests.get(id)
  }

  return { ingestBatch, reviewIngest, listPending, getIngest }
}

/** 拒绝原因归一成枚举 —— 台账的 `reasonCode` 必须是枚举而非自由文本（FR-5.1.1） */
function reasonCodeOf(reason: string): 'oversize' | 'invalid' {
  return reason.includes('超单条上限') || reason.includes('超总量上限') ? 'oversize' : 'invalid'
}

/** 导出判据面，让路由与 CLI 复用同一组上限，不各写一份 */
export const AGENT_BATCH_LIMITS = {
  maxItems: BATCH_LIMIT,
  singleEntryMaxBytes: PAYLOAD_LIMIT,
  requestTotalMaxBytes: TOTAL_LIMIT,
  kinds: new Set<string>(['dev_log', 'session', 'requirement', 'task_status', 'check_state']),
  ledgerKinds: new Set<string>([
    'agent_ingest_accepted',
    'agent_ingest_rejected',
  ] satisfies LocalEventKind[]),
}
