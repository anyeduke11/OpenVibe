import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * 文件差异核对的通用工具（DEV-0220 抽出）。
 *
 * ## 为什么需要它
 *
 * 「这个文件的改动是不是只有登记的那几处」是一条**通用**判据 —— `styles.ts` 需要，
 * `layout.tsx` 也需要。两处各写一遍 `git diff` 解析必然漂（Rule：三处及以上调用必须抽取）。
 *
 * ## 两种判据，用途不同
 *
 * - **diff 判据**（`diffVsHead`）：与 `HEAD` 比，断言改动行**恰为**登记集合。
 *   只在这批改动**未提交**时成立 —— 提交后 `git diff` 为空，闸无对象。
 *   用途：**提交前**拦住「混进未登记的改动」。
 * - **快照判据**（`matchesSnapshot`）：与落盘的快照文件比，断言**全文逐字一致**。
 *   提交前后都成立（快照跟着提交走）⇒ **常驻**。
 *   用途：任何改动（含已提交的）都必须与快照一致，改动即红并提示重新生成。
 *
 * ⚠️ 两者**不可互相替代**：diff 判据会随提交失效，快照判据会随任何改动报红。
 *   同一个文件通常**同时**挂两条 —— diff 管「这一笔干净」，快照管「此后不漂」。
 */

// ⚠️ 本文件在 `tests/support/` 下 ⇒ 上**两级**才是仓根（写成一级会指向 `tests/`，
//   所有 `repoPath('apps/...')` 都会解析成 `tests/apps/...` 而 ENOENT）
const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..', '..')

export interface DiffLines {
  added: string[]
  removed: string[]
}

/**
 * 取 `git diff` 的新增/删除行（不含 `+++`/`---` 头）。
 *
 * ⚠️ 用 `--no-color` 与 `-U0`：上下文为 0 时拿到的是**纯改动行**，
 *   与「逐行等值」判据对齐；带上下文会让「未改的行」混进来。
 *
 * ⚠️ **工作树干净时返回 `null`，不返回空数组** —— 两种状态必须分开：
 *   - `null`：文件与 HEAD 一致（改动已提交）⇒ 调用方应跳过 diff 判据；
 *   - `{added:[], removed:[]}`：文件被移动/删除导致取不到差异 ⇒ 报错。
 *   混同会让「已提交」被误判成「差异为空、闸通过」，而实际上闸根本没在判。
 *
 * @param relPath 相对仓库根的路径，用正斜杠（Windows 兼容，见项目约定）
 */
export function diffVsHead(relPath: string): DiffLines | null {
  const out = execFileSync('git', ['diff', '--no-color', '-U0', '--', relPath], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  })
  if (out.trim() === '') return null
  const added: string[] = []
  const removed: string[] = []
  for (const line of out.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) continue
    if (line.startsWith('+')) added.push(line.slice(1))
    else if (line.startsWith('-')) removed.push(line.slice(1))
  }
  return { added, removed }
}

/**
 * 断言「diff 的新增/删除行集合与登记集合等值」。
 *
 * 用**排序后比对**而非逐位置比对 —— diff 的 hunk 顺序取决于改动位置，
 * 与登记顺序无关；位置比对会在「两处改动互换先后」时报假红。
 *
 * @returns 不符时的说明（供直接抛或拼进 expect 消息）；相符返回 `null`
 */
export function diffMismatch(
  diff: DiffLines,
  expectedAdded: readonly string[],
  expectedRemoved: readonly string[],
): string | null {
  const added = [...diff.added].sort()
  const removed = [...diff.removed].sort()
  const expAdded = [...expectedAdded].sort()
  const expRemoved = [...expectedRemoved].sort()

  const extraAdded = diff.added.filter((l) => !expectedAdded.includes(l))
  const missingAdded = expectedAdded.filter((l) => !diff.added.includes(l))
  const extraRemoved = diff.removed.filter((l) => !expectedRemoved.includes(l))

  if (extraAdded.length === 0 && missingAdded.length === 0 && extraRemoved.length === 0) {
    // 还要确认「数量一致」—— 集合相同但重复行数不同（例如同一行重复两次）也要报
    if (added.length === expAdded.length && removed.length === expRemoved.length) return null
  }

  return (
    `新增行：登记 ${expAdded.length} 行，实得 ${added.length} 行；` +
    `多出的行：${extraAdded.join(' / ') || '（无）'}；` +
    `缺掉的行：${missingAdded.join(' / ') || '（无）'}。` +
    `删除行：登记 ${expRemoved.length} 行，实得 ${removed.length} 行；` +
    `多出的行：${extraRemoved.join(' / ') || '（无）'}`
  )
}

/**
 * 读文件全文，与快照逐字比对。
 *
 * @returns 相符返回 `null`；不符返回带**首个差异行号**的说明
 */
export function snapshotMismatch(absPath: string, snapshotPath: string): string | null {
  const live = readFileSync(absPath, 'utf8')
  const snap = readFileSync(snapshotPath, 'utf8')
  if (live === snap) return null

  const liveLines = live.split('\n')
  const snapLines = snap.split('\n')
  for (let i = 0; i < Math.max(liveLines.length, snapLines.length); i++) {
    if (liveLines[i] !== snapLines[i]) {
      return (
        `第 ${i + 1} 行起与快照不一致。\n` +
        `  快照：${snapLines[i] ?? '（无此行）'}\n` +
        `  当前：${liveLines[i] ?? '（无此行）'}\n` +
        `  （快照共 ${snapLines.length} 行，当前 ${liveLines.length} 行）`
      )
    }
  }
  return '内容不同（逐行比对未定位到差异，可能是行尾符差异）'
}

/** 仓库根的绝对路径（给需要读文件的地方用） */
export function repoPath(relPath: string): string {
  return join(REPO_ROOT, ...relPath.split('/'))
}
