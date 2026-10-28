/**
 * `packages/core/src/source-scan/files.ts` —— **被扫描文件的枚举**
 *
 * ## 它做什么
 *
 * 列出项目根下某类扩展名的文件，**只给相对路径**。
 *
 * ## ⚠️ 为什么「枚举」放在 TS 侧而不是助手侧
 *
 * ① **限流**：文件清单要有个上限（本仓默认 20000 个）——
 *   助手自己 walk 就没法在「超限时**部分完成**」与「直接中止」之间做选择；
 *   而 §3.8.2 的纪律是「不许静默」⇒ 超限必须变成一条**显式告警**。
 * ② **跳过规则只留一处**（§3.6 纪律：同一事实不散在两处）——
 *   助手（Go）与启发式路径（TS）用的是**同一份**文件清单。
 * ③ **绝对路径不进助手**：助手拿到的就是相对路径 ⇒ DL-23 从产生那一刻就成立。
 */
import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/** 扫描时跳过的目录名（vendor / 构建产物 / 缓存 / 版本库）。 */
export const SCAN_SKIP_DIRS: readonly string[] = [
  'node_modules',
  'dist',
  'build',
  'vendor',
  'testdata',
  '__pycache__',
  '.git',
  '.idea',
  '.vscode',
  '.venv',
  'venv',
  '.tox',
  '.mypy_cache',
  '.pytest_cache',
  '.ruff_cache',
  'site-packages',
  'target',
  'out',
]

/** 默认的文件数上限（超过就**截断并告警**，不静默）。 */
export const DEFAULT_MAX_FILES = 20_000

/** 枚举的结果（含**是否被截断**）。 */
export interface FileListing {
  /** 相对项目根的路径（**分隔符统一 `/`**） */
  files: string[]
  /** ⚠️ 是否因为超过上限而被**截断**（true ⇒ 必须显式告知用户） */
  truncated: boolean
}

/**
 * 列出项目根下带指定扩展名的文件（**相对路径**，按字典序）。
 *
 * @param root 项目根（绝对路径）
 * @param ext 扩展名（含点，例 `.py`）
 * @param maxFiles 上限
 */
export function listSourceFiles(
  root: string,
  ext: string,
  maxFiles = DEFAULT_MAX_FILES,
): FileListing {
  const out: string[] = []
  let truncated = false
  const walk = (dir: string): void => {
    if (out.length >= maxFiles) {
      truncated = true
      return
    }
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const name of entries.sort()) {
      if (name.startsWith('.')) continue
      const abs = join(dir, name)
      let st
      try {
        st = statSync(abs)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        if (SCAN_SKIP_DIRS.includes(name)) continue
        walk(abs)
        if (out.length >= maxFiles) {
          truncated = true
          return
        }
      } else if (name.endsWith(ext)) {
        out.push(relative(root, abs).split(/[\\/]/u).join('/'))
        if (out.length >= maxFiles) {
          truncated = true
          return
        }
      }
    }
  }
  walk(root)
  out.sort()
  return { files: out, truncated }
}
