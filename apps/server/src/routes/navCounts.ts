import type { FastifyInstance } from 'fastify'
import type { SqliteDatabase } from '@openvibe/core'
import type { NavCountsOut } from '@openvibe/shared'

/**
 * 侧栏角标聚合（V2 批 · `GET /api/nav-counts`）：六项 total 一次取全，
 * 前端不再为每个角标发一次请求。
 *
 * playbooks 取全量（`PlaybooksRepo.list()` 不按 status 过滤，m4 FR-2.1）——
 * 角标必须与「点进去能看到几个」同口径。
 * projects 只数非归档——`GET /api/projects` 默认就不返回归档（ProjectsRepo.list 的
 * includeArchived 默认 false，packages/core/src/repos/projects.ts:135-141），角标必须与
 * 「点进去能看到几个」同口径。其余五项与各自列表端点同为全量 COUNT(*)。
 */

export interface NavCountRouteDeps {
  db: SqliteDatabase
}

/**
 * 单条 SQL 出七格：标量子查询让 SQLite 一次扫完，避免循环里逐表往返。
 * 表名与 migrations 同源（prompts/terms/skills/flow_templates/projects/standard_packs）。
 */
const NAV_COUNTS_SQL = `
  SELECT
    (SELECT COUNT(*) FROM prompts) AS prompts,
    (SELECT COUNT(*) FROM terms) AS terms,
    (SELECT COUNT(*) FROM playbooks) AS playbooks,
    (SELECT COUNT(*) FROM skills) AS skills,
    (SELECT COUNT(*) FROM flow_templates) AS flows,
    (SELECT COUNT(*) FROM projects WHERE status != 'archived') AS projects,
    (SELECT COUNT(*) FROM standard_packs) AS packs
`

export function registerNavCountRoutes(app: FastifyInstance, deps: NavCountRouteDeps): void {
  app.get('/api/nav-counts', async (): Promise<NavCountsOut> => {
    const row = deps.db.prepare(NAV_COUNTS_SQL).get() as NavCountsOut
    return row
  })
}
