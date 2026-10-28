// `packages/shared/src/m9-panels.test.ts` —— M9 v1.6 **P3 静态面板的逐格对账**
// （`m9-dev-language-roadmap.md` §3.22 · 增强⑭ 四块内容）
//
// ## 它断什么
//
// §3.22 的四块内容**逐字**躺在 `m9-panels.ts` 里 ⇒ 内容与规格 §3.22 的表格
// 是**同一个事实的两份记录** ⇒ 改一处不改另一处就会漂移，而漂移几行**谁也看不出来**。
//
// ⇒ 本文件把规格 §3.22 的四张表**逐格解析出来**，与模块内容**逐格比对**：
// 双修规划 9 段 · 语言对照 8 维 · 选学顺序 3 条 · 练习原则 6 条。
//
// ## ⚠️ 为什么必须有这道闸
//
// ⚠️ **DL-49 的同款纪律**（分期路线 21 段是逐格对账的）—— 只不过那次的对照面
//   在 spec §3.17.1，这次在 spec §3.22。⇒ 两处用**同一个手法**。
//
// ⚠️ **不新建第二份内容**：本文件只**读**规格，不复制内容 ——
//   复制了就是「同一事实散在两处」这个病又犯了。
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  DUAL_PLAN,
  DUAL_PLAN_HEADINGS,
  DUAL_PLAN_NOTES,
  LANGUAGE_ASPECTS,
  LEARNING_ORDER,
  PRACTICE_PRINCIPLES,
} from './m9-panels'

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const SPEC = readFileSync(`${REPO_ROOT}docs/specs/m9-dev-language-roadmap.md`, 'utf8')

