import type { SqliteDatabase } from '../db'
import { nowIso } from '../db/runner'
import {
  AppError,
  newId,
  type ProjectCreateInput,
  type ProjectOut,
  type ProjectUpdateInput,
  type Stage,
} from '@openvibe/shared'
import { parseJsonColumn } from './util'

type ProjectRow = {
  id: string
  name: string
  local_path: string | null
  flow_template_id: string | null
  stages_snapshot: string
  current_stage: string | null
  status: string
  standard_pack_id: string | null
  standard_pack_version: string | null
  created_at: string
  updated_at: string
}

function rowToProject(row: ProjectRow): ProjectOut {
  return {
    id: row.id,
    name: row.name,
    localPath: row.local_path,
    flowTemplateId: row.flow_template_id,
    stagesSnapshot: parseJsonColumn<Stage[]>(row.stages_snapshot, []),
    currentStage: row.current_stage,
    status: row.status as ProjectOut['status'],
    standardPackId: row.standard_pack_id,
    standardPackVersion: row.standard_pack_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export interface ProjectHealthSummary {
  stage: string | null
  unchecked: number
  total: number
  lastLogAt: string | null
  /** 删除确认框需明示「将删除 N 条日志」（m5 §6.5），随摘要一并给出避免二次请求 */
  logCount: number
  taskCount: number
  injection: { packId: string | null; version: string | null }
}

export class ProjectsRepo {
  constructor(private readonly db: SqliteDatabase) {}

  /** 物化 stagesSnapshot（模板再改不破坏存量项目，design D10） */
  create(input: ProjectCreateInput): ProjectOut {
    const template = this.db
      .prepare('SELECT id, stages FROM flow_templates WHERE id = ?')
      .get(input.flowTemplateId) as { id: string; stages: string } | undefined
    if (!template) throw new AppError('NOT_FOUND', `流程模板不存在: ${input.flowTemplateId}`)
    const stages = parseJsonColumn<Stage[]>(template.stages, [])
    if (stages.length === 0) throw new AppError('VALIDATION_ERROR', '模板阶段为空')

    const id = newId('project')
    const ts = nowIso()
    this.db
      .prepare(
        `INSERT INTO projects (id, name, local_path, flow_template_id, stages_snapshot,
           current_stage, status, standard_pack_id, standard_pack_version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'active', NULL, NULL, ?, ?)`,
      )
      .run(
        id,
        input.name,
        input.localPath ?? null,
        template.id,
        JSON.stringify(stages),
        stages[0]?.name ?? null,
        ts,
        ts,
      )
    const project = this.get(id)
    if (!project) throw new AppError('INTERNAL', '创建后读取失败')
    return project
  }

  update(id: string, patch: ProjectUpdateInput): ProjectOut {
    const existing = this.get(id)
    if (!existing) throw new AppError('NOT_FOUND', `项目不存在: ${id}`)
    if (
      patch.currentStage !== undefined &&
      patch.currentStage !== null &&
      !existing.stagesSnapshot.some((s) => s.name === patch.currentStage)
    ) {
      throw new AppError('VALIDATION_ERROR', `阶段不存在于快照: ${patch.currentStage}`)
    }
    this.db
      .prepare(
        `UPDATE projects SET name=?, local_path=?, status=?, current_stage=?,
           standard_pack_id=?, standard_pack_version=?, updated_at=? WHERE id=?`,
      )
      .run(
        patch.name ?? existing.name,
        patch.localPath !== undefined ? patch.localPath : existing.localPath,
        patch.status ?? existing.status,
        patch.currentStage !== undefined ? patch.currentStage : existing.currentStage,
        patch.standardPackId !== undefined ? patch.standardPackId : existing.standardPackId,
        patch.standardPackVersion !== undefined
          ? patch.standardPackVersion
          : existing.standardPackVersion,
        nowIso(),
        id,
      )
    const project = this.get(id)
    if (!project) throw new AppError('INTERNAL', '更新后读取失败')
    return project
  }

  /** 删除项目级联 tasks/checkstates/devlog（外键保证），不触碰 localPath 目录（m5 §6.5） */
  delete(id: string): void {
    const info = this.db.prepare('DELETE FROM projects WHERE id = ?').run(id)
    if (info.changes === 0) throw new AppError('NOT_FOUND', `项目不存在: ${id}`)
  }

  get(id: string): ProjectOut | null {
    const row = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as
      | ProjectRow
      | undefined
    return row ? rowToProject(row) : null
  }

  /** 默认隐藏归档项目（m5 FR-1.4）；筛选归档需显式传 includeArchived */
  list(options: { includeArchived?: boolean } = {}): ProjectOut[] {
    const rows = (
      options.includeArchived
        ? this.db.prepare('SELECT * FROM projects ORDER BY updated_at DESC, id ASC').all()
        : this.db
            .prepare("SELECT * FROM projects WHERE status != 'archived' ORDER BY updated_at DESC, id ASC")
            .all()
    ) as ProjectRow[]
    return rows.map(rowToProject)
  }

  switchStage(id: string, stageName: string): void {
    const project = this.get(id)
    if (!project) throw new AppError('NOT_FOUND', `项目不存在: ${id}`)
    if (!project.stagesSnapshot.some((s) => s.name === stageName)) {
      throw new AppError('VALIDATION_ERROR', `阶段不存在于快照: ${stageName}`)
    }
    this.db
      .prepare('UPDATE projects SET current_stage=?, updated_at=? WHERE id=?')
      .run(stageName, nowIso(), id)
  }

  /** 勾选状态按项目持久化（m5 FR-3.2）；取消 = 删除记录 */
  checkState(id: string, stageName: string, itemId: string, checked: boolean): void {
    if (checked) {
      this.db
        .prepare(
          `INSERT INTO project_check_states (id, project_id, stage_name, item_id, checked_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(project_id, stage_name, item_id) DO UPDATE SET checked_at = excluded.checked_at`,
        )
        .run(newId('checkState'), id, stageName, itemId, nowIso())
    } else {
      this.db
        .prepare(
          'DELETE FROM project_check_states WHERE project_id=? AND stage_name=? AND item_id=?',
        )
        .run(id, stageName, itemId)
    }
    this.db.prepare('UPDATE projects SET updated_at=? WHERE id=?').run(nowIso(), id)
  }

  listCheckStates(id: string): { stageName: string; itemId: string; checkedAt: string }[] {
    const rows = this.db
      .prepare('SELECT stage_name, item_id, checked_at FROM project_check_states WHERE project_id=?')
      .all(id) as { stage_name: string; item_id: string; checked_at: string }[]
    return rows.map((r) => ({
      stageName: r.stage_name,
      itemId: r.item_id,
      checkedAt: r.checked_at,
    }))
  }

  /** 健康摘要（m5 §3：当前阶段 + 未勾/总检查项 + 最近日志 + 登记注入信息） */
  healthSummary(id: string): ProjectHealthSummary {
    const project = this.get(id)
    if (!project) throw new AppError('NOT_FOUND', `项目不存在: ${id}`)
    const checked = new Set(
      this.listCheckStates(id).map((c) => `${c.stageName}::${c.itemId}`),
    )
    let total = 0
    let unchecked = 0
    for (const stage of project.stagesSnapshot) {
      for (const item of stage.checklist) {
        total += 1
        if (!checked.has(`${stage.name}::${item.id}`)) unchecked += 1
      }
    }
    const lastLog = this.db
      .prepare('SELECT MAX(created_at) AS at FROM dev_log_entries WHERE project_id = ?')
      .get(id) as { at: string | null }
    const counts = this.db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM dev_log_entries WHERE project_id = ?) AS logs,
                (SELECT COUNT(*) FROM tasks WHERE project_id = ?) AS tasks`,
      )
      .get(id, id) as { logs: number; tasks: number }
    return {
      stage: project.currentStage,
      unchecked,
      total,
      lastLogAt: lastLog.at,
      logCount: counts.logs,
      taskCount: counts.tasks,
      injection: { packId: project.standardPackId, version: project.standardPackVersion },
    }
  }
}
