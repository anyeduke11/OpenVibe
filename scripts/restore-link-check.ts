#!/usr/bin/env tsx
/**
 * `scripts/restore-link-check.ts` —— 「逐字恢复旧节」自带的断链体检。
 *
 * ## 它解决什么
 *
 * 本仓做过一次「把 `docs/dev-plan.md` 的 `## §17` 一节**逐字**从旧版本恢复回来」的操作
 * （脚本化逐字取回 ＋ 逐行 diff 校验，不手抄）。逐字恢复只保证**文字一致**，
 * 不保证节内的 §-指针与文件引用仍然落空 —— 恢复进来的节可能指着**一个已被删掉的节号**，
 * 而没人发现。
 *
 * ⇒ 本工具把「逐字一致性」与「断链体检」合成**一次可复算的检查**：
 * 同一份基准、同一条命令，既回答「恢复得对不对」，也回答「恢复进来的是不是死链」。
 *
 * ## 判定口径（三条，逐条写明为什么）
 *
 * | 情形 | 判定 | 为什么 |
 * |---|---|---|
 * | 限定型指针、目标文件**存在**且**有该节** | `ok` | 落到了真节上 |
 * | 限定型指针、目标文件**存在**但**无该节** | `dangling` | 恢复进来的节指着不存在的节号 —— 正是本工具要抓的东西 |
 * | 限定型指针、目标文件**不存在** | `undecidable` | **不判红**：文件在不在是 FR-12.1（`scripts/section-ref-audit.ts`）的既有口径，本工具不抢 |
 * | 裸 `§N` 指针 | `undecidable` | 本仓裸 § 常指**别的文档**（`§0.3`/`§10.4` 是跨文档书写约定），判它必假红 |
 *
 * `undecidable` **不算落空**，不参与退出码。
 *
 * ### 与 FR-12.1 的一处刻意差异（更严一处）
 *
 * FR-12.1 的 `classifyRef` 把「父节在、子项未登记」判作 `undecidable`（保守，全仓存量闸必须保守）。
 * 本工具把同一情形判作 `dangling`：**父节在而该子节不在**，对「刚恢复的节」来说正是最该抓的错。
 * 差异只作用于本工具自己的报告与退出码，不改动 FR-12.1 的任何行为。
 *
 * ## 为什么指针解析不复用 `parseSectionRefs`（如何复用）
 *
 * `scripts/section-ref-audit.ts` 已导出 `parseSectionRefs`，但它的签名是
 * `parseSectionRefs(text, from, basenameIndex)` —— **必须先有一张「仓内实际文件名」表**才能跑，
 * 于是它有两个不满足本工具需求的地方：
 *
 * 1. **纯度**：它吃的是「仓内有哪些文件」这张表 ⇒ 拿不到「这句指针指向的文件根本不存在」这个信号
 *    （文件名不在表里 ⇒ 该指针被降级成裸引用）。而「目标文件不存在」恰是本工具要**如实报告**的一种情形。
 * 2. **形状**：它只收**仓内存在的**文件名，无法表达「作者写了一个仓里没有的文件名」。
 *
 * ⇒ 解析层在本文件内自实现，**只覆盖两种形态**（限定型 `X.md §N` 与裸 `§N`），
 * 形态与 `parseSectionRefs` 保持一致（同样的反引号／「的」「中」容错、同样的节号字形）。
 *
 * **判定层则完整复用** `scripts/section-ref-audit.ts` 已导出的 `indexSections` 与 `classifyRef`：
 * 「哪些节号算存在」「子项目签算不算节」这两套认定只应有一处出处，重写一遍必然与 FR-12.1 漂移。
 *
 * ## 退出码
 *
 * - `0`：逐字一致 **且** 恢复后的节内无 `dangling` 指针
 * - `1`：逐字不一致 **或** 恢复后的节内存在 `dangling` 指针
 * - `2`：用法错误 / 文件缺失 / 基准不可用（如「基准 rev 里没有这一节」）
 *
 * ## 用法
 *
 * ```bash
 * npx tsx scripts/restore-link-check.ts --file docs/dev-plan.md --section 17 --against 784a1d0
 * npx tsx scripts/restore-link-check.ts --file docs/dev-plan.md --section 17 --against - --json
 * ```
 *
 * `--against -` 表示以**工作树**为基准（「刚恢复完，自己跟自己比」）⇒ 逐字必然一致，
 * 此时本命令退化为**纯体检**（只报节内指针的落空情况与断链差）。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, type Dirent } from 'node:fs'
import { join, resolve } from 'node:path'
import { classifyRef, indexSections, type SectionIndex } from './section-ref-audit'

/* ════════════════════════════════════════════════════════ 纯函数：取节 */

