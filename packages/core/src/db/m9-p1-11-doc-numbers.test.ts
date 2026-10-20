// `packages/core/src/db/m9-p1-11-doc-numbers.test.ts` —— M9 v1.6 **P1.11 出口**
// （`m9-dev-plan-2026-10.md` §6.2 的 P1 出口条件 ＋ `m9-dev-language-roadmap.md` §1.4）
//
// ## 它断什么
//
// P1 出口条件写着「`lang_topics` 节点数 = **78**」。⚠️ **此前这个数没有任何闸**：
// 单测钉的是两个分项（46 / 32），`78` 这个**总数**只活在注释里，
// **文档里的数与实跑值之间没有任何一处把它们绑在一起**。
//
// ⚠️ **P1d 起这道闸按两个口径分断**（**别把它们混成一个数**）：
//   - **源清点口径**：runoob 源清单 Python 侧的三档 45 / 30 / 9 ＝ 84 ⇒ 比 spec §1.4 三档表；
//   - **路线节点口径**：库里语言级知识点 46 ＋ 32 ＝ 78 ⇒ 比 dev-plan §6.2 P1 出口。
//   P1d 补建冷门底层六条后两者在 Python 侧分岔（45 vs 46）⇒ 混着比必然误红。
//
// ⇒ 本测试断「三处文档出处两两相等，且各等于自己口径的实跑值」：
//   ① 正例：真实文档 ＋ 真实库 ⇒ 0 违规；
//   ② 变异腿：文档里的数被改（78 / 46 / 32 / 45 / 30）⇒ 必须红；
//   ③ 变异腿：实跑值与文档对不上 ⇒ 必须红；
//   ④ 反证腿：旧值（78 / 72 / 44 / 31）与新值**同在一行**时，解析器仍取新值
//      （否则就会把被订正掉的旧值当成现状 —— 那比不查更坏）。
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { newDb } from '../test-support/new-db'
import { seedLangTopics } from './m9-p1-seed-lang-topics'
import { listDagNodes } from './m9-p1-7-topic-stages'
import { strictLibraryClassifier } from './m9-classify-lang-topics'
import {
  parsePlanNodeCount,
  parseSpecNodeCount,
  parseSpecPythonSplit,
  verifyDocNumbers,
  type ActualNumbers,
  type DocNumberViolation,
} from './m9-doc-numbers'

const SEEDS_DIR = fileURLToPath(new URL('./seeds', import.meta.url))
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const SPEC_FILE = join(REPO_ROOT, 'docs/specs/m9-dev-language-roadmap.md')
const PLAN_FILE = join(REPO_ROOT, 'docs/specs/m9-dev-plan-2026-10.md')

const SPEC_TEXT = readFileSync(SPEC_FILE, 'utf8')
const PLAN_TEXT = readFileSync(PLAN_FILE, 'utf8')

/**
 * 从给定的库里取实跑值 —— **两个口径分列**。
 *
 * ⚠️ **口径分离的机器形态**：
 *   - **源清点**只数 `source_kind='runoob'` 的行（runoob 那两份源清单）——
 *     P1d 的冷门六条是 `source_kind='owner_guide'` 的**自撰**条目 ⇒ 不进源清点；
 *   - **路线节点**数全部 `kind='language'` 的行（含那六条）⇒ 46 ＋ 32 ＝ 78。
 */
function measureFrom(db: Parameters<typeof listDagNodes>[0]): ActualNumbers {
  const nodes = listDagNodes(db)
  const py = nodes.filter((n) => n.lang === 'python')
  const go = nodes.filter((n) => n.lang === 'go')
  const census = db
    .prepare(
      `SELECT slug, title, kind FROM lang_topics WHERE lang='python' AND source_kind='runoob'`,
    )
    .all() as { slug: string; title: string; kind: string }[]
  const routePy = py.filter((n) => n.kind === 'language').length
  const routeGo = go.filter((n) => n.kind === 'language').length
  return {
    sourceCensus: {
      pyLanguage: census.filter((n) => n.kind === 'language').length,
      // ⚠️ **严格库级**（§1.4 分类规则复算，实测 30）——
      //   不是 `kind='library'` 的 39 条（那 39 ＝ 严格库级 30 ＋ 环境与杂项 9）
      pyStrictLibrary: census.filter((n) => strictLibraryClassifier(n.title)).length,
      pyTotal: census.length,
    },
    routeNodes: {
      pyLanguage: routePy,
      goLanguage: routeGo,
      total: routePy + routeGo,
    },
  }
}

/** 一次建库 ＋ 导入两门，取出实跑值。 */
function measure(): ActualNumbers {
  const h = newDb()
  try {
    seedLangTopics(h.db, SEEDS_DIR)
    return measureFrom(h.db)
  } finally {
    h.close()
  }
}

/** 只替换第一处；锚点不在就抛（⇒ 变异腿打空了要立刻知道，不能静默放过）。 */
function replaceOnce(text: string, from: string, to: string): string {
  const idx = text.indexOf(from)
  if (idx === -1) throw new Error(`锚点不在文本里：${from}`)
  return text.slice(0, idx) + to + text.slice(idx + from.length)
}

