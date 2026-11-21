import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  AppError,
  TaskCreateInput,
  TaskUpdateInput,
  TASK_STATUS,
  type TaskStatus,
} from '@openvibe/shared'
import {
  createTask,
  deleteTask,
  getProject,
  listTasks,
  moveTask,
  updateTask,
  type SqliteDatabase,
} from '@openvibe/core'
import { parseOrThrow } from '../lib/validate'
import { reportRoute } from '../lib/route-source'

export interface TaskRouteDeps {
  db: SqliteDatabase
}

/** 拖拽落点：目标列 + 列内序号（序号语义见 TasksRepo.move） */
const MoveBody = z.object({
  status: z.enum(TASK_STATUS),
  order: z.number().int().min(0),
})

/** dev-plan §3.6 两端点族（看板列内排序与跨列移动共用 PATCH /api/tasks/:id） */
export function registerTaskRoutes(app: FastifyInstance, deps: TaskRouteDeps): void {
  app.get('/api/projects/:id/tasks', reportRoute('/api/projects/:id/tasks', 'db'), async (req) => {
    const { id } = req.params as { id: string }
    if (!getProject({ db: deps.db }, id)) throw new AppError('NOT_FOUND', `项目不存在: ${id}`)
    const { status } = req.query as { status?: unknown }
    const all = listTasks({ db: deps.db }, id)
    const items =
      typeof status === 'string' && (TASK_STATUS as readonly string[]).includes(status)
        ? all.filter((t) => t.status === (status as TaskStatus))
        : all
    return { items, total: items.length }
  })

  app.post('/api/projects/:id/tasks', async (req, reply) => {
    const { id } = req.params as { id: string }
    const input = parseOrThrow(TaskCreateInput, req.body)
    return reply.code(201).send(createTask({ db: deps.db }, id, input))
  })

  app.patch('/api/tasks/:id', async (req) => {
    const { id } = req.params as { id: string }
    const body = req.body as Record<string, unknown> | undefined
    // 拖拽请求固定带 status+order；其余为标题/阶段编辑，两套语义都走这一份 PATCH
    if (typeof body?.status === 'string' && body.order !== undefined) {
      const { status, order } = parseOrThrow(MoveBody, body)
      return moveTask({ db: deps.db }, id, status, order)
    }
    return updateTask({ db: deps.db }, id, parseOrThrow(TaskUpdateInput, body))
  })

  app.delete('/api/tasks/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    deleteTask({ db: deps.db }, id)
    return reply.code(204).send()
  })
}
