/**
 * 排版差异占比的量化（2026-10-30）。
 *
 * ## 它防的是哪一次事故
 *
 * 本仓发生过一次噪声：一次全仓 `prettier --write` 的重排被混进语义提交，
 * diff 里大量表格对齐改动**淹没了真正的语义行**。
 *
 * pre-commit 的闸三（排版闸）解决的是「排版不合规就不许提交」，
 * 但它管不到「**排版合了，却和大段语义改动混在同一批**」——
 * 那种提交照样会让 reviewer 找不到那一行语义改动。
 *
 * ⇒ 本脚本给闸三补一只眼睛：**这一笔里有多少比例是纯排版差异**。
 *
 * ## 口径（为什么用 git 自己的 whitespace 忽略能力）
 *
 * | 量 | 怎么算 | 含义 |
 * |---|---|---|
 * | 总改动行数 | `git diff --cached --numstat` 的 added + removed | 这一笔改了多少行 |
 * | 忽略空白后的改动行数 | `git diff --cached --ignore-all-space --numstat` 的 added + removed | **去掉纯空白差异后**还剩多少改动 ⇒ 即语义改动 |
 * | 纯排版差异行数 | 总改动 − 忽略空白后的改动 | 只差在空白上的那部分 |
 *
 * 为什么 prettier 对 Markdown 表格的列对齐正好落在这一格里：它只**加空格**，
 * 不改字符 ⇒ `--ignore-all-space` 之后那些行就消失了。
 *
 * ## 为什么只提示不拦截
 *
 * 作者可能**就是**想一次把某个文件排版做完（那是一次合理的提交）。
 * 拆不拆是他的判断 ⇒ 本闸只把占比摆出来，不替他决定。
 * 而「不合 prettier」仍然照旧拦截 —— 那是硬红线，与本提示无关。
 *
 * ## 新增 / 删除文件为什么不参与
 *
 * 新增文件在 HEAD 里没有对应版本，没有「旧排版」可比，对它算占比没有意义；
 * 删除文件同理。故两者都跳过。
 *
 * ## 阈值（为什么是两个条件都要满足）
 *
 * - 占比 **> 60%**：纯排版主导。
 * - 绝对行数 **> 30**：小文件即使全是空格差异也不值得提醒（改一行表格对齐是日常）。
 *
 * 两个条件同时满足才提示 ⇒ 既不放过「大文件里全是排版」，
 * 也不对「小文件里改了两格空格」聒噪。
 */
import { execFileSync } from 'node:child_process'

/** 占比阈值：纯排版行数 ÷ 总改动行数 超过它就提示 */
export const FORMAT_RATIO_THRESHOLD = 0.6

/** 绝对行数阈值：纯排版行数超过它才提示（避免小文件误报） */
export const FORMAT_LINES_THRESHOLD = 30

const GIT_TIMEOUT_MS = 5000

/** 一个文件的排版占比结论 */
export interface FormatDiffReport {
  path: string
  /** 总改动行数（added + removed） */
  totalLines: number
  /** 忽略空白后仍存在的改动行数 ⇒ 语义改动 */
  semanticLines: number
  /** 纯排版差异行数（总改动 − 语义改动） */
  formatLines: number
  /** 纯排版占比（0–1）；总改动为 0 时为 0 */
  ratio: number
}

/** 提示文本（空数组 = 没有需要提示的文件） */
export interface FormatDiffHint {
  path: string
  /** 占比百分比（整数，如 86 表示 86%） */
  percent: number
  formatLines: number
  totalLines: number
}

function git(repoRoot: string, args: string[]): string | null {
  try {
    return execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    return null
  }
}

/**
 * 取暂存区里每个文件的改动行数。
 *
 * ⚠️ **两次 numstat 调用**（一次带 `--ignore-all-space`、一次不带）：
 *   两次都是**一次性**取全量，不是逐文件跑 git ⇒ 提交前的闸不该自己拖慢提交。
 *
 * @param ignoreSpace 是否忽略行内空白差异
 * @returns 每个文件的改动行数；**null = git 不可用**（调用方须按「未知」处理，
 *   不能当成「零改动」—— 那会让每一个文件都被算成 100% 排版）。
 */
