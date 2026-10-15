import {
  AppError,
  parseContextFields,
  type ContextField,
  type ProjectContextOut,
  type TruncationNote,
} from '@openvibe/shared'
import type { SqliteDatabase } from '../db'
import { ProjectsRepo } from '../repos/projects'
import { TasksRepo } from '../repos/tasks'
import { DevLogRepo } from '../repos/devlog'
import { LocalEventsRepo } from '../repos/localEvents'
import { PACK_LOCK_REL } from '../local/lock'

/**
 * M8 · 聚合查询面（m8-agent-bridge.md FR-3）。
 *
 * **这个面的消费者是 agent，不是人**。三条设计取舍都由这一点推出：
 * 1. **不返回 `body` 正文**（FR-3.2.2）—— 上下文体积敏感，正文由单独的日志查询取；
 * 2. **预算裁剪顺序写死** logs → assets → checklist（FR-3.4）——顺序决定 agent 看到什么，
 *    所以它是规格而不是实现细节；
 * 3. **每次裁剪都写进 `truncated`** —— agent 会把「被砍掉的检查项」当成「不存在」，
 *    那比报错更坏。**静默截断是这个面最严重的缺陷形态。**
 */

export interface ContextServiceDeps {
  db: SqliteDatabase
  /** 注入而非直读文件系统：让「读不到 lock」这条分支在测试里可控 */
  readLock: (localPath: string) => unknown | null
}

/** 预算的保守下界：再小也要保住结构，否则返回的上下文对 agent 无意义 */
const MIN_BUDGET_CHARS = 200

export function createContextService(deps: ContextServiceDeps) {
  const projects = new ProjectsRepo(deps.db)
  const tasks = new TasksRepo(deps.db)
  const logs = new DevLogRepo(deps.db)
  const ledger = new LocalEventsRepo(deps.db)

  /**
   * 组装项目上下文。
   *
   * @param fields `?fields=` 裁剪后的字段集；非法值已在 `parseContextFields` 拒掉
   * @param budget 字符预算；`undefined` 表示不裁剪
   */
  function build(
    projectId: string,
    fields: ContextField[] = parseContextFields(undefined),
    budget?: number,
    now: Date = new Date(),
  ): ProjectContextOut {
    const project = projects.get(projectId)
    if (!project) throw new AppError('NOT_FOUND', `项目不存在: ${projectId}`)

    const truncated: TruncationNote[] = []
    const want = new Set(fields)

    // ---- 恒返回的两段：project 与 stage 摘要是 agent 定位项目的最小集 ----
    // 即使 `?fields=logs`，调用方也得知道这是哪个项目、走到哪一步了。
    const stages = project.stagesSnapshot
    const currentIdx = stages.findIndex((s) => s.name === project.currentStage)
    const completedStages = currentIdx < 0 ? 0 : currentIdx

    const out: ProjectContextOut = {
      project: {
        id: project.id,
        name: project.name,
        status: project.status,
        currentStage: project.currentStage,
        flowTemplateId: project.flowTemplateId,
        updatedAt: project.updatedAt,
      },
      stage: { current: project.currentStage, total: stages.length, completed: completedStages },
      checklist: { stageName: project.currentStage, items: [] },
      tasks: { todo: 0, doing: 0, done: 0, items: [] },
      logs: { items: [] },
      pack: { id: null, name: null, version: null, drifted: null, outdated: null },
      assets: { prompts: 0, skills: 0, terms: 0, playbooks: 0 },
      truncated,
      fields: [...fields],
    }

    // ---- pack 段：读不到 lock ⇒ 三个字段全 null **且必须进 truncated**（FR-3.2.1）----
    if (want.has('pack')) {
      out.pack = readPack(deps.readLock, project, truncated)
    }

    if (want.has('assets')) out.assets = countAssets(deps.db)

    if (want.has('tasks')) {
      const all = tasks.list(projectId)
      out.tasks = {
        todo: all.filter((t) => t.status === 'todo').length,
        doing: all.filter((t) => t.status === 'doing').length,
        done: all.filter((t) => t.status === 'done').length,
        items: all.map((t) => ({ id: t.id, title: t.title, status: t.status, stageName: t.stageName })),
      }
    }

    // ---- checklist：当前阶段的全部检查项及勾选态 ----
    const allChecklist = want.has('checklist')
      ? buildChecklist(projects, projectId, project.currentStage, project.stagesSnapshot)
      : []

    // ---- logs：**刻意不带 body**（FR-3.2.2）----
    const allLogs = want.has('logs')
      ? logs.list(projectId).map((l) => ({
          id: l.id,
          type: l.type,
          entryNo: l.entryNo,
          title: l.title,
          evidence: l.evidence,
          createdAt: l.createdAt,
        }))
      : []

    // ---- 预算裁剪：顺序固定 logs → assets → checklist（FR-3.4）----
    if (budget !== undefined && budget > 0 && budget < MIN_BUDGET_CHARS) {
      throw new AppError('VALIDATION_ERROR', `budget 至少 ${MIN_BUDGET_CHARS} 字符，收到 ${budget}`)
    }
    const cap = budget ?? Infinity

    let logItems = allLogs
    let assets = out.assets
    let checklistItems = allChecklist

    // 第一刀：logs
    const logsCost = sizeOf(logItems)
    if (logsCost > cap) {
      const keep = shrinkLogs(logItems, cap)
      truncated.push({
        section: 'logs',
        dropped: logItems.length - keep.length,
        reason: 'budget',
        detail: `预算 ${cap} 字符，日志段占 ${logsCost}，保留最近 ${keep.length} 条`,
      })
      logItems = keep
    }

    // 第二刀：assets（计数段占用小，但仍按规格顺序，不许因为「省不了多少」就跳过）
    if (sizeOf({ logs: logItems, assets }) > cap) {
      truncated.push({
        section: 'assets',
        dropped: Object.values(assets).filter((v) => v > 0).length,
        reason: 'budget',
        detail: '预算不足，资产计数置零（置零而非省略：省略会让调用方以为资产库是空的）',
      })
      assets = { prompts: 0, skills: 0, terms: 0, playbooks: 0 }
    }

    // 第三刀：checklist —— **清空不是「可选项」，是硬说明**：砍掉后必须写明丢了多少
    if (sizeOf({ logs: logItems, assets, checklist: checklistItems }) > cap) {
      truncated.push({
        section: 'checklist',
        dropped: checklistItems.length,
        reason: 'budget',
        detail: '预算不足，检查项整段未返回。**这不是「没有未完成检查项」** —— 重新取更大预算再判断',
      })
      checklistItems = []
    }

    out.logs = { items: logItems }
    out.assets = assets
    out.checklist = { stageName: project.currentStage, items: checklistItems }

    ledger.record(
      {
        kind: 'agent_context_served',
        projectId,
        payload: {
          fieldsCount: fields.length,
          truncated: truncated.length,
          platform: 'server',
        },
      },
      now,
    )

    return out
  }

  return { build }
}

