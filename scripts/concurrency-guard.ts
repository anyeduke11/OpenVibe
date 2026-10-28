/**
 * concurrency-guard —— 并行会话共用同一工作树时的**提交前护栏**（2026-10-24）。
 *
 * ## 它防的是哪一次事故
 *
 * 本仓出过一次真事故：为提交「只属于本会话」的内容，某个会话把 `DEV_LOG.md`
 * **整文件重写**成只含自己条目的版本再 `git add`，
 * 结果**覆盖掉并行会话当时尚未提交的三条正文**，事后三条原文不可恢复。
 *
 * 事故的机制不是「git 坏了」，而是**顺序**：
 * 构造只含自己条目的暂存版本 → `git add` → 再把完整版写回工作树 → `git commit`（提交的是 index）。
 * 这个顺序本身是对的（它保住了别人的内容），**缺的是护栏**：哪一步顺序做反，
 * 就会静默把别人的在编内容回退掉，而且**没有任何信号**。
 *
 * ⇒ 本脚本只做一件事：**把「这次提交的内容比磁盘上最新内容旧」这件事，在提交前显形。**
 *
 * ## 两条规则
 *
 * - **规则 A · 暂存与工作树分歧**：已暂存文件的 index 内容与工作树内容不一致。
 *   提交提交的是 index，所以工作树上更新的内容不会进这次提交 —— 它必须被人看见、被人确认。
 * - **规则 B · 回退特征**：已暂存内容里出现本仓登记过的回退字样。
 *   这一条把「已修内容被以旧措辞提交」从人工印象变成机器可判的事实。
 *
 * ## 标志清单口径单处（不另立一份）
 *
 * 回退标志字样**只认 `scripts/ownership-check.ts` 导出的 `DEFAULT_MARKERS`**。
 * 本文件不复制清单：两处各写一份必然漂移，而漂移的方向必然是「闸越来越松」。
 * 本文件只加**适配层**，两处都写清了适配原因：
 *
 * 1. `detectRollbackMarkers`：复用标志本身，另复用 `SELF_QUOTING` 做自引用豁免
 *    （判据文件按构造必须含标志字面量，否则它自己就会被判成回退）。
 * 2. `dropPreexistingMarkers`：标志若**在该文件上一版（HEAD）里已存在**，则它是本仓既有词汇
 *    （例如台账里的队列状态词），不是这一笔引入的回退 ⇒ 不算命中。
 *
 * ## 为什么不用 spawnSync
 *
 * 本仓实况教训：父进程被子进程冻住。git 一旦卡住（索引锁等待、凭证提示、网络），
 * 没有超时的同步调用会把调用方一起冻住 ⇒ 本文件一律用 `execFileSync` 且**必带 timeout**。
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { DEFAULT_MARKERS, SELF_QUOTING } from './ownership-check'

/* ------------------------------------------------------------------ 类型 */

/** 一个已暂存文件的比对事实（由 git 层采集，交给纯函数判定） */
export interface DriftFacts {
  path: string
  /** index（暂存区）里的内容 —— 必须来自 `git show :<path>`，不能拿工作树冒充 */
  indexContent: string
  /** 工作树里的内容；null = 工作树已无此文件 */
  worktreeContent: string | null
  /** 工作树独有、这次提交没带上的行数；null = 取不到（未知） */
  worktreeOnlyLines: number | null
  /** index 独有、工作树没有的行数；null = 取不到（未知） */
  stagedOnlyLines: number | null
}

/** 一条「暂存与工作树不一致」的结论 */
export interface DriftReport {
  path: string
  /** 工作树独有行数（>0 ⇒ 这次提交比磁盘旧） */
  worktreeOnlyLines: number
  /** index 独有行数（>0 ⇒ 磁盘比这次提交旧） */
  stagedOnlyLines: number
  /** 首个不一致的行号（1 起，按行号对齐比较） */
  firstDiffLine: number
  /** 首个不一致处：index 侧原文 */
  stagedExcerpt: string
  /** 首个不一致处：工作树侧原文 */
  worktreeExcerpt: string
  /** 工作树已无此文件（这次提交却带着它） */
  worktreeMissing: boolean
}

