/**
 * `packages/core/src/db/m9-doc-numbers.ts` —— M9 v1.6 **P1.11 · 文档里的实测数字必须与实跑值相等**
 * （`m9-dev-plan-2026-10.md` §6.2 的 **P1 出口条件** ＋ `m9-dev-language-roadmap.md` §1.4）
 *
 * ## 它补的是什么
 *
 * P1 出口条件写着：「`lang_topics` 节点数 = **78**」（P1d 订正后的值）。
 * ⚠️ **此前这个数没有任何闸** ——
 *   单测钉的是**两个分项**（P1d 后是 Python 46 / Go 32），而 `78` 这个**总数**只活在注释里；
 *   **文档里的数与代码里的实跑值之间，没有任何一处把它们绑在一起**。
 *   ⇒ 改文档不改代码（闸不红）／改代码不改文档（闸也不红）—— 两边可以无声地分叉。
 *
 * ⚠️ **同一个出口条款里的另一条就有闸**：「§3.1 表数复算 17」由 DL-26 守着，
 *   而 DL-26 的做法正是**从 spec 正文读出那个数**再与实跑对账（见 `m9-p1-7-topic-stages.test.ts`）。
 *   ⇒ P1.11 把同一套做法补到节点数上。
 *
 * ## 口径：**两个**，各比各的（P1d 起拆开）
 *
 * ⚠️ **P1d 之前只有一个口径，P1d 之后必须拆成两个** ——
 *   补建冷门底层六条后，「runoob 源清单的 Python 语言知识点（45）」与
 *   「库里 Python 语言知识点（46）」**分岔了**（多出来的是自撰的元类那一条）。
 *   ⇒ 拿一个口径去比另一个口径，**必然误红**（这不是假红，是两个不同的量）。
 *
 * | 口径 | 说的是什么 | 对账去处 | 实跑取值 |
 * |---|---|---|---|
 * | **源清点** | runoob 源清单 Python 侧的三档：语言 45 / 严格库级 30 / 环境与杂项 9（合计 84） | spec §1.4 三档表 | `source_kind='runoob'` 的 Python 行 |
 * | **路线节点** | 库里语言级知识点总数：Python 46 ＋ Go 32 ＝ 78 | dev-plan §6.2 P1 出口 ＋ spec §1.4 路线节点口径行 | 全部 `kind='language'` 的行 |
 *
 * ⚠️ **两个口径各自的判据**：
 *   - 源清点口径 ⇒ §1.4 三档表（语言/库级/杂项/合计）必须与 `sourceCensus` 相等；
 *   - 路线节点口径 ⇒ P1 出口「节点数」与算式必须与 `routeNodes` 相等。
 *   **跨口径比是错的**（例如拿路线节点的 46 去比源清点的 45）。
 *
 * ## ⚠️ 为什么解析必须锚死（这一处最容易写错）
 *
 * spec §1.4 的订正链与 dev-plan 的 P1 出口行里，**旧值与新值同在**：
 * - spec：「① … ⇒ `44 ＋ Go 全 34 ＝ 78`；② … ⇒ `45 ＋ Go 语言知识点 27 ＝ 72`；③ … ⇒ **78**」
 * - dev-plan：出口行里同时有「节点数 = 78」与「实测 … ＝ 78」
 *
 * ⇒ **按「第一个出现的数字」取，必然取到旧值**。
 *   本模块一律锚在带语义的标记上：
 *   **「**路线节点口径**：…」**（spec）／**「「lang_topics 节点数 = N」」**＋**「实测 **Python 语言知识点 A ＋ Go 语言知识点 B = C**」**（dev-plan）。
 *
 * ## 它是纯函数
 *
 * 文本解析与对账都不碰数据库、不碰网络 ⇒ 单测可以直接喂「改过的文档文本」当变异样本。
 * 实跑值由调用方算好传进来（`ActualNumbers`）—— 库怎么开、分类器怎么跑，是调用方的事。
 */

