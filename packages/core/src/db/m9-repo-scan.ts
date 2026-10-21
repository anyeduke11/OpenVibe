// `packages/core/src/db/m9-repo-scan.ts` —— 仓库源码扫描的**共用走法**
//
// ## 它是什么
//
// 一份「哪些源码文件要扫」的统一口径 —— 全仓否定式判据（DL-02 / DL-05 / DL-07 / DL-42）
// 都需要它，而每处各写一份就等于**口径散在多处**：改一次扫描范围要改 N 个文件，
// 漏一处就有一处守卫悄悄不扫了。
//
// ⇒ 本文件是**唯一**的走法；守卫只负责「扫什么内容」。
//
// ## ⚠️ 跳过的三类文件
//
// ① `*.test.ts` / `*.test.tsx` —— 变异腿的样本里**故意**写着被禁的形态；
// ② `node_modules` / `dist` / `build` —— 不是本仓的源码；
// ③ 目录读不到就跳过（沙箱里某些目录可能不可读）—— 不因为读不到就整个崩掉。
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** 要扫的扩展名。 */
export const SCAN_EXTENSIONS = ['.ts', '.tsx'] as const

/**
 * 全仓否定式判据要扫的源码根（相对仓库根）—— **单源**。
 *
 * ⚠️ **为什么不是整个仓库**：
 * - `docs/` 里本来就写着被禁的形态（那正是**规则说明**本身）⇒ 扫它等于把规则判红；
 * - `tests/` 里的变异腿样本**故意**写着被禁的形态 ⇒ 扫它等于把反证腿判红；
 * - `scripts/` 与 `docs/devlog-evidence/` 属外部源派生层，由 DL-02 的扫描器单独管。
 * ⇒ 「全仓」在本仓的可执行形态 = **产品源码这五个根**（DL-42 先定的口径）。
 */
export const SOURCE_SCAN_ROOTS: readonly string[] = [
  'apps/web/src',
  'apps/server/src',
  'apps/cli/src',
  'packages/shared/src',
  'packages/core/src',
]

/**
 * 走一遍若干源码根，收集要扫的文件。
 *
 * @param roots 相对仓库根的目录（相对路径）
 * @param repoRoot 仓库根（绝对路径）
 * @returns 绝对路径清单（**顺序按目录遍历顺序**，不保证字典序）
 */
export function walkSourceFiles(roots: readonly string[], repoRoot: string): string[] {
  const out: string[] = []
  for (const root of roots) walk(join(repoRoot, root), out)
  return out
}

/** 递归收集（跳过测试文件与构建目录）。 */
function walk(dir: string, out: string[]): void {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const name of entries) {
    const full = join(dir, name)
    let st: ReturnType<typeof statSync>
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist' || name === 'build') continue
      walk(full, out)
      continue
    }
    if (!SCAN_EXTENSIONS.some((ext) => name.endsWith(ext))) continue
    // ⚠️ 测试文件不扫 —— 变异腿的样本里**故意**写着那些形态
    if (name.endsWith('.test.ts') || name.endsWith('.test.tsx')) continue
    out.push(full)
  }
}
