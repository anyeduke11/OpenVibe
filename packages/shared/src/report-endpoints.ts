/**
 * **报告类端点的缓存口径**（2026-10-30；2026-10-31 改为服务端自述）。
 *
 * ⚠️ **本文件由脚本生成，不要手改**：`pnpm report:snapshot`（scripts/report-endpoints-snapshot.ts）。
 *   唯一书写处是**服务端路由注册处**（每个 GET 端点用 `reportRoute(path, source)` 声明），
 *   本清单是它的投影 —— 手改会在下一次生成时被覆盖。
 *
 * ## 判据
 *
 * **一个只读端点的结论里若含「某个磁盘路径现在还在不在」，
 * 它就是磁盘态报告 ⇒ 前端必须现算（mutation），不得走 query 缓存。**
 *
 * 真机实测（2026-10-30）踩到的正是后者：`GET /api/skills/cleanup` 的结论是
 * 「哪些 skill 的目录已经没了」，而它走了 15 秒的 query 缓存 ⇒
 * 用户删掉目录后再打开对话框，看到的仍是删除之前的快照
 * （服务端已返回 2 条，界面显示 0 条，刷新页面才对）。
 *
 * ## 三种来源各自意味着什么
 *
 * - `db`：**只读库表**。结论由数据库行决定 ⇒ 可以缓存。
 * - `filesystem`：**结论取决于磁盘当前的样子**（某个路径还在不在、目录里有什么）。
 *   ⇒ **不得缓存**，前端必须现算。
 * - `mixed`：**两者都有**（典型：库里记了路径，但要读那个路径才知道结论对不对）。
 *   ⇒ 按 `filesystem` 处理（宁可现算，不可吃旧快照）。
 *
 * ## 为什么来源由**人**声明而不是自动推导
 *
 * 自动推导（「哪个 handler 里调了 `existsSync`」）会给出**过宽**的结论：
 * 很多接口只是顺带读一下磁盘（拿个目录名、算个大小），
 * 它们的结论其实由库表决定 ⇒ 按自动推导会把它们全扫成「不能缓存」，
 * 闸就变成了噪音（而噪音的闸，人只会绕过它）。
 */

/**
 * 端点的数据来源（服务端在注册时声明）。
 *
 * - `db`：只读库表。
 * - `filesystem`：结论取决于磁盘当前的样子 ⇒ 前端不得缓存。
 * - `mixed`：库表 + 磁盘都有 ⇒ 按 `filesystem` 处理。
 */
export type ReportDataSource = 'db' | 'filesystem' | 'mixed'

/** 磁盘态来源（结论取决于磁盘当前状态的那些） */
export const DISK_DEPENDENT_SOURCES: readonly ReportDataSource[] = ['filesystem', 'mixed']

/** 该来源是否意味着「结论随磁盘变化」⇒ 前端不得缓存 */
export function isDiskDependentSource(source: ReportDataSource): boolean {
  return DISK_DEPENDENT_SOURCES.includes(source)
}

/** 一条端点自述（快照里的一行） */
export interface ReportEndpointDeclaration {
  /** 端点路径（带参数占位，如 `/api/skills/:id/versions`） */
  path: string
  /** 数据来源 */
  source: ReportDataSource
}

/**
 * 只读端点的来源清单（**由快照脚本生成，不要手改**）。
 *
 * 生成：`pnpm report:snapshot`；核对：`tests/report-endpoint-cache.test.ts`。
 */