/** spec §1.4 的 Python 三档（语言知识点 / 库级 / 环境与杂项）。 */
export interface PythonSplit {
  /** 语言知识点条数（§1.4 源清点实测 45） */
  language: number
  /** **严格**库级条数（§1.4 源清点实测 30）—— ⚠️ 不是 `kind='library'` 的全部（那是 39 ＝ 30 ＋ 杂项 9） */
  library: number
  /** 环境与杂项条数（§1.4 源清点实测 9） */
  misc: number
}

/** 节点数算式（Python 语言知识点 ＋ Go 语言知识点 = 总数）。 */
export interface NodeCountContract {
  pyLanguage: number
  goLanguage: number
  total: number
}

/**
 * 实跑值 —— 由调用方从库里算出来传进来。
 *
 * ⚠️ **两个口径分列**（理由见文件头的「两个口径」一节）：
 *   `sourceCensus` 是**源清点**（只数 `source_kind='runoob'` 的行），
 *   `routeNodes` 是**路线节点**（数全部 `kind='language'` 的行）。
 */
export interface ActualNumbers {
  /** **源清点口径** —— runoob 源清单 Python 侧的三档拆分（§1.4 三档表对账用）。 */
  sourceCensus: {
    /** Python 语言知识点条数（实测 45） */
    pyLanguage: number
    /**
     * Python 的**严格库级**条数 —— 按 §1.4 分类规则复算（实测 30）。
     *
     * ⚠️ **不是 `kind='library'` 的全部**：种子里的 `kind='library'` 有 39 条
     *   （＝ 严格库级 30 ＋ 环境与杂项 9，两者都归 `library`）。
     *   §1.4 的三档表把「杂项」单列一档 ⇒ 对账必须用分类器的**严格库级**口径。
     */
    pyStrictLibrary: number
    /** Python 源清单总条数（实测 84） */
    pyTotal: number
  }
  /** **路线节点口径** —— 库里全部语言级知识点（P1 出口「节点数」对账用）。 */
  routeNodes: {
    /** Python 的语言知识点条数（实测 46） */
    pyLanguage: number
    /** Go 的语言知识点条数（实测 32） */
    goLanguage: number
    /** 两门合计（实测 78） */
    total: number
  }
}

export type DocNumberRule =
  'parse-failed' | 'internal-mismatch' | 'spec-plan-mismatch' | 'actual-mismatch'

export interface DocNumberViolation {
  /** 出了问题的出处 */
  where: string
  rule: DocNumberRule
  detail: string
}

// ============================================================================
// 文本解析
// ============================================================================

/** 取某个 `### N.M` 标题到下一个 `### ` 之间的正文；找不到标题返回 null。 */
function sectionByHeading(text: string, heading: RegExp): string | null {
  const lines = text.split('\n')
  const start = lines.findIndex((l) => heading.test(l))
  if (start === -1) return null
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((l) => l.startsWith('### '))
  return (end === -1 ? rest : rest.slice(0, end)).join('\n')
}

/** 在文本里取第一个匹配的数字；取不到返回 null。 */
function firstNumber(text: string, re: RegExp): number | null {
  const m = re.exec(text)
  return m ? Number(m[1]) : null
}

/**
 * 读 spec §1.4 三档表的 Python 拆分。
 *
 * ⚠️ **只在 §1.4 区间内找** —— 「库级」这两个字在 spec 全篇到处是
 *   （§1.4 之前的实测结论、§3.1 的 schema 说明、§4.1.1 的资源层讨论…）。
 */