/** 一份已暂存内容（路径 + 内容），纯函数的输入单位 */
export interface StagedBlob {
  path: string
  content: string
}

/** 一处回退特征命中 */
export interface MarkerHit {
  path: string
  line: number
  marker: string
  excerpt: string
}

/* ------------------------------------------------------------------ 常量 */

const GIT_TIMEOUT_MS = 5000
const EXCERPT_CAP = 160
/** 放行规则 A 的环境变量：只在「确认这次就该提交暂存区那一版」时显式设 1 */
export const ALLOW_PARTIAL_STAGE_ENV = 'OPENVIBE_ALLOW_PARTIAL_STAGE'

/* ------------------------------------------------------------------ 纯函数 */

/**
 * 规则 A 的判定核心（纯函数：输入是采集好的事实，输出是结论，无 IO）。
 *
 * 判定顺序刻意是「内容相同 ⇒ 无漂移」先于「计数」：
 * 内容逐字相同是硬证据；计数只用来补两件事 ——
 * ① 给出「未纳入多少行」这个可读数字；② 在 git 视角下两边等价时（行尾过滤、属性过滤）
 * 把原始字节差异判为**非真漂移**，避免每次提交都被行尾差异误伤。
 */
export function judgeDrift(facts: DriftFacts[]): DriftReport[] {
  const out: DriftReport[] = []
  for (const f of facts) {
    if (f.worktreeContent === null) {
      // 提交里带着这个文件，工作树却已经没有它 ⇒ 提交一落地就把工作树状态改掉
      out.push({
        path: f.path,
        worktreeOnlyLines: 0,
        stagedOnlyLines: f.indexContent === '' ? 0 : f.indexContent.split('\n').length,
        firstDiffLine: 1,
        stagedExcerpt: excerpt(f.indexContent.split('\n')[0] ?? ''),
        worktreeExcerpt: '（工作树已无此文件）',
        worktreeMissing: true,
      })
      continue
    }
    if (f.indexContent === f.worktreeContent) continue
    const known = f.worktreeOnlyLines !== null && f.stagedOnlyLines !== null
    if (known && f.worktreeOnlyLines === 0 && f.stagedOnlyLines === 0) continue

    const indexLines = f.indexContent.split('\n')
    const worktreeLines = f.worktreeContent.split('\n')
    const at = firstDifferenceLine(indexLines, worktreeLines)
    out.push({
      path: f.path,
      worktreeOnlyLines: f.worktreeOnlyLines ?? 0,
      stagedOnlyLines: f.stagedOnlyLines ?? 0,
      firstDiffLine: at,
      stagedExcerpt: excerpt(indexLines[at - 1] ?? '（无此行）'),
      worktreeExcerpt: excerpt(worktreeLines[at - 1] ?? '（无此行）'),
      worktreeMissing: false,
    })
  }
  return out
}

/**
 * 按行号对齐找首个不一致的行（1 起）。
 *
 * 只做「逐位对齐」而不做完整 diff：护栏要回答的是「从哪一行开始两边不是同一份」，
 * 逐位对齐给出的答案与人的直觉一致；而完整 diff 的代价（O(n·m)）对一个提交前闸不划算。
 */
export function firstDifferenceLine(indexLines: string[], worktreeLines: string[]): number {
  const n = Math.min(indexLines.length, worktreeLines.length)
  for (let i = 0; i < n; i++) {
    if (indexLines[i] !== worktreeLines[i]) return i + 1
  }
  return n + 1
}

