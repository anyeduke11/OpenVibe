import { createHash } from 'node:crypto'
import type { SqliteDatabase } from '../db'
import { AppError, newId, type AgentIngestKind, type AgentIngestStatus } from '@openvibe/shared'

/**
 * 回流待确认队列（m8-agent-bridge.md FR-1.2 / FR-2）。
 *
 * 三条不可让步的不变式（都写在这里而不是只写在 spec 里）：
 * 1. **幂等三态**：同键同载荷 ⇒ duplicate（不重复落库）；同键异载荷 ⇒ conflict
 *    （**先到者一个字节都不改**）；键不存在 ⇒ accepted。
 * 2. **一律 pending**：任何 kind 落库都是 pending，用户在 Web 确认才转 published。
 *    沿用 m4-playbook FR-5「人工确认是唯一入库路径」——agent 的判断不可作为事实源。
 * 3. **cwd 是自报字段**：不构成安全凭据，不据此判定「agent 真的在那个目录里」。
 */

type IngestRow = {
  id: string
  project_id: string
  kind: string
  idempotency_key: string
  payload_json: string
  source_platform: string
  source_session_id: string | null
  cwd: string | null
  status: string
  reject_reason: string | null
  created_at: string
  reviewed_at: string | null
}

export interface IngestInput {
  projectId: string
  kind: AgentIngestKind
  idempotencyKey: string
  payload: unknown
  sourcePlatform: string
  sourceSessionId?: string | null
  cwd?: string | null
}

export type IngestOutcome =
  | { status: 'accepted'; id: string }
  | { status: 'duplicate'; id: string }
  /** 冲突响应只给双方 sha 的前 8 位 —— 回显完整载荷等于泄露另一个会话的内容（FR-7.1） */
  | { status: 'conflict'; id: string; existingKeySha: string; incomingKeySha: string }

export interface AgentIngest {
  id: string
  projectId: string
  kind: AgentIngestKind
  status: AgentIngestStatus
  sourcePlatform: string
  sourceSessionId: string | null
  cwd: string | null
  rejectReason: string | null
  createdAt: string
  reviewedAt: string | null
  payload: unknown
}

function rowToIngest(row: IngestRow): AgentIngest {
  return {
    id: row.id,
    projectId: row.project_id,
    kind: row.kind as AgentIngestKind,
    status: row.status as AgentIngestStatus,
    sourcePlatform: row.source_platform,
    sourceSessionId: row.source_session_id,
    cwd: row.cwd,
    rejectReason: row.reject_reason,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    payload: JSON.parse(row.payload_json),
  }
}

/** 规范化后的载荷文本：键排序后序列化 */
function canonicalJson(payload: unknown): string {
  // 键排序是幂等语义正确的前提：agent 重试时 JSON.stringify 的键序不保证稳定，
  // 不归一就会把「同一份载荷」判成 conflict，而 agent 无从知道该换键。
  return JSON.stringify(payload, (_k, v) => {
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)))
    }
    return v
  })
}

