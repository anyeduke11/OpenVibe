/**
 * `tests/support/m9-spec-consistency.ts` —— M9 规格一致性检查器（**纯函数层**）
 * （`docs/specs/m9-dev-plan-2026-10.md` §11 · **DL-44 / DL-45 / DL-46** ＋ §11.1 的 **DL-26**）
 *
 * ## 它断什么
 *
 * | 判据 | 一句话 | 本文件里对应的那支 |
 * |---|---|---|
 * | **DL-44** | §0 速览里的每个数字都必须与正文**各自的出处**相等 | 「DL-44」组 |
 * | **DL-44 兜底** | §0 的**分组口径**逐项与 §3.1 的代码块一致（**成员集合相等**，不是只对总数） | 「分组口径」组 |
 * | **DL-45** | 标成「界面形态已跑」的判据，在 §10.2 表里**必须有对应行** | 「DL-45」组 |
 * | **DL-46** | §6.3 台账里标 ⛔ 的条目确实卡在 §9 的对应期上 | 「DL-46」组 |
 * | **DL-26** | §3.1 的表数复算 = 17 | 「DL-26」组 |
 *
 * ## ⚠️ 为什么必须是**纯函数**（不读文件）
 *
 * §11.2 的变异腿要拿**改过的 spec 文本**喂进来（删一行表、润色一个数、去掉一个 ⛔…），
 * 而每条腿都必须是**真改动**（不是在测试里写个假样本）⇒ 检查器只能吃字符串。
 * ⇒ 文件读取与「读真 spec」的断言在 `tests/m9-spec-consistency.test.ts` 里，
 *   本文件**一行 I/O 都不做**。
 *
 * ## ⚠️ 「总数对」不等于「分解对」
 *
 * DL-44 的兜底那支断的是**成员集合相等**：§3.1 抬头的分组里每组写了几个表名，
 * 那些表名与 §3.1 代码块里的 17 个必须**逐个相等**（不重不漏）——
 * 只比「7 ＋ 4 ＋ 2 ＋ 3 ＋ 1 = 17」的话，**分组整体错位一格也照样绿**
 * （这正是 v1.5 修过的那次：总数 17 对得上，分组却错位）。
 */

/** 一条违规。 */
export interface SpecViolation {
  /** 判据编号（DL-26 / DL-44 / DL-45 / DL-46） */
  rule: string
  /** 定位：章节 ＋ 行号（1 起） */
  where: string
  /** 违规说明 */
  detail: string
}

// ============================================================================
// 行 / 表格工具
// ============================================================================

/** 表格里的一行。 */
interface SpecRow {
  /** 1 起行号 */
  line: number
  /** 单元格（已 trim，**粗体标记未去** —— 判定有时要看标记） */
  cells: string[]
}

/** 去掉 Markdown 粗体标记与首尾空格。 */
function stripBold(text: string): string {
  return text.replace(/\*\*/g, '').trim()
}

