import type { FastifyInstance } from 'fastify'
import {
  AppError,
  SkillCreateInput,
  SkillRemoteImportInput,
  SkillRemoteSearchInput,
  SkillRetrackInput,
  SkillReviewInput,
  SkillScanInput,
  SkillUpdateCheckInput,
  SkillUpdateInput,
  type SkillRemoteImportReport,
  type SkillRetrackReport,
} from '@openvibe/shared'
import { SkillsRepo, type SqliteDatabase } from '@openvibe/core'
import { parseOrThrow } from '../lib/validate'
import {
  checkRemoteUpdates,
  importFromGithub,
  importFromSkillhub,
  retrackRemoteSkills,
  searchSkillhub,
} from '../lib/skill-remote'

export interface SkillRouteDeps {
  db: SqliteDatabase
  /** 远程取数实现注入点（测试 mock 上游；缺省全局 fetch，出站走 http-guard 守卫） */
  fetchImpl?: typeof fetch
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

  // 远程源（DEV-0067）：SkillHub 搜索 → 选 slug 导入；GitHub 整仓导入（ref 缺省=默认分支）
  app.post('/api/skills/remote/search', async (req) => {
    const input = parseOrThrow(SkillRemoteSearchInput, req.body)
    if (input.source !== 'skillhub') {
      throw new AppError('VALIDATION_ERROR', '远程搜索当前仅支持 skillhub 源')
    }
    return searchSkillhub(input.q, deps.fetchImpl)
  })

  app.post('/api/skills/remote/import', async (req) => {
    const input = parseOrThrow(SkillRemoteImportInput, req.body)
    const fetched =
      input.source === 'github'
        ? await importFromGithub(input.repo, input.ref, deps.fetchImpl, input.path)
        : await importFromSkillhub(input.slug, deps.fetchImpl)
    const report: SkillRemoteImportReport = {
      source: input.source,
      origin: fetched.origin,
      discovered: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      warnings: [...fetched.warnings],
    }
    for (const entry of fetched.entries) {
      report.discovered += 1
      report[skills.upsertRemote(entry)] += 1
    }
    return report
  })

  // 检查更新（DEV-0068）：树指纹对比，GitHub 整仓一次 trees 调用；ids 缺省=全部远程条目
  app.post('/api/skills/remote/check-updates', async (req) => {
    const { ids } = parseOrThrow(SkillUpdateCheckInput, req.body ?? {})
    const all = skills.list()
    const tracked = all
      .filter(
        (s) =>
          (s.source === 'github' || s.source === 'skillhub') &&
          (ids === undefined || ids.includes(s.id)),
      )
      .map((s) => ({
        skillId: s.id,
        name: s.name,
        source: s.source,
        remoteRef: s.remoteRef,
        remoteTreeHash: s.remoteTreeHash,
      }))
    return checkRemoteUpdates(tracked, deps.fetchImpl)
  })

  // 补档（DEV-0069）：未建档的存量远程条目按版本线溯源串重导一次，写树指纹
  app.post('/api/skills/remote/retrack', async (req) => {
    const { ids } = parseOrThrow(SkillRetrackInput, req.body ?? {})
    const candidates = skills
      .list()
      .filter(
        (s) =>
          (s.source === 'github' || s.source === 'skillhub') &&
          s.remoteRef === null &&
          (ids === undefined || ids.includes(s.id)),
      )
      .map((s) => {
        const versions = skills.versions(s.id)
        return {
          skillId: s.id,
          name: s.name,
          source: s.source,
          versionLabel: versions.at(-1)?.versionLabel ?? null,
        }
      })
    const report: SkillRetrackReport = { items: [], summary: { retracked: 0, failed: 0 } }
    const { results } = await retrackRemoteSkills(
      candidates,
      (entry) => {
        skills.upsertRemote(entry)
      },
      deps.fetchImpl,
    )
    for (const r of results) {
      report.items.push(r)
      report.summary[r.status] += 1
    }
    return report
  })

  // 重复整理报告（DEV-0067）：只报告不删，删除由客户端按 id 走既有 DELETE 逐条确认
  app.get('/api/skills/duplicates', async () => {
    return skills.duplicates()
  })

  // 内置审查（DEV-0067）：ids 缺省=全量；无本地目录的条目仅元数据审查
  app.post('/api/skills/review', async (req) => {
    const { ids } = parseOrThrow(SkillReviewInput, req.body ?? {})
    return skills.review(ids)
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
