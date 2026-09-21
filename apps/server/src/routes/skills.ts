import type { FastifyInstance } from 'fastify'
import { AppError, SkillCreateInput, SkillScanInput, SkillUpdateInput } from '@openvibe/shared'
import { SkillsRepo, type SqliteDatabase } from '@openvibe/core'
import { parseOrThrow } from '../lib/validate'

export interface SkillRouteDeps {
  db: SqliteDatabase
}

/** 量小（本地 skill 台账），name/description 过滤在内存做，不引入 SQL LIKE 分支 */
function matchQuery(query: string, text: string): boolean {
  return text.toLowerCase().includes(query.toLowerCase())
}

/** dev-plan §3.2 五端点 + 扫描（Web 按钮与 CLI `scan --skills` 打同一入口，m2 §5） */
export function registerSkillRoutes(app: FastifyInstance, deps: SkillRouteDeps): void {
  const skills = new SkillsRepo(deps.db)

  app.get('/api/skills', async (req) => {
    const { q } = req.query as { q?: unknown }
    // 列表要显示版本数（m2 FR-3.1）：台账量小，逐条 count 比新增端点划算
    const all = skills.list().map((s) => ({ ...s, versionCount: skills.versions(s.id).length }))
    const items =
      typeof q === 'string' && q.trim() !== ''
        ? all.filter((s) => matchQuery(q.trim(), s.name) || matchQuery(q.trim(), s.description))
        : all
    return { items, total: items.length }
  })

  app.post('/api/skills', async (req, reply) => {
    const input = parseOrThrow(SkillCreateInput, req.body)
    return reply.code(201).send(skills.create(input))
  })

  // 静态段先于 :id 匹配（find-my-way 优先级）
  app.post('/api/skills/scan', async (req) => {
    const { roots } = parseOrThrow(SkillScanInput, req.body ?? {})
    return skills.scan(roots)
  })

  app.get('/api/skills/:id/versions', async (req) => {
    const { id } = req.params as { id: string }
    if (!skills.get(id)) throw new AppError('NOT_FOUND', `skill 不存在: ${id}`)
    const items = skills.versions(id)
    return { items, total: items.length }
  })

  app.patch('/api/skills/:id', async (req) => {
    const { id } = req.params as { id: string }
    const patch = parseOrThrow(SkillUpdateInput, req.body)
    return skills.update(id, patch)
  })

  app.delete('/api/skills/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    skills.delete(id)
    return reply.code(204).send()
  })
}
