#!/usr/bin/env tsx
/**
 * `scripts/section-ref-audit.ts` —— §-引用解析器 ＋ 悬空对账表。
 *
 * ## 它解决什么
 *
 * 仓内文档互相引用时用「`dev-plan.md` §16.10」这种形态。这类引用全仓 263 处，
 * 人读是读不完的 —— 上一轮就抓出 `theme.md` 里一条指向不存在的 §6.7 的断指针。
 * 本脚本把它变成**可复算**的：解析 → 建目标文件的节号索引 → 判定 → 出对账表。
 *
 * 它同时是「拆分 `docs/dev-plan.md`」的前置产物：拆分前必须先知道
 * **谁引用了 dev-plan 的哪一节**（对账表第 3 节），
 * 否则拆完才发现引用全断。
 *
 * ## 为什么只判「限定型」引用（**这个决定省掉了 600 条假红**）
 *
 * 裸写的 `§3` **不可判**：它在头部表格里常指**别的文档**的节
 * —— `§0.3` / `§0.4` 是跨文档的书写约定，`§10.4` 指 PRD 而非本文件。
 * 把裸引用当「同文件」判，实测会造出 608 条「断链」，其中绝大多数是假的。
 * ⇒ **假红比不红更坏**：本脚本只判**带文件名**的限定型引用，裸引用只报数。
 *
 * ## 三种子项形态（少收一种就会误判成断链）
 *
 * `§X.Y` 的 `Y` 在本仓有三种表达：
 * ① 子标题（`### 3.2 …`）；② 节内条目（`- **6.2 …**` 或有序列表 `7.`）；
 * ③ 表格行首标签（`| j | … |`，即「§7 的 j 行」）。
 * 三种都收进索引，条目型引用才不会误判。
 *
 * ## 顶层节有两种写法（少认一种就会造出假红）
 *
 * `## 2. 用户画像` 与 `## 第 2 章 · 现状量化` 都是顶层节。
 * 后者若不认，索引里就只有 `2.1` 而**没有 `2`** ⇒ 引用「§2」被误判断链。
 * 实证：`docs/PRD.md` 与 `docs/analysis-2026-10-02-first-principles.md`
 * 的顶层节全是「第 N 章」写法 ⇒ 缺这一条，两份文件的 §2～§10 全是死链。
 *
 * ## 判定口径：**只判可证伪的那一种**
 *
 * | 判定 | 条件 | 可证伪性 |
 * |---|---|---|
 * | **标题型绿** | 目标文件有该编号的标题 | 命中即绿 |
 * | **条目型绿** | 目标文件有父节，且该节的子项标签含被引末段 | 命中即绿 |
 * | **不可判** | 父节在，但子项没登记（可能指未登记的表格行） | 不判红 |
 * | **断链（红）** | 被引编号的**顶层节在目标文件里不存在** | 可证伪：没有 §7 就不可能有 §7-j |
 *
 * 最后一条是唯一的红：**「目标文件连这个顶层节都没有」**是无歧义的死链。
 * 其余情形一律不红 —— 宁可漏，不可造假红。
 *
 * ## 别名表：裸引用的**建议层**（`docs/section-ref-aliases.json`）
 *
 * 裸引用只报数 ⇒ 3500 余处裸引用里，机器只能判「自家能解」的那部分。
 * 别名表登记「节号 → 来源文件」，把**指向集中**的节号交给机器判：
 *
 * | 层 | 做什么 | 写错的后果 |
 * |---|---|---|
 * | **判据层** | 限定型引用落不落空（FR-12） | 报红 |
 * | **建议层** | 裸引用 → 限定化建议（别名表） | 只漏判 / 指错，**永不假红** |
 *
 * 候选集合 = 别名表登记的目标（**收窄**），任一命中即绿。
 * 登记写错 ⇒ 候选变小 ⇒ 要么退回不可解（漏判），要么指向另一个**确实有该节号**的
 * 文件（限定化后仍是绿的）⇒ **不会让闸报红**。
 *
 * ## 已知存量（登记，不是豁免）
 *
 * 存量 1 条断链在 `docs/dev-plan.md`，该文件当前属**并行会话保留区**（owner 裁定原样保留），
 * 故只登记不改。登记项若某轮不再出现，本脚本会反过来报「该清理了」——
 * 没有这条反向检查，登记就会变成没人对得上的死条目。
 * 别名表同样带这条反向检查（登记项多余 / 目标文件已消失）。
 *
 * ## 零依赖
 *
 * 只用 node 内建模块（`node:fs` / `node:path`）。
 *
 * ```bash
 * npx tsx scripts/section-ref-audit.ts                      # 判定并打印摘要（退出码：0 绿 / 1 红）
 * npx tsx scripts/section-ref-audit.ts --json               # 机器可读
 * npx tsx scripts/section-ref-audit.ts --write <path>       # 写对账表
 * npx tsx scripts/section-ref-audit.ts --emit-rewrite-plan  # 裸引用 → 限定化建议（给人落笔）
 * npx tsx scripts/section-ref-audit.ts --emit-alias-candidates  # 别名表候选登记表
 * ```
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

/* ════════════════════════════════════════════════════════ 常量与口径 */

/**
 * 扫描面：`docs/` 全树，**排除**三类目录。
 *
 * - `devlog-evidence/` —— 历次复审的**存档**，记录「当时为真」，不是活断言；
 * - `superpowers/` —— 历史计划稿；
 * - `agent-memory/` —— agent 记忆的**导出件**（跨项目内容，引用指向外部文档）。
 *
 * 排除它们不是为了让闸好看，是它们**本来就不该被当前文档的引用闸管**。
 */
export const EXCLUDED_DIRS = ['devlog-evidence/', 'superpowers/', 'agent-memory/']

/**
 * 判据面的扫描面：`docs/` 全树，**排除** `EXCLUDED_DIRS` 里的存档与历史目录。
 *
 * **单一出处**：独立脚本与并入 `docs:check` 的 FR-12 面共用这一条 ⇒ 两处口径不可能漂移。
 */
export function auditScope(rel: string): boolean {
  return rel.startsWith('docs/') && !EXCLUDED_DIRS.some((d) => rel.includes(d))
}

/** 被引节号的形态：数字开头，允许字母后缀与连字符标签（`7-j` / `3.2-M7` / `15.4b`） */
const REF_ID = /^\d+[0-9A-Za-z]*(?:[.-][0-9A-Za-z]+)*$/

/** 标题里的节号：`## 3. …` / `### 3.2 …` / `### 15.4b …` / `## 3-9b. …` */
const HEADING_ID = /^(?:§\s*)?(\d+[0-9A-Za-z]*(?:[.-][0-9A-Za-z]+)*)(?=\s|[.、，,：:）)]|$)/

/**
 * 标题里的「章」式节号：`## 第 2 章 · 现状量化`。
 *
 * ## 为什么必须单独认
 *
 * 本仓的顶层节有两种写法：**`## 2. 用户画像`**（数字开头）与
 * **`## 第 2 章 · 现状量化`**（「第」开头）。
 * 后者若不认，索引里就只有 `2.1`／`2.2` 而**没有 `2`** ⇒
 * 引用「§2」会被判成「顶层节不存在」⇒ **假红**。
 *
 * 实证：`docs/PRD.md` 与 `docs/analysis-2026-10-02-first-principles.md`
 * 的顶层节全是「第 N 章」写法，缺这一条 ⇒ 两份文件的 §2～§10 全是死链。
 */
