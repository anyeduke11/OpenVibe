/**
 * scripts/report-endpoints-snapshot.ts —— 只读端点的**数据来源自述快照**（2026-10-31）。
 *
 * ## 它防的是什么
 *
 * 「哪些只读端点的结论取决于磁盘」这件事，若靠**人维护的清单**，
 * 就会出现「新增端点而忘了登记」⇒ 缓存闸完全看不见它。
 * 而闸的失效是**静默**的（它不报错，只是看不见新端点）⇒ 人以为闸在管着。
 *
 * ⇒ 唯一书写处改成**路由注册处**（每个 GET 端点用 `reportRoute(path, source)` 声明），
 *   本脚本从运行时路由表导出清单，判据测试比对快照与现值。
 *
 * ## 形态与仓内既有先例一致
 *
 * 与 `scripts/barrel-snapshot.ts`（主出口面快照）同款：**脚本生成 + 测试比对**。
 * 快照文件本身是**手写不可**的（它由脚本覆盖），但它的 diff 是「契约变更清单」，
 * 会出现在提交的 diff 里 ⇒ 审阅者看得见「新增了哪个端点、它是什么来源」。
 *
 * ## 用法
 *
 * - 重新生成：`pnpm report:snapshot`
 * - 核对（CI/本地）：`tests/report-endpoint-cache.test.ts` 自动比对，无需手动跑
 */
import { writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { buildApp } from '../apps/server/src/app'
import { isDiskDependentSource, type ReportEndpointDeclaration } from '@openvibe/shared'

const ROOT = process.cwd()
const OUT = join(ROOT, 'packages', 'shared', 'src', 'report-endpoints.ts')

/**
 * 采集路由注册处的自述。
 *
 * ⚠️ **必须在 `buildApp` 之前知道要采什么** —— 采集钩子是在路由注册时触发的，
 *   所以这里只能拿到「已注册完」的清单（`buildApp` 的返回值）。
 */
const { routeSources } = await buildApp({})

// 同一路径若被声明了两次（不可能，但守卫一下）：取第一条并报出来
const seen = new Set<string>()
const decls: ReportEndpointDeclaration[] = []
for (const s of routeSources) {
  if (seen.has(s.path)) {
    console.error(`✗ 路径被声明了两次：${s.path}（第一次来源 ${s.source}，这次 ${s.source}）`)
    process.exit(1)
  }
  seen.add(s.path)
  decls.push({
    path: s.path,
    source: s.source,
    ...(s.reason === undefined ? {} : { reason: s.reason }),
  })
}

decls.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))

// ⚠️ **磁盘态必须带理由**：这是「声明的判据是否写下」的机器检查点。
//   类型层已用重载强制（`reportRoute(p, 'filesystem')` 编译不过），
//   这里再查一遍是因为**快照文件可能被人手改过**（它是生成件，但没人拦得住直接编辑）。
const missingReason = decls.filter(
  (d) => isDiskDependentSource(d.source) && (d.reason === undefined || d.reason.trim() === ''),
)
if (missingReason.length > 0) {
  console.error('✗ 这些磁盘态端点的声明没有写理由（reason）：')
  for (const d of missingReason) console.error(`  · ${d.path}（${d.source}）`)
  process.exit(1)
}

const body = decls
  .map((d) =>
    d.reason === undefined
      ? `  { path: '${d.path}', source: '${d.source}' },`
      : `  { path: '${d.path}', source: '${d.source}', reason: '${d.reason.replace(/'/g, "\\'")}' },`,
  )
  .join('\n')