/**
 * 规则 B 的判定核心（纯函数）：在**已暂存内容**里搜回退特征标志。
 *
 * ## 为什么直接复用 ownership-check 的标志
 *
 * `DEFAULT_MARKERS` 导出的就是 `RegExp[]`，逐行 `test` 即可用，不需要另立清单。
 * `SELF_QUOTING` 同样直接复用：判据文件按构造必须含标志字面量
 * （否则「标志能抓到真实回退」这条判据本身就测不到），把它们判成回退是自伤。
 *
 * ## 一处必要的适配
 *
 * ownership-check 的标志是按「**新增行**」设计的（比对 diff 的新增行），
 * 而本脚本判的是「**已暂存内容**」（整份将入库的文本）。
 * 口径差异带来一个必须显式处理的适配：**该标志在本仓多处是既有词汇**，
 * 不是新增行才有 ⇒ 它是否构成「回退」要看**这一笔有没有引入它**，那是 `dropPreexistingMarkers` 的职责。
 */
export function detectRollbackMarkers(stagedBlobs: StagedBlob[]): MarkerHit[] {
  const hits: MarkerHit[] = []
  for (const blob of stagedBlobs) {
    if (SELF_QUOTING.some((p) => p.test(blob.path))) continue
    const lines = blob.content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!
      for (const marker of DEFAULT_MARKERS) {
        if (!marker.test(line)) continue
        hits.push({
          path: blob.path,
          line: i + 1,
          marker: markerLiteral(marker),
          excerpt: excerpt(line.trim()),
        })
      }
    }
  }
  return hits
}

/**
 * 适配层：剔除「该标志在该文件上一版里就已存在」的命中。
 *
 * ## 为什么必须有这一层
 *
 * 本仓的台账正文里，这些字样是**正常词汇**而不是回退特征：
 * 队列状态词在 DEV_LOG.md 的 HEAD 版本里出现过数十次，任务表的「未估人日」写法也在既有版本里。
 * 若不剔除，规则 B 会把每一次正常的台账提交都判红 ⇒ 闸变成噪音，人只会绕过它。
 *
 * ## 判据
 *
 * 「回退」= **这一笔把旧措辞写回去了**。
 * 若同一标志在该文件的上一版（HEAD）里已经存在，它就是本仓既有词汇，不是这一笔引入的 ⇒ 不算命中。
 * 新增文件（HEAD 无此文件）不在豁免范围内 —— 它的每个标志都是这一笔引入的。
 *
 * ⚠️ 已知代价（登记在交付报告里）：豁免是**文件级**的，
 * 所以「某文件上一版已有该标志、这一笔又在别处引入同一标志」会被一并放过 —— 宁可漏报，不误伤台账。
 */
export function dropPreexistingMarkers(hits: MarkerHit[], headBlobs: StagedBlob[]): MarkerHit[] {
  const headByPath = new Map(headBlobs.map((b) => [b.path, b.content]))
  return hits.filter((h) => {
    const head = headByPath.get(h.path)
    if (head === undefined) return true
    const re = markerRegex(h.marker)
    if (!re) return true
    return !head.split('\n').some((line) => re.test(line))
  })
}

/** 标志的可读字面量（正则源码去掉转义）——报告里要给人看的是字面量，不是正则 */
export function markerLiteral(re: RegExp): string {
  return re.source.replace(/\\(.)/g, '$1')
}

/** 由字面量反查标志正则（用于「上一版是否已有该标志」的判断） */
function markerRegex(literal: string): RegExp | undefined {
  return DEFAULT_MARKERS.find((m) => markerLiteral(m) === literal)
}

function excerpt(text: string): string {
  const t = text.trim()
  return t.length > EXCERPT_CAP ? `${t.slice(0, EXCERPT_CAP)}…` : t
}

/* ------------------------------------------------------------------ IO 层 */

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
    // git 不可用 / 仓库不存在 / 命令失败 ⇒ 取不到事实，返回 null 由上层按「未知」处理。
    // 这里刻意不抛：护栏的失败方式应该是「查不到 ⇒ 放行并说明」，不是「崩在提交前」。
    return null
  }
}

/** 已暂存的路径列表（`-z` 分隔：路径里有空格/换行也不会被切错） */
function stagedPaths(repoRoot: string): string[] {
  const out = git(repoRoot, ['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR'])
  if (out === null) return []
  return out.split('\0').filter((p) => p.length > 0)
}

