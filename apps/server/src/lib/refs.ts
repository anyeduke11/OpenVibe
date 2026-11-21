import type { SqliteDatabase } from '@openvibe/core'
import { referencedPackNames as coreReferencedPackNames } from '@openvibe/core'

/**
 * 引用探测（m1 §6.3 / m6a §6.2）。
 *
 * ⚠️ **本文件自 2026-11-20 起是再导出薄壳**：实现迁到 `@openvibe/core` 的 `repos/refs.ts`
 * （F-1 · service-layer.md FR-3 的服务层收敛——删除资产要「查引用 → 删 → 记台账」，
 * 这条编排属领域规则，留在 server 层就无法被服务层复用）。
 * 既有 import 路径与行为**一字未变**；本文件保留是为了不打断既有引用面。
 */
export function referencedPackNames(
  db: SqliteDatabase,
  assetId: string,
  selectionKey: 'promptIds' | 'termIds' | 'skillIds' | 'playbookIds',
): string[] {
  return coreReferencedPackNames(db, assetId, selectionKey)
}
