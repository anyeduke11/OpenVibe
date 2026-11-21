import type { SqliteDatabase } from '../db'

/**
 * 引用探测（m1 §6.3 / m6a §6.2）：扫描 standard_packs.selection 中某资产 id 的引用包名。
 * 包已物化内容快照，删除源资产不破坏包体，仅在响应头 X-Referenced-Packs 提示用户。
 *
 * ## 为什么迁到 core（F-1 · service-layer.md FR-3）
 *
 * 迁移前本函数在 `apps/server/src/lib/refs.ts`，被三个路由各 import 一次。它是**领域规则**
 * （「这个资产被哪些标准包选中」），不是传输层的东西——留在 server 的 lib 里，服务层就无法
 * 复用它，于是资产删除的编排（引用检查 → 删除 → 记台账）只能各路由各写一遍。
 * 迁到 core 后：实现处数从 1 保持为 1（不是从 1 变成 2），而调用方从「路由」扩到「服务层」。
 *
 * `apps/server/src/lib/refs.ts` 保留为**再导出**（既有 import 路径不破，行为零变化）。
 */
export function referencedPackNames(
  db: SqliteDatabase,
  assetId: string,
  selectionKey: 'promptIds' | 'termIds' | 'skillIds' | 'playbookIds',
): string[] {
  const rows = db.prepare('SELECT name, selection FROM standard_packs').all() as {
    name: string
    selection: string
  }[]
  const names: string[] = []
  for (const row of rows) {
    try {
      const sel = JSON.parse(row.selection) as Record<string, unknown>
      const ids = sel[selectionKey]
      if (Array.isArray(ids) && ids.includes(assetId)) names.push(row.name)
    } catch {
      // selection 损坏的包不参与引用判定
    }
  }
  return names.sort()
}
