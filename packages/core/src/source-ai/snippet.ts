/**
 * `packages/core/src/source-ai/snippet.ts` —— **片段的本地读取**（P5.1）
 * （`m9-dev-language-roadmap.md` §3.8 T1 硬要求 / §5.5）
 *
 * ## 它解决什么
 *
 * §3.8 对 T1 有两条硬要求（owner 裁定新增）：
 *
 * 1. **出网前必须展示「将要发送的确切内容」**，不是「你的代码片段」这种描述 ——
 *    用户要在**看到全文**的前提下勾选，否则「勾选」是在盲签。
 * 2. 「全都不发」这个选择必须能被记住，且随时可撤回。
 *
 * ⇒ 第 1 条意味着界面**必须能看到片段正文** ⇒ 需要一个**本地**读取口。
 * ⚠️ 这个读取**不出网**（它读的是用户本机的项目文件，显示在用户自己的屏幕上）。
 *
 * ## ⚠️ 读取边界（越权读文件是最危险的形态）
 *
 * - 路径**必须是相对项目根的**且**不含 `..`**；
 * - 解析后的绝对路径**必须仍在项目根内**（否则 `../` 越界）；
 * - 文件大小有上限（防止把巨型文件读进内存）。
 *
 * ⚠️ **P4 的扫描器已经保证命中路径是相对路径**（DL-23），
 *   但**读侧不能假设调用方守规矩** ⇒ 这里再兜一道（纵深防御）。
 */
import { readFileSync, statSync } from 'node:fs'
import { isAbsolute, join, resolve, sep } from 'node:path'

/** 片段窗口（一段本地源码）。 */
export interface SnippetWindow {
  /** 相对项目根的路径 */
  path: string
  /** 窗口起始行（1 起） */
  start_line: number
  /** 窗口结束行（1 起，含） */
  end_line: number
  /** 窗口内的正文（**逐行**；⚠️ 未脱敏 —— 这是**本地展示**用的） */
  lines: string[]
}

/** 读取窗口的默认上下行数。 */
export const SNIPPET_CONTEXT_LINES = 3

/** 单个片段的最大行数（防止一口气发出去一大段）。 */
export const SNIPPET_MAX_LINES = 40

/** 单个文件的最大字节数（超过就不读）。 */
export const SNIPPET_MAX_BYTES = 512 * 1024

/** 单次批量读取的最大文件数（⚠️ 超出的条目会返回 `null` ⇒ 界面显示「没加载」）。 */
export const SNIPPET_MAX_FILES = 100

/**
 * **批量**读命中附近的一段源码（一次请求读完，抽屉里每条命中都显示自己的窗口）。
 *
 * ⚠️ **为什么要有批量口**：§3.8 的 T1 硬要求是「出网前必须展示**将要发送的确切内容**」——
 *   用户要在**看到全文**的前提下勾选 ⇒ 内容必须在**勾选框旁边**一直显示。
 *   逐条点开的话，勾选框就摆在一个用户还没看过的内容旁边 ⇒ 那还是盲签。
 *
 * ⚠️ **上限**：一次最多读 `SNIPPET_MAX_FILES` 个文件（超出的**如实说**，
 *   不静默截断 —— 界面要能告诉用户「后面几条没加载」）。
 *
 * @param root 项目根（绝对路径）
 * @param rows 要读的命中（`id` ＋ 相对路径 ＋ 行号）
 * @returns id → 窗口（读不到的是 `null`）
 */
export function readSnippets(
  root: string,
  rows: readonly { id: number; file_rel_path: string; line: number }[],
): Map<number, SnippetWindow | null> {
  const out = new Map<number, SnippetWindow | null>()
  for (const r of rows.slice(0, SNIPPET_MAX_FILES)) {
    out.set(r.id, readSnippet(root, r.file_rel_path, r.line))
  }
  for (const r of rows.slice(SNIPPET_MAX_FILES)) {
    out.set(r.id, null)
  }
  return out
}

/**
 * 读命中行附近的一段源码（**本地读**）。
 *
 * @param root 项目根（绝对路径）
 * @param relPath 相对项目根的路径
 * @param line 命中行（1 起；越界会被夹逼）
 * @param opts 窗口上下行数
 * @returns 读不到时返回 `null`（**不抛** —— 界面要能显示「读不到」而不是整页崩）
 */
export function readSnippet(
  root: string,
  relPath: string,
  line: number,
  opts: { before?: number; after?: number } = {},
): SnippetWindow | null {
  if (!isAbsolute(root)) return null
  if (relPath === '' || isAbsolute(relPath)) return null
  // ⚠️ `..` 一律拒（越界读文件是最危险的形态）
  if (relPath.split(/[\\/]/u).includes('..')) return null

  const abs = resolve(join(root, relPath))
  const rootNorm = root.endsWith(sep) ? root.slice(0, -1) : root
  if (abs !== rootNorm && !abs.startsWith(rootNorm + sep)) return null

  let stat
  try {
    stat = statSync(abs)
  } catch {
    return null
  }
  if (!stat.isFile() || stat.size > SNIPPET_MAX_BYTES) return null

  let text: string
  try {
    text = readFileSync(abs, 'utf8')
  } catch {
    return null
  }
  const all = text.split('\n')
  const hit = Math.min(Math.max(Math.floor(line), 1), Math.max(all.length, 1))
  const before = opts.before ?? SNIPPET_CONTEXT_LINES
  const after = opts.after ?? SNIPPET_CONTEXT_LINES
  const start = Math.max(1, hit - before)
  const end = Math.min(all.length, hit + after)
  // ⚠️ 窗口过长 ⇒ 从**命中行**往两边收（保证命中行在窗口里）
  const cappedStart = Math.max(start, end - SNIPPET_MAX_LINES + 1)
  return {
    path: relPath,
    start_line: cappedStart,
    end_line: end,
    lines: all.slice(cappedStart - 1, end),
  }
}