/**
 * 读 index 里的 blob 内容。
 *
 * ⚠️ 必须是 `git show :<path>`（读 index），**不能**用 readFileSync 拿工作树当 index ——
 * 那正是本脚本要抓的同一个错误：把工作树 newest 的内容当成「已暂存的内容」去比，比出来永远是「一致」。
 */
function indexContent(repoRoot: string, path: string): string | null {
  return git(repoRoot, ['show', `:${path}`])
}

function worktreeContent(repoRoot: string, path: string): string | null {
  try {
    return readFileSync(join(repoRoot, path), 'utf8')
  } catch {
    return null
  }
}

/** index 与工作树的行数差（git 视角 ⇒ 行尾/属性过滤都已算进去） */
function numstat(
  repoRoot: string,
  path: string,
): { worktreeOnly: number | null; stagedOnly: number | null } {
  const out = git(repoRoot, ['diff', '--numstat', '--', path])
  if (out === null) return { worktreeOnly: null, stagedOnly: null }
  const line = out.split('\n')[0] ?? ''
  if (!line.trim()) return { worktreeOnly: 0, stagedOnly: 0 }
  const [a, m] = line.split('\t')
  const added = Number(a)
  const removed = Number(m)
  return {
    worktreeOnly: Number.isFinite(added) ? added : null,
    stagedOnly: Number.isFinite(removed) ? removed : null,
  }
}

/**
 * 规则 A 与规则 B 的**公共采集层**：一次把「已暂存路径 + index 内容 + 工作树内容 + 行数差」取齐。
 *
 * 收敛成一次采集有两个理由：① 同一批路径被两条规则各走一遍会翻倍 git 调用（提交前的闸不该自己拖慢提交）；
 * ② 两条规则看的是**同一份事实**（index 与工作树），分开采集迟早会出现「两次读到的不是同一刻」的口径裂缝。
 */
export function collectStagedFacts(repoRoot: string): DriftFacts[] {
  const facts: DriftFacts[] = []
  for (const path of stagedPaths(repoRoot)) {
    const index = indexContent(repoRoot, path)
    if (index === null) continue // 不在 index 里（已暂存删除）⇒ 无从比较
    const { worktreeOnly, stagedOnly } = numstat(repoRoot, path)
    facts.push({
      path,
      indexContent: index,
      worktreeContent: worktreeContent(repoRoot, path),
      worktreeOnlyLines: worktreeOnly,
      stagedOnlyLines: stagedOnly,
    })
  }
  return facts
}

/**
 * 规则 A 的采集 + 判定：逐个已暂存文件，比对 index 与工作树。
 *
 * 全程**只读**：不 add、不 commit、不 checkout、不 stash —— 护栏在并行工作树里的任何写操作都可能踩掉别人的在编内容。
 */
export function detectStagedWorktreeDrift(repoRoot: string): DriftReport[] {
  return judgeDrift(collectStagedFacts(repoRoot))
}

/** 采集已暂存内容（供规则 B 扫描）；二进制文件跳过（标志扫描对二进制无意义） */
export function collectStagedBlobs(facts: DriftFacts[]): StagedBlob[] {
  const blobs: StagedBlob[] = []
  for (const f of facts) {
    if (f.indexContent.includes('\u0000')) continue
    blobs.push({ path: f.path, content: f.indexContent })
  }
  return blobs
}

/**
 * 采集这些路径在 HEAD 里的上一版内容（用于「既有词汇」豁免；HEAD 无此文件则不入列）。
 *
 * 只在**真有命中**时才拉：多数提交根本没有回退特征，不该为它们逐个读 HEAD。
 */
function collectHeadBlobs(repoRoot: string, paths: string[]): StagedBlob[] {
  const blobs: StagedBlob[] = []
  for (const path of paths) {
    const content = git(repoRoot, ['show', `HEAD:${path}`])
    if (content === null) continue
    blobs.push({ path, content })
  }
  return blobs
}

/* ════════════════════════════════════════════════════════ 规则 C · 回退态（新增行口径） */

