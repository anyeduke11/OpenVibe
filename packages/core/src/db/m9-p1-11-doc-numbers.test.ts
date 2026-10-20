// `packages/core/src/db/m9-p1-11-doc-numbers.test.ts` —— M9 v1.6 **P1.11 出口**
// （`m9-dev-plan-2026-10.md` §6.2 的 P1 出口条件 ＋ `m9-dev-language-roadmap.md` §1.4）
//
// ## 它断什么
//
// P1 出口条件写着「`lang_topics` 节点数 = **72**」。⚠️ **此前这个数没有任何闸**：
// 单测钉的是两个分项（45 / 27），`72` 这个**总数**只活在注释里，
// **文档里的数与实跑值之间没有任何一处把它们绑在一起**。
//
// ⇒ 本测试断「三处文档出处两两相等，且都等于实跑值」：
//   ① 正例：真实文档 ＋ 真实库 ⇒ 0 违规；
//   ② 变异腿：文档里的数被改（72 / 45 / 30 / 27）⇒ 必须红；
//   ③ 变异腿：实跑值与文档对不上 ⇒ 必须红；
//   ④ 反证腿：旧值（78 / 44 / 31）与新值**同在一行**时，解析器仍取新值
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

/** 从给定的库里取实跑值。 */
function measureFrom(db: Parameters<typeof listDagNodes>[0]): ActualNumbers {
  const nodes = listDagNodes(db)
  const py = nodes.filter((n) => n.lang === 'python')
  const go = nodes.filter((n) => n.lang === 'go')
  return {
    pyLanguage: py.filter((n) => n.kind === 'language').length,
    goLanguage: go.filter((n) => n.kind === 'language').length,
    // ⚠️ **严格库级**（§1.4 分类规则复算，实测 30）——
    //   不是 `kind='library'` 的 39 条（那 39 ＝ 严格库级 30 ＋ 环境与杂项 9）
    pyStrictLibrary: py.filter((n) => strictLibraryClassifier(n.title)).length,
    pyTotal: py.length,
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
  it('① 实跑值：Python 语言 45 / Go 语言 27 / 严格库级 30 / Python 总 84', () => {
    const a = measure()
    expect(a).toEqual({ pyLanguage: 45, goLanguage: 27, pyStrictLibrary: 30, pyTotal: 84 })
  })

  it('② 三处文档出处读出来的数一致，且等于实跑 ⇒ 0 违规', () => {
    const specCount = parseSpecNodeCount(SPEC_TEXT)
    const planCount = parsePlanNodeCount(PLAN_TEXT)
    const split = parseSpecPythonSplit(SPEC_TEXT)
    expect(specCount).toEqual({ pyLanguage: 45, goLanguage: 27, total: 72 })
    expect(planCount).toEqual({ pyLanguage: 45, goLanguage: 27, total: 72 })
    expect(split).toEqual({ language: 45, library: 30, misc: 9 })
    expect(rules(violations(SPEC_TEXT, PLAN_TEXT))).toEqual([])
  })

  it('③ 节点数 72 = 45 ＋ 27（总数不是「两个分项各自对」就算过）', () => {
    const c = parsePlanNodeCount(PLAN_TEXT)
    expect(c).not.toBeNull()
    expect(c!.pyLanguage + c!.goLanguage).toBe(c!.total)
    expect(c!.total).toBe(72)
  })

  // ───────────────────────────────────────────────────────────────────────
  // ② 变异腿：文档里的数被改 ⇒ 必须红
  // ───────────────────────────────────────────────────────────────────────
  it('变异 ①：dev-plan 的「节点数 = 72」改成 71 ⇒ 红', () => {
    const bad = replaceOnce(PLAN_TEXT, '「lang_topics 节点数 = 72', '「lang_topics 节点数 = 71')
    expect(rules(violations(SPEC_TEXT, bad))).toContain('actual-mismatch')
  })

  it('变异 ②：dev-plan 的实测分项 45 改成 46 ⇒ 红', () => {
    const bad = replaceOnce(
      PLAN_TEXT,
      '实测 **Python 语言知识点 45',
      '实测 **Python 语言知识点 46',
    )
    const r = rules(violations(SPEC_TEXT, bad))
    // 46 ＋ 27 = 73 ≠ 72 ⇒ 文档自己的算式就不成立；同时与 spec 说的 45 对不上
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

  it('变异 ⑤：spec 的节点数算式 27 改成 26 ⇒ 两份台账对不上 ⇒ 红', () => {
    const bad = replaceOnce(
      SPEC_TEXT,
      '订正后是 `45 ＋ Go 语言知识点 27 ＝ 72`',
      '订正后是 `45 ＋ Go 语言知识点 26 ＝ 72`',
    )
    expect(rules(violations(bad, PLAN_TEXT))).toContain('spec-plan-mismatch')
  })

  it('变异 ⑥：实跑值与文档对不上 ⇒ 红（闸不是只在改文档时才做事）', () => {
    const wrong: ActualNumbers = {
      pyLanguage: 44,
      goLanguage: 27,
      pyStrictLibrary: 30,
      pyTotal: 84,
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
      expect(actual.pyLanguage).toBe(44)
      const r = rules(verifyDocNumbers({ specText: SPEC_TEXT, planText: PLAN_TEXT }, actual))
      expect(r).toContain('actual-mismatch')
    } finally {
      h.close()
    }
  })

  // ───────────────────────────────────────────────────────────────────────
  // ③ 反证：旧值与新值同在一行时，必须取新值
  // ───────────────────────────────────────────────────────────────────────
  it('反证 ①：spec 订正注记里「订正前 78」与「订正后 72」同在 ⇒ 取 72', () => {
    const sec = SPEC_TEXT.slice(SPEC_TEXT.indexOf('### 1.4'))
    expect(sec).toContain('订正前是 `44 ＋ Go 全 34 ＝ 78`')
    expect(sec).toContain('订正后是 `45 ＋ Go 语言知识点 27 ＝ 72`')
    expect(parseSpecNodeCount(SPEC_TEXT)!.total).toBe(72)
  })

  it('反证 ②：dev-plan 出口行里「原写 78」与「实测 … = 72」同在 ⇒ 取 72', () => {
    const line = PLAN_TEXT.split('\n').find((l) => l.startsWith('- **P1 出口**'))!
    expect(line).toContain('原写 78')
    expect(line).toContain('78 的算法是')
    expect(parsePlanNodeCount(PLAN_TEXT)!.total).toBe(72)
    expect(parsePlanNodeCount(PLAN_TEXT)!.pyLanguage).toBe(45)
  })

  it('反证 ③：闸只在「改文档」时才红 ⇒ 把文档改回去它就绿（规则不是恒红）', () => {
    const bad = replaceOnce(PLAN_TEXT, '「lang_topics 节点数 = 72', '「lang_topics 节点数 = 71')
    expect(rules(violations(SPEC_TEXT, bad)).length).toBeGreaterThan(0)
    expect(rules(violations(SPEC_TEXT, PLAN_TEXT))).toEqual([])
  })
})