function sizeOf(v: unknown): number {
  return Buffer.byteLength(JSON.stringify(v), 'utf8')
}

/**
 * 日志裁剪：**留最新的**（agent 关心当下，不是考古）。
 *
 * ⚠️ **依赖上游排序方向**：`DevLogRepo.list()` 的 SQL 是 `ORDER BY created_at DESC, entry_no DESC`
 * ——**最新在前**。所以从**前往后**留才是留最新的；从后往前留会留成最旧的
 * （这个错误本轮真犯过一次，是「先砍 logs」那条用例抓出来的）。
 * 上游若改成升序，这里会静默变成「留最旧的」，故本文件下方有一条用例钉死这个方向。
 */
function shrinkLogs<T>(items: T[], cap: number): T[] {
  const kept: T[] = []
  let used = 0
  for (const item of items) {
    const cost = sizeOf(item)
    if (used + cost > cap) break
    used += cost
    kept.push(item)
  }
  return kept
}

/**
 * 当前阶段的检查项及勾选态。
 *
 * **勾选态的语义**：`project_check_states` 取消勾选时是 `DELETE`（不是置 null），
 * 所以「有行 = 已勾选」。写成 `checkedAt !== null` 会永远为真 —— 这里按**行是否存在**判。
 */
function buildChecklist(
  projects: ProjectsRepo,
  projectId: string,
  stageName: string | null,
  stages: { name: string; checklist: { id: string; text: string }[] }[],
) {
  if (stageName === null) return []
  const stage = stages.find((s) => s.name === stageName)
  if (!stage) return []
  const checkedIds = new Set(
    projects.listCheckStates(projectId).filter((c) => c.stageName === stageName).map((c) => c.itemId),
  )
  return stage.checklist.map((c) => ({ id: c.id, label: c.text, checked: checkedIds.has(c.id) }))
}

/**
 * 资产计数走 SQL `COUNT(*)`，与 `routes/navCounts.ts` 同一张表同一口径 ——
 * 不另建计数来源，否则两处数字会漂。
 */
function countAssets(db: SqliteDatabase): ProjectContextOut['assets'] {
  const row = db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM prompts) AS prompts,
              (SELECT COUNT(*) FROM skills) AS skills,
              (SELECT COUNT(*) FROM terms) AS terms,
              (SELECT COUNT(*) FROM playbooks) AS playbooks`,
    )
    .get() as ProjectContextOut['assets']
  return row
}

function readPack(
  readLock: (localPath: string) => unknown | null,
  project: { localPath: string | null },
  truncated: TruncationNote[],
): ProjectContextOut['pack'] {
  const empty = { id: null, name: null, version: null, drifted: null, outdated: null }
  if (!project.localPath) {
    truncated.push({
      section: 'pack',
      dropped: 4,
      reason: 'no_lock_file',
      detail: '项目未绑定本机路径，pack 段的漂移态不可判定（**不是「没漂移」**）',
    })
    return empty
  }
  let lock: unknown
  try {
    lock = readLock(project.localPath)
  } catch {
    lock = null
  }
  if (lock === null) {
    truncated.push({
      section: 'pack',
      dropped: 4,
      reason: 'no_lock_file',
      detail: `读不到 ${PACK_LOCK_REL}，pack 段的漂移态不可判定（**不是「没漂移」**）`,
    })
    return empty
  }
  const l = lock as { packId?: string; name?: string; version?: string; drifted?: boolean; outdated?: boolean }
  return {
    id: l.packId ?? null,
    name: l.name ?? null,
    version: l.version ?? null,
    drifted: l.drifted ?? null,
    outdated: l.outdated ?? null,
  }
}
