import { DevLogRepo } from '../repos/devlog'
import { ProjectsRepo } from '../repos/projects'
import { TasksRepo } from '../repos/tasks'
import type { SqliteDatabase } from '../db'
import type {
  DevLogCreateInput,
  DevLogOut,
  ProjectCreateInput,
  ProjectOut,
  ProjectUpdateInput,
  TaskCreateInput,
  TaskOut,
  TaskStatus,
  TaskUpdateInput,
} from '@openvibe/shared'

/**
 * 项目域服务（F-1 · service-layer.md FR-3 的服务层收敛）。
 *
 * ## 为什么项目、任务、开发日志三个域放一个文件
 *
 * 三个域的路由形态同构且**互相引用**：`tasks.ts` 与 `devlog.ts` 都要先确认项目存在
 * （`projects.get(id)` 不存在就 404），而项目路由自己要算健康摘要。
 * 若拆三个服务文件，这三个文件之间会互相 import——服务层之间互相依赖是 spec 明确要避免的
 * （FR-4.1 的 zone 是「禁向上依赖」，服务层互相调会让依赖方向失去意义）。
 * 放在一个文件里，它们共享同一个 `ProjectsRepo` 实例，依赖是**文件内**的。
 *
 * ## 边界
 *
 * - FR-1.3 传输无关；FR-1.2 deps 显式。
 * - **项目健康摘要（healthSummary）留在服务层**：它是「项目 + 任务 + 日志」三处的聚合，
 *   放在项目路由里就等于路由知道另外两个域的表结构。
 */

export interface ProjectServiceDeps {
  db: SqliteDatabase
}

// ── 项目 ────────────────────────────────────────────────────────────────

export function listProjects(
  deps: ProjectServiceDeps,
  options?: Parameters<ProjectsRepo['list']>[0],
): ProjectOut[] {
  return new ProjectsRepo(deps.db).list(options)
}

export function getProject(deps: ProjectServiceDeps, id: string): ProjectOut | null {
  return new ProjectsRepo(deps.db).get(id)
}

export function createProject(deps: ProjectServiceDeps, input: ProjectCreateInput): ProjectOut {
  return new ProjectsRepo(deps.db).create(input)
}

export function updateProject(
  deps: ProjectServiceDeps,
  id: string,
  patch: ProjectUpdateInput,
): ProjectOut {
  return new ProjectsRepo(deps.db).update(id, patch)
}

export function deleteProject(deps: ProjectServiceDeps, id: string): void {
  new ProjectsRepo(deps.db).delete(id)
}

/** 项目健康摘要（项目 + 任务 + 日志三处的聚合） */
export function projectHealthSummary(
  deps: ProjectServiceDeps,
  id: string,
): ReturnType<ProjectsRepo['healthSummary']> {
  return new ProjectsRepo(deps.db).healthSummary(id)
}

/** 阶段切换（写动作：切到另一个阶段才生效） */
export function switchProjectStage(deps: ProjectServiceDeps, id: string, stageName: string): void {
  new ProjectsRepo(deps.db).switchStage(id, stageName)
}

/** 检查项勾选态的写入（覆盖写语义由 repo 承担） */
export function setProjectCheckState(
  deps: ProjectServiceDeps,
  id: string,
  stageName: string,
  itemId: string,
  checked: boolean,
): void {
  new ProjectsRepo(deps.db).checkState(id, stageName, itemId, checked)
}

/** 检查项勾选态的读取 */
export function listProjectCheckStates(
  deps: ProjectServiceDeps,
  id: string,
): ReturnType<ProjectsRepo['listCheckStates']> {
  return new ProjectsRepo(deps.db).listCheckStates(id)
}

// ── 任务 ────────────────────────────────────────────────────────────────

export function listTasks(
  deps: ProjectServiceDeps,
  projectId: string,
  status?: TaskStatus,
): TaskOut[] {
  return new TasksRepo(deps.db).list(projectId, status)
}

export function getTask(deps: ProjectServiceDeps, id: string): TaskOut | null {
  return new TasksRepo(deps.db).get(id)
}

export function createTask(
  deps: ProjectServiceDeps,
  projectId: string,
  input: TaskCreateInput,
): TaskOut {
  return new TasksRepo(deps.db).create(projectId, input)
}

export function updateTask(deps: ProjectServiceDeps, id: string, patch: TaskUpdateInput): TaskOut {
  return new TasksRepo(deps.db).update(id, patch)
}

/** 任务移动（改状态 + 排序位） */
export function moveTask(
  deps: ProjectServiceDeps,
  id: string,
  status: TaskStatus,
  targetIndex: number,
): TaskOut {
  return new TasksRepo(deps.db).move(id, status, targetIndex)
}

export function deleteTask(deps: ProjectServiceDeps, id: string): void {
  new TasksRepo(deps.db).delete(id)
}

// ── 开发日志 ────────────────────────────────────────────────────────────

export function listDevLogs(
  deps: ProjectServiceDeps,
  projectId: string,
  type?: DevLogCreateInput['type'],
): DevLogOut[] {
  return new DevLogRepo(deps.db).list(projectId, type)
}

export function getDevLog(deps: ProjectServiceDeps, id: string): DevLogOut | null {
  return new DevLogRepo(deps.db).get(id)
}

export function createDevLog(
  deps: ProjectServiceDeps,
  projectId: string,
  input: DevLogCreateInput,
): DevLogOut {
  return new DevLogRepo(deps.db).create(projectId, input)
}

/** 日志导出（Markdown 形态） */
export function exportDevLogs(
  deps: ProjectServiceDeps,
  projectId: string,
  type: DevLogCreateInput['type'],
): string {
  return new DevLogRepo(deps.db).export(projectId, type)
}

/** 关联资产到日志（回流写链：把一条日志与它产出的资产关联起来） */
export function linkDevLogAsset(deps: ProjectServiceDeps, entryId: string, assetId: string): void {
  new DevLogRepo(deps.db).linkAsset(entryId, assetId)
}

/** 资产回流来源反查（回流时反推这条日志是从哪个包来的） */
export function reflowOriginFor(
  deps: ProjectServiceDeps,
  assetId: string,
): ReturnType<DevLogRepo['reflowOriginFor']> {
  return new DevLogRepo(deps.db).reflowOriginFor(assetId)
}