const HEADING_CHAPTER = /^第\s*(\d+[0-9A-Za-z]*)\s*[章篇部]/

/** 非编号标题的标签：取首个词（`#### M7 团队协作` → `M7`；`### FR-1 …` → `FR-1`） */
const HEADING_LABEL = /^([0-9A-Za-z][0-9A-Za-z-]{0,5})(?=\s|$)/

/** 节内条目标签：`- **6.2 …**` */
const BOLD_LABEL = /^\s*(?:[-*+]\s*)?\*\*(\d+(?:\.\d+)*[A-Za-z]?)(?=\s|\*\*)/

/** 节内条目标签：有序列表项号 `7. ` */
const ORDERED_LABEL = /^(\d+)\.\s+\S/

/** 节内条目标签：表格行首标签 `| j | … |` */
const CELL_LABEL = /^\|\s*([0-9A-Za-z]{1,4}(?:-[0-9A-Za-z]{1,4})?)\s*\|/

/**
 * 已知存量断链的**读取方式**：**不在本文件里写死**。
 *
 * ## 为什么改为从基线文件读
 *
 * 本闸已并入 `docs:check`（作为 FR-12），两闸共用**同一个基线文件**
 * （`docs/docs-check-baseline.json`）⇒ 「哪些断链已知、为什么」只能有**一处**出处。
 * 留一份在代码里、一份在基线里 ⇒ 两处漂移，且基线的「登记项不再出现要报『该清理了』」
 * 这条反向检查就只对其中一份生效。
 *
 * ⇒ 已知存量登记在基线文件的 `known` 里，键 = `FR-12.1|<消息>`（精确登记）。
 */
export interface KnownDangling {
  /** 命中的判定消息（与基线键的后半段逐字相同） */
  message: string
  /** 登记理由（基线键的值） */
  why: string
}

/**
 * 从 `docs:check` 的基线文件里读出本闸的已知存量。
 *
 * **纯函数**（只吃解析好的 JSON）—— 检查器能直接调它，不用先造目录。
 *
 * @param baseline 基线文件解析结果（`{ known: Record<string, string> }`）
 */
export function parseKnownDangling(baseline: { known?: Record<string, string> }): KnownDangling[] {
  const out: KnownDangling[] = []
  for (const [key, why] of Object.entries(baseline.known ?? {})) {
    if (!key.startsWith('FR-12.1|')) continue
    out.push({ message: key.slice('FR-12.1|'.length), why })
  }
  return out
}

/* ════════════════════════════════════════════════════════ 纯函数：索引 */

/** 一个目标文件的节号索引 */
export interface SectionIndex {
  /** 编号型标题的节号集合，如 `3` / `3.2` / `15.4b` */
  sections: Set<string>
  /** 父节 → 其子项标签集合（子标题名 / 粗体条目 / 有序列表项号 / 表格行首标签） */
  labels: Map<string, Set<string>>
}

/**
 * 给一个 Markdown 文件建节号索引。
 *
 * **纯函数**（不碰文件系统）—— 检查器能直接调它，不用先造文件。
 *
 * @param md 文件全文
 */
export function indexSections(md: string): SectionIndex {
  const sections = new Set<string>()
  const labels = new Map<string, Set<string>>()
  const add = (parent: string, label: string): void => {
    let set = labels.get(parent)
    if (!set) {
      set = new Set<string>()
      labels.set(parent, set)
    }
    set.add(label)
  }

  let current: string | null = null
  let inFence = false
  for (const line of md.split('\n')) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence
      continue
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading && !inFence) {
      const text = heading[2]?.trim() ?? ''
      const numbered = HEADING_ID.exec(text)
      if (numbered) {
        const id = numbered[1] ?? ''
        // 子标题同时也是父节的子项标签：`### 3.2` 既是节号，也是 §3 下的一个条目
        if (current && current !== id) add(current, id)
        sections.add(id)
        current = id
      } else {
        // 「第 N 章」式顶层节（`## 第 2 章 · …`）：与 `## 2. …` 等价
        const chapter = HEADING_CHAPTER.exec(text)
        if (chapter) {
          const id = chapter[1] ?? ''
          if (current && current !== id) add(current, id)
          sections.add(id)
          current = id
          continue
        }
        // 非编号标题（`#### M7 团队协作`）：它的**标签**挂到当前编号节下，
        // 但**不重置** current —— 否则同一节下的第二个兄弟标签（`#### M7`）就丢了归属。
        // 影响面只有「绿 vs 不可判」，不影响红（红只看顶层节在不在）。
        const label = HEADING_LABEL.exec(text)?.[1]
        if (current && label) add(current, label)
      }
      continue
    }
    if (!current || inFence) continue
    const bold = BOLD_LABEL.exec(line)
    if (bold) {
      add(current, bold[1] ?? '')
      continue
    }
    const ordered = ORDERED_LABEL.exec(line)
    if (ordered) {
      add(current, ordered[1] ?? '')
      continue
    }
    const cell = CELL_LABEL.exec(line)
    if (cell) add(current, cell[1] ?? '')
  }
  return { sections, labels }
}

/* ════════════════════════════════════════════════════════ 纯函数：解析 */

export interface QualifiedRef {
  /** 被引目标文件的仓内相对路径（posix 分隔） */
  target: string
  /** 被引的节号原文 */
  ref: string
  /** 引用所在文件 */
  from: string
  /** 引用所在行号（1 起） */
  line: number
  /** 引用所在行的原文（截断） */
  context: string
}

export interface BareRef {
  /** 引用所在文件 */
  from: string
  /** 引用所在行号（1 起） */
  line: number
  /** 被引的节号原文 */
  id: string
  /** 行内原文（截断） */
  context: string
  /** 行内偏移（用于「原引用 → 新指向」的定位） */
  offset: number
}

export interface ParseResult {
  /** 限定型引用（带文件名） */
  refs: QualifiedRef[]
  /** 裸引用（不带文件名，指向不可确定 ⇒ 不判） */
  bare: BareRef[]
  /** 裸引用数（不带文件名，指向不可确定 ⇒ 不判） */
  bareCount: number
  /** 目标文件在仓内不唯一的引用（basename 重名 ⇒ 不判） */
  ambiguousCount: number
}

/**
 * 从一段文本里抽出 §-引用。
 *
 * **只收限定型**（`文件.md §N`）：目标文件由**仓内实际文件名反查**得到，
 * 不靠正则猜文件名 —— 猜会过捕获（实测把两��文件名粘成一条）。
 *
 * @param text       文件全文
 * @param from       引用所在文件的仓内相对路径
 * @param basenameIndex basename → 仓内相对路径列表（长度 >1 即重名，不可判）
 */