/** 取某一级小节的正文（从标题到下一个同级或更高级标题）。 */
function section(heading: string): string {
  const lines = SPEC.split('\n')
  const start = lines.findIndex((l) => l.trim().startsWith(heading))
  if (start < 0) throw new Error(`规格里找不到小节：${heading}`)
  const level = heading.match(/^#+/)?.[0].length ?? 4
  let end = lines.length
  for (let i = start + 1; i < lines.length; i += 1) {
    const m = lines[i]!.match(/^(#+)\s/)
    if (m && m[1]!.length <= level) {
      end = i
      break
    }
  }
  return lines.slice(start, end).join('\n')
}

/** 解析小节里的表格行（去粗体、去首尾空白；表头与分隔行不算）。 */
function tableRows(text: string): string[][] {
  const rows: string[][] = []
  let seenBody = false
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t.startsWith('|')) {
      seenBody = false
      continue
    }
    const cells = t
      .slice(1, t.endsWith('|') ? -1 : undefined)
      .split('|')
      .map((c) => c.replace(/\*\*/g, '').trim())
    // 分隔行（`|---|---|`）跳过；表头行跳过（它是这组表的第一行）
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue
    if (!seenBody) {
      seenBody = true
      continue
    }
    rows.push(cells)
  }
  return rows
}

/** §3.22.1 的两套双修规划（精通 5 段 / 熟悉 4 段）—— 按行内的模式抬头分组。 */
function dualPlanRows(): { profile: 'master' | 'familiar'; rows: string[][] }[] {
  const out: { profile: 'master' | 'familiar'; rows: string[][] }[] = []
  let current: 'master' | 'familiar' | null = null
  let bucket: string[][] = []
  for (const line of section('#### 3.22.1').split('\n')) {
    const t = line.trim()
    if (t.includes('精通模式')) {
      if (current !== null) out.push({ profile: current, rows: bucket })
      current = 'master'
      bucket = []
      continue
    }
    if (t.includes('熟悉模式')) {
      if (current !== null) out.push({ profile: current, rows: bucket })
      current = 'familiar'
      bucket = []
      continue
    }
    if (current === null) continue
    if (!t.startsWith('|')) continue
    const cells = t
      .slice(1, t.endsWith('|') ? -1 : undefined)
      .split('|')
      .map((c) => c.replace(/\*\*/g, '').trim())
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue
    if (cells[0] === '#' || cells[0] === '') continue
    bucket.push(cells)
  }
  if (current !== null) out.push({ profile: current, rows: bucket })
  return out
}

describe('M9 P3 · §3.22.1 双修规划（9 段）', () => {
  it('逐格对账：周期 / 段名 / 内容三格逐字相等', () => {
    const groups = dualPlanRows()
    expect(groups.map((g) => g.profile)).toEqual(['master', 'familiar'])
    const got = DUAL_PLAN.map((s) => [s.period, s.title, s.detail])
    const want = groups.flatMap((g) => g.rows.map((r) => [r[1]!, r[2]!, r[3]!]))
    expect(got).toEqual(want)
  })

  it('段数逐字相等：精通 5 段 ＋ 熟悉 4 段 ＝ 9 段', () => {
    const groups = dualPlanRows()
    expect(groups[0]!.rows).toHaveLength(5)
    expect(groups[1]!.rows).toHaveLength(4)
    expect(DUAL_PLAN).toHaveLength(9)
    expect(DUAL_PLAN.filter((s) => s.profile === 'master')).toHaveLength(5)
    expect(DUAL_PLAN.filter((s) => s.profile === 'familiar')).toHaveLength(4)
  })

  it('两套模式各自的段序从 1 起（不是连号）', () => {
    expect(DUAL_PLAN.filter((s) => s.profile === 'master').map((s) => s.no)).toEqual([
      1, 2, 3, 4, 5,
    ])
    expect(DUAL_PLAN.filter((s) => s.profile === 'familiar').map((s) => s.no)).toEqual([1, 2, 3, 4])
  })

  it('抬头与说明逐字取自 §3.22.1', () => {
    const text = section('#### 3.22.1')
    expect(text).toContain(DUAL_PLAN_HEADINGS.master)
    expect(text).toContain(DUAL_PLAN_HEADINGS.familiar)
    expect(text).toContain(DUAL_PLAN_NOTES.master)
    expect(text).toContain(DUAL_PLAN_NOTES.familiar)
  })

  it('⚠️ 双修规划**不得由分期路线推导**（段数与切法都不同 ⇒ 推导不出来）', () => {
    // §3.22.1：分期路线是「Python 精通 5 段 ＋ Go 精通 4 段」并列，
    // 双修规划是「先 Python 4 个月、再 Python 2 个月、再 Go 2 个月…」串行交织
    // ⇒ 段数不同（21 vs 9）、切法不同（两门 vs 单门）
    expect(DUAL_PLAN).toHaveLength(9)
    const periods = DUAL_PLAN.map((s) => s.period)
    expect(periods.filter((p) => p.includes('月'))).toHaveLength(5)
    expect(periods.filter((p) => p.includes('周'))).toHaveLength(4)
  })
})

describe('M9 P3 · §3.22.2 语言对照表（8 维）', () => {
  it('逐格对账：维度 / Python / Go 三格逐字相等', () => {
    const rows = tableRows(section('#### 3.22.2'))
    const got = LANGUAGE_ASPECTS.map((a) => [a.aspect, a.python, a.go])
    const want = rows.map((r) => [r[0]!, r[1]!, r[2]!])
    expect(got).toEqual(want)
  })

  it('维度数逐字相等：8 维', () => {
    expect(LANGUAGE_ASPECTS).toHaveLength(8)
    expect(tableRows(section('#### 3.22.2'))).toHaveLength(8)
  })
})

describe('M9 P3 · §3.22.3 选学顺序（3 条）', () => {
  it('逐格对账：路线 / 内容两格逐字相等', () => {
    const rows = tableRows(section('#### 3.22.3'))
    const got = LEARNING_ORDER.map((o) => [o.route, o.detail])
    const want = rows.map((r) => [r[1]!, r[2]!])
    expect(got).toEqual(want)
  })

  it('条数逐字相等：3 条', () => {
    expect(LEARNING_ORDER).toHaveLength(3)
  })
})

describe('M9 P3 · §3.22.4 练习原则（6 条）', () => {
  it('逐格对账：原则 / 内容两格逐字相等', () => {
    const rows = tableRows(section('#### 3.22.4'))
    const got = PRACTICE_PRINCIPLES.map((p) => [p.principle, p.detail])
    const want = rows.map((r) => [r[1]!, r[2]!])
    expect(got).toEqual(want)
  })

  it('条数逐字相等：6 条', () => {
    expect(PRACTICE_PRINCIPLES).toHaveLength(6)
  })
})