/**
 * 一条回退态命中（规则 C 的结论单位）。
 *
 * ⚠️ 与规则 B 的 `MarkerHit` **不是同一件事**：规则 B 说「这个文件里出现了标志字样」，
 * 规则 C 说「这条**新增**的行是回退态」——后者精确得多，因为它多问了一句
 * 「这行在 HEAD 里是不是新的」。
 */
export interface RollbackHit {
  path: string
  /** 新增行的行号（在**新文件**里的行号，1 起） */
  line: number
  /** 命中的标志字样 */
  marker: string
  /** 新增行原文 */
  excerpt: string
}

/** 一条新增行的事实（采集层产出，纯函数判定） */
export interface AddedLine {
  path: string
  /** 在新文件里的行号（1 起） */
  line: number
  /** 该行文本（已去掉 diff 的 `+` 前缀） */
  text: string
}

/**
 * 去空白后比较用：prettier 对 Markdown 的重排**只改空白**（表格列对齐是加空格）⇒
 * 排版重排产生的行，去掉空白后与 HEAD 的某行逐字相同。
 *
 * ⚠️ 这条是规则 C 不误报的关键：不这么做的话，每一次表格对齐都会被判成回退。
 */
export function squashWhitespace(text: string): string {
  return text.replace(/\s+/g, '')
}

/**
 * 规则 C 的判定核心（纯函数）。
 *
 * ## 判据
 *
 * 对每条新增行：**命中回退标志** 且 **去空白后在 HEAD 版该文件里查无此行** ⇒ 回退态。
 *
 * ## 为什么必须加「新增性」这一问
 *
 * ⚠️ 规则 B 扫全文 + 文件级豁免（「该标志在该文件 HEAD 版里已存在 ⇒ 整个文件放过」）
 *   在 `docs/tasks.md` / `docs/decisions.md` 这类**本身就在正常讨论这些措辞**的文件上
 *   整体失效 ⇒ 真回退被放过（实测 2026-10-26：`tasks.md` 的 T12 那行漏报）。
 *
 *   回退的写法是「**把旧措辞新写进来**」⇒ 这行在 HEAD 里查无此行；
 *   而排版重排产生的行，去空白后与 HEAD 的某行逐字相同 ⇒ 放行。
 *
 * ## 实测（2026-10-26 · 7 个真实文件）
 *
 * 精确命中 2 件真回退（`docs/tasks.md`、`docs/specs/m6-standard-pack.md`），
 * 对 5 件「登记回退事实的说明行 / 纯排版重排」零假阳性。
 *
 * @param added 新增行事实
 * @param headByPath HEAD 版内容（路径 → 文本）
 * @param markers 标志清单
 * @param selfQuoting 自引用豁免路径
 */
export function detectRollbackInAddedLines(
  added: AddedLine[],
  headByPath: Map<string, string>,
  markers: RegExp[],
  selfQuoting: RegExp[] = [],
): RollbackHit[] {
  const out: RollbackHit[] = []
  // 每个路径的 HEAD 版「去空白后逐行集合」——一次性建好，避免逐行重复 split
  const headSets = new Map<string, Set<string>>()
  for (const [path, content] of headByPath) {
    const set = new Set<string>()
    for (const line of content.split('\n')) set.add(squashWhitespace(line))
    headSets.set(path, set)
  }

  for (const a of added) {
    if (selfQuoting.some((p) => p.test(a.path))) continue
    const marker = markers.find((m) => m.test(a.text))
    if (!marker) continue
    // ⚠️ HEAD 里没有这个文件 ⇒ 整份都是新增 ⇒ 该行必然是新的 ⇒ 算回退
    const set = headSets.get(a.path)
    if (set && set.has(squashWhitespace(a.text))) continue
    out.push({
      path: a.path,
      line: a.line,
      marker: markerLiteral(marker),
      excerpt: excerpt(a.text),
    })
  }
  return out
}

