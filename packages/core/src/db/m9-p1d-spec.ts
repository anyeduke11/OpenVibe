/**
 * `packages/core/src/db/m9-p1d-spec.ts` —— M9 v1.6 **P1d · spec §3.17.1 口径读取器**
 * （`m9-dev-plan-2026-10.md` §6.5 ＋ `m9-dev-language-roadmap.md` §3.17.1 · **DL-49 / DL-50**）
 *
 * ## 它解决什么
 *
 * §3.17.1 那张 21 行的表是 `lang_profile_phases` 种子的**唯一对照面**（DL-49）：
 * 段数、顺序、标签、阶段名、耗时、产出**逐格取自附件**，一处都不许润色。
 *
 * ⇒ 谁来读这 21 行，必须**只有一处**：
 * - `scripts/extract-m9-guide-phases.ts` —— 从附件抽取时**自检**：对不上即中止；
 * - `packages/core/src/db/m9-p1d-*.test.ts` —— 单测**对账**：文档 ↔ 实跑。
 *
 * ⚠️ **两处各写一份解析是最坏的做法** —— 解析写错了，两边会**错得一模一样**，
 *   于是「文档 ↔ 实跑」这条闸变成同义反复，自己证自己（同 `m9-p1b-spec.ts` 的手法）。
 *
 * ## ⚠️ 解析必须锚死（本仓的老教训）
 *
 * - §3.17.1 之后还有别的表 ⇒ **必须截断到该小节末尾**；
 * - 产出栏的「空」在表里写成 **`**（附件无此栏）**`** ⇒ 读成 `null`（**不是空串**）；
 * - 产出栏的**前缀逐字保留**（产出 / 练习 / 跳过）⇒ 解析不许剥前缀。
 */
import { readFileSync } from 'node:fs'

/**
 * 三种学习模式（§3.17 的全局枚举）。
 *
 * ⚠️ **单一声明处** —— 本类型最早落在 `m9-p1b-necessity.ts`（资源必要性矩阵的轴），
 *   那一处已经是仓内公开导出的唯一定义 ⇒ 本模块**复用它**，不另立一份。
 *   （两份形状相同的类型声明就是**第二处口径**，迟早分叉。）
 */
export type { LangProfile } from './m9-p1b-necessity'
import type { LangProfile } from './m9-p1b-necessity'

/** §3.17.1 的一行（21 行里的一行）。 */
export interface SpecPhaseRow {
  /** 表里的序号（1–21） */
  index: number
  lang: 'python' | 'go'
  profile: LangProfile
  /** 该模式该语言下的段序（1 起） */
  ord: number
  /** 附件逐字标签（如「阶段 0 · 约 0.5 周」） */
  label: string
  /** 阶段名（如「环境与准备」） */
  title: string
  /** 耗时（如「0.5 周」「长期」） */
  duration: string
  /** 产出栏**整串**（含「产出：」「练习：」「跳过：」前缀）；附件无此栏时为 null */
  outcome: string | null
}

/** 表里写「产出栏为空」的那一格。 */
const EMPTY_OUTCOME_CELL = '（附件无此栏）'

/** 模式中文名 → 枚举。 */
const PROFILE_BY_CN: Record<string, LangProfile> = {
  精通: 'master',
  熟悉: 'familiar',
  速成: 'vibe',
}

const LANG_BY_CN: Record<string, 'python' | 'go'> = {
  Python: 'python',
  Go: 'go',
}

/** 去掉表格单元格里可能有的粗体标记与首尾空格。 */
function cleanCell(text: string): string {
  return text.replace(/\*\*/g, '').trim()
}

/** 取 §3.17.1 的正文（从该小节标题到下一个同级标题为止）。 */
export function specSection3171(specText: string): string | null {
  const start = specText.indexOf('#### 3.17.1')
  if (start === -1) return null
  const rest = specText.slice(start)
  const next = rest.indexOf('\n#### ', 1)
  return next === -1 ? rest : rest.slice(0, next)
}

/**
 * 读 §3.17.1 的 21 行。
 *
 * ⚠️ **读不出 21 行就返回空数组**（不返回部分结果）——
 *   部分结果会让「对账」变成「拿半张表去比」，那比不比还糟。
 */
export function parseSpecPhaseRows(specText: string): SpecPhaseRow[] {
  const sec = specSection3171(specText)
  if (sec === null) return []
  const rows: SpecPhaseRow[] = []
  for (const line of sec.split('\n')) {
    if (!line.trim().startsWith('|')) continue
    const cells = line.split('|').slice(1, -1)
    if (cells.length < 8) continue
    const index = Number(cleanCell(cells[0] ?? ''))
    if (!Number.isInteger(index) || index === 0) continue
    const lang = LANG_BY_CN[cleanCell(cells[1] ?? '')]
    const profile = PROFILE_BY_CN[cleanCell(cells[2] ?? '')]
    if (lang === undefined || profile === undefined) continue
    const ord = Number(cleanCell(cells[3] ?? ''))
    if (!Number.isInteger(ord)) continue
    const label = cleanCell(cells[4] ?? '')
    const title = cleanCell(cells[5] ?? '')
    const duration = cleanCell(cells[6] ?? '')
    const rawOutcome = cleanCell(cells[7] ?? '')
    const outcome = rawOutcome === EMPTY_OUTCOME_CELL ? null : rawOutcome
    rows.push({ index, lang, profile, ord, label, title, duration, outcome })
  }
  return rows
}

/**
 * 产出栏的三种前缀与空栏计数（DL-49 的第二、三支）。
 *
 * ⚠️ **前缀逐字保留，一个都不许剥** —— 「跳过」是**本段明确不学什么**，
 *   剥成「产出」会把「本段不学并发」显示成「本段产出并发模式」，方向完全相反。
 */