function numstatByPath(repoRoot: string, ignoreSpace: boolean): Map<string, number> | null {
  const args = ['diff', '--cached', '--numstat']
  if (ignoreSpace) args.push('--ignore-all-space')
  args.push('--diff-filter=ACMR')
  const out = git(repoRoot, args)
  if (out === null) return null
  const map = new Map<string, number>()
  for (const line of out.split('\n')) {
    if (line.trim() === '') continue
    // 格式：<added>\t<removed>\t<path>
    // ⚠️ 二进制文件是 `-\t-\t<path>` ⇒ 跳过（没有「行」的概念）。
    const parts = line.split('\t')
    if (parts.length < 3) continue
    const added = Number(parts[0])
    const removed = Number(parts[1])
    if (!Number.isFinite(added) || !Number.isFinite(removed)) continue
    const path = parts.slice(2).join('\t')
    map.set(path, (map.get(path) ?? 0) + added + removed)
  }
  return map
}

/**
 * 算出每个已改文件的排版占比。
 *
 * ⚠️ **「语义 map 里没有这个文件」的正确读法是「它没有语义改动」**，
 *   不是「不知道」—— 用 `--ignore-all-space` 时，纯空白差异的文件会**整个消失**。
 *   早先把它当成「未知」而回退成总改动行数 ⇒ 每个文件都被算成 0% 排版，
 *   整道闸静默失效（而它看起来是「什么都没报」＝「一切正常」）。
 *
 * @param repoRoot 仓库根
 */
export function collectFormatDiffReports(repoRoot: string): FormatDiffReport[] {
  const total = numstatByPath(repoRoot, false)
  if (total === null) return []
  const semantic = numstatByPath(repoRoot, true)
  const reports: FormatDiffReport[] = []
  for (const [path, totalLines] of total) {
    if (totalLines === 0) continue // 纯重命名：没有内容差异
    // semantic 为 null（git 不可用）⇒ 按「未知」处理：语义改动取总改动 ⇒ 占比 0（不提示）
    const semanticLines =
      semantic === null ? totalLines : Math.min(semantic.get(path) ?? 0, totalLines)
    const formatLines = totalLines - semanticLines
    reports.push({
      path,
      totalLines,
      semanticLines,
      formatLines,
      ratio: formatLines / totalLines,
    })
  }
  return reports
}

/**
 * 从报告里挑出「需要提示」的文件。
 *
 * ⚠️ **两个条件都要满足**：占比超阈 **且** 纯排版绝对行数超阈。
 */
export function pickFormatHints(
  reports: readonly FormatDiffReport[],
  ratioThreshold = FORMAT_RATIO_THRESHOLD,
  linesThreshold = FORMAT_LINES_THRESHOLD,
): FormatDiffHint[] {
  return reports
    .filter((r) => r.ratio > ratioThreshold && r.formatLines > linesThreshold)
    .map((r) => ({
      path: r.path,
      percent: Math.round(r.ratio * 100),
      formatLines: r.formatLines,
      totalLines: r.totalLines,
    }))
}

/** 提示的渲染（人话 + 可执行建议） */
export function renderFormatHints(hints: readonly FormatDiffHint[]): string {
  const lines: string[] = []
  for (const h of hints) {
    lines.push(
      `  · ${h.path}：纯排版差异 ${String(h.formatLines)} 行 / 共 ${String(h.totalLines)} 行改动（${String(h.percent)}%）`,
    )
  }
  lines.push('  建议：把排版改动单独提交一次（先 git stash 排版 → 提交语义 → 恢复排版），')
  lines.push('        否则 reviewer 要在大量对齐改动里找你的语义行。')
  lines.push('  （这只是提示，不拦提交；确认这次就是要一起改，那就忽略它。）')
  return lines.join('\n')
}

/* ------------------------------------------------------------------ 提交级判据 */

/**
 * 「这一笔像一次全仓重排」的判定（2026-10-31）。
 *
 * ## 为什么单文件判据不够
 *
 * 单文件判据（占比 > 60% 且纯排版 > 30 行）抓的是「**一个文件**里排版淹没了语义」。
 * 但本仓原始事故的形态不是那样 —— 那是一次**全仓** `prettier --write`，
 * 排版改动**摊在几十个文件上**，每个文件里的占比都可能不高（每个文件也就改几行）
 * ⇒ 单文件判据一句都不提示 ⇒ 闸形同虚设。
 *
 * ## 提交级口径
 *
 * 两个条件同时满足才提示：
 * 1. **被排版主导的文件数 ≥ `FORMAT_FILES_THRESHOLD`**（默认 5 个）
 *    —— 单个文件的占比不必高，但**很多个**文件都被排版主导 ⇒ 这是重排的形态。
 * 2. **纯排版总行数 ≥ `FORMAT_TOTAL_LINES_THRESHOLD`**（默认 100 行）
 *    —— 防止「5 个文件各改 1 行空格」被当成重排（那是日常改动）。
 *
 * ## 为什么仍然只提示不拦
 *
 * 与单文件判据同理由：作者可能就是想一次把某个目录排版做完（那是一次合理提交）。
 * 拆不拆是他的判断 ⇒ 本闸只把形态摆出来。
 */