/**
 * 标题里的节号：`## 17 …` / `## §17 …` / `### 4.2 …` / `### 15.4b …`。
 *
 * **为什么允许 `§` 前缀**：本仓的 `docs/dev-plan.md` 顶层节一律写成 `## §17 …`
 * （与 `scripts/section-ref-audit.ts` 的 `HEADING_ID` 同一形态）⇒ 只认裸数字的解析器
 * 在本仓最需要它的地方会直接找不到节。
 */
const HEADING_NUM = /^(?:§\s*)?(\d+[0-9A-Za-z]*(?:[.-][0-9A-Za-z]+)*)(?=\s|[.、，,：:）)]|$)/

/** 被引节号的字形：`17` / `4.2` / `15.4b` / `13-8` / `15.1-9` */
const REF_NUM = '\\d+[0-9A-Za-z]*(?:[.-][0-9A-Za-z]+)*'

/**
 * 限定型指针：`` `docs/tasks.md` §2c `` / `theme.md` §3.4`。
 *
 * 文件名允许带反引号与「的」「中」（`X.md` 的 `§N` / `X.md` 中 `§N`），
 * 与 `scripts/section-ref-audit.ts` 的 `parseSectionRefs` 同容错。
 */
const QUALIFIED_RE = new RegExp(
  '`?([A-Za-z0-9_][A-Za-z0-9_.\\-/]*\\.md)`?[ \\t]*(?:的|中)?[ \\t]*§[ \\t]*(' + REF_NUM + ')',
  'g',
)

/** 裸指针：`§17.4` */
const BARE_RE = new RegExp('§[ \\t]*(' + REF_NUM + ')', 'g')

/** 一个被取出的节 */
export interface ExtractedSection {
  /** 标题行原文（含 `##` 标记与行内空白，不裁剪 —— 逐字比对要连标记一起比） */
  heading: string
  /** 标题行之下、节末之前的正文（不含标题行） */
  body: string
  /** 节起始行号（1 起，含标题行） */
  startLine: number
  /** 节末行号（1 起，含；节末空行已剔除） */
  endLine: number
}

/**
 * 归一化节号：去掉 `§` 前缀与首尾空白。
 *
 * 大小写不敏感（`3.2-M7` 与 `3.2-m7` 视为同一个节）—— 节号里的大小写在实践中只是写法差异。
 */
function normalizeSectionId(sectionId: string): string {
  return sectionId.trim().replace(/^§\s*/, '').toLowerCase()
}

/**
 * 从一段 Markdown 里取出一整节。
 *
 * **节的边界**：从标题行起，到**下一个同级或更高级**的标题为止；子节（更深一级）算在本节之内。
 * **节末的空行不算本节**（那是节与节之间的分隔行，两侧同样剔除 ⇒ 比对对称）。
 *
 * 找不到返回 `null`（不抛异常）—— 「基准里没有这一节」是正常情形，不是错误。
 *
 * @param markdown  Markdown 全文
 * @param sectionId 节号，如 `17` / `4.2`（可带 `§` 前缀）
 */
