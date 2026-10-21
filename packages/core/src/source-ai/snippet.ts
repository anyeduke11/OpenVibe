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
import type { SnippetFailureReason } from '@openvibe/shared'

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

/**
 * 一次片段读取的**结果**。
 *
 * ⚠️ `window` 与 `failure` **互斥**：读到了就没有失败原因，读不到就必须有原因
 *   （「读不到」而不说为什么，等于让用户自己去猜）。
 */
export interface SnippetReadResult {
  /** 读到的窗口（读不到时为 `null`） */
  window: SnippetWindow | null
  /** 读不到的原因（读到时为 `null`） */
  failure: SnippetFailureReason | null
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
 * @returns id → 读取结果（读不到时 `window` 为 `null` 且 `failure` 说明了原因）
 */
export function readSnippets(
  root: string,
  rows: readonly { id: number; file_rel_path: string; line: number }[],
): Map<number, SnippetReadResult> {
  const out = new Map<number, SnippetReadResult>()
  for (const r of rows.slice(0, SNIPPET_MAX_FILES)) {
    out.set(r.id, readSnippet(root, r.file_rel_path, r.line))
  }
  for (const r of rows.slice(SNIPPET_MAX_FILES)) {
    out.set(r.id, { window: null, failure: 'not_loaded' })
  }
  return out
}

/**
 * 读命中行附近的一段源码（**本地读**）。
 *
 * ## ⚠️ 为什么失败要**给原因**，而不是回 `null`
 *
 * 只回 `null` 的话，界面只能说「读不到」⇒ 用户分不清是文件被删了、
 * 还是文件被改短了（行号越界）、还是当前项目根与扫描时不是同一个
 * ⇒ 这几种情况用户该做的动作完全不同（重新扫描 / 换项目 / 缩小范围）。
 *
 * ⚠️ **行号越界不再夹逼**：命中行号来自扫描时的事实，文件被改短了就该**如实说**
 *   —— 夹到文件末尾等于把**另一行**当成命中行给用户看（那是在骗人）。
 *
 * @param root 项目根（绝对路径）
 * @param relPath 相对项目根的路径
 * @param line 命中行（1 起）
 * @param opts 窗口上下行数
 * @returns 读取结果（读不到时 `window` 为 `null`、`failure` 给出原因）
 */
export function readSnippet(
  root: string,
  relPath: string,
  line: number,
  opts: { before?: number; after?: number } = {},
): SnippetReadResult {
  if (!isAbsolute(root)) return { window: null, failure: 'unreadable' }
  if (relPath === '' || isAbsolute(relPath)) return { window: null, failure: 'out_of_project' }
  // ⚠️ `..` 一律拒（越界读文件是最危险的形态）
  if (relPath.split(/[\\/]/u).includes('..')) {
    return { window: null, failure: 'out_of_project' }
  }

  const abs = resolve(join(root, relPath))
  const rootNorm = root.endsWith(sep) ? root.slice(0, -1) : root
  if (abs !== rootNorm && !abs.startsWith(rootNorm + sep)) {
    return { window: null, failure: 'out_of_project' }
  }

  let stat
  try {
    stat = statSync(abs)
  } catch {
    return { window: null, failure: 'file_missing' }
  }
  if (!stat.isFile()) return { window: null, failure: 'file_missing' }
  if (stat.size > SNIPPET_MAX_BYTES) return { window: null, failure: 'too_large' }

  let text: string
  try {
    text = readFileSync(abs, 'utf8')
  } catch {
    return { window: null, failure: 'unreadable' }
  }
  const all = text.split('\n')
  // ⚠️ **行号越界 ⇒ 如实报**（不夹逼：夹了就是把别的行当成命中行给用户看）
  if (!Number.isFinite(line) || line < 1 || line > all.length) {
    return { window: null, failure: 'line_out_of_range' }
  }
  const hit = Math.floor(line)
  const before = opts.before ?? SNIPPET_CONTEXT_LINES
  const after = opts.after ?? SNIPPET_CONTEXT_LINES
  const start = Math.max(1, hit - before)
  const end = Math.min(all.length, hit + after)
  // ⚠️ 窗口过长 ⇒ 从**命中行**往两边收（保证命中行在窗口里）
  const cappedStart = Math.max(start, end - SNIPPET_MAX_LINES + 1)
  return {
    window: {
      path: relPath,
      start_line: cappedStart,
      end_line: end,
      lines: all.slice(cappedStart - 1, end),
    },
    failure: null,
  }
}
