// `tests/m9-spec-consistency.test.ts` —— M9 v1.6 **§11 配套检查器 · 正支**
// （`docs/specs/m9-dev-plan-2026-10.md` §11 · **DL-44 / DL-45 / DL-46** ＋ **DL-26**）
//
// ## 它断什么
//
// 这道闸是 M9 **唯一在零产品代码时就能绿**的判据集（§11.3）——
// 规格自己内部必须自洽：§0 速览的每个数字都要与正文**各自的出处**相等；
// 标成「界面形态已跑」的判据要在 §10.2 的「demo 不能证明什么」表里有登记；
// §6.3 台账标 ⛔ 的条目要真的卡在 §9 的那一期上。
//
// ## ⚠️ 这道闸**自己**也必须能红
//
// `tests/m9-mutations.test.ts` 用**真改过的 spec 文本**喂它，断言它当场红。
// 两份文件是**一对**：只有正支没有变异腿，闸就可能是个恒绿的摆设。
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkSpecConsistency, summarizeSpec } from './support/m9-spec-consistency'

/**
 * ⚠️ **不要用 `new URL('./X.md', import.meta.url)`** ——
 *   jsdom 环境里的 `URL` 是浏览器实现，`fileURLToPath` 认不了它（报「The URL must be of scheme file」）。
 *   ⇒ 直接把 `import.meta.url`（字符串）交给 Node 的 `fileURLToPath`，再按目录拼文件名。
 *   （本文件跑在 `unit` project（node 环境）里，但同一份写法在 `web` project 下也成立。）
 */
const HERE = dirname(fileURLToPath(import.meta.url))
const SPEC_PATH = join(HERE, '..', 'docs', 'specs', 'm9-dev-language-roadmap.md')
const SPEC_TEXT = readFileSync(SPEC_PATH, 'utf8')

describe('M9 §11 · DL-44 / DL-45 / DL-46 ＋ DL-26 的一致性闸', () => {
  it('① 真 spec **零违规**（§0 ↔ 正文 · §10.2 登记 · §6.3 ⛔ ↔ §9 依赖 · 表数）', () => {
    const v = checkSpecConsistency(SPEC_TEXT)
    expect(v, v.map((x) => `[${x.rule}] ${x.where} — ${x.detail}`).join('\n')).toEqual([])
  })

  it('② 检查器**不是空壳**：它确实读到了规格里的全部关键事实', () => {
    const facts = summarizeSpec(SPEC_TEXT)
    // ⚠️ 这些数**必须与规格正文一致** —— 若哪天规格变了，这里必须跟着改，
    //   否则这条断言就变成「我抄的数」而不是「我读到的数」。
    expect(facts.overviewRows).toBe(10) // §0 速览表的 10 行（含 2026-10-21 加的「规格自己由谁守」）
    expect(facts.enhancements).toBe(14) // §3.0 的增强①~⑭
    expect(facts.tables).toBe(17) // §3.1 代码块（`grep -c '^lang_'` 的复算）
    expect(facts.criteria).toBe(50) // §7 判据表
    expect(facts.phases).toBe(11) // §9 期表
    expect(facts.phaseDays).toBe(38) // §9 逐期人日求和
    expect(facts.ledgerRows).toBe(9) // §6.3 台账
    expect(facts.demoRows).toBeGreaterThan(20) // §10.2 的「demo 不能证明什么」表
  })

  it('③ 表格结构体检：台账每行的格数与表头一致（编辑长表格行后最容易破的地方）', () => {
    // ⚠️ 2026-10-21 实测抓到过一次**自己引入的**缺陷：编辑 §6.3 第 8 条那一行时
    //   把最后一格拆成了两格 ⇒ 那一行 9 格、其它行 8 格 ⇒ **表格静默变形**，
    //   Markdown 照样渲染，但按列号取值的解析会取错列。
    // ⇒ 这条体检是那次的直接产物。
    const v = checkSpecConsistency(SPEC_TEXT)
    expect(v.filter((x) => x.rule === 'STRUCT')).toEqual([])
  })
})