export function parseSectionRefs(
  text: string,
  from: string,
  basenameIndex: Map<string, string[]>,
): ParseResult {
  const refs: QualifiedRef[] = []
  const bare: BareRef[] = []
  let ambiguousCount = 0

  const names = [...basenameIndex.keys()].sort((a, b) => b.length - a.length)
  if (names.length === 0) return { refs, bare, bareCount: 0, ambiguousCount }
  const alt = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  // 文件名 → 反引号/助词/空白 → § → 节号
  const re = new RegExp(`(${alt})(\`?\\s*(?:的|中)?\\s*§\\s*)([0-9][0-9A-Za-z.-]*)`, 'g')

  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const occupied: [number, number][] = []
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(line)) !== null) {
      occupied.push([m.index, m.index + m[0].length])
      const candidates = basenameIndex.get(m[1] ?? '') ?? []
      if (candidates.length !== 1) {
        ambiguousCount++
        continue
      }
      refs.push({
        target: candidates[0] ?? '',
        ref: m[3] ?? '',
        from,
        line: i + 1,
        context: line.trim().slice(0, 120),
      })
    }
    // 裸引用：`§` 出现在未被限定型引用占用的位置
    for (const mm of line.matchAll(/§\s*([0-9][0-9A-Za-z.-]*)/g)) {
      const at = mm.index ?? 0
      if (occupied.some(([s, e]) => at >= s && at < e)) continue
      bare.push({
        from,
        line: i + 1,
        id: mm[1] ?? '',
        context: line.trim().slice(0, 120),
        offset: at,
      })
    }
  }
  return { refs, bare, bareCount: bare.length, ambiguousCount }
}

/* ════════════════════════════════════════════════════════ 纯函数：判定 */

export type RefVerdict = 'heading' | 'item' | 'undecidable' | 'dangling'

/**
 * 判定一条引用在目标文件里是否落空。
 *
 * **唯一的红是「顶层节不存在」** —— 可证伪，且不依赖任何子项约定。
 * 父节在但子项没登记的，一律 `undecidable`（可能指未登记的表格行）。
 */
export function classifyRef(ref: string, target: SectionIndex): RefVerdict {
  if (!REF_ID.test(ref)) return 'undecidable'
  if (target.sections.has(ref)) return 'heading'

  // 最长祖先优先：`3.2-M7` 的祖先是 `3.2`（不是 `3`）
  for (let k = ref.length - 1; k > 0; k--) {
    const ch = ref[k]
    if (ch !== '.' && ch !== '-') continue
    const ancestor = ref.slice(0, k)
    if (!target.sections.has(ancestor)) continue
    const labels = target.labels.get(ancestor)
    const last = ref.slice(k + 1)
    if (labels && (labels.has(ref) || labels.has(last) || labels.has(last.replace(/-/g, '')))) {
      return 'item'
    }
    return 'undecidable'
  }

  // 没有带分隔符的祖先候选 ⇒ 单段编号：目标文件有没有这个顶层节？
  const top = /^\d+/.exec(ref)?.[0] ?? ref
  return target.sections.has(top) ? 'undecidable' : 'dangling'
}

/* ════════════════════════════════════════════════════════ 汇总 */

export interface AuditFinding {
  ref: QualifiedRef
  verdict: RefVerdict
  /** 是否命中已知存量登记 */
  known: boolean
  /** 判定消息（与 `docs:check` 的 Finding 消息逐字相同 ⇒ 基线可按 `rule|消息` 对齐） */
  message: string
}

/** 断链的判定消息（基线键 = `FR-12.1|` ＋ 本消息） */
export function danglingMessage(target: string, ref: string): string {
  return `§-引用指向不存在的节：${target} §${ref}`
}

export interface AuditResult {
  findings: AuditFinding[]
  /** 限定型引用总数 */
  total: number
  /** 裸引用明细（不可判，只报数；改写清单用它出建议） */
  bareRefs: BareRef[]
  /** 裸引用数（不可判，只报数） */
  bareCount: number
  /** 目标重名而不可判的引用数 */
  ambiguousCount: number
  /** 未登记的断链（红） */
  dangling: AuditFinding[]
  /** 命中已知存量的断链 */
  knownDangling: AuditFinding[]
  /** 登记了但本轮不再出现（该清理了） */
  staleKnown: string[]
  /** 判定分布 */
  counts: Record<RefVerdict, number>
}

/**
 * 跑一遍全仓判定。
 *
 * @param docs       参与扫描的文件（`{ path, content }`，path 为 posix 相对路径）
 * @param targets    目标文件的节号索引（basename → 索引），可含扫描面之外的文件
 * @param known      已知存量登记（默认空；CLI 从基线文件读，见 `parseKnownDangling`）
 */
export function auditSectionRefs(
  docs: { path: string; content: string }[],
  targets: Map<string, SectionIndex>,
  known: KnownDangling[] = [],
): AuditResult {
  const basenameIndex = new Map<string, string[]>()
  for (const path of targets.keys()) {
    const base = path.slice(path.lastIndexOf('/') + 1)
    const list = basenameIndex.get(base) ?? []
    list.push(path)
    basenameIndex.set(base, list)
  }

  const findings: AuditFinding[] = []
  const bareRefs: BareRef[] = []
  let ambiguousCount = 0
  for (const doc of docs) {
    const parsed = parseSectionRefs(doc.content, doc.path, basenameIndex)
    bareRefs.push(...parsed.bare)
    ambiguousCount += parsed.ambiguousCount
    for (const ref of parsed.refs) {
      const index = targets.get(ref.target)
      if (!index) continue
      const verdict = classifyRef(ref.ref, index)
      findings.push({
        ref,
        verdict,
        known: false,
        message:
          verdict === 'dangling'
            ? danglingMessage(ref.target, ref.ref)
            : `${ref.target} §${ref.ref}`,
      })
    }
  }

  // 存量对齐：按「文件 + 被引节号」对齐，**不按行号** —— 行号会随文件增删漂移。
  // ⚠️ 必须在分类**之后**、过滤**之前**做，否则存量会被当成未登记断链（红）。
  const knownKeys = new Set(known.map((k) => k.message))
  const knownFound = new Set<string>()
  for (const f of findings) {
    if (f.verdict !== 'dangling') continue
    if (!knownKeys.has(f.message)) continue
    f.known = true
    knownFound.add(f.message)
  }

  const dangling = findings.filter((f) => f.verdict === 'dangling' && !f.known)
  const knownDangling = findings.filter((f) => f.verdict === 'dangling' && f.known)
  const counts: Record<RefVerdict, number> = { heading: 0, item: 0, undecidable: 0, dangling: 0 }
  for (const f of findings) counts[f.verdict]++

  const staleKnown = known.filter((k) => !knownFound.has(k.message)).map((k) => k.message)

  return {
    findings,
    total: findings.length,
    bareRefs,
    bareCount: bareRefs.length,
    ambiguousCount,
    dangling,
    knownDangling,
    staleKnown,
    counts,
  }
}

/* ════════════════════════════════════════════════════════ 对账表 */