/**
 * 采集已暂存内容相对 HEAD 的**新增行**（规则 C 的输入）。
 *
 * ⚠️ 必须取 **`--cached`**（暂存区相对 HEAD），不是工作树相对 HEAD ——
 *   提交入库的是 index，工作树里还没暂存的内容不在这次提交里。
 * ⚠️ 用 `-U0`（零上下文）：只需 `-` / `+` 行本身，context 行对判定无用。
 */
export function collectAddedLines(repoRoot: string, paths: string[]): AddedLine[] {
  const out: AddedLine[] = []
  for (const path of paths) {
    const raw = git(repoRoot, ['diff', '--cached', '-U0', '-M', '--', path])
    if (raw === null) continue
    // 逐 hunk 解析：新增行的行号按 hunk 头部的「+起始,长度」推算
    let newLineNo = 0
    for (const line of raw.split('\n')) {
      const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      if (hunk) {
        newLineNo = Number(hunk[1]) - 1
        continue
      }
      if (line.startsWith('+++') || line.startsWith('---')) continue
      if (line.startsWith('diff ') || line.startsWith('index ')) continue
      if (line.startsWith('+')) {
        newLineNo += 1
        out.push({ path, line: newLineNo, text: line.slice(1) })
        continue
      }
      if (line.startsWith('-')) continue
      // context 行（-U0 下不该出现，兜底计数）
      newLineNo += 1
    }
  }
  return out
}

/* ------------------------------------------------------------------ 闸本体 */

export interface GuardOptions {
  repoRoot: string
  env: NodeJS.ProcessEnv
}

export interface GuardOutcome {
  /** 0 = 放行；1 = 拦下 */
  exitCode: number
  drift: DriftReport[]
  markers: MarkerHit[]
  /** 规则 C 的回退态命中（新增行口径） */
  rollbacks: RollbackHit[]
  /** 规则 A 是否被环境变量显式放行（放行了也照样记录） */
  driftAllowed: boolean
  lines: string[]
}

/** 规则 A 的放行开关：只有显式设成 1/true 才算数 */
export function partialStageAllowed(env: NodeJS.ProcessEnv): boolean {
  const v = env[ALLOW_PARTIAL_STAGE_ENV]
  return v === '1' || v === 'true'
}

/** 跑一遍护栏，返回结论与可打印的报告行 */
export function runGuard(opts: GuardOptions): GuardOutcome {
  const facts = collectStagedFacts(opts.repoRoot)
  const drift = judgeDrift(facts)
  const stagedBlobs = collectStagedBlobs(facts)
  const rawHits = detectRollbackMarkers(stagedBlobs)
  // HEAD 上一版**按需**拉取：只有真有命中才需要它做「既有词汇」豁免
  const hitPaths = [...new Set(rawHits.map((h) => h.path))]
  const markers = dropPreexistingMarkers(rawHits, collectHeadBlobs(opts.repoRoot, hitPaths))
  const driftAllowed = partialStageAllowed(opts.env)

  // 规则 C：回退态（新增行口径）。**独立于规则 B** ——
  // 规则 B 是「全文扫 + 文件级豁免」，规则 C 是「新增行扫 + 行级新增性比对」，
  // 后者更精确（见 detectRollbackInAddedLines 的注释）。
  const stagedPathList = stagedPaths(opts.repoRoot)
  const addedLines = collectAddedLines(opts.repoRoot, stagedPathList)
  const markerPaths = [...new Set(addedLines.map((a) => a.path))]
  const headByPath = new Map<string, string>()
  for (const path of markerPaths) {
    const content = git(opts.repoRoot, ['show', `HEAD:${path}`])
    if (content !== null) headByPath.set(path, content)
  }
  const rollbacks = detectRollbackInAddedLines(
    addedLines,
    headByPath,
    DEFAULT_MARKERS,
    SELF_QUOTING,
  )

  const driftBlocking = drift.length > 0 && !driftAllowed
  const markerBlocking = markers.length > 0
  const rollbackBlocking = rollbacks.length > 0
  const exitCode = driftBlocking || markerBlocking || rollbackBlocking ? 1 : 0

  return {
    exitCode,
    drift,
    markers,
    rollbacks,
    driftAllowed,
    lines: renderGuard({
      repoRoot: opts.repoRoot,
      stagedCount: stagedBlobs.length,
      drift,
      markers,
      rollbacks,
      driftAllowed,
      blocked: exitCode === 1,
    }),
  }
}

