/**
 * **报告类端点的缓存口径**（2026-10-30）。
 *
 * ## 它解决的是哪一类事故
 *
 * 本仓的只读报告接口有两类，混用缓存策略会出事：
 *
 * | 类别 | 结论取决于 | 能不能缓存 |
 * |---|---|---|
 * | **库表报告** | 数据库里的行 | 能 —— 行变了别的接口也会改它 |
 * | **磁盘态报告** | **文件系统当前的样子** | 不能 —— 目录可以在 OpenVibe 不知情时消失 |
 *
 * 真机实测（2026-10-30）踩到的正是后者：`GET /api/skills/cleanup` 的结论是
 * 「哪些 skill 的目录已经没了」，而它走了 15 秒的 query 缓存 ⇒
 * 用户删掉目录后再打开对话框，看到的仍是删除之前的快照
 * （服务端已返回 2 条，界面显示 0 条，刷新页面才对）。
 *
 * ## 判据（可判机器判的那条）
 *
 * **一个只读端点的结论里若含「某个磁盘路径现在还在不在」，
 * 它就是磁盘态报告 ⇒ 前端必须现算（mutation），不得走 query 缓存。**
 *
 * 判据的落地形式是**清单 + 判据测试**（`tests/report-endpoint-cache.test.ts`）：
 * 清单是单源（这里），测试扫 `apps/web/src/hooks/**` 里的 `useQuery` 调用，
 * 命中清单里的端点即判红。
 *
 * ## 为什么是清单而不是「扫描服务端代码自动推导」
 *
 * 自动推导（「哪个 handler 里调了 `existsSync`」）会给出**过宽**的结论：
 * 很多接口只是顺带读一下磁盘（拿个目录名、算个大小），
 * 它们的结论其实由库表决定 ⇒ 按自动推导会把它们全扫成「不能缓存」，
 * 闸就变成了噪音（而噪音的闸，人只会绕过它）。
 *
 * ⇒ 宁可**人工判定、显式登记**：清单里每一条都写清了「为什么它的结论取决于磁盘」。
 *   新增磁盘态报告时**必须**登记进来 —— 这条纪律由判据测试的反向检查兜住
 *   （清单里的端点必须真的被前端用，且必须走 mutation）。
 */

/**
 * 磁盘态报告端点清单：结论含「某个磁盘路径现在还在不在」。
 *
 * ⚠️ **登记即契约**：清单里的端点，前端必须用 mutation 现算，不得走 `useQuery`。
 *   判据测试会扫 `apps/web/src/hooks/**` 逐个核对。
 */
export const DISK_STATE_REPORT_ENDPOINTS = [
  /**
   * 清理失效条目的预检：逐条判「skill 目录还在不在」⇒ 目录随时会消失。
   * （真机实测踩到过：走 query 缓存 ⇒ 服务端 2 条 / 界面 0 条。）
   */
  '/api/skills/cleanup',
  /**
   * 重复整理报告：其中「失效目录」那一段判「本地目录还在不在」。
   */
  '/api/skills/duplicates',
] as const

export type DiskStateReportEndpoint = (typeof DISK_STATE_REPORT_ENDPOINTS)[number]

/** 该端点是不是磁盘态报告（判据测试与前端调用点共用同一个判断） */
export function isDiskStateReport(endpoint: string): boolean {
  return (DISK_STATE_REPORT_ENDPOINTS as readonly string[]).includes(endpoint)
}