export function extractSection(markdown: string, sectionId: string): ExtractedSection | null {
  const want = normalizeSectionId(sectionId)
  if (want === '') return null
  const lines = markdown.split('\n')

  // 定位标题行（跳过围栏代码块内的假标题）
  let inFence = false
  let headingIdx = -1
  let level = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (/^\s*```/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const h = /^(#{1,6})\s+(.*)$/.exec(line)
    if (!h) continue
    const id = HEADING_NUM.exec(h[2]?.trim() ?? '')?.[1]
    if (id && id.toLowerCase() === want) {
      headingIdx = i
      level = h[1]?.length ?? 1
      break
    }
  }
  if (headingIdx < 0) return null

  // 找下一个同级或更高级的标题 —— 它是本节的边界
  let boundary = lines.length
  inFence = false
  for (let i = headingIdx + 1; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (/^\s*```/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const h = /^(#{1,6})\s+/.exec(line)
    if (h && (h[1]?.length ?? 6) <= level) {
      boundary = i
      break
    }
  }

  // 剔除节末空行（节间分隔行不属本节）
  let endIdx = boundary - 1
  while (endIdx > headingIdx && (lines[endIdx] ?? '').trim() === '') endIdx--

  return {
    heading: lines[headingIdx] ?? '',
    body: lines.slice(headingIdx + 1, endIdx + 1).join('\n'),
    startLine: headingIdx + 1,
    endLine: endIdx + 1,
  }
}

/**
 * 整节的文本（标题行 ＋ 正文）—— 逐字比对的对象。
 *
 * **为什么要单独拼**：标题行与正文分开存是为了能分别展示；
 * 但「逐字」必须连标题行一起比（把 `##` 改成 `###` 也是差异）⇒ 比对时拼回一整段。
 */
export function sectionText(section: ExtractedSection): string {
  return section.body === '' ? section.heading : `${section.heading}\n${section.body}`
}

/* ════════════════════════════════════════════════════════ 纯函数：逐行比对 */

/** 一处行级差异 */
export interface LineDiff {
  /** 行号（1 起，相对被比对的文本） */
  line: number
  /** 差异种类 */
  kind: 'only-original' | 'only-restored' | 'changed'
  /** 基准侧该行原文（`only-restored` 时无） */
  original?: string
  /** 恢复侧该行原文（`only-original` 时无） */
  restored?: string
}

/** 逐字比对的结果 */
export interface VerbatimDiff {
  /** 是否逐行完全一致 */
  identical: boolean
  /** 逐行比对的行数（两侧行数的较大者） */
  totalLines: number
  /** 第一处差异（无差异时为 `null`） */
  firstDiff: LineDiff | null
  /** 全部差异（最多 `MAX_DIFFS` 条） */
  diffs: LineDiff[]
  /** 差异总条数（可能大于 `diffs.length`） */
  diffCount: number
  /** 差异条数是否因超过上限而被截断 */
  truncated: boolean
}

/** 差异清单上限 —— 恢复场景下差异通常只有一两处，200 条足够定位，且不至于把报告刷爆 */
export const MAX_DIFFS = 200

/**
 * 逐行严格比对两段文本。
 *
 * **空行与行尾空白都算差异** —— 恢复场景要的是「逐字」，不是「意思对」。
 * 行尾空白被 trim 掉就等于放过了一种最常见的失真（编辑器自动格式化顺手改了缩进）。
 *
 * @param original 基准侧文本
 * @param restored 恢复侧文本
 */
export function diffVerbatim(original: string, restored: string): VerbatimDiff {
  const a = original.split('\n')
  const b = restored.split('\n')
  const totalLines = Math.max(a.length, b.length)
  const diffs: LineDiff[] = []
  let diffCount = 0

  for (let i = 0; i < totalLines; i++) {
    const left = a[i]
    const right = b[i]
    if (left === right) continue
    diffCount++
    if (diffs.length >= MAX_DIFFS) continue
    if (left === undefined) {
      diffs.push({ line: i + 1, kind: 'only-restored', restored: right })
    } else if (right === undefined) {
      diffs.push({ line: i + 1, kind: 'only-original', original: left })
    } else {
      diffs.push({ line: i + 1, kind: 'changed', original: left, restored: right })
    }
  }

  return {
    identical: diffCount === 0,
    totalLines,
    firstDiff: diffs[0] ?? null,
    diffs,
    diffCount,
    truncated: diffCount > diffs.length,
  }
}

/* ════════════════════════════════════════════════════════ 纯函数：指针抽取 */

/** 一条 §-指针 */
export interface SectionPointer {
  /** 命中的原文 */
  raw: string
  /** 限定型指针指向的文件名（裸指针无此字段） */
  file?: string
  /** 被引节号（裸指针也有） */
  ref?: string
  /** 所在行号（1 起，相对传入文本） */
  line: number
  /** 指针形态 */
  kind: 'qualified' | 'bare'
}

/**
 * 从一段文本里抽出 §-指针。
 *
 * **只覆盖两种形态**：限定型（`X.md §N`）与裸型（裸 `§N`）。
 * 限定型按**写法**识别（不查仓内有没有这个文件）—— 查了就没法报告「目标文件不存在」。
 *
 * @param text 待扫描文本（一般是某节的正文）
 */
export function collectSectionRefs(text: string): SectionPointer[] {
  const out: SectionPointer[] = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const occupied: [number, number][] = []

    QUALIFIED_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = QUALIFIED_RE.exec(line)) !== null) {
      occupied.push([m.index, m.index + m[0].length])
      out.push({
        raw: m[0],
        file: m[1],
        ref: m[2],
        line: i + 1,
        kind: 'qualified',
      })
    }

    BARE_RE.lastIndex = 0
    while ((m = BARE_RE.exec(line)) !== null) {
      const at = m.index
      // 已被限定型指针占用的 § 不再重复计一条裸指针
      if (occupied.some(([s, e]) => at >= s && at < e)) continue
      out.push({ raw: m[0], ref: m[1], line: i + 1, kind: 'bare' })
    }
  }
  return out
}