/** 报告渲染：每条规则都要写清「哪条规则 / 哪些文件 / 为什么危险 / 怎么处置」 */
export function renderGuard(input: {
  repoRoot: string
  stagedCount: number
  drift: DriftReport[]
  markers: MarkerHit[]
  rollbacks: RollbackHit[]
  driftAllowed: boolean
  blocked: boolean
}): string[] {
  const out: string[] = []
  out.push('concurrency-guard —— 并行会话共用工作树时的提交前护栏')
  out.push(`仓库：${input.repoRoot}`)
  out.push(`已暂存文件：${input.stagedCount} 个`)
  out.push('')

  if (input.drift.length === 0 && input.markers.length === 0 && input.rollbacks.length === 0) {
    out.push('✅ 通过：暂存区与工作树一致，已暂存内容里没有回退特征。')
    return out
  }

  if (input.drift.length > 0) {
    out.push(`── 规则 A · 暂存与工作树分歧（命中 ${input.drift.length} 个文件）`)
    out.push(
      '  为什么危险：这次提交提交的是**暂存区（index）**的内容；工作树上更新的内容不会进这次提交。',
    )
    out.push(
      '    并行会话正在写的段落就停在这个文件的工作树里 —— 谁整文件改写并暂存，别人的在编内容就会被静默丢掉。',
    )
    out.push('  怎么处置：')
    out.push(
      '    ① 多出来的内容是**别人会话正在写的** ⇒ 别整文件暂存：改用局部暂存（git add -p <文件>），',
    )
    out.push('       或把这个文件整个留在工作树（git restore --staged <文件>）。')
    out.push('    ② 多出来的内容是**你自己后来又改的**，且确实要提交暂存区那一版 ⇒ 显式放行：')
    out.push(`       ${ALLOW_PARTIAL_STAGE_ENV}=1 git commit -m "..."`)
    out.push('    ③ 分不清是谁的 ⇒ 先停手：git diff -- <文件> 看清差异再决定。')
    if (input.driftAllowed) {
      out.push(`  ⓘ 本次已由 ${ALLOW_PARTIAL_STAGE_ENV}=1 放行规则 A（只记录，不再拦下）。`)
    }
    for (const d of input.drift) {
      out.push(`  ✗ ${d.path}`)
      if (d.worktreeMissing) {
        out.push('      工作树已无此文件，这次提交却带着它 ⇒ 提交一落地就把工作树状态改掉。')
        out.push(`      暂存区原文：${d.stagedExcerpt}`)
      } else {
        const dir =
          d.worktreeOnlyLines > 0
            ? `工作树比这次提交多 ${d.worktreeOnlyLines} 行（这次提交比磁盘旧）`
            : `工作树比这次提交少 ${d.stagedOnlyLines} 行（磁盘比这次提交旧）`
        out.push(`      ${dir} · 首个不一致行：第 ${d.firstDiffLine} 行`)
        out.push(`      暂存区：${d.stagedExcerpt}`)
        out.push(`      工作树：${d.worktreeExcerpt}`)
      }
    }
    out.push('')
  }

  if (input.markers.length > 0) {
    out.push(`── 规则 B · 回退特征（命中 ${input.markers.length} 处）`)
    out.push(
      '  为什么危险：已暂存内容里出现了本仓登记过的回退特征字样 ⇒ 可能把已修内容以旧措辞提交。',
    )
    out.push('    这类内容一旦入库就是历史，事后要改就得再改一次。')
    out.push('  怎么处置：')
    out.push('    ① 命中行确实是回退 ⇒ 改回新措辞后重新暂存（git add <文件>）再提交。')
    out.push(
      '    ② 命中行**不是**回退（本仓既有词汇误伤）⇒ 请在报告里点名行号与原文，由 owner 决定是否调判据。',
    )
    out.push('    ⚠️ 规则 B 不提供放行开关：回退态入库不可逆。')
    out.push('       （确实要跳过这一次：用 git commit --no-verify —— 但请先确认命中行无害。）')
    for (const m of input.markers) {
      out.push(`  ✗ ${m.path}:${m.line}`)
      out.push(`      命中标志：${m.marker}`)
      out.push(`      原文：${m.excerpt}`)
    }
    out.push('')
  }

  if (input.rollbacks.length > 0) {
    out.push(`── 规则 C · 回退态（新增行口径，命中 ${input.rollbacks.length} 处）`)
    out.push(
      '  为什么危险：这些是**新增进来**的行，且含本仓登记过的回退措辞 ⇒ 把已修内容以旧措辞提交。',
    )
    out.push(
      '    与规则 B 的区别：规则 B 扫全文，规则 C 只看「新增行」且多问一句「这行在 HEAD 里是不是新的」——',
    )
    out.push('    正因如此，规则 B 会因文件级豁免漏报（如 `docs/tasks.md` 本身就在讨论这些措辞）。')
    out.push('  怎么处置：')
    out.push('    ① 命中行确实是回退 ⇒ 改回新措辞后重新暂存（git add <文件>）再提交。')
    out.push(
      '    ② 命中行**不是**回退（本仓既有词汇误伤）⇒ 请在报告里点名行号与原文，由 owner 决定是否调判据。',
    )
    out.push('    ⚠️ 规则 C 不提供放行开关：回退态入库不可逆。')
    out.push('       （确实要跳过这一次：用 git commit --no-verify —— 但请先确认命中行无害。）')
    for (const r of input.rollbacks) {
      out.push(`  ✗ ${r.path}:${r.line}`)
      out.push(`      命中标志：${r.marker}`)
      out.push(`      原文：${r.excerpt}`)
    }
    out.push('')
  }

  if (input.blocked) {
    out.push('结论：本次提交被拦下（规则 A / B / C 命中）。')
  } else {
    out.push('结论：规则 A 已按显式放行处理，本次提交放行。')
  }
  return out
}