export const FORMAT_FILES_THRESHOLD = 5
export const FORMAT_TOTAL_LINES_THRESHOLD = 100

/** 一处「像一次全仓重排」的结论 */
export interface CommitLevelFormatHint {
  /** 被排版主导的文件数 */
  fileCount: number
  /** 纯排版总行数 */
  formatLines: number
  /** 改动总行数 */
  totalLines: number
  /** 整体纯排版占比（0–1） */
  ratio: number
  /** 被排版主导的文件（按纯排版行数降序） */
  paths: string[]
}

/**
 * 判「这一笔像一次全仓重排」。
 *
 * ⚠️ **被排版主导的文件**用的是**单文件口径**（占比 > 60%），
 *   但**不要求**纯排版行数超阈 —— 提交级看的是「面」，
 *   单文件的「行数得多」由提交级的「总行数」条件统一兜。
 */
export function pickCommitLevelHint(
  reports: readonly FormatDiffReport[],
  filesThreshold = FORMAT_FILES_THRESHOLD,
  totalLinesThreshold = FORMAT_TOTAL_LINES_THRESHOLD,
): CommitLevelFormatHint | null {
  const dominant = reports
    .filter((r) => r.ratio > FORMAT_RATIO_THRESHOLD && r.formatLines > 0)
    .sort((a, b) => b.formatLines - a.formatLines)
  if (dominant.length < filesThreshold) return null
  const formatLines = dominant.reduce((sum, r) => sum + r.formatLines, 0)
  if (formatLines < totalLinesThreshold) return null
  const totalLines = reports.reduce((sum, r) => sum + r.totalLines, 0)
  return {
    fileCount: dominant.length,
    formatLines,
    totalLines,
    ratio: totalLines === 0 ? 0 : formatLines / totalLines,
    paths: dominant.map((r) => r.path),
  }
}

/** 提交级提示的渲染 */
export function renderCommitLevelHint(hint: CommitLevelFormatHint): string {
  const shown = hint.paths.slice(0, 5).join('、')
  return [
    `  这一笔像一次**全仓排版重排**：${String(hint.fileCount)} 个文件被排版主导，`,
    `  纯排版共 ${String(hint.formatLines)} 行 / 全部改动 ${String(hint.totalLines)} 行（${String(Math.round(hint.ratio * 100))}%）。`,
    `  涉及：${shown}${hint.paths.length > 5 ? ' 等' : ''}`,
    '  建议：把排版重排单独提交一次（先 git stash 排版 → 提交语义 → 恢复排版），',
    '        否则 reviewer 要在几十个文件的对齐改动里找你的语义行。',
    '  （这只是提示，不拦提交；确认这次就是要一次做完，那就忽略它。）',
  ].join('\n')
}

/* ------------------------------------------------------------------ CLI */

/**
 * 命令行入口：打印提示（若有），退出码恒为 0。
 *
 * ⚠️ **退出码恒 0**：本闸只提示不拦 ⇒ 它绝不能让提交失败。
 *   真要拦时，闸三那一步（prettier --check）已经在拦了。
 */
function main(): void {
  const repoRoot = process.cwd()
  const reports = collectFormatDiffReports(repoRoot)
  const hints = pickFormatHints(reports)
  const commitHint = pickCommitLevelHint(reports)
  if (hints.length === 0 && commitHint === null) return
  console.log('⚠️ 这一笔里排版改动占比偏高（提示，不拦提交）：')
  if (hints.length > 0) console.log(renderFormatHints(hints))
  // ⚠️ **提交级提示与单文件提示是两段**：单文件管「一个文件里排版淹了语义」，
  //   提交级管「很多个文件一起被排版主导」（全仓重排的形态）。
  //   两者可能同时命中（一次重排里既有单文件重排也有多文件摊开）⇒ 都打印。
  if (commitHint !== null) {
    console.log('')
    console.log(renderCommitLevelHint(commitHint))
  }
}

if (process.argv[1]?.endsWith('format-diff-guard.ts') === true) {
  main()
}