export const REPORT_ENDPOINT_SOURCES: readonly ReportEndpointDeclaration[] = [
  { path: '/api/ai/adoption', source: 'db' },
  { path: '/api/ai/extract/usage', source: 'db' },
  { path: '/api/cli/commands', source: 'db' },
  { path: '/api/extract/consents', source: 'db' },
  { path: '/api/extract/gate', source: 'db' },
  { path: '/api/flow-templates', source: 'db' },
  { path: '/api/injection-status', source: 'mixed' },
  { path: '/api/lang/findings', source: 'db' },
  { path: '/api/lang/interpret/capability', source: 'db' },
  { path: '/api/lang/interpret/providers', source: 'db' },
  { path: '/api/lang/modes', source: 'db' },
  { path: '/api/lang/resources', source: 'db' },
  { path: '/api/lang/resources/readme', source: 'db' },
  { path: '/api/lang/roadmap', source: 'db' },
  { path: '/api/lang/snippet', source: 'db' },
  { path: '/api/lang/snippets', source: 'db' },
  { path: '/api/lang/source/consent', source: 'db' },
  { path: '/api/lang/source/consents', source: 'db' },
  { path: '/api/lang/source/export', source: 'db' },
  { path: '/api/lang/source/share-by-provider', source: 'db' },
  { path: '/api/lang/source/share-daily', source: 'db' },
  { path: '/api/lang/source/share-summary', source: 'db' },
  { path: '/api/lang/topics', source: 'db' },
  { path: '/api/lang/topics/:id', source: 'db' },
  { path: '/api/local-events/summary', source: 'db' },
  { path: '/api/nav-counts', source: 'db' },
  { path: '/api/om', source: 'db' },
  { path: '/api/packs', source: 'db' },
  { path: '/api/packs/:id', source: 'db' },
  { path: '/api/packs/:id/exports', source: 'db' },
  { path: '/api/packs/:id/exports/:exportId/bundle', source: 'db' },
  { path: '/api/packs/:id/injections', source: 'db' },
  { path: '/api/playbooks', source: 'db' },
  { path: '/api/playbooks/search', source: 'db' },
  { path: '/api/projects', source: 'db' },
  { path: '/api/projects/:id', source: 'db' },
  { path: '/api/projects/:id/agent-ingests', source: 'db' },
  { path: '/api/projects/:id/check-states', source: 'db' },
  { path: '/api/projects/:id/context', source: 'db' },
  { path: '/api/projects/:id/devlog', source: 'db' },
  { path: '/api/projects/:id/devlog/export', source: 'db' },
  { path: '/api/projects/:id/injection-status', source: 'mixed' },
  { path: '/api/projects/:id/ports', source: 'filesystem' },
  { path: '/api/projects/:id/tasks', source: 'db' },
  { path: '/api/projects/:id/term-recommendations', source: 'db' },
  { path: '/api/prompts', source: 'db' },
  { path: '/api/prompts/:id', source: 'db' },
  { path: '/api/prompts/:id/versions', source: 'db' },
  { path: '/api/prompts/export', source: 'db' },
  { path: '/api/reflow-origin/:assetId', source: 'db' },
  { path: '/api/settings', source: 'db' },
  { path: '/api/settings/agent-write', source: 'db' },
  { path: '/api/settings/telemetry', source: 'db' },
  { path: '/api/skills', source: 'db' },
  { path: '/api/skills/:id/versions', source: 'db' },
  { path: '/api/skills/cleanup', source: 'filesystem' },
  { path: '/api/skills/duplicates', source: 'filesystem' },
  { path: '/api/skills/scan-roots', source: 'mixed' },
  { path: '/api/skills/scan-roots/defaults', source: 'filesystem' },
  { path: '/api/stats', source: 'db' },
  { path: '/api/telemetry/events', source: 'db' },
  { path: '/api/terms', source: 'db' },
  { path: '/api/terms/search', source: 'db' },
]

/**
 * 磁盘态报告端点路径清单（从自述清单里筛出来的**派生量**，不要手写）。
 *
 * ⚠️ 它是给前端与判据测试用的**筛选结果**，不是另一份登记 ——
 *   唯一书写处是服务端路由注册处。
 */
export const DISK_STATE_REPORT_ENDPOINTS: readonly string[] = REPORT_ENDPOINT_SOURCES.filter((e) =>
  isDiskDependentSource(e.source),
).map((e) => e.path)

/** 该端点是不是磁盘态报告（判据测试与前端调用点共用同一个判断） */
export function isDiskStateReport(endpoint: string): boolean {
  return DISK_STATE_REPORT_ENDPOINTS.includes(endpoint)
}