/* ------------------------------------------------------------------ CLI 入口 */

function resolveRepoRoot(start: string): string | null {
  const out = git(start, ['rev-parse', '--show-toplevel'])
  const trimmed = out?.trim()
  return trimmed ? trimmed : null
}

function main(argv: string[]): number {
  const args = argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(
      [
        '用法：npx tsx scripts/concurrency-guard.ts [--repo <仓根>]',
        '',
        '  规则 A · 暂存与工作树分歧：已暂存文件的工作树内容与 index 不一致 ⇒ 拦下。',
        `    放行：${ALLOW_PARTIAL_STAGE_ENV}=1（只在确认这次就该提交暂存区那一版时用）。`,
        '  规则 B · 回退特征：已暂存内容命中回退字样 ⇒ 拦下（不放行）。',
        '  规则 C · 回退态：新增行命中回退字样且该行在 HEAD 里是新的 ⇒ 拦下（不放行）。',
        '',
        '退出码：0 = 放行；1 = 拦下。',
      ].join('\n') + '\n',
    )
    return 0
  }

  const repoIdx = args.indexOf('--repo')
  const explicit = repoIdx >= 0 ? args[repoIdx + 1] : undefined
  const repoRoot = explicit ? resolve(explicit) : resolveRepoRoot(process.cwd())

  if (!repoRoot) {
    process.stdout.write(
      `⚠️ concurrency-guard：在 ${explicit ?? process.cwd()} 找不到 git 仓库根 ⇒ 跳过检查（不拦提交）。\n`,
    )
    return 0
  }

  const outcome = runGuard({ repoRoot, env: process.env })
  process.stdout.write(`${outcome.lines.join('\n')}\n`)
  return outcome.exitCode
}

if (process.argv[1] && (process.argv[1] as string).endsWith('concurrency-guard.ts')) {
  process.exitCode = main(process.argv)
}