/**
 * 生成对账表 Markdown。
 *
 * 四节：① 判定摘要 ② 断链清单 ③ **拆分影响面**（谁引用了 `docs/dev-plan.md` 的哪一节）
 * ④ 附面（仓根 md，只报数不判红）。
 * 第 ③ 节是「拆 dev-plan.md 前置」要用的那张表。
 */
export function buildReport(
  result: AuditResult,
  options: { splitTarget?: string; aux?: AuditResult; known?: KnownDangling[] } = {},
): string {
  const splitTarget = options.splitTarget ?? 'docs/dev-plan.md'
  const aux = options.aux
  const known = options.known ?? []
  const lines: string[] = []
  lines.push('# §-引用对账表')
  lines.push('')
  lines.push('> 生成方式：`npx tsx scripts/section-ref-audit.ts --write <本文件>`。')
  lines.push('> 判定口径与边界见 `scripts/section-ref-audit.ts` 文件头（**只判限定型引用；红只出在「目标文件连顶层节都没有」**）。')
  lines.push('> 本表是**点时快照**：文档改了要重跑重写；它不替代闸，`scripts/section-ref-audit.ts` 才是闸。')
  lines.push('> ⚠️ 判定基于**当前工作树**（不是 HEAD）—— 未提交的改动会改变本表（某节尚未入库、或已从工作树移除）。')
  lines.push('')

  lines.push('## 1. 判定摘要')
  lines.push('')
  lines.push('| 项 | 数 |')
  lines.push('|---|---|')
  lines.push(`| 限定型引用（可判面） | ${result.total} |`)
  lines.push(`| ├ 标题型绿 | ${result.counts.heading} |`)
  lines.push(`| ├ 条目型绿 | ${result.counts.item} |`)
  lines.push(`| ├ 不可判（父节在、子项未登记） | ${result.counts.undecidable} |`)
  lines.push(`| └ 断链（红） | ${result.counts.dangling} |`)
  lines.push(`| 裸引用（不可判，只报数） | ${result.bareCount} |`)
  lines.push(`| 目标文件重名而不可判 | ${result.ambiguousCount} |`)
  lines.push('')

  lines.push('## 2. 断链清单')
  lines.push('')
  if (result.dangling.length === 0 && result.knownDangling.length === 0) {
    lines.push('（无）')
  } else {
    lines.push('| 位置 | 被引 | 状态 | 说明 |')
    lines.push('|---|---|---|---|')
    for (const f of result.knownDangling) {
      lines.push(
        `| \`${f.ref.from}:${f.ref.line}\` | \`${f.ref.target} §${f.ref.ref}\` | 已知存量（只报不改） | ${known.find((k) => k.message === f.message)?.why ?? ''} |`,
      )
    }
    for (const f of result.dangling) {
      lines.push(
        `| \`${f.ref.from}:${f.ref.line}\` | \`${f.ref.target} §${f.ref.ref}\` | **未登记断链** | ${f.ref.context} |`,
      )
    }
  }
  lines.push('')
  if (result.staleKnown.length > 0) {
    lines.push('⚠️ **登记项本轮不再出现 —— 该清理了**：')
    for (const s of result.staleKnown) lines.push(`- \`${s}\``)
    lines.push('')
  }

  lines.push('## 3. 拆分影响面：谁引用了 `docs/dev-plan.md` 的哪一节')
  lines.push('')
  const bySection = new Map<string, AuditFinding[]>()
  for (const f of result.findings) {
    if (f.ref.target !== splitTarget) continue
    const list = bySection.get(f.ref.ref) ?? []
    list.push(f)
    bySection.set(f.ref.ref, list)
  }
  if (bySection.size === 0) {
    lines.push('（无）')
  } else {
    lines.push('| 被引节号 | 引用处数 | 引用位置 |')
    lines.push('|---|---|---|')
    const sorted = [...bySection.entries()].sort((a, b) => b[1].length - a[1].length)
    for (const [ref, list] of sorted) {
      const where = list.map((f) => `\`${f.ref.from}:${f.ref.line}\``).join('、')
      lines.push(`| §${ref} | ${list.length} | ${where} |`)
    }
    lines.push('')
    lines.push(
      `合计 **${[...bySection.values()].reduce((n, l) => n + l.length, 0)} 处**限定型引用指向 \`${splitTarget}\`。`,
    )
    lines.push('')
    lines.push(
      '⚠️ **这张表不含裸引用** —— 裸 `§N` 的指向不可判定（见文件头「为什么只判限定型」）。' +
        '拆分时裸引用必须**逐条人工确认**，机械改写会改错指向。',
    )
  }
  lines.push('')

  if (aux) {
    lines.push('## 4. 附面：仓根 md（`DEV_LOG.md` / `README.md`）—— 只报数，不判红')
    lines.push('')
    lines.push(
      '**为什么不判红**：仓根的日志记录的是**当时为真**的状态，' +
        '条目里出现已被删掉的节号属正常（如 §17 的整节删除）。' +
        '把它们算进红，等于要求三年前的日志补今天的结构 —— 那是给历史制造噪声。' +
        '但它们**必须被看见**：日志里指着已删节号的条目，正是「谁在依赖这一节」的线索。',
    )
    lines.push('')
    lines.push('| 项 | 数 |')
    lines.push('|---|---|')
    lines.push(`| 限定型引用 | ${aux.total} |`)
    lines.push(`| 裸引用（不可判） | ${aux.bareCount} |`)
    lines.push(`| 断链（只报数） | ${aux.counts.dangling} |`)
    lines.push('')
    if (aux.dangling.length > 0) {
      lines.push('| 位置 | 被引 | 上下文 |')
      lines.push('|---|---|---|')
      for (const f of aux.dangling) {
        lines.push(
          `| \`${f.ref.from}:${f.ref.line}\` | \`${f.ref.target} §${f.ref.ref}\` | ${f.ref.context.replace(/\|/g, '\\|')} |`,
        )
      }
      lines.push('')
    }
  }
  lines.push('')
  return lines.join('\n')
}

/* ════════════════════════════════════════════════════════ 改写清单 */

/**
 * 裸引用 → 限定化的**建议**。
 *
 * ## 为什么是「建议」而不是「判定」
 *
 * 裸 `§N` 的指向机器判不了（`§7` 在 31 份文件里都存在）⇒ 本函数**只对全仓唯一可解的
 * 节号出建议**，其余列入「待人工确认」，**绝不猜**。
 *
 * ## 为什么建议本身不会造成假红
 *
 * 限定化的方向是「把裸引用写成带文件名的引用」⇒ 判据面上从「不可判」变成「可判」，
 * 且**候选目标永远包含原指向** ⇒ 写错最多是「仍不可判」，不会造出假红。
 */
export interface RewriteSuggestion {
  ref: BareRef
  /** 建议写成 `目标文件 §id` */
  target: string
}

export interface RewriteAmbiguity {
  id: string
  /** 出现处数（去重到行） */
  count: number
  /** 能解它的文件数 */
  resolverCount: number
  /** 候选文件（最多列 6 个） */
  candidates: string[]
  /** 出现位置（前 6 个） */
  places: string[]
}

export interface RewritePlan {
  suggestions: RewriteSuggestion[]
  ambiguities: RewriteAmbiguity[]
  /** 自家不可解且全仓无可解目标（真·断链） */
  unresolvable: BareRef[]
}

