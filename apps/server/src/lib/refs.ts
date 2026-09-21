import type { SqliteDatabase } from '@openvibe/core'

/**
 * 引用探测（m1 §6.3 / m6a §6.2）：扫描 standard_packs.selection 中某资产 id 的引用包名。
 * 包已物化内容快照，删除源资产不破坏包体，仅在响应头 X-Referenced-Packs 提示用户。
 */
export function referencedPackNames(
  db: SqliteDatabase,
  assetId: string,
  selectionKey: 'promptIds' | 'termIds' | 'skillIds',
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
