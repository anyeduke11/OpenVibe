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
 * ## 已知存量（登记，不是豁免）
 *
 * 存量 1 条断链在 `docs/dev-plan.md`，该文件当前属**并行会话保留区**（owner 裁定原样保留），
 * 故只登记不改。登记项若某轮不再出现，本脚本会反过来报「该清理了」——
 * 没有这条反向检查，登记就会变成没人对得上的死条目。
 *
 * ## 零依赖
 *
 * 只用 node 内建模块（`node:fs` / `node:path`）。
 *
 * ```bash
 * npx tsx scripts/section-ref-audit.ts            # 判定并打印摘要（退出码：0 绿 / 1 红）
 * npx tsx scripts/section-ref-audit.ts --json     # 机器可读
 * npx tsx scripts/section-ref-audit.ts --write <path>   # 写对账表
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

/** 被引节号的形态：数字开头，允许字母后缀与连字符标签（`7-j` / `3.2-M7` / `15.4b`） */
const REF_ID = /^\d+[0-9A-Za-z]*(?:[.-][0-9A-Za-z]+)*$/

/** 标题里的节号：`## 3. …` / `### 3.2 …` / `### 15.4b …` / `## 3-9b. …` */
const HEADING_ID = /^(?:§\s*)?(\d+[0-9A-Za-z]*(?:[.-][0-9A-Za-z]+)*)(?=\s|[.、，,：:）)]|$)/

/** 非编号标题的标签：取首个词（`#### M7 团队协作` → `M7`；`### FR-1 …` → `FR-1`） */
const HEADING_LABEL = /^([0-9A-Za-z][0-9A-Za-z-]{0,5})(?=\s|$)/

/** 节内条目标签：`- **6.2 …**` */
const BOLD_LABEL = /^\s*(?:[-*+]\s*)?\*\*(\d+(?:\.\d+)*[A-Za-z]?)(?=\s|\*\*)/

/** 节内条目标签：有序列表项号 `7. ` */
const ORDERED_LABEL = /^(\d+)\.\s+\S/

/** 节内条目标签：表格行首标签 `| j | … |` */
const CELL_LABEL = /^\|\s*([0-9A-Za-z]{1,4}(?:-[0-9A-Za-z]{1,4})?)\s*\|/

/**
 * 已知存量断链（登记，不是豁免）。
 *
 * 键 = `来源文件:行号`，值 = 登记理由。
 * 判定依据是**当前工作树**的行号 —— 行号会随文件增删漂移，
 * 所以登记项同时记被引节号（`§7`），命中时按「文件 + 节号」对齐，避免行号漂移造成假清理。
 */
export const KNOWN_DANGLING: { where: string; ref: string; why: string }[] = [
  {
    where: 'docs/dev-plan.md',
    ref: '7',
    why:
      '指向 `specs/onboarding.md` 的 §7 —— 该 spec 的节只到 §6（验收标准是 §5），故这条引用指空。' +
      '**该文件属并行会话保留区（owner 裁定原样保留），只登记不改**；待该会话收尾后改成 §5。',
  },
]

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

export interface ParseResult {
  /** 限定型引用（带文件名） */
  refs: QualifiedRef[]
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
  let bareCount = 0
  let ambiguousCount = 0

  const names = [...basenameIndex.keys()].sort((a, b) => b.length - a.length)
  if (names.length === 0) return { refs, bareCount, ambiguousCount }
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
      bareCount++
    }
  }
  return { refs, bareCount, ambiguousCount }
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
}

export interface AuditResult {
  findings: AuditFinding[]
  /** 限定型引用总数 */
  total: number
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
 * @param known      已知存量登记（默认 `KNOWN_DANGLING`）
 */
export function auditSectionRefs(
  docs: { path: string; content: string }[],
  targets: Map<string, SectionIndex>,
  known: { where: string; ref: string; why: string }[] = KNOWN_DANGLING,
): AuditResult {
  const basenameIndex = new Map<string, string[]>()
  for (const path of targets.keys()) {
    const base = path.slice(path.lastIndexOf('/') + 1)
    const list = basenameIndex.get(base) ?? []
    list.push(path)
    basenameIndex.set(base, list)
  }

  const findings: AuditFinding[] = []
  let bareCount = 0
  let ambiguousCount = 0
  for (const doc of docs) {
    const parsed = parseSectionRefs(doc.content, doc.path, basenameIndex)
    bareCount += parsed.bareCount
    ambiguousCount += parsed.ambiguousCount
    for (const ref of parsed.refs) {
      const index = targets.get(ref.target)
      if (!index) continue
      const verdict = classifyRef(ref.ref, index)
      findings.push({ ref, verdict, known: false })
    }
  }

  // 存量对齐：按「文件 + 被引节号」对齐，**不按行号** —— 行号会随文件增删漂移。
  // ⚠️ 必须在分类**之后**、过滤**之前**做，否则存量会被当成未登记断链（红）。
  const knownKeys = new Set(known.map((k) => `${k.where}|${k.ref}`))
  const knownFound = new Set<string>()
  for (const f of findings) {
    if (f.verdict !== 'dangling') continue
    const key = `${f.ref.from}|${f.ref.ref}`
    if (!knownKeys.has(key)) continue
    f.known = true
    knownFound.add(key)
  }

  const dangling = findings.filter((f) => f.verdict === 'dangling' && !f.known)
  const knownDangling = findings.filter((f) => f.verdict === 'dangling' && f.known)
  const counts: Record<RefVerdict, number> = { heading: 0, item: 0, undecidable: 0, dangling: 0 }
  for (const f of findings) counts[f.verdict]++

  const staleKnown = known
    .filter((k) => !knownFound.has(`${k.where}|${k.ref}`))
    .map((k) => `${k.where} §${k.ref}`)

  return {
    findings,
    total: findings.length,
    bareCount,
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
  options: { splitTarget?: string; aux?: AuditResult } = {},
): string {
  const splitTarget = options.splitTarget ?? 'docs/dev-plan.md'
  const aux = options.aux
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
        `| \`${f.ref.from}:${f.ref.line}\` | \`${f.ref.target} §${f.ref.ref}\` | 已知存量（只报不改） | ${KNOWN_DANGLING.find((k) => k.where === f.ref.from && k.ref === f.ref.ref)?.why ?? ''} |`,
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
  const inScope = (rel: string): boolean => !EXCLUDED_DIRS.some((d) => rel.includes(d))
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
  const mainDocs = [...targets.keys()].filter((rel) => rel.startsWith('docs/') && inScope(rel)).map(read)
  // 附面（只报数）：仓根 md —— 日志记录的是「当时为真」，不该按活断言判红
  const auxDocs = [...targets.keys()].filter((rel) => !rel.includes('/')).map(read)

  const result = auditSectionRefs(mainDocs, targets)
  const aux = auditSectionRefs(auxDocs, targets)

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
    writeFileSync(abs, buildReport(result, { aux }), 'utf8')
    console.log(`\n对账表已写：${writePath}`)
  }

  return result.dangling.length > 0 || result.staleKnown.length > 0 ? 1 : 0
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main())
}