export function parseSpecPythonSplit(specText: string): PythonSplit | null {
  const sec = sectionByHeading(specText, /^### 1\.4(\s|$)/)
  if (sec === null) return null
  const language = firstNumber(sec, /^\|\s*\*\*语言知识点\*\*\s*\|\s*(\d+)\s*\|/m)
  const library = firstNumber(sec, /^\|\s*\*\*库级\*\*\s*\|\s*(\d+)\s*\|/m)
  const misc = firstNumber(sec, /^\|\s*环境与杂项\s*\|\s*(\d+)\s*\|/m)
  if (language === null || library === null || misc === null) return null
  return { language, library, misc }
}

/**
 * 读 spec §1.4 的**路线节点口径**算式。
 *
 * ⚠️ **锚在「**路线节点口径**：」上** —— 同一节里还有订正链的三个旧算式
 *   （`44 ＋ Go 全 34 ＝ 78` / `45 ＋ Go 语言知识点 27 ＝ 72`），
 *   按「第一个出现的数字」取必然取到被订正掉的旧值。
 */
export function parseSpecNodeCount(specText: string): NodeCountContract | null {
  const sec = sectionByHeading(specText, /^### 1\.4(\s|$)/)
  if (sec === null) return null
  const m =
    /\*\*路线节点口径\*\*：Python 语言知识点\s*`(\d+)`\s*[＋+]\s*Go 语言知识点\s*`(\d+)`\s*[＝=]\s*`(\d+)`/.exec(
      sec,
    )
  if (!m) return null
  return { pyLanguage: Number(m[1]), goLanguage: Number(m[2]), total: Number(m[3]) }
}

/**
 * 读 dev-plan §6.2 的 **P1 出口条件**里的节点数。
 *
 * ⚠️ **定位用行首锚**（`- **P1 出口**` 全文唯一），**取数用带语义的标记**：
 *   - 「`「lang_topics 节点数 = N`」」—— 出口条件本身；
 *   - 「`实测 **Python 语言知识点 A ＋ Go 语言知识点 B = C**`」—— 实测算式。
 *
 *   ⚠️ **不能取「第一个出现的 72」**：该行同时有旧值 78（两次）与新值 72（两次），
 *   还有旧算法「Python 语言知识点 44 ＋ Go 全部 34 条」—— 它后面跟的是
 *   「Go 全部 34 条」而不是「Go 语言知识点 N」⇒ 靠后半段的措辞也能把它挡掉。
 */
export function parsePlanNodeCount(planText: string): NodeCountContract | null {
  const line = planText.split('\n').find((l) => l.startsWith('- **P1 出口**'))
  if (line === undefined) return null
  const exit = /「lang_topics 节点数 = (\d+)/.exec(line)
  const real =
    /实测\s*\*\*Python 语言知识点\s*(\d+)\s*[＋+]\s*Go 语言知识点\s*(\d+)\s*[＝=]\s*(\d+)\*\*/.exec(
      line,
    )
  if (!exit || !real) return null
  return {
    pyLanguage: Number(real[1]),
    goLanguage: Number(real[2]),
    total: Number(exit[1]),
  }
}

// ============================================================================
// 对账
// ============================================================================

/**
 * 把「三处文档出处」与「实跑值」摆在一起对账。
 *
 * 断四件事：
 * 1. `parse-failed` —— 任一出处读不出来（文档被改到闸认不出 ⇒ 同样报红）
 * 2. `internal-mismatch` —— 某处文档**自己**的算式不成立（46 ＋ 32 ≠ 78）
 * 3. `spec-plan-mismatch` —— spec 与 dev-plan 两份台账说的不是一回事
 * 4. `actual-mismatch` —— 文档说的数与**实跑**对不上
 *
 * ⚠️ **第 4 条按两个口径分断**：路线节点口径比 `actual.routeNodes`，
 *   源清点口径比 `actual.sourceCensus` —— **跨口径比是错的**。
 */
export function verifyDocNumbers(
  docs: { specText: string; planText: string },
  actual: ActualNumbers,
): DocNumberViolation[] {
  const out: DocNumberViolation[] = []
  const split = parseSpecPythonSplit(docs.specText)
  const specCount = parseSpecNodeCount(docs.specText)
  const planCount = parsePlanNodeCount(docs.planText)

  if (split === null || specCount === null || planCount === null) {
    const missing: string[] = []
    if (split === null) missing.push('spec §1.4 三档表')
    if (specCount === null) missing.push('spec §1.4 订正注记的节点数算式')
    if (planCount === null) missing.push('dev-plan §6.2 的 P1 出口条件')
    out.push({
      where: '(文档)',
      rule: 'parse-failed',
      detail: `读不出：${missing.join('、')} ⇒ 文档被改到闸认不出了（**不许当成「没有这项」**）`,
    })
    return out
  }

  // ── ① 文档内部自洽 ──
  for (const [where, c] of [
    ['spec §1.4', specCount],
    ['dev-plan §6.2', planCount],
  ] as const) {
    if (c.pyLanguage + c.goLanguage !== c.total) {
      out.push({
        where,
        rule: 'internal-mismatch',
        detail: `${String(c.pyLanguage)} ＋ ${String(c.goLanguage)} ≠ ${String(c.total)} ⇒ 文档自己的算式就不成立`,
      })
    }
  }

  // ── ② 两份台账必须说同一件事 ──
  if (
    specCount.pyLanguage !== planCount.pyLanguage ||
    specCount.goLanguage !== planCount.goLanguage ||
    specCount.total !== planCount.total
  ) {
    out.push({
      where: 'spec §1.4 ↔ dev-plan §6.2',
      rule: 'spec-plan-mismatch',
      detail:
        `spec 说 ${String(specCount.pyLanguage)} ＋ ${String(specCount.goLanguage)} = ${String(specCount.total)}，` +
        `dev-plan 说 ${String(planCount.pyLanguage)} ＋ ${String(planCount.goLanguage)} = ${String(planCount.total)}` +
        ` ⇒ 两份台账对不上`,
    })
  }

  // ── ③ 与实跑对账 · 路线节点口径（以 dev-plan 的出口条件为准 —— 那是合同条款）──
  if (actual.routeNodes.pyLanguage !== planCount.pyLanguage) {
    out.push({
      where: 'dev-plan §6.2 出口条件 · Python 分项',
      rule: 'actual-mismatch',
      detail: `文档说 ${String(planCount.pyLanguage)} 条，实跑 ${String(actual.routeNodes.pyLanguage)} 条`,
    })
  }
  if (actual.routeNodes.goLanguage !== planCount.goLanguage) {
    out.push({
      where: 'dev-plan §6.2 出口条件 · Go 分项',
      rule: 'actual-mismatch',
      detail: `文档说 ${String(planCount.goLanguage)} 条，实跑 ${String(actual.routeNodes.goLanguage)} 条`,
    })
  }
  if (actual.routeNodes.pyLanguage + actual.routeNodes.goLanguage !== planCount.total) {
    out.push({
      where: 'dev-plan §6.2 出口条件 · 节点数总数',
      rule: 'actual-mismatch',
      detail:
        `实跑 ${String(actual.routeNodes.pyLanguage)} ＋ ${String(actual.routeNodes.goLanguage)} = ` +
        `${String(actual.routeNodes.pyLanguage + actual.routeNodes.goLanguage)}，文档说 ${String(planCount.total)}`,
    })
  }
  if (actual.routeNodes.total !== planCount.total) {
    out.push({
      where: 'dev-plan §6.2 出口条件 · 节点数总数（自报口径）',
      rule: 'actual-mismatch',
      detail: `实跑自报 ${String(actual.routeNodes.total)}，文档说 ${String(planCount.total)}`,
    })
  }

  // ── ④ spec §1.4 三档表 · **源清点口径**（与上面的路线节点口径不是同一个量）──
  if (split.language !== actual.sourceCensus.pyLanguage) {
    out.push({
      where: 'spec §1.4 三档表 · 语言知识点（源清点口径）',
      rule: 'actual-mismatch',
      detail: `文档说 ${String(split.language)} 条，实跑 ${String(actual.sourceCensus.pyLanguage)} 条`,
    })
  }
  if (split.library !== actual.sourceCensus.pyStrictLibrary) {
    out.push({
      where: 'spec §1.4 三档表 · 库级（源清点口径）',
      rule: 'actual-mismatch',
      detail: `文档说 ${String(split.library)} 条，实跑 ${String(actual.sourceCensus.pyStrictLibrary)} 条（严格库级口径）`,
    })
  }
  if (split.language + split.library + split.misc !== actual.sourceCensus.pyTotal) {
    out.push({
      where: 'spec §1.4 三档表 · 三档合计（源清点口径）',
      rule: 'actual-mismatch',
      detail:
        `${String(split.language)} ＋ ${String(split.library)} ＋ ${String(split.misc)} = ` +
        `${String(split.language + split.library + split.misc)}，实跑 Python 源清单总数 ${String(actual.sourceCensus.pyTotal)}`,
    })
  }

  return out
}
