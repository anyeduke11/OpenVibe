import { readFileSync } from 'node:fs'

/**
 * barrel 导出面解析器（v0.2.3 批次 C：tooling-face 闸自动生成 + 主出口快照共用）。
 *
 * 口径单源在此——barrel-audit.ts / tests/tooling-face.test.ts / tests/main-face-snapshot.test.ts
 * 三处消费同一份实现，谁也不得自带一份「按行数猜符号」的正则（那是对账闸自证失败的同型错误）。
 * 解析规则：`export { … } from '…'` 块内剥行注释；`type X` 记 isType；`X as Y` 的对外名是 Y。
 */
export interface ExportedName {
  name: string
  isType: boolean
  module: string
}

export function parseExportsOfFile(filePath: string): ExportedName[] {
  const src = readFileSync(filePath, 'utf8')
  const out: ExportedName[] = []
  const re = /export\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g
  for (const m of src.matchAll(re)) {
    const module = m[2] ?? ''
    const clause = (m[1] ?? '').replace(/\/\/[^\n]*/g, '')
    for (const raw of clause.split(',')) {
      let item = raw.trim()
      if (item === '') continue
      const isType = item.startsWith('type ')
      if (isType) item = item.slice(5).trim()
      const asMatch = /^(.+?)\s+as\s+(\w+)$/.exec(item)
      const name = asMatch ? (asMatch[2] ?? '') : item
      if (name !== '') out.push({ name, isType, module })
    }
  }
  return out
}

export function exportedNames(filePath: string): string[] {
  return parseExportsOfFile(filePath)
    .map((e) => e.name)
    .sort()
}