/* ════════════════════════════════════════════════════════ 仓内视图 */

/** 文件名解析的结论 */
export type FileResolution =
  /** 唯一命中 */
  | { kind: 'resolved'; relPath: string }
  /** 仓内没有这个文件 */
  | { kind: 'missing' }
  /** 仓内有多个同名文件（不可判） */
  | { kind: 'ambiguous'; candidates: string[] }

/** 仓内视图：解析文件名 ＋ 取文件的节号索引 */
export interface RepoView {
  /** 解析被提到的文件名 */
  resolve(mentioned: string): FileResolution
  /** 取文件的节号索引；文件不在视图里返回 `null` */
  sectionIndex(relPath: string): SectionIndex | null
}

/**
 * 仓内文件的**统一认定面**：`docs/` 全树 ＋ 仓根的 Markdown。
 *
 * **为什么照这个面**：与 `scripts/section-ref-audit.ts` 的目标索引同面（同一套「谁算仓内文档」认定），
 * 否则两个工具会对「`theme.md` 指的是哪个文件」给出不同答案。
 */
function collectRepoMarkdown(root: string): string[] {
  const out: string[] = []
  const walk = (dir: string, prefix: string): void => {
    let entries: Dirent[]
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
      const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`
      if (entry.isDirectory()) walk(join(dir, entry.name), rel)
      else if (entry.name.endsWith('.md')) out.push(rel)
    }
  }
  const docsDir = join(root, 'docs')
  if (existsSync(docsDir)) walk(docsDir, 'docs')
  try {
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.md')) out.push(entry.name)
    }
  } catch {
    /* 仓根读不到就只当没有根级文档 */
  }
  return out
}

/**
 * 用一张「文件路径 → 内容」表造一个仓内视图（**不碰磁盘**）。
 *
 * 供单测用：纯函数的判定面必须能在内存里跑。
 *
 * @param files 仓内相对路径（posix）→ 文件内容
 */
export function createMemoryRepoView(files: Record<string, string>): RepoView {
  const paths = Object.keys(files)
  const byBasename = new Map<string, string[]>()
  for (const p of paths) {
    const base = p.slice(p.lastIndexOf('/') + 1)
    const list = byBasename.get(base) ?? []
    list.push(p)
    byBasename.set(base, list)
  }
  const cache = new Map<string, SectionIndex>()
  return {
    resolve(mentioned: string): FileResolution {
      const name = mentioned.trim().replace(/^\.\//, '')
      // ① 带路径的写法先按「仓内相对路径」精确命中
      //    （`docs/tasks.md` 这种写法最明确，不该被同名文件劫走）
      if (name.includes('/') && files[name] !== undefined) {
        return { kind: 'resolved', relPath: name }
      }
      // ② 回落到「按 basename 唯一命中」—— 与既有 FR-12.1 同口径：
      //    `specs/onboarding.md` §7 这类「相对所在目录写的路径」在本仓普遍存在，
      //    FR-12.1 靠 basename 反查认它，本工具必须给出同一个答案，否则两个工具会互相打脸。
      const base = name.slice(name.lastIndexOf('/') + 1)
      const candidates = byBasename.get(base) ?? []
      if (candidates.length === 1) return { kind: 'resolved', relPath: candidates[0] ?? '' }
      if (candidates.length === 0) return { kind: 'missing' }
      return { kind: 'ambiguous', candidates }
    },
    sectionIndex(relPath: string): SectionIndex | null {
      const content = files[relPath]
      if (content === undefined) return null
      const cached = cache.get(relPath)
      if (cached) return cached
      const index = indexSections(content)
      cache.set(relPath, index)
      return index
    },
  }
}

/**
 * 造一个读真实磁盘的仓内视图。
 *
 * @param root 仓根（绝对路径由调用方给，本文件不写死任何本机路径）
 */
export function createDiskRepoView(root: string): RepoView {
  const files = new Map<string, string>()
  for (const rel of collectRepoMarkdown(root)) {
    try {
      files.set(rel, readFileSync(join(root, rel), 'utf8'))
    } catch {
      /* 读不到的文件不进索引（视作不存在） */
    }
  }
  return createMemoryRepoView(Object.fromEntries(files))
}

/* ════════════════════════════════════════════════════════ 判定 */

/** 指针落空结论 */
export type PointerStatus = 'ok' | 'dangling' | 'undecidable'

/** 一次判定的完整结论（含给人看的原因） */
export interface PointerCheck {
  /** 结论 */
  status: PointerStatus
  /** 判定理由（中文，直接进报告） */
  reason: string
  /** 解析到的目标文件（仓内相对路径） */
  target?: string
}

/**
 * 判定一条指针在目标文件里落不落空。
 *
 * **判定层复用 `scripts/section-ref-audit.ts` 的 `classifyRef`**
 * （哪些节号算存在、子项目签算不算节，只应有一处出处）。
 * 与 FR-12.1 的一处差异见文件头：「父节在、子项未登记」在本工具判 `dangling`。
 *
 * @param pointer 待判指针
 * @param view    仓内视图
 */
export function checkPointer(pointer: SectionPointer, view: RepoView): PointerCheck {
  if (pointer.kind === 'bare') {
    return { status: 'undecidable', reason: '裸 §-指针：本仓裸 § 常指别的文档，不可判' }
  }
  if (!pointer.file || !pointer.ref) {
    return { status: 'undecidable', reason: '指针不完整（缺文件名或缺节号）' }
  }

  const resolution = view.resolve(pointer.file)
  if (resolution.kind === 'missing') {
    // 不判红：文件在不在是 FR-12.1 的既有口径
    return { status: 'undecidable', reason: `目标文件不存在：${pointer.file}` }
  }
  if (resolution.kind === 'ambiguous') {
    return {
      status: 'undecidable',
      reason: `目标文件名重名，不可判：${pointer.file}（${resolution.candidates.join('、')}）`,
    }
  }

  const index = view.sectionIndex(resolution.relPath)
  if (!index) {
    return { status: 'undecidable', reason: `目标文件不可读：${resolution.relPath}` }
  }

  const verdict = classifyRef(pointer.ref, index)
  if (verdict === 'heading' || verdict === 'item') {
    return {
      status: 'ok',
      reason: `${resolution.relPath} 命中 §${pointer.ref}`,
      target: resolution.relPath,
    }
  }
  return {
    status: 'dangling',
    reason: `目标文件 ${resolution.relPath} 无 §${pointer.ref}`,
    target: resolution.relPath,
  }
}

/**
 * 判定一条指针落不落空。
 *
 * @param pointer  待判指针
 * @param repoRoot 仓根
 * @param view     仓内视图（默认读磁盘；测试可注入内存视图 ⇒ 不碰磁盘）
 */
export function classifyTarget(
  pointer: SectionPointer,
  repoRoot: string,
  view: RepoView = createDiskRepoView(repoRoot),
): PointerStatus {
  return checkPointer(pointer, view).status
}

/* ════════════════════════════════════════════════════════ 纯函数：断链差 */

/**
 * 两次扫描所得断链集合的差。
 *
 * @param before 基准侧的断链标识集合
 * @param after  恢复侧的断链标识集合
 */
export function linkDelta(
  before: string[],
  after: string[],
): { added: string[]; removed: string[] } {
  const beforeSet = new Set(before)
  const afterSet = new Set(after)
  return {
    added: [...afterSet].filter((x) => !beforeSet.has(x)).sort(),
    removed: [...beforeSet].filter((x) => !afterSet.has(x)).sort(),
  }
}

/* ════════════════════════════════════════════════════════ CLI */

/** 命令行参数 */
interface CliOptions {
  /** 仓内相对路径 */
  file: string
  /** 节号 */
  section: string
  /** 基准：git rev，或 `-`（工作树） */
  against: string
  /** 是否输出 JSON */
  json: boolean
}

const USAGE =
  '用法：npx tsx scripts/restore-link-check.ts --file <仓内相对路径> --section <节号> --against <rev|-> [--json]'

/** 解析命令行参数（支持 `--x 值` 与 `--x=值` 两种写法） */
function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { file: '', section: '', against: '-', json: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? ''
    const eq = arg.indexOf('=')
    const name = eq >= 0 ? arg.slice(0, eq) : arg
    const inlineValue = eq >= 0 ? arg.slice(eq + 1) : undefined
    const take = (): string => {
      if (inlineValue !== undefined) return inlineValue
      i++
      return argv[i] ?? ''
    }
    if (name === '--file') opts.file = take()
    else if (name === '--section') opts.section = take()
    else if (name === '--against') opts.against = take()
    else if (name === '--json') opts.json = true
  }
  return opts
}

/**
 * 找仓根：从当前目录往上找带 `.git` 的那一层。
 *
 * **为什么不写死路径**：本仓的工作树路径是本机事实，写进脚本就等于把工具绑死在某一台机器上。
 */
function findRepoRoot(start: string): string {
  let dir = resolve(start)
  for (;;) {
    if (existsSync(join(dir, '.git'))) return dir
    const parent = resolve(dir, '..')
    if (parent === dir) return resolve(start)
    dir = parent
  }
}

/** 取基准 rev 下的文件内容；取不到抛错（由调用方转成「基准不可用」） */
function readBaseline(root: string, rev: string, relPath: string): string {
  return execFileSync('git', ['show', `${rev}:${relPath}`], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
}

/** 指针清单的一行（报告用） */
interface PointerReportRow {
  raw: string
  kind: 'qualified' | 'bare'
  file?: string
  ref?: string
  /** 相对整节起始的行号（1 起） */
  line: number
  status: PointerStatus
  reason: string
  target?: string
}

/** 断链标识：`<目标文件> §<节号>` */
function danglingKey(check: PointerCheck, pointer: SectionPointer): string {
  const file = check.target ?? pointer.file ?? '(未知文件)'
  return `${file} §${pointer.ref ?? '?'}`
}

/** 主流程 */
function main(): number {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.file === '' || opts.section === '') {
    console.error(`✗ 参数不足。${USAGE}`)
    return 2
  }

  const root = findRepoRoot(process.cwd())
  const relPath = opts.file.trim().replace(/^\.\//, '')
  const currentPath = join(root, relPath)
  if (!existsSync(currentPath)) {
    console.error(`✗ 文件不存在（相对仓根）：${relPath}`)
    return 2
  }
  const currentText = readFileSync(currentPath, 'utf8')

  const current = extractSection(currentText, opts.section)
  if (!current) {
    console.error(`✗ 当前文件里没有这一节：${relPath} §${opts.section}`)
    return 2
  }

  // 基准侧
  const againstIsWorktree = opts.against === '-'
  let baselineText: string
  if (againstIsWorktree) {
    baselineText = currentText
  } else {
    try {
      baselineText = readBaseline(root, opts.against, relPath)
    } catch (err) {
      console.error(`✗ 基准不可用：${opts.against}:${relPath}（${(err as Error).message.trim()}）`)
      return 2
    }
  }
  const baseline = extractSection(baselineText, opts.section)
  if (!baseline) {
    console.error(`✗ 基准无此节：${opts.against}:${relPath} 里没有 §${opts.section}`)
    return 2
  }

  // 逐字比对
  const diff = diffVerbatim(sectionText(baseline), sectionText(current))

  // 节内指针体检（只扫正文：标题行里的节号是本节自己的编号，不是指针）
  const view = createDiskRepoView(root)
  const bodyOffset = current.startLine // 正文首行 = startLine + 1（1 起）
  const currentPointers = collectSectionRefs(current.body).map((p) => ({
    pointer: p,
    check: checkPointer(p, view),
  }))
  const baselinePointers = collectSectionRefs(baseline.body).map((p) => ({
    pointer: p,
    check: checkPointer(p, view),
  }))

  const currentDangling = currentPointers
    .filter((x) => x.check.status === 'dangling')
    .map((x) => danglingKey(x.check, x.pointer))
  const baselineDangling = baselinePointers
    .filter((x) => x.check.status === 'dangling')
    .map((x) => danglingKey(x.check, x.pointer))
  const delta = linkDelta(baselineDangling, currentDangling)

  const rows: PointerReportRow[] = currentPointers.map(({ pointer, check }) => ({
    raw: pointer.raw,
    kind: pointer.kind,
    file: pointer.file,
    ref: pointer.ref,
    line: bodyOffset + pointer.line,
    status: check.status,
    reason: check.reason,
    target: check.target,
  }))

  const okCount = rows.filter((r) => r.status === 'ok').length
  const danglingCount = rows.filter((r) => r.status === 'dangling').length
  const undecidableCount = rows.filter((r) => r.status === 'undecidable').length
  const failed = !diff.identical || danglingCount > 0

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          file: relPath,
          section: opts.section,
          against: opts.against,
          againstIsWorktree,
          verbatim: {
            identical: diff.identical,
            totalLines: diff.totalLines,
            firstDiff: diff.firstDiff,
            diffs: diff.diffs,
            diffCount: diff.diffCount,
            truncated: diff.truncated,
          },
          pointers: rows,
          linkDelta: delta,
          summary: {
            total: rows.length,
            ok: okCount,
            dangling: danglingCount,
            undecidable: undecidableCount,
          },
          conclusion: {
            passed: !failed,
            exitCode: failed ? 1 : 0,
            message: failed
              ? `逐字${diff.identical ? '一致' : '不一致'}；节内落空指针 ${danglingCount} 条`
              : `逐字一致；节内无落空指针`,
          },
        },
        null,
        2,
      ),
    )
    return failed ? 1 : 0
  }

  // ── 人读报告 ──
  console.log(`── 逐字一致性 · ${relPath} §${opts.section} ──`)
  console.log(`基准：${againstIsWorktree ? '工作树（--against -）' : opts.against}`)
  if (diff.identical) {
    console.log(`结论：一致 —— 逐行比对 ${diff.totalLines} 行，零差异`)
  } else {
    console.log(
      `结论：不一致 —— 共 ${diff.diffCount} 处差异${diff.truncated ? `（清单已截断至 ${diff.diffs.length} 条）` : ''}`,
    )
    const first = diff.firstDiff
    if (first) {
      console.log(`第一处差异：第 ${first.line} 行（${first.kind}）`)
      if (first.original !== undefined) console.log(`  基准：${first.original}`)
      if (first.restored !== undefined) console.log(`  恢复：${first.restored}`)
    }
  }

  console.log('')
  console.log('── §-指针体检 · 恢复后节内（不含标题行）──')
  console.log(`统计：共 ${rows.length} 条 · ok ${okCount} · dangling ${danglingCount} · undecidable ${undecidableCount}`)
  for (const row of rows) {
    console.log(`  [${row.status.padEnd(11)}] 第 ${String(row.line).padStart(4)} 行  ${row.raw} —— ${row.reason}`)
  }

  console.log('')
  console.log('── 断链差（相对基准）──')
  console.log(`新增断链：${delta.added.length === 0 ? '（无）' : delta.added.join('、')}`)
  console.log(`消除断链：${delta.removed.length === 0 ? '（无）' : delta.removed.join('、')}`)

  console.log('')
  console.log(
    `结论：${failed ? '✗ 不通过' : '✓ 通过'} —— 逐字${diff.identical ? '一致' : '不一致'} · 节内落空指针 ${danglingCount} 条`,
  )
  console.log(`退出码：${failed ? 1 : 0}`)
  return failed ? 1 : 0
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main())
}