/**
 * 算出裸引用的改写建议。
 *
 * @param bareRefs 裸引用明细
 * @param targets  目标文件的节号索引
 * @param aliases  别名表（登记过的节号 ⇒ 候选被**收窄**到登记的目标）
 */
export function buildRewritePlan(
  bareRefs: BareRef[],
  targets: Map<string, SectionIndex>,
  aliases: AliasTable = { aliases: new Map() },
): RewritePlan {
  const suggestions: RewriteSuggestion[] = []
  const ambiguities = new Map<string, RewriteAmbiguity>()
  const unresolvable: BareRef[] = []

  for (const ref of bareRefs) {
    const own = targets.get(ref.from)
    // 自家能解 ⇒ 这条本来就是同文件引用，不必限定化
    if (own && (classifyRef(ref.id, own) === 'heading' || classifyRef(ref.id, own) === 'item')) {
      continue
    }
    const resolution = resolveBareRef(ref.id, ref.from, targets, aliases)
    const resolvers = resolution.resolvers
    const where = `${ref.from}:${ref.line}`
    if (resolvers.length === 0) {
      unresolvable.push(ref)
      continue
    }
    if (resolvers.length === 1) {
      suggestions.push({ ref, target: resolvers[0]! })
      continue
    }
    const entry = ambiguities.get(ref.id) ?? {
      id: ref.id,
      count: 0,
      resolverCount: resolvers.length,
      candidates: resolvers.slice(0, 6),
      places: [],
    }
    entry.count++
    if (entry.places.length < 6) entry.places.push(where)
    ambiguities.set(ref.id, entry)
  }

  return {
    suggestions,
    ambiguities: [...ambiguities.values()].sort((a, b) => b.count - a.count),
    unresolvable,
  }
}

/**
 * 拆分改写清单：把限定型引用按「旧文件＋节号 → 新文件」映射展开。
 *
 * @param map 映射表：`{ "<旧文件路径>": { "<节号>": "<新文件路径>" } }`；
 *              映射缺失的条目列入「未映射」表（不猜）。
 */
export function buildSplitRewriteRows(
  findings: AuditFinding[],
  map: Record<string, Record<string, string>>,
): { mapped: { from: string; ref: string; target: string; newTarget: string; places: string[] }[]; unmapped: { from: string; ref: string; places: string[] }[] } {
  const byKey = new Map<string, { from: string; ref: string; target: string; places: string[] }>()
  for (const f of findings) {
    const key = `${f.ref.target}|${f.ref.ref}`
    const entry = byKey.get(key) ?? {
      from: f.ref.target,
      ref: f.ref.ref,
      target: f.ref.target,
      places: [],
    }
    entry.places.push(`${f.ref.from}:${f.ref.line}`)
    byKey.set(key, entry)
  }
  const mapped: { from: string; ref: string; target: string; newTarget: string; places: string[] }[] = []
  const unmapped: { from: string; ref: string; places: string[] }[] = []
  for (const entry of byKey.values()) {
    const sectionMap = map[entry.target]
    const newTarget = sectionMap?.[entry.ref]
    if (newTarget) {
      mapped.push({ ...entry, newTarget })
    } else {
      unmapped.push({ from: entry.from, ref: entry.ref, places: entry.places })
    }
  }
  return { mapped, unmapped }
}

/**
 * 生成改写清单 Markdown。
 *
 * 三节：① 裸引用 → 限定化建议 ② 待人工确认（目标不唯一）③ 拆分改写清单。
 */
