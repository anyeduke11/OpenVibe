import type { SqliteDatabase } from '../db'
import {
  AppError,
  newId,
  TASK_STATUS,
  type TaskCreateInput,
  type TaskOut,
  type TaskStatus,
  type TaskUpdateInput,
} from '@openvibe/shared'

type TaskRow = {
  id: string
  project_id: string
  title: string
  stage_name: string | null
  status: string
  order_: number
}

function rowToTask(row: TaskRow): TaskOut {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    stageName: row.stage_name,
    status: row.status as TaskStatus,
    order: row.order_,
  }
}

function isTaskStatus(value: string): value is TaskStatus {
  return (TASK_STATUS as readonly string[]).includes(value)
}

export class TasksRepo {
  constructor(private readonly db: SqliteDatabase) {}

  create(projectId: string, input: TaskCreateInput): TaskOut {
    const title = input.title.trim()
    if (title === '') throw new AppError('VALIDATION_ERROR', '任务标题不能为空')
    this.assertProject(projectId)
    this.assertStage(projectId, input.stageName)

    const head = this.db
      .prepare(
        "SELECT COALESCE(MAX(order_), -1) + 1 AS n FROM tasks WHERE project_id = ? AND status = 'todo'",
      )
      .get(projectId) as { n: number }
    const id = newId('task')
    this.db
      .prepare('INSERT INTO tasks (id, project_id, title, stage_name, status, order_) VALUES (?,?,?,?,?,?)')
      .run(id, projectId, title, input.stageName ?? null, 'todo', head.n)
    return this.mustGet(id)
  }

  list(projectId: string, status?: TaskStatus): TaskOut[] {
    const rows = (
      status
        ? this.db
            .prepare('SELECT * FROM tasks WHERE project_id = ? AND status = ? ORDER BY order_, id')
            .all(projectId, status)
        : this.db
            .prepare(
              'SELECT * FROM tasks WHERE project_id = ? ORDER BY status, order_, id',
            )
            .all(projectId)
    ) as TaskRow[]
    return rows.map(rowToTask)
  }

  get(id: string): TaskOut | null {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined
    return row ? rowToTask(row) : null
  }

  /** 元数据编辑；status/order 走 move 语义（拖拽即改列 + 重排） */
  update(id: string, patch: TaskUpdateInput): TaskOut {
    const existing = this.mustGet(id)
    if (patch.title !== undefined) {
      const title = patch.title.trim()
      if (title === '') throw new AppError('VALIDATION_ERROR', '任务标题不能为空')
      this.db.prepare('UPDATE tasks SET title = ? WHERE id = ?').run(title, id)
    }
    if (patch.stageName !== undefined) {
      this.assertStage(existing.projectId, patch.stageName ?? undefined)
      this.db
        .prepare('UPDATE tasks SET stage_name = ? WHERE id = ?')
        .run(patch.stageName, id)
    }
    if (patch.status !== undefined || patch.order !== undefined) {
      return this.move(id, patch.status ?? existing.status, patch.order ?? existing.order)
    }
    return this.mustGet(id)
  }

  /**
   * 移动到目标列的 targetIndex 位（索引以「自身移出后」的列序计，源列同步收缩重编号）。
   * m5 FR-4.1 的列内拖拽与跨列拖拽共用此入口，前端不必自己算 order。
   */
  move(id: string, status: TaskStatus, targetIndex: number): TaskOut {
    if (!isTaskStatus(status)) throw new AppError('VALIDATION_ERROR', `任务状态非法: ${status}`)
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined
    if (!row) throw new AppError('NOT_FOUND', `任务不存在: ${id}`)

    const source = row.status
    this.db.transaction(() => {
      const destIds = this.columnIds(row.project_id, status, id)
      const at = Math.max(0, Math.min(Number.isFinite(targetIndex) ? targetIndex : destIds.length, destIds.length))
      destIds.splice(at, 0, id)
      this.renumber(row.project_id, status, destIds)
      if (source !== status) this.renumber(row.project_id, source, this.columnIds(row.project_id, source, id))
    })()
    return this.mustGet(id)
  }

  delete(id: string): void {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined
    if (!row) throw new AppError('NOT_FOUND', `任务不存在: ${id}`)
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM tasks WHERE id = ?').run(id)
      this.renumber(row.project_id, row.status, this.columnIds(row.project_id, row.status, id))
    })()
  }

  private columnIds(projectId: string, status: string, exceptId: string): string[] {
    return (
      this.db
        .prepare(
          'SELECT id FROM tasks WHERE project_id = ? AND status = ? AND id != ? ORDER BY order_, id',
        )
        .all(projectId, status, exceptId) as { id: string }[]
    ).map((r) => r.id)
  }

  private renumber(projectId: string, status: string, orderedIds: string[]): void {
    const stmt = this.db.prepare('UPDATE tasks SET status = ?, order_ = ? WHERE id = ?')
    orderedIds.forEach((taskId, index) => stmt.run(status, index, taskId))
  }

  private assertProject(projectId: string): void {
    const row = this.db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)
    if (!row) throw new AppError('NOT_FOUND', `项目不存在: ${projectId}`)
  }

  /** 建卡时阶段必须在快照内；快照后续变更造成的旧名由 UI 归入「已移除阶段」（m5 §6.2） */
  private assertStage(projectId: string, stageName?: string): void {
    if (stageName === undefined || stageName === null || stageName === '') return
    const project = this.db.prepare('SELECT stages_snapshot FROM projects WHERE id = ?').get(
      projectId,
    ) as { stages_snapshot: string } | undefined
    const stages = (JSON.parse(project?.stages_snapshot ?? '[]') as { name: string }[]) ?? []
    if (!stages.some((s) => s.name === stageName)) {
      throw new AppError('VALIDATION_ERROR', `阶段不存在于项目快照: ${stageName}`)
    }
  }

  private mustGet(id: string): TaskOut {
    const task = this.get(id)
    if (!task) throw new AppError('INTERNAL', `任务写入后读取失败: ${id}`)
    return task
  }
}