/** sha256 全长：只在内存里比对，不落库（FR-7.1 的短指纹是它的前 8 位） */
function sha256Of(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

export class AgentIngestRepo {
  constructor(private readonly db: SqliteDatabase) {}

  private assertProject(projectId: string): void {
    const row = this.db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)
    if (!row) throw new AppError('NOT_FOUND', `项目不存在：${projectId}`)
  }

  /** 幂等三态的落点（FR-2.2）。SQLite 单写者提供串行保证，`UNIQUE(idempotency_key)` 是唯一仲裁者。 */
  ingest(input: IngestInput, now: string): IngestOutcome {
    const key = input.idempotencyKey.trim()
    if (key === '') throw new AppError('VALIDATION_ERROR', 'idempotency_key 不能为空')
    if (input.sourcePlatform.trim() === '') {
      throw new AppError('VALIDATION_ERROR', 'source_platform 不能为空')
    }

    const payloadJson = canonicalJson(input.payload ?? {})
    const incomingSha = sha256Of(payloadJson)

    const existing = this.db
      .prepare('SELECT * FROM agent_ingests WHERE idempotency_key = ?')
      .get(key) as IngestRow | undefined

    if (existing) {
      const existingSha = sha256Of(existing.payload_json)
      if (existingSha === incomingSha) {
        return { status: 'duplicate', id: existing.id }
      }
      // 把先到者标成 conflict：四态闭集里这一态的存在意义，就是让 Web 面板能
      // 对「需要人介入的行」加重视觉权重（M8-E FR-5.1.1.2）。
      //
      // **「先到者一个字节都不改」指的是内容**（payload / created_at），不是裁决状态 ——
      // 状态不标的话，待确认队列里就只剩一堆看不出异常的 pending，人根本无从介入。
      this.db.prepare("UPDATE agent_ingests SET status = 'conflict' WHERE id = ?").run(existing.id)
      return {
        status: 'conflict',
        id: existing.id,
        // 只给 sha 前 8 位：回显完整载荷等于把另一个会话的内容泄露出去（FR-7.1）
        existingKeySha: existingSha.slice(0, 8),
        incomingKeySha: incomingSha.slice(0, 8),
      }
    }

    this.assertProject(input.projectId)
    const id = newId('agentIngest')
    // INSERT 走 UNIQUE 兜底：并发下两个同键请求必有一个撞在这里抛错，
    // 由调用方转成 conflict —— 不做应用层锁（FR-7.3）。
    this.db
      .prepare(
        `INSERT INTO agent_ingests
           (id, project_id, kind, idempotency_key, payload_json,
            source_platform, source_session_id, cwd, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      )
      .run(
        id,
        input.projectId,
        input.kind,
        key,
        payloadJson,
        input.sourcePlatform,
        input.sourceSessionId ?? null,
        input.cwd ?? null,
        now,
      )
    return { status: 'accepted', id }
  }

  /** Web 的人工裁决入口（owner 裁⑥：合并交给用户在 Web 裁决，服务层不给自动策略） */
  review(id: string, to: Extract<AgentIngestStatus, 'published' | 'rejected'>, reason: string | null, now: string): AgentIngest {
    const row = this.db.prepare('SELECT * FROM agent_ingests WHERE id = ?').get(id) as IngestRow | undefined
    if (!row) throw new AppError('NOT_FOUND', `回流记录不存在：${id}`)
    if (row.status === 'conflict') {
      throw new AppError('IDEMPOTENCY_CONFLICT', '冲突记录不能直接裁决，请先决定保留哪一方的幂等键')
    }
    this.db
      .prepare('UPDATE agent_ingests SET status = ?, reject_reason = ?, reviewed_at = ? WHERE id = ?')
      .run(to, reason, now, id)
    return rowToIngest(this.db.prepare('SELECT * FROM agent_ingests WHERE id = ?').get(id) as IngestRow)
  }

  /**
   * 待确认队列：pending 与 conflict 都要人看，两者视觉权重不同（M8-E FR-5.1.1.2）。
   * 末位 `id ASC` 不是装饰 —— 守卫 `tests/order-determinism.test.ts` 要求列表 SQL 有唯一键兜底，
   * 同秒写入的两条若只按 created_at 排，返回顺序会在两次查询间抖动。
   */
  listPending(projectId: string, limit = 50): AgentIngest[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM agent_ingests
          WHERE project_id = ? AND status IN ('pending','conflict')
          ORDER BY created_at DESC, id ASC LIMIT ?`,
      )
      .all(projectId, limit) as IngestRow[]
    return rows.map(rowToIngest)
  }

  get(id: string): AgentIngest | null {
    const row = this.db.prepare('SELECT * FROM agent_ingests WHERE id = ?').get(id) as IngestRow | undefined
    return row ? rowToIngest(row) : null
  }
}