const file = `/**
 * **报告类端点的缓存口径**（2026-10-30；2026-10-31 改为服务端自述）。
 *
 * ⚠️ **本文件由脚本生成，不要手改**：\`pnpm report:snapshot\`（scripts/report-endpoints-snapshot.ts）。
 *   唯一书写处是**服务端路由注册处**（每个 GET 端点用 \`reportRoute(path, source)\` 声明），
 *   本清单是它的投影 —— 手改会在下一次生成时被覆盖。
 *
 * ## 判据
 *
 * **一个只读端点的结论里若含「某个磁盘路径现在还在不在」，
 * 它就是磁盘态报告 ⇒ 前端必须现算（mutation），不得走 query 缓存。**
 *
 * 真机实测（2026-10-30）踩到的正是后者：\`GET /api/skills/cleanup\` 的结论是
 * 「哪些 skill 的目录已经没了」，而它走了 15 秒的 query 缓存 ⇒
 * 用户删掉目录后再打开对话框，看到的仍是删除之前的快照
 * （服务端已返回 2 条，界面显示 0 条，刷新页面才对）。
 *
 * ## 三种来源各自意味着什么
 *
 * - \`db\`：**只读库表**。结论由数据库行决定 ⇒ 可以缓存。
 * - \`filesystem\`：**结论取决于磁盘当前的样子**（某个路径还在不在、目录里有什么）。
 *   ⇒ **不得缓存**，前端必须现算。
 * - \`mixed\`：**两者都有**（典型：库里记了路径，但要读那个路径才知道结论对不对）。
 *   ⇒ 按 \`filesystem\` 处理（宁可现算，不可吃旧快照）。
 *
 * ## 为什么来源由**人**声明而不是自动推导
 *
 * 自动推导（「哪个 handler 里调了 \`existsSync\`」）会给出**过宽**的结论：
 * 很多接口只是顺带读一下磁盘（拿个目录名、算个大小），
 * 它们的结论其实由库表决定 ⇒ 按自动推导会把它们全扫成「不能缓存」，
 * 闸就变成了噪音（而噪音的闸，人只会绕过它）。
 */

/**
 * 端点的数据来源（服务端在注册时声明）。
 *
 * - \`db\`：只读库表。
 * - \`filesystem\`：结论取决于磁盘当前的样子 ⇒ 前端不得缓存。
 * - \`mixed\`：库表 + 磁盘都有 ⇒ 按 \`filesystem\` 处理。
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
  /** 端点路径（带参数占位，如 \`/api/skills/:id/versions\`） */
  path: string
  /** 数据来源 */
  source: ReportDataSource
  /**
   * 「这个结论为什么会随磁盘变化」的一句话说明（2026-10-31）。
   *
   * ⚠️ **磁盘态来源（\`filesystem\` / \`mixed\`）必须给**，\`db\` 可省。
   *
   * ## 为什么要有它
   *
   * 声明只有 \`db\` / \`filesystem\` / \`mixed\` 三个值时，判对与否全靠写 handler 的人
   * 当时想清楚了。而这类判断最容易错在「看起来像库表、实际读了磁盘」的边界情形
   * （例如「库表里记了目录名，但要读那个目录才知道结论对不对」）。
   * ⇒ 后人复核时无从还原当时的依据，判错也无人发现。
   *
   * ⇒ 把依据**写在声明旁边**：它随清单落档（diff 里看得见），
   *   且判据测试会检查「磁盘态必须有非空理由」⇒ 忘了写就红。
   */
  reason?: string
}

/**
 * 只读端点的来源清单（**由快照脚本生成，不要手改**）。
 *
 * 生成：\`pnpm report:snapshot\`；核对：\`tests/report-endpoint-cache.test.ts\`。
 */
export const REPORT_ENDPOINT_SOURCES: readonly ReportEndpointDeclaration[] = [
${body}
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
`

writeFileSync(OUT, file, 'utf8')

/**
 * ⚠️ **生成件必须自己排版合规**：本文件是 `.ts`（会被 prettier 管），
 *   而带 `reason` 的长行会超 100 字符 ⇒ 手拼的模板串不是 prettier 格式
 *   ⇒ 每次重跑快照都会被 pre-commit 的排版闸拦下（闸是硬红线，绕不过去）。
 *
 * ⚠️ **为什么不在 `.prettierignore` 里豁免它**：豁免等于「生成件可以是任意排版」
 *   ⇒ 它的 diff 里会混着格式噪声，审阅者看不出「这次改了哪条声明」。
 *   仓内既有先例（`barrel-snapshot.ts` 生成 `.txt`）不撞这个闸，是因为
 *   **prettier 根本不处理 `.txt`** —— 不是因为它豁免了什么。
 *
 * ⇒ 做法：写盘后让 prettier 自己排一遍（**在同一个进程里**跑，
 *   避免再起一个 node 进程的启动开销）。
 */
const prettier = await import('prettier')
const formatted = await prettier.format(file, {
  parser: 'typescript',
  ...(await prettier.resolveConfig(OUT)),
})
if (formatted !== file) writeFileSync(OUT, formatted, 'utf8')

console.log(
  `端点来源快照：${String(decls.length)} 个只读端点（磁盘态 ${String(
    decls.filter((d) => d.source !== 'db').length,
  )} 个）→ ${relative(ROOT, OUT)}`,
)
