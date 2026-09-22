import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'

/**
 * 全树快照（m6b §7.1a 的 dry-run 零写入断言口径）：
 * 相对路径（恒用 `/` 分隔）→ 类型 / 内容 sha256 / mtime / 权限位。
 * 目录也进快照，所以「`.openvibe/` 未创建」与「多了一个空目录」都会被同一断言抓到。
 */
export interface TreeEntry {
  kind: 'file' | 'dir'
  sha256: string
  mtimeMs: number
  mode: number
}

export type TreeSnapshot = Record<string, TreeEntry>

const toRel = (root: string, abs: string): string => relative(root, abs).split(sep).join('/')

export function treeSnapshot(root: string): TreeSnapshot {
  const out: TreeSnapshot = {}
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name)
      const st = statSync(abs)
      if (entry.isDirectory()) {
        out[toRel(root, abs)] = { kind: 'dir', sha256: '', mtimeMs: st.mtimeMs, mode: 0 }
        walk(abs)
        continue
      }
      out[toRel(root, abs)] = {
        kind: 'file',
        sha256: createHash('sha256').update(readFileSync(abs)).digest('hex'),
        mtimeMs: st.mtimeMs,
        mode: st.mode & 0o777,
      }
    }
  }
  const rootStat = statSync(root)
  out['.'] = { kind: 'dir', sha256: '', mtimeMs: rootStat.mtimeMs, mode: rootStat.mode & 0o777 }
  walk(root)
  return out
}

/** 快照差异（断言失败时人读用）：只列出新增/删除/变化的路径 */
export function treeDiff(before: TreeSnapshot, after: TreeSnapshot): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  const lines: string[] = []
  for (const key of [...keys].sort()) {
    const a = before[key]
    const b = after[key]
    if (!a) lines.push(`+ ${key}`)
    else if (!b) lines.push(`- ${key}`)
    else if (a.sha256 !== b.sha256 || a.mtimeMs !== b.mtimeMs) lines.push(`~ ${key}`)
  }
  return lines
}

/** 测试内同步写文件（自动建父目录），返回绝对路径 */
export function putFile(projectDir: string, relPath: string, content: string): string {
  const abs = join(projectDir, relPath)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, content, 'utf8')
  return abs
}