/** 找标题行下标；`key` 必须是标题里**逐字出现**的片段。 */
function findHeading(lines: string[], key: string): number {
  for (let i = 0; i < lines.length; i += 1) {
    const t = (lines[i] ?? '').trim()
    if (/^#{2,4}\s/.test(t) && t.includes(key)) return i
  }
  return -1
}

/**
 * 取某标题到**下一个同级或更高级标题**之间的行区间（含标题行）。
 *
 * ⚠️ 必须按**级别**截断，不能按「下一个 `###`」—— §3.17.1 是 `####`，
 *   它后面还有 `#### 3.17.2`，按固定级别截会把 3.17.2 吃进来。
 */
function sectionRange(lines: string[], key: string): { from: number; to: number } | null {
  const from = findHeading(lines, key)
  if (from < 0) return null
  const level = ((lines[from] ?? '').trim().match(/^#+/) ?? ['#'])[0]!.length
  let to = lines.length
  for (let i = from + 1; i < lines.length; i += 1) {
    const m = (lines[i] ?? '').trim().match(/^(#{2,4})\s/)
    if (m && m[1]!.length <= level) {
      to = i
      break
    }
  }
  return { from, to }
}

/** 取区间里的表格行。 */
function tableRows(lines: string[], from: number, to: number): SpecRow[] {
  const out: SpecRow[] = []
  for (let i = from; i < to; i += 1) {
    const t = (lines[i] ?? '').trim()
    if (!t.startsWith('|')) continue
    const cells = t.split('|').slice(1, -1).map((c) => c.trim())
    if (cells.length === 0) continue
    if (cells.every((c) => c === '')) continue
    out.push({ line: i + 1, cells })
  }
  return out
}

/** 去掉表头行与分隔行（`|---|`）。 */
function dataRows(rows: SpecRow[]): SpecRow[] {
  return rows.filter((r) => {
    const first = r.cells[0] ?? ''
    if (/^-+$/.test(first)) return false
    return true
  })
}

/** 中文数字（一 ~ 九十九）→ 阿拉伯数字。 */
function cnNum(text: string): number | null {
  const digits: Record<string, number> = {
    一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
  }
  if (text === '十') return 10
  const m = /^十([一二三四五六七八九])$/.exec(text)
  if (m) return 10 + digits[m[1]!]!
  if (text.length === 1) return digits[text] ?? null
  const m2 = /^([一二三四五六七八九])十([一二三四五六七八九])?$/.exec(text)
  if (m2) return digits[m2[1]!]! * 10 + (m2[2] ? digits[m2[2]!]! : 0)
  return null
}

/** 从文本里取第一个中文数字（形如「十四条」）。 */
function firstCnNum(text: string, suffix: string): number | null {
  const re = new RegExp(`([一二三四五六七八九十]+)${suffix}`)
  const m = re.exec(text)
  return m ? cnNum(m[1]!) : null
}

// ============================================================================
// DL-44 —— §0 速览 ↔ 正文各出处
// ============================================================================

/** §0 速览的一行（问什么 / 答 / 去哪看）。 */
interface OverviewRow {
  line: number
  key: string
  answer: string
}

function overviewRows(lines: string[]): OverviewRow[] {
  const sec = sectionRange(lines, '## 0. 一分钟读懂')
  if (!sec) return []
  const out: OverviewRow[] = []
  for (const r of dataRows(tableRows(lines, sec.from, sec.to))) {
    const key = stripBold(r.cells[0] ?? '')
    if (key === '问什么' || key === '') continue
    out.push({ line: r.line, key, answer: r.cells[1] ?? '' })
  }
  return out
}

/** §3.1 代码块里的表名（`grep -c '^lang_'` 的复算）。 */
function spec31TableNames(lines: string[]): { name: string; line: number }[] {
  const sec = sectionRange(lines, '### 3.1 数据模型')
  if (!sec) return []
  const out: { name: string; line: number }[] = []
  for (let i = sec.from; i < sec.to; i += 1) {
    const m = /^(lang_[a-z_]+)/.exec(lines[i] ?? '')
    if (m) out.push({ name: m[1]!, line: i + 1 })
  }
  return out
}

/** §3.0 里的「增强」行数（`增强①` ~ `增强⑭`）。 */
function enhancementCount(lines: string[]): number {
  const sec = sectionRange(lines, '### 3.0 owner 裁定后的范围')
  if (!sec) return 0
  let n = 0
  for (const r of dataRows(tableRows(lines, sec.from, sec.to))) {
    if (/^增强[①-⑳]/.test(stripBold(r.cells[0] ?? ''))) n += 1
  }
  return n
}

/** §7 里的判据条数。 */
function criterionCount(lines: string[]): number {
  const sec = sectionRange(lines, '## 7. 验收判据')
  if (!sec) return 0
  let n = 0
  for (const r of tableRows(lines, sec.from, sec.to)) {
    if (/^DL-\d+$/.test(stripBold(r.cells[0] ?? ''))) n += 1
  }
  return n
}

/** §9 的期表（一行一期）。 */
interface PhaseRow {
  line: number
  /** 期号（如 `P1d`） */
  phase: string
  /** 依赖列 */
  depends: string
  /** 人日 */
  days: number
}

function phaseRows(lines: string[]): PhaseRow[] {
  const sec = sectionRange(lines, '## 9. 最终方案')
  if (!sec) return []
  const out: PhaseRow[] = []
  for (const r of dataRows(tableRows(lines, sec.from, sec.to))) {
    const first = stripBold(r.cells[0] ?? '')
    const m = /^M9-(P[0-9][a-z]?)$/.exec(first)
    if (!m) continue
    const days = Number(stripBold(r.cells[6] ?? ''))
    out.push({
      line: r.line,
      phase: m[1]!,
      depends: stripBold(r.cells[5] ?? ''),
      days: Number.isFinite(days) ? days : 0,
    })
  }
  return out
}

/** §6.3 台账的一行。 */
interface LedgerRow {
  line: number
  /** 编号（1 起） */
  no: number
  /** ⛔「卡住哪期」列 */
  blockedCell: string
  /** 该行标了 ⛔ 吗 */
  isBlocked: boolean
  /** 「卡住哪期」列里提到的期 */
  phases: string[]
}

function ledgerRows(lines: string[]): LedgerRow[] {
  const sec = sectionRange(lines, '### 6.3 ⛔ 本轮自定默认值')
  if (!sec) return []
  const out: LedgerRow[] = []
  for (const r of dataRows(tableRows(lines, sec.from, sec.to))) {
    const no = Number(stripBold(r.cells[0] ?? ''))
    if (!Number.isInteger(no) || no === 0) continue
    const blockedCell = r.cells[5] ?? ''
    const phases = [...blockedCell.matchAll(/P[0-9][a-z]?/g)].map((m) => m[0])
    out.push({
      line: r.line,
      no,
      blockedCell,
      // ⚠️ **只看格首的 ⛔ 标记**，不是「整格里出现过 ⛔」——
      //   台账里那几格的**说明文字**本身会提到「仍登记 ⛔ 是为了保留 DL-46 断的那条依赖关系」，
      //   用 `includes('⛔')` 判的话，去掉格首的标记也照样算「还标着 ⛔」⇒ 闸形同虚设。
      isBlocked: /^\s*⛔/.test(blockedCell),
      phases: [...new Set(phases)],
    })
  }
  return out
}

/** §6.3.1 依赖链里声明的「A 必须先于 B」对。 */
function precedenceChain(lines: string[]): { before: number; after: number; line: number }[] {
  const sec = sectionRange(lines, '### 6.3.1')
  if (!sec) return []
  const out: { before: number; after: number; line: number }[] = []
  for (let i = sec.from; i < sec.to; i += 1) {
    const text = lines[i] ?? ''
    if (!text.includes('必须先于')) continue
    const after = /第\s*(\d+)\s*条/.exec(text)?.[1]
    if (!after) continue
    // 「先于」的那一条写在**上一行**（`第 6 条（…）`）
    let before: string | undefined
    for (let j = i - 1; j >= sec.from; j -= 1) {
      const prev = lines[j] ?? ''
      if (prev.trim() === '') continue
      before = /第\s*(\d+)\s*条/.exec(prev)?.[1]
      break
    }
    if (!before) continue
    out.push({ before: Number(before), after: Number(after), line: i + 1 })
  }
  return out
}

function checkDl44(lines: string[], v: SpecViolation[]): void {
  const ov = overviewRows(lines)
  const answerOf = (key: string): OverviewRow | undefined => ov.find((r) => r.key === key)

  // ① 增强条数
  const enhRow = answerOf('有几条增强')
  if (!enhRow) {
    v.push({ rule: 'DL-44', where: '§0', detail: '速览表里找不到「有几条增强」这一行' })
  } else {
    const declared = firstCnNum(enhRow.answer, '条')
    const actual = enhancementCount(lines)
    if (declared === null) {
      v.push({ rule: 'DL-44', where: `§0:${enhRow.line}`, detail: '「有几条增强」的行里读不出中文数字' })
    } else if (declared !== actual) {
      v.push({
        rule: 'DL-44',
        where: `§0:${enhRow.line}`,
        detail: `增强条数：速览写 ${declared} 条，§3.0 实数 ${actual} 条`,
      })
    }
  }

  // ② 表数
  const tblRow = answerOf('数据落在几张表')
  const tables = spec31TableNames(lines)
  if (!tblRow) {
    v.push({ rule: 'DL-44', where: '§0', detail: '速览表里找不到「数据落在几张表」这一行' })
  } else {
    const declared = firstCnNum(tblRow.answer, '张')
    if (declared === null) {
      v.push({ rule: 'DL-44', where: `§0:${tblRow.line}`, detail: '「数据落在几张表」的行里读不出中文数字' })
    } else if (declared !== tables.length) {
      v.push({
        rule: 'DL-44',
        where: `§0:${tblRow.line}`,
        detail: `表数：速览写 ${declared} 张，§3.1 代码块复算 ${tables.length} 张`,
      })
    }
  }

  // ③ 判据条数
  const critRow = answerOf('验收怎么算过')
  if (!critRow) {
    v.push({ rule: 'DL-44', where: '§0', detail: '速览表里找不到「验收怎么算过」这一行' })
  } else {
    const declared = firstCnNum(critRow.answer, '条判据')
    const actual = criterionCount(lines)
    if (declared === null) {
      v.push({ rule: 'DL-44', where: `§0:${critRow.line}`, detail: '「验收怎么算过」的行里读不出中文数字' })
    } else if (declared !== actual) {
      v.push({
        rule: 'DL-44',
        where: `§0:${critRow.line}`,
        detail: `判据条数：速览写 ${declared} 条，§7 实数 ${actual} 条`,
      })
    }
  }

  // ④ 期数
  const phaseRow = answerOf('多少工作量')
  const phases = phaseRows(lines)
  if (!phaseRow) {
    v.push({ rule: 'DL-44', where: '§0', detail: '速览表里找不到「多少工作量」这一行' })
  } else {
    const declared = firstCnNum(phaseRow.answer, '期')
    if (declared === null) {
      v.push({ rule: 'DL-44', where: `§0:${phaseRow.line}`, detail: '「多少工作量」的行里读不出中文数字' })
    } else if (declared !== phases.length) {
      v.push({
        rule: 'DL-44',
        where: `§0:${phaseRow.line}`,
        detail: `期数：速览写 ${declared} 期，§9 实数 ${phases.length} 期`,
      })
    }
  }

  // ⑤ 人日（速览 ↔ §9 表求和 ↔ §9 合计段落的标题数）
  if (phaseRow) {
    const sumDays = phases.reduce((acc, p) => acc + p.days, 0)
    const declared = /≈\s*(\d+)\s*人日/.exec(phaseRow.answer)?.[1]
    if (declared === undefined) {
      v.push({ rule: 'DL-44', where: `§0:${phaseRow.line}`, detail: '「多少工作量」的行里读不出「≈ N 人日」' })
    } else if (Number(declared) !== sumDays) {
      v.push({
        rule: 'DL-44',
        where: `§0:${phaseRow.line}`,
        detail: `人日：速览写 ${declared} 人日，§9 逐期求和 ${sumDays} 人日`,
      })
    }
    // ⚠️ §9 的合计段落：**锚在「合计 ≈ N 人日」这个标题形状上**，
    //   不能取行内第一个数字 —— 同一行后半句还留着旧值（「合计 35 → 38 人日」）。
    const sec9 = sectionRange(lines, '## 9. 最终方案')
    if (sec9) {
      for (let i = sec9.from; i < sec9.to; i += 1) {
        const m = /合计\s*≈\s*(\d+)\s*人日/.exec(lines[i] ?? '')
        if (!m) continue
        if (Number(m[1]) !== sumDays) {
          v.push({
            rule: 'DL-44',
            where: `§9:${i + 1}`,
            detail: `§9 合计段落写「合计 ≈ ${m[1]} 人日」，但逐期求和是 ${sumDays} 人日`,
          })
        }
        break
      }
    }
  }

  // ⑥ 待裁条数
  const ledger = ledgerRows(lines)
  const waitRow = answerOf('卡在哪')
  if (!waitRow) {
    v.push({ rule: 'DL-44', where: '§0', detail: '速览表里找不到「卡在哪」这一行' })
  } else {
    const declared = firstCnNum(waitRow.answer, '条待裁')
    if (declared === null) {
      v.push({ rule: 'DL-44', where: `§0:${waitRow.line}`, detail: '「卡在哪」的行里读不出中文数字' })
    } else if (declared !== ledger.length) {
      v.push({
        rule: 'DL-44',
        where: `§0:${waitRow.line}`,
        detail: `待裁条数：速览写 ${declared} 条，§6.3 台账实数 ${ledger.length} 条`,
      })
    }
  }
}

// ============================================================================
// DL-44 兜底 —— §0 的分组口径 ↔ §3.1 的代码块（**成员集合相等**）
// ============================================================================

/** §3.1 抬头写下的分组口径。 */
interface GroupSpec {
  label: string
  count: number
  names: string[]
}

/** 读 §3.1 抬头那段里的分组口径。 */
function section31Groups(lines: string[]): { groups: GroupSpec[]; line: number } | null {
  const sec = sectionRange(lines, '### 3.1 数据模型')
  if (!sec) return null
  for (let i = sec.from; i < sec.to; i += 1) {
    const text = lines[i] ?? ''
    if (!text.includes('本节的分组口径')) continue
    const groups: GroupSpec[] = []
    const re = /\*\*([^*]+?)\s(\d+)\*\*（([^）]*)）/g
    for (const m of text.matchAll(re)) {
      const names = [...(m[3] ?? '').matchAll(/`([^`]+)`/g)].map((x) => x[1]!)
      groups.push({ label: m[1]!.trim(), count: Number(m[2]), names })
    }
    return { groups, line: i + 1 }
  }
  return null
}

/** 读 §0 速览「数据落在几张表」那一行的分组写法。 */
function overviewGroups(answer: string): { label: string; count: number }[] {
  const inner = /（([^）]*)）/.exec(answer)?.[1]
  if (inner === undefined) return []
  const out: { label: string; count: number }[] = []
  const re = /([^\s·＋（）]+)\s(\d+)/g
  for (const m of inner.matchAll(re)) {
    out.push({ label: m[1]!.replace(/[＋+]/g, '').trim(), count: Number(m[2]) })
  }
  return out
}

function checkDl44Groups(lines: string[], v: SpecViolation[]): void {
  const parsed = section31Groups(lines)
  if (!parsed) {
    v.push({ rule: 'DL-44', where: '§3.1', detail: '找不到 §3.1 抬头的分组口径那一段' })
    return
  }
  const { groups, line } = parsed
  const tables = spec31TableNames(lines)
  const tableNames = new Set(tables.map((t) => t.name))

  // ① 每组声明的条数 == 该组列出的表名个数
  for (const g of groups) {
    if (g.count !== g.names.length) {
      v.push({
        rule: 'DL-44',
        where: `§3.1:${line}`,
        detail: `分组「${g.label}」写 ${g.count} 张，括号里只列了 ${g.names.length} 个表名`,
      })
    }
  }

  // ② 各组表名的并集 == 代码块里的表名集合（**不重不漏**）
  const listed = groups.flatMap((g) => g.names)
  const listedSet = new Set(listed)
  if (listedSet.size !== listed.length) {
    const dup = listed.filter((n, i) => listed.indexOf(n) !== i)
    v.push({
      rule: 'DL-44',
      where: `§3.1:${line}`,
      detail: `分组口径里表名重复：${[...new Set(dup)].join('、')}`,
    })
  }
  for (const name of listedSet) {
    if (!tableNames.has(name)) {
      v.push({
        rule: 'DL-44',
        where: `§3.1:${line}`,
        detail: `分组口径里的「${name}」不在 §3.1 代码块的表名里`,
      })
    }
  }
  for (const t of tables) {
    if (!listedSet.has(t.name)) {
      v.push({
        rule: 'DL-44',
        where: `§3.1:${t.line}`,
        detail: `§3.1 代码块里的「${t.name}」没有出现在任何分组里`,
      })
    }
  }

  // ③ §0 的分组写法与 §3.1 的分组**逐项相等**（标签 ＋ 条数，顺序也要对）
  const ov = overviewRows(lines)
  const tblRow = ov.find((r) => r.key === '数据落在几张表')
  if (tblRow) {
    const ovGroups = overviewGroups(tblRow.answer)
    if (ovGroups.length !== groups.length) {
      v.push({
        rule: 'DL-44',
        where: `§0:${tblRow.line}`,
        detail: `§0 速览的分组写了 ${ovGroups.length} 组，§3.1 抬头是 ${groups.length} 组`,
      })
    } else {
      for (let i = 0; i < groups.length; i += 1) {
        const a = ovGroups[i]!
        const b = groups[i]!
        if (a.label !== b.label || a.count !== b.count) {
          v.push({
            rule: 'DL-44',
            where: `§0:${tblRow.line}`,
            detail: `§0 第 ${i + 1} 组写「${a.label} ${a.count}」，§3.1 抬头是「${b.label} ${b.count}」`,
          })
        }
      }
    }
  }
}

// ============================================================================
// DL-45 —— 「界面形态已跑」的判据必须在 §10.2 有对应行
// ============================================================================

/**
 * 取一段文本里**单独出现**的 DL 编号。
 *
 * ⚠️ **范围写法（`DL-01~DL-50`）不算「单独出现」** ——
 *   §10.2 第一行是总括句（「不证明任何一条 DL-01~DL-50」），
 *   若把范围展开，每一条判据都会在那一行里「找到」⇒ 闸变成永真。
 * ⇒ 两端贴着 `~` 的编号一律跳过。
 */
function standaloneDlIds(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(/DL-\d+/g)) {
    const at = m.index ?? 0
    const before = text[at - 1] ?? ''
    const after = text[at + m[0].length] ?? ''
    if (before === '~' || after === '~') continue
    out.push(m[0])
  }
  return out
}

function checkDl45(lines: string[], v: SpecViolation[]): void {
  const sec7 = sectionRange(lines, '## 7. 验收判据')
  const sec102 = sectionRange(lines, '### 10.2')
  if (!sec7) {
    v.push({ rule: 'DL-45', where: '§7', detail: '找不到 §7 验收判据表' })
    return
  }
  if (!sec102) {
    v.push({ rule: 'DL-45', where: '§10.2', detail: '找不到 §10.2「demo 不是验证」表' })
    return
  }

  const demoIds = new Set<string>()
  for (const r of tableRows(lines, sec102.from, sec102.to)) {
    for (const id of standaloneDlIds(r.cells.join(' '))) demoIds.add(id)
  }

  for (const r of dataRows(tableRows(lines, sec7.from, sec7.to))) {
    const id = stripBold(r.cells[0] ?? '')
    if (!/^DL-\d+$/.test(id)) continue
    const tier = stripBold(r.cells[r.cells.length - 1] ?? '')
    if (!tier.includes('界面形态已跑')) continue
    if (!demoIds.has(id)) {
      v.push({
        rule: 'DL-45',
        where: `§7:${r.line}`,
        detail: `${id} 标成「界面形态已跑」，但 §10.2 的「demo 不能证明什么」表里没有它的对应行`,
      })
    }
  }
}

// ============================================================================
// DL-46 —— §6.3 台账的 ⛔ ↔ §9 的依赖列
// ============================================================================

function checkDl46(lines: string[], v: SpecViolation[]): void {
  const ledger = ledgerRows(lines)
  const phases = phaseRows(lines)
  const phaseById = new Map(phases.map((p) => [p.phase, p]))
  const chain = precedenceChain(lines)

  // ① 台账里标 ⛔ 的每一行，提到期都必须在 §9 存在
  for (const row of ledger) {
    if (!row.isBlocked) continue
    for (const ph of row.phases) {
      if (!phaseById.has(ph)) {
        v.push({
          rule: 'DL-46',
          where: `§6.3:${row.line}`,
          detail: `第 ${row.no} 条标 ⛔ 卡「${ph}」，但 §9 的期表里没有这一期`,
        })
      }
    }
  }

  // ② 依赖链声明的「A 必须先于 B」：两条都得还在台账里、都还标着 ⛔
  for (const link of chain) {
    const a = ledger.find((r) => r.no === link.before)
    const b = ledger.find((r) => r.no === link.after)
    if (!a || !b) {
      v.push({
        rule: 'DL-46',
        where: `§6.3.1:${link.line}`,
        detail: `依赖链声明「第 ${link.before} 条必须先于第 ${link.after} 条」，但台账里缺了一条`,
      })
      continue
    }
    if (!a.isBlocked) {
      v.push({
        rule: 'DL-46',
        where: `§6.3:${a.line}`,
        detail: `依赖链说第 ${link.before} 条卡着后面的期，但台账第 ${link.before} 条已经不再标 ⛔`,
      })
    }
    if (!b.isBlocked) {
      v.push({
        rule: 'DL-46',
        where: `§6.3:${b.line}`,
        detail: `依赖链说第 ${link.after} 条在第 ${link.before} 条之后，但台账第 ${link.after} 条已经不再标 ⛔`,
      })
    }

    // ③ B 卡的那一期，依赖里必须含 A 卡的**每一期**
    for (const ph of b.phases) {
      const target = phaseById.get(ph)
      if (!target) continue
      for (const needed of a.phases) {
        if (!target.depends.includes(needed)) {
          v.push({
            rule: 'DL-46',
            where: `§9:${target.line}`,
            detail: `§6.3.1 说第 ${link.before} 条必须先于第 ${link.after} 条 ⇒ §9 的 ${ph} 行的依赖里必须有「${needed}」，实写「${target.depends}」`,
          })
        }
      }
    }
  }
}

// ============================================================================
// DL-26 —— §3.1 的表数复算
// ============================================================================

/** 规格写死的表数（§3.1 标题里的「十七张表」）。 */
const SPEC_TABLE_COUNT = 17

function checkDl26(lines: string[], v: SpecViolation[]): void {
  const tables = spec31TableNames(lines)
  if (tables.length !== SPEC_TABLE_COUNT) {
    v.push({
      rule: 'DL-26',
      where: '§3.1',
      detail: `§3.1 代码块复算得 ${tables.length} 张表，规格写的是 ${SPEC_TABLE_COUNT} 张`,
    })
  }
}

// ============================================================================
// 表格结构体检 —— **行宽必须与表头一致**
// ============================================================================

/**
 * 把一段里的表格行按「连续块」分组（空行 / 非表格行断开）。
 *
 * ⚠️ **为什么要有这道**：2026-10-21 实测抓到一次**自己引入的**缺陷 ——
 *   编辑 §6.3 台账第 8 条那一行时，把最后一格拆成了两格 ⇒ 那一行变成 **9 格**，
 *   其它行仍是 8 格 ⇒ **表格静默变形**：Markdown 渲染器照样显示（多一列而已），
 *   但任何按列号取值的解析都会**取错列**（本例把「⛔ 卡住哪期」读成了「阶段 2 的推荐档」）。
 *   ⇒ 改长表格行之后**必须**数一遍竖线 / 比一次列数，肉眼是抓不到的。
 */
function tableBlocks(lines: string[], from: number, to: number): SpecRow[][] {
  const blocks: SpecRow[][] = []
  let current: SpecRow[] = []
  for (let i = from; i < to; i += 1) {
    const t = (lines[i] ?? '').trim()
    if (t.startsWith('|')) {
      const cells = t.split('|').slice(1, -1).map((c) => c.trim())
      current.push({ line: i + 1, cells })
      continue
    }
    if (current.length > 0) {
      blocks.push(current)
      current = []
    }
  }
  if (current.length > 0) blocks.push(current)
  return blocks
}

function checkTableWidths(lines: string[], v: SpecViolation[]): void {
  const targets: { key: string; rule: string }[] = [
    { key: '## 0. 一分钟读懂', rule: 'STRUCT' },
    { key: '#### 1.6.1 资源全量口径', rule: 'STRUCT' },
    { key: '#### 3.17.1 附件分期路线全量照抄', rule: 'STRUCT' },
    { key: '### 6.3 ⛔ 本轮自定默认值', rule: 'STRUCT' },
    { key: '## 7. 验收判据', rule: 'STRUCT' },
    { key: '## 9. 最终方案', rule: 'STRUCT' },
    { key: '### 10.2', rule: 'STRUCT' },
  ]
  for (const t of targets) {
    const sec = sectionRange(lines, t.key)
    if (!sec) continue
    for (const block of tableBlocks(lines, sec.from, sec.to)) {
      const head = block[0]
      if (!head) continue
      const width = head.cells.length
      for (const row of block.slice(1)) {
        if (row.cells.length !== width) {
          v.push({
            rule: t.rule,
            where: `${t.key} 第 ${row.line} 行`,
            detail: `该行 ${row.cells.length} 格，同表其它行是 ${width} 格 —— 表格变形（编辑长表格行后必须数一遍列数）`,
          })
        }
      }
    }
  }
}

// ============================================================================

/**
 * 规格里被解析出来的**事实计数**。
 *
 * ⚠️ **它存在是为了自证「检查器不是空壳」** —— 一道恒绿的闸和一个
 *   「什么都没读到所以什么都没报」的闸，在测试里长得一模一样。
 *   ⇒ 测试必须能断言「它确实读到了 14 条增强 / 17 张表 / 50 条判据 / 11 期 / 9 条待裁」。
 */
export interface SpecFacts {
  /** §0 速览表的数据行数 */
  overviewRows: number
  /** §3.0 的增强条数 */
  enhancements: number
  /** §3.1 代码块里的表数 */
  tables: number
  /** §7 的判据条数 */
  criteria: number
  /** §9 的期数 */
  phases: number
  /** §9 逐期人日求和 */
  phaseDays: number
  /** §6.3 台账的行数 */
  ledgerRows: number
  /** §10.2 的表格行数 */
  demoRows: number
}

/** 读出规格里的事实计数。 */
export function summarizeSpec(specText: string): SpecFacts {
  const lines = specText.split('\n')
  const sec102 = sectionRange(lines, '### 10.2')
  return {
    overviewRows: overviewRows(lines).length,
    enhancements: enhancementCount(lines),
    tables: spec31TableNames(lines).length,
    criteria: criterionCount(lines),
    phases: phaseRows(lines).length,
    phaseDays: phaseRows(lines).reduce((acc, p) => acc + p.days, 0),
    ledgerRows: ledgerRows(lines).length,
    demoRows: sec102 ? tableRows(lines, sec102.from, sec102.to).length : 0,
  }
}

/**
 * 跑完整套规格一致性检查。
 *
 * @param specText spec 文件的全文（**任意文本** —— 变异腿喂的就是改过的版本）
 * @returns 违规列表（空数组 = 全绿）
 */
export function checkSpecConsistency(specText: string): SpecViolation[] {
  const lines = specText.split('\n')
  const v: SpecViolation[] = []
  checkDl44(lines, v)
  checkDl44Groups(lines, v)
  checkDl45(lines, v)
  checkDl46(lines, v)
  checkDl26(lines, v)
  checkTableWidths(lines, v)
  return v
}