export interface OutcomePrefixTally {
  产出: number
  练习: number
  跳过: number
  空: number
  total: number
}

export function tallyOutcomePrefixes(rows: readonly SpecPhaseRow[]): OutcomePrefixTally {
  const tally: OutcomePrefixTally = { 产出: 0, 练习: 0, 跳过: 0, 空: 0, total: rows.length }
  for (const row of rows) {
    if (row.outcome === null) {
      tally.空 += 1
      continue
    }
    const prefix = row.outcome.split('：')[0]
    if (prefix === '产出' || prefix === '练习' || prefix === '跳过') tally[prefix] += 1
  }
  return tally
}

/**
 * DL-50 的**反证**：两套「阶段」并存的裁定必须留在 spec 里。
 *
 * ⚠️ **反证为什么重要**：DL-50 的正向支（仓里没有 站↔段 映射表）**恒绿** ——
 *   它只会说「没有」，而「没有」也可能是因为解析写错了。
 *   ⇒ 必须同时断「裁定文字还在，且两处都写了不映射」。
 */
export interface NoMappingCheck {
  /** §3.6 的两列分工表在，且写了「不做逐格映射」 */
  stageDivision: boolean
  /** §3.22.1 的第三套分段在，且写了「互不映射」 */
  triplePlan: boolean
  problems: string[]
}

export function checkNoMappingStatements(specText: string): NoMappingCheck {
  const problems: string[] = []
  const stageIdx = specText.indexOf('### 3.6 ')
  const stageSec =
    stageIdx === -1 ? '' : specText.slice(stageIdx, specText.indexOf('### 3.7 ', stageIdx))
  const stageDivision =
    stageSec.includes('`lang_topics.stage_id`') &&
    stageSec.includes('`lang_profile_phases`') &&
    stageSec.includes('不做逐格映射')
  if (!stageDivision) problems.push('§3.6 的两列分工表或「不做逐格映射」那句不见了')

  const planIdx = specText.indexOf('#### 3.22.1')
  const planSec =
    planIdx === -1 ? '' : specText.slice(planIdx, specText.indexOf('#### ', planIdx + 5))
  const triplePlan = planSec.includes('互不映射')
  if (!triplePlan) problems.push('§3.22.1 的「三者互不映射」那句不见了')

  return { stageDivision, triplePlan, problems }
}

/** 读 spec 文件并取出 §3.17.1 的 21 行。 */
export function readSpecPhaseRows(specPath: string): SpecPhaseRow[] {
  return parseSpecPhaseRows(readFileSync(specPath, 'utf8'))
}

// ============================================================================
// §3.17.2 —— 速成专区四块静态内容
// ============================================================================

/** §3.17.2 的四块（对应 `m9-vibe-static.ts` 的四个常量）。 */
export interface SpecVibeStatic {
  abilities: { name: string; detail: string }[]
  minimalKnowledge: { lang: 'python' | 'go'; name: string; detail: string }[]
  workflow: { step: number; title: string; detail: string }[]
  pitfalls: { name: string; detail: string }[]
}

/**
 * 读 spec §3.17.2 的四张表。
 *
 * ⚠️ **按「表出现的顺序」分类，不靠表里的关键字** ——
 *   「6 项能力」与「6 个翻车点」两张表的行形状**完全一样**（3 列、首列 `**N**`），
 *   靠内容猜是哪一张迟早猜错 ⇒ 按顺序：能力 → 最小知识 → 工作流 → 翻车点。
 *
 * @returns 读不出就返回 null（**不返回部分结果** —— 半张表去对账比不比还糟）。
 */
export function parseSpecVibeStatic(specText: string): SpecVibeStatic | null {
  const start = specText.indexOf('#### 3.17.2')
  if (start === -1) return null
  const rest = specText.slice(start)
  const next = rest.indexOf('\n#### ', 1)
  const sec = next === -1 ? rest : rest.slice(0, next)

  // 把连续的 '|' 开头的行并成一张表
  const tables: string[][] = []
  let current: string[] = []
  for (const line of sec.split('\n')) {
    if (line.trim().startsWith('|')) {
      current.push(line)
      continue
    }
    if (current.length > 0) {
      tables.push(current)
      current = []
    }
  }
  if (current.length > 0) tables.push(current)
  if (tables.length < 4) return null

  const cells = (line: string): string[] =>
    line.split('|').slice(1, -1).map((c) => c.replace(/\*\*/g, '').trim())

  const dataRows = (t: string[]): string[][] =>
    t
      .map(cells)
      .filter((r) => r.length >= 3 && !/^-+$/.test(r[0] ?? '') && !/^#/.test(r[0] ?? ''))

  const abilities = dataRows(tables[0]!).map((r) => ({
    name: r[1] ?? '',
    detail: r[2] ?? '',
  }))
  const minimalKnowledge = dataRows(tables[1]!).map((r) => ({
    lang: (r[1] === 'Go' ? 'go' : 'python') as 'python' | 'go',
    name: r[2] ?? '',
    detail: r[3] ?? '',
  }))
  const workflow = dataRows(tables[2]!)
    .filter((r) => /^STEP\b/.test(r[0] ?? ''))
    .map((r) => ({
      step: Number(/(\d+)/.exec(r[0] ?? '')?.[1] ?? 0),
      title: r[1] ?? '',
      detail: r[2] ?? '',
    }))
  const pitfalls = dataRows(tables[3]!).map((r) => ({
    name: r[1] ?? '',
    detail: r[2] ?? '',
  }))

  return { abilities, minimalKnowledge, workflow, pitfalls }
}