function violations(
  specText: string,
  planText: string,
  actual: ActualNumbers = measure(),
): DocNumberViolation[] {
  return verifyDocNumbers({ specText, planText }, actual)
}

function rules(vs: DocNumberViolation[]): string[] {
  return vs.map((v) => v.rule)
}

describe('M9 P1.11 · 文档里的实测数字必须与实跑值相等', () => {
  // ───────────────────────────────────────────────────────────────────────
  // ① 正例
  // ───────────────────────────────────────────────────────────────────────
  it('① 实跑值：源清点 45 / 30 / 84 ＋ 路线节点 46 / 32 / 78（两个口径分列）', () => {
    const a = measure()
    expect(a).toEqual({
      sourceCensus: { pyLanguage: 45, pyStrictLibrary: 30, pyTotal: 84 },
      routeNodes: { pyLanguage: 46, goLanguage: 32, total: 78 },
    })
  })

  it('② 三处文档出处读出来的数一致，且等于实跑 ⇒ 0 违规', () => {
    const specCount = parseSpecNodeCount(SPEC_TEXT)
    const planCount = parsePlanNodeCount(PLAN_TEXT)
    const split = parseSpecPythonSplit(SPEC_TEXT)
    expect(specCount).toEqual({ pyLanguage: 46, goLanguage: 32, total: 78 })
    expect(planCount).toEqual({ pyLanguage: 46, goLanguage: 32, total: 78 })
    expect(split).toEqual({ language: 45, library: 30, misc: 9 })
    expect(rules(violations(SPEC_TEXT, PLAN_TEXT))).toEqual([])
  })

  it('③ 节点数 78 = 46 ＋ 32（总数不是「两个分项各自对」就算过）', () => {
    const c = parsePlanNodeCount(PLAN_TEXT)
    expect(c).not.toBeNull()
    expect(c!.pyLanguage + c!.goLanguage).toBe(c!.total)
    expect(c!.total).toBe(78)
  })

  // ───────────────────────────────────────────────────────────────────────
  // ② 变异腿：文档里的数被改 ⇒ 必须红
  // ───────────────────────────────────────────────────────────────────────
  it('变异 ①：dev-plan 的「节点数 = 78」改成 77 ⇒ 红', () => {
    const bad = replaceOnce(PLAN_TEXT, '「lang_topics 节点数 = 78', '「lang_topics 节点数 = 77')
    expect(rules(violations(SPEC_TEXT, bad))).toContain('actual-mismatch')
  })

  it('变异 ②：dev-plan 的实测分项 46 改成 47 ⇒ 红', () => {
    const bad = replaceOnce(
      PLAN_TEXT,
      '实测 **Python 语言知识点 46',
      '实测 **Python 语言知识点 47',
    )
    const r = rules(violations(SPEC_TEXT, bad))
    // 47 ＋ 32 = 79 ≠ 78 ⇒ 文档自己的算式就不成立；同时与 spec 说的 46 对不上
    expect(r).toContain('internal-mismatch')
    expect(r).toContain('spec-plan-mismatch')
  })

  it('变异 ③：spec §1.4 三档表的「语言知识点 45」改成 44 ⇒ 红', () => {
    const bad = replaceOnce(SPEC_TEXT, '| **语言知识点** | 45 |', '| **语言知识点** | 44 |')
    expect(rules(violations(bad, PLAN_TEXT))).toContain('actual-mismatch')
  })

  it('变异 ④：spec §1.4 三档表的「库级 30」改成 31 ⇒ 红', () => {
    const bad = replaceOnce(SPEC_TEXT, '| **库级** | 30 |', '| **库级** | 31 |')
    expect(rules(violations(bad, PLAN_TEXT))).toContain('actual-mismatch')
  })

  it('变异 ⑤：spec 的路线节点算式 32 改成 31 ⇒ 两份台账对不上 ⇒ 红', () => {
    const bad = replaceOnce(
      SPEC_TEXT,
      'Go 语言知识点 `32` ＝ `78`',
      'Go 语言知识点 `31` ＝ `78`',
    )
    expect(rules(violations(bad, PLAN_TEXT))).toContain('spec-plan-mismatch')
  })

  it('变异 ⑥：实跑值与文档对不上 ⇒ 红（闸不是只在改文档时才做事）', () => {
    const wrong: ActualNumbers = {
      sourceCensus: { pyLanguage: 45, pyStrictLibrary: 30, pyTotal: 84 },
      routeNodes: { pyLanguage: 45, goLanguage: 32, total: 77 },
    }
    expect(rules(violations(SPEC_TEXT, PLAN_TEXT, wrong))).toContain('actual-mismatch')
  })

  it('变异 ⑦：出口条件被删到闸认不出 ⇒ 红（不许当成「没有这项」）', () => {
    const bad = PLAN_TEXT.split('\n')
      .filter((l) => !l.startsWith('- **P1 出口**'))
      .join('\n')
    expect(rules(violations(SPEC_TEXT, bad))).toEqual(['parse-failed'])
  })

  // ───────────────────────────────────────────────────────────────────────
  // ②′ 真·库变异腿：**改库不改文档** ⇒ 也必须红
  //   （变异 ⑥ 只喂了假值；这一条真动一次库，证明「实跑侧是真的在读库」）
  // ───────────────────────────────────────────────────────────────────────
  it('变异 ⑧：真把库里一条语言知识点改成库级（文档不动）⇒ 红', () => {
    const h = newDb()
    try {
      seedLangTopics(h.db, SEEDS_DIR)
      const victim = h.db
        .prepare(
          `SELECT slug FROM lang_topics WHERE lang = 'python' AND kind = 'language' ORDER BY id LIMIT 1`,
        )
        .get() as { slug: string } | undefined
      expect(victim, '库里没有语言知识点可改 ⇒ 变异腿打空了').toBeTruthy()
      h.db.prepare(`UPDATE lang_topics SET kind = 'library' WHERE slug = ? AND lang = 'python'`).run(
        victim!.slug,
      )
      const actual = measureFrom(h.db)
      expect(actual.routeNodes.pyLanguage).toBe(45)
      const r = rules(verifyDocNumbers({ specText: SPEC_TEXT, planText: PLAN_TEXT }, actual))
      expect(r).toContain('actual-mismatch')
    } finally {
      h.close()
    }
  })

  // ───────────────────────────────────────────────────────────────────────
  // ③ 反证：旧值与新值同在一行时，必须取新值
  // ───────────────────────────────────────────────────────────────────────
  it('反证 ①：spec 订正链里三个旧算式与「路线节点口径」同在 ⇒ 取最新的 78', () => {
    const sec = SPEC_TEXT.slice(SPEC_TEXT.indexOf('### 1.4'))
    // ⚠️ 订正链的三个旧值**刻意留在同一节里**（如实登记，不删痕迹）
    expect(sec).toContain('44 ＋ Go 全 34 ＝ 78')
    expect(sec).toContain('45 ＋ Go 语言知识点 27 ＝ 72')
    // 锚点行在它们之后 ⇒ 解析器必须取锚点行的数，不是「第一个出现的数字」
    expect(parseSpecNodeCount(SPEC_TEXT)!.total).toBe(78)
    expect(parseSpecNodeCount(SPEC_TEXT)!.pyLanguage).toBe(46)
  })

  it('反证 ②：dev-plan 出口行里「节点数 = 78」与「实测 … = 78」同在 ⇒ 取 78', () => {
    const line = PLAN_TEXT.split('\n').find((l) => l.startsWith('- **P1 出口**'))!
    expect(line).toContain('「lang_topics 节点数 = 78')
    expect(line).toContain('实测 **Python 语言知识点 46 ＋ Go 语言知识点 32 = 78**')
    expect(parsePlanNodeCount(PLAN_TEXT)!.total).toBe(78)
    expect(parsePlanNodeCount(PLAN_TEXT)!.pyLanguage).toBe(46)
  })

  it('反证 ③：闸只在「改文档」时才红 ⇒ 把文档改回去它就绿（规则不是恒红）', () => {
    const bad = replaceOnce(PLAN_TEXT, '「lang_topics 节点数 = 78', '「lang_topics 节点数 = 77')
    expect(rules(violations(SPEC_TEXT, bad)).length).toBeGreaterThan(0)
    expect(rules(violations(SPEC_TEXT, PLAN_TEXT))).toEqual([])
  })

  // ───────────────────────────────────────────────────────────────────────
  // ④ 口径分离：P1d 起这两个口径的数**本来就不同**（45 ≠ 46）
  //   ⇒ 闸必须各比各的；跨口径比会在正例上直接误红。
  // ───────────────────────────────────────────────────────────────────────
  it('口径分离：§1.4 三档表说 45、路线节点说 46 ⇒ 各比各的，不互相报错', () => {
    // 正例：两个口径的数**不同**（源清点 45 ≠ 路线节点 46）——
    //   若闸跨口径比，这一条必然红 ⇒ 它同时是「分离真的生效了」的证明。
    expect(rules(violations(SPEC_TEXT, PLAN_TEXT))).toEqual([])

    // 只改源清点那一处（§1.4 三档表）⇒ 红，且**不**牵连路线节点那几条
    const badCensus = replaceOnce(SPEC_TEXT, '| **语言知识点** | 45 |', '| **语言知识点** | 44 |')
    const v1 = violations(badCensus, PLAN_TEXT)
    expect(rules(v1)).toContain('actual-mismatch')
    expect(
      v1.filter((v) => v.where.includes('§6.2 出口条件')),
      '改源清点不该牵连路线节点那条',
    ).toEqual([])

    // 只改路线节点那一处（dev-plan 出口条件）⇒ 红，且**不**牵连源清点那几条
    const badRoute = replaceOnce(PLAN_TEXT, '「lang_topics 节点数 = 78', '「lang_topics 节点数 = 77')
    const v2 = violations(SPEC_TEXT, badRoute)
    expect(rules(v2)).toContain('actual-mismatch')
    expect(
      v2.filter((v) => v.where.includes('§1.4 三档表')),
      '改路线节点不该牵连源清点那条',
    ).toEqual([])
  })
})
