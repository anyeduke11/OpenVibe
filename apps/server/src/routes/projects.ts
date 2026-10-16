import { existsSync, statSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  AppError,
  InjectionStatusQuery,
  ProjectCreateInput,
  ProjectUpdateInput,
  type InjectionStatusOut,
} from '@openvibe/shared'
import {
  PACK_LOCK_REL,
  ProjectsRepo,
  checkLocalPath,
  readInjectionStatus,
  type SqliteDatabase,
} from '@openvibe/core'
import { parseOrThrow } from '../lib/validate'
import { resolveLedger, type LedgerDeps } from '../lib/ledger'

export interface ProjectRouteDeps extends LedgerDeps {
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
  const ledger = resolveLedger(deps)

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
    // `flow_template_run` 的写入点（local-event-ledger FR-2.3 列的四类之一）。
    //
    // **为什么落在这里而不是新造一个「运行模板」端点**：`ProjectCreateInput.flowTemplateId`
    // 是**必填**的（project.ts:8），所以「开一个项目」在语义上已经就是「跑了一次这个模板」。
    // 台账 spec 曾把该 kind 记成「全仓没有跑模板的用户动作」—— 那是错的：前端 `FlowsPage`
    // 有 `onRun` 入口（问答运行对话框），而项目创建本身要求指定模板。真正缺的不是产品动作，
    // 是这个既成事实**在台账里没有落点**，于是模板被使用的频次一直不可见。
    //
    // 另建端点会造出第二次「同一次运行记两行」的入口，且与项目创建语义重复。
    ledger({
      kind: 'flow_template_run',
      subjectType: 'flow_template',
      subjectId: input.flowTemplateId,
      projectId: project.id,
      // payload 只放枚举（FR-6.3）：模板名与项目名同属可识别的自由文本，不入台账
      payload: { origin: 'user' },
    })
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

  /**
   * 清单勾选持久化（m5 FR-3.2 / §7.4）：PUT 幂等，取消即删除登记行。
   *
   * ⚠️ **幂等与「一次勾选记一条」会打架**：这个端点是 PUT，前端可重复调。
   * 直接在 handler 里记事件 ⇒ 用户把同一条勾了又取消再勾上，台账就多两条，
   * 而 §6.4 明确要求每个发射点自带去重说明。⇒ **只在状态真正翻转时记一条**。
   *
   * 取消勾选（`checked: false`）**不记**：`checklist_item_checked` 的语义是「已勾选」，
   * 记一条「取消」既不是这个 kind，也没法在读侧还原成同一件事。
   */
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
    const wasChecked = projects
      .listCheckStates(id)
      .some((c) => c.stageName === stageName && c.itemId === itemId)
    projects.checkState(id, stageName, itemId, checked)
    if (checked && !wasChecked) {
      // payload 只放枚举值（FR-6.3）：stageName 取自该项目的 stagesSnapshot，是阶段枚举不是项目名
      ledger({
        kind: 'checklist_item_checked',
        subjectType: 'checklist_item',
        subjectId: itemId,
        projectId: id,
        payload: { stage: stageName },
      })
    }
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

  /**
   * 目录版注入状态（onboarding FR-2.4 步骤③自动确认，T8b 的 D-5）：
   * 向导注入那一刻项目记录还不存在，Web 只能按绝对路径轮询 lock 文件。
   * 与 :id 版同一份 core 只读实现；只回 InjectionStatusOut，绝不列目录内容。
   */
  app.get('/api/injection-status', async (req): Promise<InjectionStatusOut> => {
    const { dir } = parseOrThrow(InjectionStatusQuery, req.query)
    if (!isAbsolute(dir)) {
      throw new AppError('VALIDATION_ERROR', 'dir 必须是绝对路径', {
        fieldErrors: { dir: ['需要绝对路径'] },
      })
    }
    if (!existsSync(dir)) throw new AppError('NOT_FOUND', `目录不存在: ${dir}`)
    if (!statSync(dir).isDirectory()) {
      throw new AppError('VALIDATION_ERROR', 'dir 不是目录', {
        fieldErrors: { dir: ['需要一个已存在的目录'] },
      })
    }
    // 尚未注入与 lock 损坏要分开报：readInjectionStatus 只认「读不到/解不开」这一种情形
    if (!existsSync(join(dir, PACK_LOCK_REL))) {
      return { lockPresent: false, error: `尚未注入（缺 ${PACK_LOCK_REL}）` }
    }
    return readInjectionStatus({ localPath: dir, registered: null })
  })
}
