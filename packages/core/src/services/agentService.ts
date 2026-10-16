import {
  AGENT_INGEST_LIMITS,
  AppError,
  DEVLOG_TYPES,
  newId,
  REQUIREMENT_PRIORITIES,
  TASK_STATUS,
  type AgentIngestItemResult,
  type AgentIngestOne,
  type AgentIngestStatus,
  type DevLogEvidence,
  type DevLogType,
  type LocalEventKind,
  type TaskStatus,
} from '@openvibe/shared'
import type { SqliteDatabase } from '../db'
import { AgentIngestRepo, type AgentIngest } from '../repos/agentIngest'
import { DevLogRepo } from '../repos/devlog'
import { LocalEventsRepo } from '../repos/localEvents'
import { ProjectsRepo } from '../repos/projects'
import { TasksRepo } from '../repos/tasks'

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

  /* ======================================================================
   * 发布分发（FR-2.8 / FR-2.9 / FR-2.1.1）
   *
   * ⚠️ **这一段此前从未存在**：原先 `review` 只改 `agent_ingests.status`，
   * 人工确认后业务表里空无一物（dev-plan §4.2 的 🔴 行）。
   *
   * **三条不可让步的纪律**：
   * 1. **只在人工确认后落库**。`reviewIngest` 是唯一入口，且只在 pending → published
   *    的那一次触发 —— agent 自己的判断永远不是事实源（FR-2.5）。
   * 2. **非法值走 rejected，绝不扩列**。`tasks.status` 的三值闭集由既有迁移的
   *    CHECK 钉死，agent 上报 `blocked` 之类一律整条 rejected（FR-2.9）。
   * 3. **不改既有表形**。dev_log / check_state / task_status 全部走既有 repo 方法，
   *    连 `entry_no` 都不自己算（`DevLogRepo.create` 的事务分配）。
   * ==================================================================== */

  const devLog = new DevLogRepo(deps.db)
  const projects = new ProjectsRepo(deps.db)
  const tasks = new TasksRepo(deps.db)

  /**
   * 分发的判定依据是 `payload_json` 的**内容**，不是 `kind` 之外的东西 ——
   * 五种 kind 共用一个端点，差异全在载荷内部（FR-2.1）。
   *
   * ⚠️ **键名是本实现定的，不是抄来的**：实测 `packages/shared/src/schemas/agent.ts:16`
   * 的 `AgentPayload = z.record(z.string(), z.unknown())` **对每种 kind 一视同仁、不约束键名**，
   * 全仓也没有任何地方定义过这五种载荷的形状（`apps/cli` 的 agent 命令尚未落地，
   * spec 只写了落点、没写载荷契约）。所以这里按业务表列名取 camelCase 键，
   * 并**对缺失/非法一律 rejected**——宁可拒，不可猜着写坏数据。
   */
  function dispatchPublish(ingest: AgentIngest, now: string): DispatchResult {
    switch (ingest.kind) {
      case 'dev_log':
        return publishDevLog(ingest)
      case 'check_state':
        return publishCheckState(ingest)
      case 'task_status':
        return publishTaskStatus(ingest)
      case 'requirement':
        return publishRequirement(ingest, now)
      case 'session':
        // FR-2.8 / 2.9 / 2.1.1 三个落点**都没有 session 这一类**；`agent_sessions` 表
        // 在 0007 里建了，但全仓无任何写入路径（实测 `INSERT INTO agent_sessions` 命中 0）。
        // 故本 kind 发布时**只转状态、不落业务表** —— 这是登记在案的缺口，不是漏写。
        return { ok: true }
      default:
        return { ok: false, reason: `未知 kind：${String(ingest.kind)}` }
    }
  }

  /** FR-2.8：写既有 `dev_log_entries`，`type` 取 DEV|CHECK，`entry_no` 与时间戳都交给既有 repo */
  function publishDevLog(ingest: AgentIngest): DispatchResult {
    const p = recordOf(ingest.payload)
    if (!p) return reject('payload 不是对象，无法落 dev_log')
    // type 缺省 DEV：既有 `DevLogCreateInput.type` 是必填，缺省值由这一层补，
    // 否则上报方漏传一个可选字段就会把日志卡在队列里
    const type = textOf(p.type) || 'DEV'
    if (!isDevLogType(type)) {
      return reject(`dev_log 的 type 非法：${type}（既有闭集 DEV|CHECK，不扩列）`)
    }
    devLog.create(ingest.projectId, {
      type,
      title: textOf(p.title),
      body: textOf(p.body),
      relatedFiles: Array.isArray(p.relatedFiles)
        ? p.relatedFiles.filter((f): f is string => typeof f === 'string')
        : [],
      evidence: readEvidence(p.evidence),
    })
    return { ok: true }
  }

  /** FR-2.9：`check_state` → `project_check_states`（有行 = 已勾选，取消即删行） */
  function publishCheckState(ingest: AgentIngest): DispatchResult {
    const p = recordOf(ingest.payload)
    if (!p) return reject('payload 不是对象，无法落 check_state')
    const stageName = textOf(p.stageName).trim()
    const itemId = textOf(p.itemId).trim()
    if (!stageName) return reject('check_state 缺 stageName')
    if (!itemId) return reject('check_state 缺 itemId')
    // 缺省 true：agent 上报 check_state 这件事本身就是在说「这条检查过了」；
    // 要取消勾选必须显式给 checked:false。`checkState` 自带 ON CONFLICT，重复发布收敛成一行
    projects.checkState(ingest.projectId, stageName, itemId, p.checked !== false)
    return { ok: true }
  }

  /** FR-2.9：`task_status` → `tasks.status`，三值闭集不扩列 */
  function publishTaskStatus(ingest: AgentIngest): DispatchResult {
    const p = recordOf(ingest.payload)
    if (!p) return reject('payload 不是对象，无法落 task_status')
    const taskId = textOf(p.taskId).trim()
    if (!taskId) return reject('task_status 缺 taskId')
    const status = textOf(p.status).trim()
    if (!isTaskStatus(status)) {
      // FR-2.9 明写：agent 上报 blocked / review 之类值一律 rejected，**不得扩列**。
      // 扩列要改既有迁移的 CHECK，属 A/B 级 —— 本层无权做，也不该偷偷做。
      return reject(`task_status 上报非法状态「${status}」：tasks.status 闭集 todo|doing|done 不扩列`)
    }
    const task = tasks.get(taskId)
    if (!task) return reject(`task_status 指向的任务不存在：${taskId}`)
    if (task.projectId !== ingest.projectId) {
      return reject(`task_status 的任务不属于本项目（跨项目写 refused）：${taskId}`)
    }
    // 追加到目标列末尾：目标列长度即「自身之外的兄弟数」，`move` 的 at 会夹到该长度，
    // 所以重复发布同一条也收敛到同一位置 —— 幂等由既有 move 语义提供，不另造去重表
    tasks.move(taskId, status, tasks.list(ingest.projectId, status).length)
    return { ok: true }
  }

  /**
   * FR-2.1.1：`requirement` → `requirements` 草稿。**status 恒为 `draft`，不接受载荷里的值** ——
   * FR-2.5 说得很直白：agent 的判断不可作为事实源，用户确认这条才算需求。
   *
   * ⚠️ **这里直接写 SQL 的原因**：`requirements` 表在 0007 建了，但**全仓没有任何 repo 写它**
   * （`ls packages/core/src/repos/` 无对应文件）。服务层持有 `deps.db`，
   * 新建 `RequirementsRepo` 超出本轮文件所有权，故在此落笔并登记。
   */
  function publishRequirement(ingest: AgentIngest, now: string): DispatchResult {
    const p = recordOf(ingest.payload)
    if (!p) return reject('payload 不是对象，无法落 requirement')
    const title = textOf(p.title).trim()
    if (!title) return reject('requirement 缺 title')
    const priority = textOf(p.priority).trim() || 'P2'
    if (!isRequirementPriority(priority)) {
      return reject(`requirement 的 priority 非法：${priority}（既有闭集 P0|P1|P2，不扩列）`)
    }
    // source_session_id 有外键指向 agent_sessions，而该表**全仓无写入路径**，
    // 所以上报方给的 id 几乎必然查不到 —— 硬塞会撞 FK 约束。查无此会话就落 NULL。
    const sessionId = ingest.sourceSessionId
    const sessionExists =
      !!sessionId &&
      !!deps.db.prepare('SELECT 1 AS ok FROM agent_sessions WHERE id = ?').get(sessionId)
    deps.db
      .prepare(
        `INSERT INTO requirements (id, project_id, title, detail, priority, status, source_session_id, created_at)
         VALUES (?, ?, ?, ?, ?, 'draft', ?, ?)`,
      )
      .run(
        newId('requirement'),
        ingest.projectId,
        title,
        textOf(p.detail),
        priority,
        sessionExists ? sessionId : null,
        now,
      )
    return { ok: true }
  }

  /**
   * Web 的人工裁决（owner 裁⑥：合并策略交给用户，服务层不给自动策略）。
   *
   * **分发只发生一次**：`pending → published` 的首次裁决才落业务表。
   * 重复 review（重复请求、误点两次）不再分发 —— 否则 `dev_log` 会多出一条日志、
   * `requirement` 会多出一条需求。已终态记录仍走既有 `review` 的状态更新语义，
   * `conflict` 仍由 repo 抛 `IDEMPOTENCY_CONFLICT`（既有行为不变）。
   *
   * **分发失败 ⇒ 整条 rejected 且业务表零写入**：不是抛错给前端，
   * 而是让这条回到队列里带一句 reject_reason，人能看见「为什么这条没落库」。
   */
  function reviewIngest(id: string, to: Extract<AgentIngestStatus, 'published' | 'rejected'>, reason: string | null): AgentIngest {
    const before = ingests.get(id)
    if (!before) throw new AppError('NOT_FOUND', `回流记录不存在：${id}`)

    if (to === 'published' && before.status === 'pending') {
      const result = dispatchPublish(before, deps.now().toISOString())
      if (!result.ok) {
        return ingests.review(id, 'rejected', result.reason, deps.now().toISOString())
      }
    }
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

/**
 * 分发结果：**失败一律带一句人能看懂的理由**，它会原样落进
 * `agent_ingests.reject_reason` —— 队列里看得见「为什么这条没落库」，
 * 比抛个 500 让前端转圈强。
 */
type DispatchResult = { ok: true } | { ok: false; reason: string }

function reject(reason: string): DispatchResult {
  return { ok: false, reason }
}

/** payload 的形状由上报方给（`AgentPayload` 是 `record<string, unknown>`），故逐字段收窄 */
function recordOf(payload: unknown): Record<string, unknown> | null {
  return payload !== null && typeof payload === 'object' && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : null
}

/** 非字符串一律当空串：宁可少写字段，也不把对象/数组原样塞进 TEXT 列 */
function textOf(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function isDevLogType(value: string): value is DevLogType {
  return (DEVLOG_TYPES as readonly string[]).includes(value)
}

function isTaskStatus(value: string): value is TaskStatus {
  return (TASK_STATUS as readonly string[]).includes(value)
}

function isRequirementPriority(value: string): boolean {
  return (REQUIREMENT_PRIORITIES as readonly string[]).includes(value)
}

/** `evidence` 是既有 DevLogEvidence（command + resultSummary），两字段齐了才带，否则不带 */
function readEvidence(value: unknown): DevLogEvidence | undefined {
  const e = recordOf(value)
  if (!e) return undefined
  const command = textOf(e.command)
  const resultSummary = textOf(e.resultSummary)
  return command && resultSummary ? { command, resultSummary } : undefined
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
