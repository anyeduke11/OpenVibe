import { isAbsolute } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { AppError, ProjectCreateInput, ProjectUpdateInput } from '@openvibe/shared'
import {
  ProjectsRepo,
  checkLocalPath,
  readInjectionStatus,
  type SqliteDatabase,
} from '@openvibe/core'
import { parseOrThrow } from '../lib/validate'

export interface ProjectRouteDeps {
  db: SqliteDatabase
}

/**
 * localPath 必须是绝对路径：注入状态只读 `<localPath>/.openvibe/pack.lock.json`，
 * 相对路径会随进程 cwd 漂移，等于把读取目标交给环境（m5 FR-1.3 / §6.1）。
 */
function assertLocalPath(localPath: string | null | undefined): void {
  if (typeof localPath === 'string' && localPath !== '' && !isAbsolute(localPath)) {
    throw new AppError('VALIDATION_ERROR', 'localPath 必须是绝对路径', {
      fieldErrors: { localPath: ['需要绝对路径'] },
    })
  }
}

const StageBody = z.object({ stageName: z.string().min(1) })

const CheckStateBody = z.object({
  stageName: z.string().min(1),
  itemId: z.string().min(1),
  checked: z.boolean(),
})

/** dev-plan §3.5 六端点 + 健康摘要内联（列表/详情都带，删除确认框据此显示「将删除 N 条日志」） */
export function registerProjectRoutes(app: FastifyInstance, deps: ProjectRouteDeps): void {
  const projects = new ProjectsRepo(deps.db)

  app.get('/api/projects', async (req) => {
    const { status } = req.query as { status?: unknown }
    let items = projects.list().map((p) => ({ ...p, health: projects.healthSummary(p.id) }))
    if (typeof status === 'string' && status !== '' && status !== 'all') {
      if (status === 'archived') {
        items = projects
          .list({ includeArchived: true })
          .filter((p) => p.status === 'archived')
          .map((p) => ({ ...p, health: projects.healthSummary(p.id) }))
      } else {
        items = items.filter((p) => p.status === status)
      }
    }
    return { items, total: items.length }
  })

  app.post('/api/projects', async (req, reply) => {
    const input = parseOrThrow(ProjectCreateInput, req.body)
    assertLocalPath(input.localPath)
    const project = projects.create(input)
    const check = checkLocalPath(project.localPath)
    return reply
      .code(201)
      .send({ ...project, health: projects.healthSummary(project.id), localPathWarning: check.warning ?? null })
  })

  app.get('/api/projects/:id', async (req) => {
    const { id } = req.params as { id: string }
    const project = projects.get(id)
    if (!project) throw new AppError('NOT_FOUND', `项目不存在: ${id}`)
    return { ...project, health: projects.healthSummary(id) }
  })

  app.patch('/api/projects/:id', async (req) => {
    const { id } = req.params as { id: string }
    const patch = parseOrThrow(ProjectUpdateInput, req.body)
    assertLocalPath(patch.localPath)
    const project = projects.update(id, patch)
    const check = checkLocalPath(project.localPath)
    return { ...project, health: projects.healthSummary(id), localPathWarning: check.warning ?? null }
  })

  // 级联由外键保证；不触碰 localPath 目录内任何文件（m5 §6.5）
  app.delete('/api/projects/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    projects.delete(id)
    return reply.code(204).send()
  })

  app.post('/api/projects/:id/stages/current', async (req) => {
    const { id } = req.params as { id: string }
    const { stageName } = parseOrThrow(StageBody, req.body)
    projects.switchStage(id, stageName)
    const project = projects.get(id)
    if (!project) throw new AppError('NOT_FOUND', `项目不存在: ${id}`)
    return { ...project, health: projects.healthSummary(id) }
  })

  /** 清单勾选持久化（m5 FR-3.2 / §7.4）：PUT 幂等，取消即删除登记行 */
  app.get('/api/projects/:id/check-states', async (req) => {
    const { id } = req.params as { id: string }
    if (!projects.get(id)) throw new AppError('NOT_FOUND', `项目不存在: ${id}`)
    const items = projects.listCheckStates(id)
    return { items, total: items.length }
  })

  app.put('/api/projects/:id/check-states', async (req) => {
    const { id } = req.params as { id: string }
    const project = projects.get(id)
    if (!project) throw new AppError('NOT_FOUND', `项目不存在: ${id}`)
    const { stageName, itemId, checked } = parseOrThrow(CheckStateBody, req.body)
    const stage = project.stagesSnapshot.find((s) => s.name === stageName)
    if (!stage) throw new AppError('VALIDATION_ERROR', `阶段不存在于快照: ${stageName}`)
    if (!stage.checklist.some((item) => item.id === itemId)) {
      throw new AppError('VALIDATION_ERROR', `检查项不存在于该阶段: ${itemId}`)
    }
    projects.checkState(id, stageName, itemId, checked)
    return { checkStates: projects.listCheckStates(id), health: projects.healthSummary(id) }
  })

  app.get('/api/projects/:id/injection-status', async (req) => {
    const { id } = req.params as { id: string }
    const project = projects.get(id)
    if (!project) throw new AppError('NOT_FOUND', `项目不存在: ${id}`)
    return readInjectionStatus({
      localPath: project.localPath,
      registered: { packId: project.standardPackId, version: project.standardPackVersion },
    })
  })
}