export function buildRewriteReport(
  plan: RewritePlan,
  split: { mapped: { from: string; ref: string; target: string; newTarget: string; places: string[] }[]; unmapped: { from: string; ref: string; places: string[] }[] },
): string {
  const lines: string[] = []
  lines.push('# §-引用改写清单')
  lines.push('')
  lines.push('> 生成方式：`npx tsx scripts/section-ref-audit.ts --emit-rewrite-plan`。')
  lines.push('> **这是给人落笔的清单，不是判据** —— 判据是 `scripts/section-ref-audit.ts`（退出码才有红绿）。')
  lines.push('> 建议**只对「全仓唯一可解」的节号给**；目标不唯一的列入第 2 节，**机器不猜**。')
  lines.push('')

  lines.push('## 1. 裸引用 → 限定化建议（机器可判的）')
  lines.push('')
  if (plan.suggestions.length === 0) {
    lines.push('（无）')
  } else {
    lines.push('| 位置 | 现状 | 建议写成 |')
    lines.push('|---|---|---|')
    for (const s of plan.suggestions) {
      lines.push(
        `| \`${s.ref.from}:${s.ref.line}\` | \`§${s.ref.id}\` | \`${s.target.slice(s.target.lastIndexOf('/') + 1)} §${s.ref.id}\` |`,
      )
    }
    lines.push('')
    lines.push(`合计 **${plan.suggestions.length} 处**。`)
  }
  lines.push('')

  lines.push('## 2. 待人工确认（目标不唯一，机器不猜）')
  lines.push('')
  if (plan.ambiguities.length === 0) {
    lines.push('（无）')
  } else {
    lines.push('| 节号 | 出现处数 | 能解它的文件数 | 候选（节号在多个文件里都存在 ⇒ 需看上下文） | 出现位置（抽样） |')
    lines.push('|---|---|---|---|---|')
    for (const a of plan.ambiguities) {
      lines.push(
        `| \`§${a.id}\` | ${a.count} | ${a.resolverCount} | ${a.candidates.map((c) => `\`${c.slice(c.lastIndexOf('/') + 1)}\``).join('、')} | ${a.places.map((p) => `\`${p}\``).join('、')} |`,
      )
    }
    lines.push('')
    lines.push(
      '⚠️ 这些节号在**多份文件里都存在** ⇒ 机器无法判定它指哪一份。' +
        '要消除它们，只能**逐条看上下文**或**限定化改写**（第 1 节那种做法）。',
    )
  }
  lines.push('')

  lines.push('## 3. 拆分改写清单（限定型引用 → 拆分后的新文件）')
  lines.push('')
  lines.push('| 原引用 | 引用处数 | 新指向 | 引用位置 |')
  lines.push('|---|---|---|---|')
  if (split.mapped.length === 0) {
    lines.push('| （映射未定义或无命中） | — | — | — |')
  } else {
    for (const m of split.mapped) {
      lines.push(
        `| \`${m.target} §${m.ref}\` | ${m.places.length} | \`${m.newTarget}\` | ${m.places.map((p) => `\`${p}\``).join('、')} |`,
      )
    }
  }
  lines.push('')
  if (split.unmapped.length > 0) {
    lines.push(
      `⚠️ **未映射 ${split.unmapped.length} 组**（映射表没给「旧文件＋节号 → 新文件」的对应）：` +
        '这些引用在拆分后会断链，**需人工补映射**。',
    )
    lines.push('')
    lines.push('| 原引用 | 引用处数 | 引用位置 |')
    lines.push('|---|---|---|')
    for (const u of split.unmapped) {
      lines.push(
        `| \`${u.from} §${u.ref}\` | ${u.places.length} | ${u.places.map((p) => `\`${p}\``).join('、')} |`,
      )
    }
    lines.push('')
  }
  lines.push('')
  return lines.join('\n')
}

/* ════════════════════════════════════════════════════════ 别名表 */

/**
 * 别名表：一張「节号 → 来源文件」的人工登记表。
 *
 * ## 它解決什麼
 *
 * 裸引用 `§N` 的指向不可判定 —— 同一个节号常常在多份文件裡都存在。
 * 实测（主面 `docs/`）：裸引用 3431 條，自家可解 2219、**自家不可解 980**；
 * 不可解裡「多目标」佔絕大多数 —— 机器知道 `§7` 在好幾份文件裡都有，
 * 卻不知道**这條引用指的是哪一份**。
 *
 * ## 判定口徑：**别名表收窄候選，任一命中即綠**
 *
 * 一條裸引用的候選文件集合：
 *
 * | 情形 | 候選集合 |
 * |---|---|
 * | 别名表登记了該节号 | **别名表登记的目标文件**（收窄：别处的文件不再是候選） |
 * | 别名表没登记 | 自家文件 |
 *
 * `resolvers` = 候選集合裡**能解**該节号的文件。
 *
 * ## 为什麼「收窄」是安全的（**假紅防護**）
 *
 * 别名表登錯 ⇒ 候選集合變小 ⇒ 要麼 resolvers 为空（退回不可解 ⇒ 漏判），
 * 要麼 resolvers 指向另一个**确实有該节号**的文件 ⇒ 限定化后仍是**綠**的。
 * ⇒ **别名表登錯只造成漏判或指錯，永遠不會讓閘報紅。**
 * 若口徑反过来（「必須命中全部登记目标」），写錯就會造出假紅 —— 方向反了。
 *
 * 别名表**不參與判紅**：FR-12 只判限定型引用落空，别名表只服務於
 * 「裸引用 → 限定化」的改写建議 ⇒ 它是**建議層**，不是**判據層**。
 */
export interface AliasTable {
  /** 节号 → 来源文件的倉內相對路徑（posix 分隔） */
  aliases: Map<string, string[]>
}

/** 别名表档案的預設位置（倉內数據档案 ⇒ 口徑單处、可入版本庫） */
export const ALIAS_FILE = 'docs/section-ref-aliases.json'

/**
 * 從别名表档案（JSON）解析出别名表。
 *
 * **純函数**（只吃解析好的 JSON）—— 檢查器能直接調它，不用先造档案。
 *
 * 形狀：`{ "aliases": { "<节号>": ["<来源档案>", ...] } }`
 */
export function parseAliases(json: { aliases?: Record<string, string[]> }): AliasTable {
  const aliases = new Map<string, string[]>()
  for (const [id, list] of Object.entries(json.aliases ?? {})) {
    const targets = (list ?? []).filter((t): t is string => typeof t === 'string' && t.length > 0)
    if (targets.length === 0) continue
    aliases.set(id, targets)
  }
  return { aliases }
}

/** 一條裸引用的解析結果 */
export interface BareResolution {
  /** 候選集合（别名表登记時＝登记的目标；未登记時＝全倉能解該节号的档案） */
  candidates: string[]
  /** 候選集合裡能解該节号的档案 */
  resolvers: string[]
  /** 候選集合是别名表收窄的（否則是机器自找） */
  viaAlias: boolean
}

/**
 * 解析一條裸引用能指到哪。
 *
 * ## 候選集合怎麼来（**别名表是收窄，不是替換**）
 *
 * | 情形 | 候選集合 |
 * |---|---|
 * | 别名表登记了該节号 | **别名表登记的目标档案**（收窄：别处的档案不再是候選） |
 * | 别名表没登记 | **全倉能解該节号的档案**（机器自己找） |
 *
 * 未登记時若把候選收窄成「自家」，就會丟掉「全倉唯一可解」那批本可自動建議的引用
 * ⇒ **收窄只能作用在已登记的节号上**。
 *
 * @param id      被引节号
 * @param from    引用所在档案（自家）
 * @param targets 全倉目标索引
 * @param aliases 别名表
 */
export function resolveBareRef(
  id: string,
  from: string,
  targets: Map<string, SectionIndex>,
  aliases: AliasTable,
): BareResolution {
  const aliased = aliases.aliases.get(id)
  const canResolve = (path: string): boolean => {
    const index = targets.get(path)
    if (!index) return false
    const v = classifyRef(id, index)
    return v === 'heading' || v === 'item'
  }
  const candidates = aliased ? [...new Set(aliased)] : [...targets.keys()].filter(canResolve)
  const resolvers = candidates.filter(canResolve)
  return { candidates, resolvers, viaAlias: aliased !== undefined }
}

/** 一个「需人工裁定来源」的节号候選 */
export interface AliasCandidate {
  /** 节号 */
  id: string
  /** 出现处数（去重到行） */
  count: number
  /** 能解它的档案（全部，不受别名表影響） */
  resolvers: string[]
  /** 样例上下文（最多 4 处） */
  samples: { place: string; context: string }[]
}

/**
 * 生成「需人工裁定来源」的节号候選表。
 *
 * ## 为什麼要这張表
 *
 * 机器能給的只有「`§7` 在这 3 份文件裡都有」—— 但**哪一份才是这條引用指的**，
 * 只有看上下文才知道 ⇒ 这一步**机器替不了**，只能把工作量从「逐條讀 3431 处引用」
 * 壓到「逐條讀 N 个节号的样例上下文」。
 *
 * ## 涵蓋範圍
 *
 * 只收**自家不可解**的裸引用（自家能解的本来就是同档案引用，不該限定化）。
 * 其中「唯一可解」的由 `buildRewritePlan` **全自動**覆蓋，不需要人工登记；
 * 本表把三類都列出来，是为了讓人看清**哪些还要裁**、**哪些裁不了**。
 *
 * @param bareRefs 裸引用明細
 * @param targets  全倉目标索引
 */
export function buildAliasCandidates(
  bareRefs: BareRef[],
  targets: Map<string, SectionIndex>,
): AliasCandidate[] {
  const acc = new Map<string, AliasCandidate>()
  const seen = new Set<string>()
  for (const ref of bareRefs) {
    const own = targets.get(ref.from)
    if (own && (classifyRef(ref.id, own) === 'heading' || classifyRef(ref.id, own) === 'item')) continue
    const key = `${ref.id}|${ref.from}|${ref.line}`
    if (seen.has(key)) continue
    seen.add(key)
    const resolvers: string[] = []
    for (const [path, index] of targets) {
      if (path === ref.from) continue
      const v = classifyRef(ref.id, index)
      if (v === 'heading' || v === 'item') resolvers.push(path)
    }
    const entry = acc.get(ref.id) ?? { id: ref.id, count: 0, resolvers, samples: [] }
    entry.count++
    if (entry.samples.length < 4) {
      entry.samples.push({ place: `${ref.from}:${ref.line}`, context: ref.context })
    }
    acc.set(ref.id, entry)
  }
  return [...acc.values()].sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))
}

/** 候選表的三類分档（供報告與登记用） */
export interface AliasCandidateBuckets {
  /** 唯一可解（全自動覆蓋，不需要人工登记） */
  auto: AliasCandidate[]
  /** 多目标（需人工裁定来源） */
  needHuman: AliasCandidate[]
  /** 全倉無可解（别名表也救不了 —— 目标档案裡根本没这个节号） */
  hopeless: AliasCandidate[]
}

/** 把候選表按「可解度」分三档 */
export function bucketAliasCandidates(candidates: AliasCandidate[]): AliasCandidateBuckets {
  const auto: AliasCandidate[] = []
  const needHuman: AliasCandidate[] = []
  const hopeless: AliasCandidate[] = []
  for (const c of candidates) {
    if (c.resolvers.length === 0) hopeless.push(c)
    else if (c.resolvers.length === 1) auto.push(c)
    else needHuman.push(c)
  }
  return { auto, needHuman, hopeless }
}

/**
 * 生成别名表候選報告 Markdown（**給人登记用**）。
 *
 * 兩节：① 需人工裁定（多目标）② 分档摘要（唯一可解 / 無可解）。
 */
export function buildAliasCandidateReport(candidates: AliasCandidate[]): string {
  const buckets = bucketAliasCandidates(candidates)
  const lines: string[] = []
  lines.push('# §-引用别名表 · 候選登记表')
  lines.push('')
  lines.push('> 生成方式：`npx tsx scripts/section-ref-audit.ts --emit-alias-candidates`。')
  lines.push('> **这是給人落筆的登记表** —— 判定口徑見 `scripts/section-ref-audit.ts` 文件頭「别名表」节。')
  lines.push('> 登记形狀：`{ "<节号>": ["<来源档案>", ...] }`（档案路徑用倉內相對路徑）。')
  lines.push('')

  lines.push('## 1. 需人工裁定来源（多目标）')
  lines.push('')
  if (buckets.needHuman.length === 0) {
    lines.push('（無）')
  } else {
    lines.push('| 节号 | 出现处数 | 能解它的档案 | 样例上下文 |')
    lines.push('|---|---|---|---|')
    for (const c of buckets.needHuman) {
      const ctx = c.samples
        .map((s) => `\`${s.place}\` ${s.context.replace(/\|/g, '\\|').slice(0, 60)}`)
        .join('<br>')
      lines.push(
        `| \`§${c.id}\` | ${c.count} | ${c.resolvers.map((r) => `\`${r}\``).join('、')} | ${ctx} |`,
      )
    }
  }
  lines.push('')

  lines.push('## 2. 分档摘要')
  lines.push('')
  lines.push('| 分档 | 节号数 | 说明 |')
  lines.push('|---|---|---|')
  lines.push(`| 唯一可解（全自動覆蓋） | ${buckets.auto.length} | 只有一份档案能解 ⇒ 机器直接出建議，**不需人工登记** |`)
  lines.push(`| 多目标（需人工裁定） | ${buckets.needHuman.length} | 多份档案都能解 ⇒ 只有看上下文能定 |`)
  lines.push(`| 全倉無可解 | ${buckets.hopeless.length} | 没有任何档案有这个节号 ⇒ 别名表也救不了 |`)
  lines.push('')
  return lines.join('\n')
}

/**
 * 别名表登记项的**反向检查**：登记还在，但已经不必要了。
 *
 * ## 为什么必须有
 *
 * 别名表是**手工维护**的表。没有反向检查，它会慢慢积累没人对得上的死条目
 * —— 节号被改写、目标文件被拆掉、引用被限定化之后，登记项还在原地。
 * 这套机制在 `docs:check` 的基线里已经证明过必要性（登记项不再出现要报「该清理了」）。
 *
 * ## 两类失效
 *
 * | 失效 | 判定 |
 * |---|---|
 * | **多余** | 该节号现在**自家能解**（引用被限定化过了）⇒ 不必再登记 |
 * | **目标丢失** | 登记的目标文件在仓内已不存在 |
 *
 * **只报数，不判红** —— 别名表是**建议层**，它的问题不该让 CI 变红。
 */
export interface AliasAudit {
  /** 仍然生效的登记项数 */
  active: number
  /** 已多余（该节号自家可解）的登记节号 */
  redundant: string[]
  /** 目标文件已不存在的登记项 */
  missingTarget: { id: string; target: string }[]
}

/**
 * 检查别名表登记项是否已失效。
 *
 * **纯函数**（只吃解析好的数据）—— 检查器能直接调它。
 *
 * @param aliases  别名表
 * @param bareRefs 裸引用明细（用来判「自家可解」）
 * @param targets  全仓目标索引（用来判「目标文件是否存在」）
 */
export function auditAliasEntries(
  aliases: AliasTable,
  bareRefs: BareRef[],
  targets: Map<string, SectionIndex>,
): AliasAudit {
  // 自家能解的节号集合（引用方文件 → 节号）
  const selfResolvable = new Set<string>()
  for (const ref of bareRefs) {
    const own = targets.get(ref.from)
    if (!own) continue
    const v = classifyRef(ref.id, own)
    if (v === 'heading' || v === 'item') selfResolvable.add(`${ref.from}|${ref.id}`)
  }

  const redundant: string[] = []
  const missingTarget: { id: string; target: string }[] = []
  let active = 0
  for (const [id, list] of aliases.aliases) {
    for (const target of list) {
      if (!targets.has(target)) {
        missingTarget.push({ id, target })
        continue
      }
      active++
    }
    // 该节号是否还在裸引用里、且已经自家可解（⇒ 登记多余）
    const stillBare = bareRefs.some(
      (r) => r.id === id && !selfResolvable.has(`${r.from}|${r.id}`),
    )
    if (!stillBare) redundant.push(id)
  }
  return { active, redundant, missingTarget }
}

/* ════════════════════════════════════════════════════════ CLI */

function collectMarkdown(root: string): { docs: string[]; rootFiles: string[] } {
  const docs: string[] = []
  const rootFiles: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.md')) docs.push(full)
    }
  }
  walk(join(root, 'docs'))
  for (const name of readdirSync(root)) {
    if (name.endsWith('.md')) rootFiles.push(join(root, name))
  }
  return { docs, rootFiles }
}

function main(): number {
  const args = process.argv.slice(2)
  const root = resolve(process.cwd())
  const asJson = args.includes('--json')
  const writeIdx = args.indexOf('--write')
  const writePath = writeIdx >= 0 ? args[writeIdx + 1] : null

  const { docs: docFiles, rootFiles } = collectMarkdown(root)
  const toRel = (abs: string): string => relative(root, abs).split('\\').join('/')

  // 目标索引覆盖全仓 md —— 引用可以指向扫描面之外的文件（如 `docs/devlog-evidence/…`）
  const targets = new Map<string, SectionIndex>()
  for (const abs of [...docFiles, ...rootFiles]) {
    targets.set(toRel(abs), indexSections(readFileSync(abs, 'utf8')))
  }

  const read = (rel: string): { path: string; content: string } => ({
    path: rel,
    content: readFileSync(join(root, rel), 'utf8'),
  })
  // 主面（判红）：`docs/` 下的文档 —— 与治理闸 FR-11 的扫描面同口径
  const mainDocs = [...targets.keys()].filter((rel) => auditScope(rel)).map(read)
  // 附面（只报数）：仓根 md —— 日志记录的是「当时为真」，不该按活断言判红
  const auxDocs = [...targets.keys()].filter((rel) => !rel.includes('/')).map(read)

  // 已知存量从**基线文件**读（与 docs:check 共用同一份 ⇒ 单源）
  const baselinePath = join(root, 'docs', 'docs-check-baseline.json')
  const baseline = existsSync(baselinePath)
    ? (JSON.parse(readFileSync(baselinePath, 'utf8')) as { known?: Record<string, string> })
    : { known: {} }
  const known = parseKnownDangling(baseline)

  // 别名表：仓内数据文件（口径单处）⇒ 登记过的节号，候选被收窄
  const aliasIdx = args.indexOf('--aliases')
  const aliasPath = aliasIdx >= 0 ? (args[aliasIdx + 1] ?? ALIAS_FILE) : ALIAS_FILE
  const aliasAbs = resolve(root, aliasPath)
  const aliases = existsSync(aliasAbs)
    ? parseAliases(JSON.parse(readFileSync(aliasAbs, 'utf8')) as { aliases?: Record<string, string[]> })
    : { aliases: new Map<string, string[]>() }

  const result = auditSectionRefs(mainDocs, targets, known)
  const aux = auditSectionRefs(auxDocs, targets, known)

  // 别名表候选登记表：给人落笔用，不判红绿
  if (args.includes('--emit-alias-candidates')) {
    const candidates = buildAliasCandidates(result.bareRefs, targets)
    const report = buildAliasCandidateReport(candidates)
    const outIdx = args.indexOf('--write-alias-candidates')
    if (outIdx >= 0) {
      const abs = resolve(root, args[outIdx + 1] ?? '')
      if (!existsSync(join(abs, '..'))) {
        console.error(`✗ 目标目录不存在：${abs}`)
        return 2
      }
      writeFileSync(abs, report, 'utf8')
      console.log(`别名表候选已写：${args[outIdx + 1]}`)
    } else {
      console.log(report)
    }
    return 0
  }

  // 改写清单模式：给人落笔用，不判红绿
  if (args.includes('--emit-rewrite-plan')) {
    const plan = buildRewritePlan(result.bareRefs, targets, aliases)
    const mapIdx = args.indexOf('--map')
    const mapPath = mapIdx >= 0 ? args[mapIdx + 1] : null
    let map: Record<string, Record<string, string>> = {}
    if (mapPath) {
      const abs = resolve(root, mapPath)
      if (!existsSync(abs)) {
        console.error(`✗ 映射文件不存在：${mapPath}`)
        return 2
      }
      map = JSON.parse(readFileSync(abs, 'utf8')) as Record<string, Record<string, string>>
    }
    const split = buildSplitRewriteRows(result.findings, map)
    const report = buildRewriteReport(plan, split)
    const planIdx = args.indexOf('--write-plan')
    if (planIdx >= 0) {
      const abs = resolve(root, args[planIdx + 1] ?? '')
      if (!existsSync(join(abs, '..'))) {
        console.error(`✗ 目标目录不存在：${abs}`)
        return 2
      }
      writeFileSync(abs, report, 'utf8')
      console.log(`改写清单已写：${args[planIdx + 1]}`)
    } else {
      console.log(report)
    }
    return 0
  }

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          total: result.total,
          counts: result.counts,
          bareCount: result.bareCount,
          ambiguousCount: result.ambiguousCount,
          dangling: result.dangling.map((f) => ({
            from: f.ref.from,
            line: f.ref.line,
            target: f.ref.target,
            ref: f.ref.ref,
            context: f.ref.context,
          })),
          knownDangling: result.knownDangling.map((f) => ({
            from: f.ref.from,
            line: f.ref.line,
            target: f.ref.target,
            ref: f.ref.ref,
          })),
          staleKnown: result.staleKnown,
          aux: {
            total: aux.total,
            bareCount: aux.bareCount,
            dangling: aux.dangling.map((f) => ({
              from: f.ref.from,
              line: f.ref.line,
              target: f.ref.target,
              ref: f.ref.ref,
              context: f.ref.context,
            })),
          },
        },
        null,
        2,
      ),
    )
    return result.dangling.length > 0 || result.staleKnown.length > 0 ? 1 : 0
  }

  console.log('── §-引用判定 · 主面（docs/，判红）──')
  console.log(`限定型引用（可判面）：${result.total}`)
  console.log(`  标题型绿：${result.counts.heading}`)
  console.log(`  条目型绿：${result.counts.item}`)
  console.log(`  不可判：${result.counts.undecidable}`)
  console.log(`  断链：${result.counts.dangling}（其中已知存量 ${result.knownDangling.length}）`)
  console.log(`裸引用（不可判，只报数）：${result.bareCount}`)
  console.log(`目标文件重名而不可判：${result.ambiguousCount}`)

  // 别名表（**建议层**）：登记项是否已失效 —— 只报数，不判红
  if (aliases.aliases.size > 0) {
    const aliasAudit = auditAliasEntries(aliases, result.bareRefs, targets)
    console.log(`别名表登记：${aliases.aliases.size} 项（目标仍存在 ${aliasAudit.active} 个）`)
    for (const id of aliasAudit.redundant) {
      console.log(`  · 登记项已多余（该节号已自家可解或已无裸引用，该清理了）：§${id}`)
    }
    for (const m of aliasAudit.missingTarget) {
      console.log(`  · 登记目标已不存在：§${m.id} → ${m.target}`)
    }
  }

  for (const f of result.knownDangling) {
    console.log(`  · 已知存量：${f.ref.from}:${f.ref.line} → ${f.ref.target} §${f.ref.ref}（只报不改）`)
  }
  for (const f of result.dangling) {
    console.log(`  · 未登记断链：${f.ref.from}:${f.ref.line} → ${f.ref.target} §${f.ref.ref}`)
    console.log(`      ${f.ref.context}`)
  }
  for (const s of result.staleKnown) {
    console.log(`  · 登记项本轮不再出现（该清理了）：${s}`)
  }

  console.log('')
  console.log('── §-引用判定 · 附面（仓根 md，只报数不判红）──')
  console.log(`限定型引用：${aux.total} · 裸引用：${aux.bareCount} · 断链：${aux.counts.dangling}`)
  for (const f of aux.dangling) {
    console.log(`  · 断链（只报数）：${f.ref.from}:${f.ref.line} → ${f.ref.target} §${f.ref.ref}`)
  }

  if (writePath) {
    const abs = resolve(root, writePath)
    if (!existsSync(join(abs, '..'))) {
      console.error(`✗ 目标目录不存在：${abs}`)
      return 2
    }
    writeFileSync(abs, buildReport(result, { aux, known }), 'utf8')
    console.log(`\n对账表已写：${writePath}`)
  }

  return result.dangling.length > 0 || result.staleKnown.length > 0 ? 1 : 0
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main())
}
