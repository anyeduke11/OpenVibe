import { describe, expect, it } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tempDir } from '@openvibe/core/test-support'
import {
  appendContextHistory,
  checkC5Ratchet,
  checkC7Ratchet,
  checkTraceability,
  checkTraceDocUniqueness,
  parseC5RatchetBaseline,
  readContextHistory,
  reportCoAnchors,
  reportHeaderClosure,
  reportNonLinkedRefs,
  traceRowsFromAnchor,
  writeContextHistory,
  writeContextReport,
  type C5RatchetBaseline,
  type ContextCheckHistory,
  type ContextCheckRun,
  type TraceSources,
} from '../scripts/context-check'

/**
 * `scripts/context-check.ts` 的 C-6 判据测试（上下文追溯闭合）。
 *
 * ## 本文件的全部价值在「每处破坏各报 1 违规」
 *
 * 判据只有在**能红**的时候才是闸。本文件对 C-6 的五条子判据各造一份
 * 「只改坏一处」的夹具，逐条断言它恰好报 1 处违规且指名道姓；
 * 再造一份未破坏的基线夹具，断言 0 违规。
 *
 * 为什么用夹具而不直接改仓里的真文件：真文件一改就污染仓（且 `git diff`
 * 里混着真改动与测试改动，review 时看不出哪一行是故意的破坏）。
 *
 * ## 夹具的编号分工
 *
 * - `CM-A1`／`CM-B1`：规格 FR 标题里**声明**了它们 ⇒ 触发反向闭合检查。
 * - `CM-C1`：规格里**没有**任何 FR 声明它 ⇒ 它的行坏掉时不会连带触发
 *   反向检查 ⇒ 「FR 不存在」「验收编号不存在」这两条用例才能各自只报 1 违规
 *   （一处破坏不该引发两处抱怨，否则红的原因会被噪声淹没）。
 */

/**
 * 一份最小的「需求方案」文档：需求清单 ＋ 双向追溯表。
 *
 * ⚠️ **节标题刻意写成与真实文档不同的措辞**（「需求条目」／「追溯对照」），
 *    以证明 C-6 押在**锚点**上而非标题文字上：改标题不影响判定。
 */
function traceDoc(reqRows: string[], traceRows: string[]): string {
  return [
    '# 需求方案',
    '',
    '## 4. 需求条目',
    '',
    '<!-- c6:reqs -->',
    '',
    '| ID | 需求 | 现状 | 验收 | 优先级 |',
    '| --- | --- | --- | --- | --- |',
    ...reqRows,
    '',
    '## 5. 验收口径',
    '',
    '（这一节不在 §4 内，不得被当成需求行抓走）',
    '',
    '## 10. 追溯对照',
    '',
    '<!-- c6:trace -->',
    '',
    '| CM | 归属 | 验收 ID | 状态 |',
    '| --- | --- | --- | --- |',
    ...traceRows,
    '',
  ].join('\n')
}

/** 一份最小的规格文件：FR 标题 ＋ 验收编号表 */
function specFile(frHeadings: string[], acceptanceIds: string[]): string {
  return [
    '# SPEC',
    '',
    ...frHeadings,
    '',
    '| ID | 判据 | pass 条件 |',
    '| --- | --- | --- |',
    ...acceptanceIds.map((id) => `| ${id} | 判据 | 条件 |`),
    '',
  ].join('\n')
}

/** 造一份完整的追溯来源 */
function sources(opts?: {
  reqRows?: string[]
  traceRows?: string[]
  specText?: string
  traceDocText?: string
  extraDocs?: Map<string, string>
}): TraceSources {
  const reqRows = opts?.reqRows ?? [
    '| CM-A1 | 甲需求 | 已满足 | UT-CM-01 | P0 |',
    '| CM-B1 | 乙需求 | 缺口 | UT-CM-02 | P1 |',
    '| CM-C1 | 丙需求 | 缺口 | UT-CM-03 | P2 |',
  ]
  const traceRows = opts?.traceRows ?? [
    '| CM-A1 | [spec.md](./specs/spec.md) **FR-1** | UT-CM-01 | 已满足 |',
    '| CM-B1 | [spec.md](./specs/spec.md) **FR-2** | UT-CM-02 | 待实现 |',
    '| CM-C1 | [spec.md](./specs/spec.md) **FR-1** | UT-CM-03 | 待实现 |',
  ]
  const specText =
    opts?.specText ??
    specFile(
      ['### FR-1 · 甲（CM-A1）', '### FR-2 · 乙（CM-B1）'],
      ['UT-CM-01', 'UT-CM-02', 'UT-CM-03'],
    )
  const targets = new Map<string, string>([
    ['docs/specs/spec.md', specText],
    ...(opts?.extraDocs ?? new Map<string, string>()),
  ])
  return {
    traceDoc: opts?.traceDocText ?? traceDoc(reqRows, traceRows),
    targets,
    specPaths: ['docs/specs/spec.md'],
  }
}

/** 把违规信息压成「判据 + 消息」的可断言字符串 */
function summary(issues: { rule: string; message: string }[]): string[] {
  return issues.map((i) => `${i.rule} ${i.message}`)
}

describe('context-check · C-6 基线', () => {
  it('一致的需求清单与追溯表 ⇒ 0 违规', () => {
    expect(checkTraceability(sources())).toEqual([])
  })
})

describe('context-check · C-6 条款指针解析（锚点语义粒度）', () => {
  /**
   * 条款解析专用规格（**刻意不写「（CM-*）」声明**）：本组只验「指针能否解析到
   * 具体条款」，不掺反向闭合——混在一起时一处破坏会引两处抱怨，红的原因被噪声淹没。
   *
   * FR-2 用**裸编号**条款（m11／context-management 的写法）；
   * FR-6 用**显式 `- FR-6.x` 标签**（docs-governance-check 的写法）——两种标注法都覆盖。
   */
  const specWithClauses = [
    '# SPEC',
    '',
    '### FR-1 · 甲',
    '',
    '1. **第一条**：甲的子条款。',
    '',
    '### FR-2 · 乙',
    '',
    '1. **第一条**：乙的子条款。',
    '2. **第二条**：乙的第二个子条款。',
    '',
    '### FR-6 · 标签式',
    '',
    '- FR-6.1 显式标签条款。',
    '- FR-6.2 显式标签条款。',
    '',
    '| ID | 判据 | pass 条件 |',
    '| --- | --- | --- |',
    '| UT-CM-01 | 判据 | 条件 |',
    '| UT-CM-02 | 判据 | 条件 |',
    '| UT-CM-03 | 判据 | 条件 |',
    '',
  ].join('\n')
  const rowsWithClauses = (ptr: string): string[] => [
    '| CM-A1 | [spec.md](./specs/spec.md) FR-1.1:第一条 | UT-CM-01 | 已满足 |',
    `| CM-B1 | [spec.md](./specs/spec.md) ${ptr} | UT-CM-02 | 待实现 |`,
    '| CM-C1 | [spec.md](./specs/spec.md) FR-1 | UT-CM-03 | 待实现 |',
  ]

  it('裸编号条款：FR-2.1:第一条 指向 FR-2 的第 1 条 ⇒ 0 违规', () => {
    const s = sources({ specText: specWithClauses, traceRows: rowsWithClauses('FR-2.1:第一条') })
    expect(checkTraceability(s)).toEqual([])
  })

  it('显式标签条款：FR-6.1:显式标签 存在 ⇒ 0 违规', () => {
    const s = sources({ specText: specWithClauses, traceRows: rowsWithClauses('FR-6.1:显式标签') })
    expect(checkTraceability(s)).toEqual([])
  })

  it('条款指到空处：FR-2 下只有 2 条，指 FR-2.3 ⇒ 报 1 违规并说明只有几条', () => {
    const s = sources({ specText: specWithClauses, traceRows: rowsWithClauses('FR-2.3:任意词') })
    const issues = checkTraceability(s)
    expect(issues).toHaveLength(1)
    expect(summary(issues)[0]).toContain('FR-2.3')
    expect(summary(issues)[0]).toContain('第 3 条')
  })

  it('父 FR 不存在时的条款指针：FR-9.1 ⇒ 报 1 违规', () => {
    const s = sources({ specText: specWithClauses, traceRows: rowsWithClauses('FR-9.1:任意词') })
    const issues = checkTraceability(s)
    expect(issues).toHaveLength(1)
    expect(summary(issues)[0]).toContain('FR-9.1')
    expect(summary(issues)[0]).toContain('不存在')
  })

  it('条款指针缺名锚 ⇒ 报 1 违规（只给序号时规格增删条目会静默漂）', () => {
    const s = sources({ specText: specWithClauses, traceRows: rowsWithClauses('FR-2.1') })
    const issues = checkTraceability(s)
    expect(issues).toHaveLength(1)
    expect(summary(issues)[0]).toContain('缺名锚')
  })

  it('名锚关键词在条款区域里不存在（规格改名后指针没跟上）⇒ 报 1 违规', () => {
    const s = sources({
      specText: specWithClauses,
      traceRows: rowsWithClauses('FR-2.1:不存在的词'),
    })
    const issues = checkTraceability(s)
    expect(issues).toHaveLength(1)
    expect(summary(issues)[0]).toContain('内容已不匹配')
    expect(summary(issues)[0]).toContain('第 1 条')
    // 反向清单：报错直接给出受影响的 CM 编号与追溯表行号
    expect(summary(issues)[0]).toContain('受影响的行')
    expect(summary(issues)[0]).toContain('CM-B1 第 ')
  })

  it('验收：短语改动的反向清单——同指一条指针的两行一次列全', () => {
    // 规格把 FR-2 第 1 条的短语改名，而两行都还锚着旧短语
    const mutated = specWithClauses.replace(
      '1. **第一条**：乙的子条款。',
      '1. **新标题**：乙的子条款。',
    )
    const rows = [
      '| CM-A1 | [spec.md](./specs/spec.md) FR-2.1:第一条 | UT-CM-01 | 已满足 |',
      '| CM-B1 | [spec.md](./specs/spec.md) FR-2.1:第一条 | UT-CM-02 | 待实现 |',
      '| CM-C1 | [spec.md](./specs/spec.md) FR-1 | UT-CM-03 | 待实现 |',
    ]
    const issues = checkTraceability(sources({ specText: mutated, traceRows: rows }))
    expect(issues).toHaveLength(2)
    for (const m of summary(issues)) {
      expect(m).toContain('受影响的行')
      expect(m).toContain('CM-A1 第 ')
      expect(m).toContain('CM-B1 第 ')
    }
  })

  it('名锚必须等值于首行粗体短语：首行里有这个词但不是短语 ⇒ 报 1 违规', () => {
    // FR-2.1 首行 `1. **第一条**：乙的子条款。` —— 「乙的子条款」在首行文本里，
    // 但粗体短语只有「第一条」⇒ 子串不算，等值才算
    const s = sources({
      specText: specWithClauses,
      traceRows: rowsWithClauses('FR-2.1:乙的子条款'),
    })
    const issues = checkTraceability(s)
    expect(issues).toHaveLength(1)
    expect(summary(issues)[0]).toContain('内容已不匹配')
    expect(summary(issues)[0]).toContain('粗体短语')
  })

  it('验收：两条首行含同一子串，指向其中一条时另一条的改动不影响判定', () => {
    const mutated = specWithClauses.replace(
      '2. **第二条**：乙的第二个子条款。',
      '2. **第二条**：这里也提到 第一条 作为对比。',
    )
    // 目标条款自己的短语没变 ⇒ 无论另一条怎么写，指向它的判定恒绿
    const target = sources({
      specText: specWithClauses,
      traceRows: rowsWithClauses('FR-2.1:第一条'),
    })
    const targetAfter = sources({ specText: mutated, traceRows: rowsWithClauses('FR-2.1:第一条') })
    expect(checkTraceability(target)).toEqual([])
    expect(checkTraceability(targetAfter)).toEqual([])
    // 而共同子串本身当不了名锚：另一条的裸文本含「第一条」，它的短语是「第二条」
    const wrong = sources({ specText: mutated, traceRows: rowsWithClauses('FR-2.2:第一条') })
    const issues = checkTraceability(wrong)
    expect(issues).toHaveLength(1)
    expect(summary(issues)[0]).toContain('内容已不匹配')
  })

  it('普通 FR-N 仍按家族口径（家族里只有 FR-11.2 标题，指 FR-11 也算命中）', () => {
    const s = sources({
      specText: specWithClauses.replace(
        '### FR-6 · 标签式',
        '### FR-11.2 家族式子标题\n\n- FR-11.2.1 条款。\n\n### FR-6 · 标签式',
      ),
      traceRows: rowsWithClauses('FR-11'),
    })
    expect(checkTraceability(s)).toEqual([])
  })
})
describe('context-check · C-6 需求清单 ↔ 追溯表', () => {
  it('需求清单里的编号在追溯表里缺行 ⇒ 报 1 违规', () => {
    const s = sources({
      traceRows: [
        '| CM-A1 | [spec.md](./specs/spec.md) **FR-1** | UT-CM-01 | 已满足 |',
        '| CM-C1 | [spec.md](./specs/spec.md) **FR-1** | UT-CM-03 | 待实现 |',
      ],
    })
    const issues = checkTraceability(s)
    expect(issues).toHaveLength(1)
    expect(summary(issues)[0]).toContain('CM-B1')
    expect(summary(issues)[0]).toContain('没有对应行')
  })

  it('追溯表里的编号在需求清单里不存在 ⇒ 报 1 违规', () => {
    const s = sources({
      traceRows: [
        '| CM-A1 | [spec.md](./specs/spec.md) **FR-1** | UT-CM-01 | 已满足 |',
        '| CM-B1 | [spec.md](./specs/spec.md) **FR-2** | UT-CM-02 | 待实现 |',
        '| CM-C1 | [spec.md](./specs/spec.md) **FR-1** | UT-CM-03 | 待实现 |',
        '| CM-Z9 | [spec.md](./specs/spec.md) **FR-1** | UT-CM-01 | 已满足 |',
      ],
    })
    const issues = checkTraceability(s)
    expect(issues).toHaveLength(1)
    expect(summary(issues)[0]).toContain('CM-Z9')
    expect(summary(issues)[0]).toContain('不存在')
  })

  it('同一编号在追溯表里出现两次 ⇒ 报 1 违规', () => {
    const s = sources({
      traceRows: [
        '| CM-A1 | [spec.md](./specs/spec.md) **FR-1** | UT-CM-01 | 已满足 |',
        '| CM-B1 | [spec.md](./specs/spec.md) **FR-2** | UT-CM-02 | 待实现 |',
        '| CM-C1 | [spec.md](./specs/spec.md) **FR-1** | UT-CM-03 | 待实现 |',
        '| CM-A1 | [spec.md](./specs/spec.md) **FR-1** | UT-CM-01 | 已满足 |',
      ],
    })
    const issues = checkTraceability(s)
    expect(issues).toHaveLength(1)
    expect(summary(issues)[0]).toContain('出现 2 次')
  })
})

describe('context-check · C-6 归属标识必须真实存在', () => {
  it('引用的 FR 在目标文件里不存在 ⇒ 报 1 违规', () => {
    const s = sources({
      traceRows: [
        '| CM-A1 | [spec.md](./specs/spec.md) **FR-1** | UT-CM-01 | 已满足 |',
        '| CM-B1 | [spec.md](./specs/spec.md) **FR-2** | UT-CM-02 | 待实现 |',
        '| CM-C1 | [spec.md](./specs/spec.md) **FR-7** | UT-CM-03 | 待实现 |',
      ],
    })
    const issues = checkTraceability(s)
    expect(issues).toHaveLength(1)
    expect(summary(issues)[0]).toContain('FR-7')
    expect(summary(issues)[0]).toContain('不存在')
  })

  it('引用的治理判据在目标文件里没登记 ⇒ 报 1 违规', () => {
    const s = sources({
      traceRows: [
        '| CM-A1 | [spec.md](./specs/spec.md) **FR-1** 判据 C-9 | UT-CM-01 | 已满足 |',
        '| CM-B1 | [spec.md](./specs/spec.md) **FR-2** | UT-CM-02 | 待实现 |',
        '| CM-C1 | [spec.md](./specs/spec.md) **FR-1** | UT-CM-03 | 待实现 |',
      ],
    })
    const issues = checkTraceability(s)
    expect(issues).toHaveLength(1)
    expect(summary(issues)[0]).toContain('C-9')
  })

  it('引用的验收编号在规格里不存在 ⇒ 报 1 违规', () => {
    const s = sources({
      traceRows: [
        '| CM-A1 | [spec.md](./specs/spec.md) **FR-1** | UT-CM-01 | 已满足 |',
        '| CM-B1 | [spec.md](./specs/spec.md) **FR-2** | UT-CM-02 | 待实现 |',
        '| CM-C1 | [spec.md](./specs/spec.md) **FR-1** | UT-CM-99 | 待实现 |',
      ],
    })
    const issues = checkTraceability(s)
    expect(issues).toHaveLength(1)
    expect(summary(issues)[0]).toContain('UT-CM-99')
  })

  it('归属列只有散文、没有可机验锚点 ⇒ 报 1 违规', () => {
    const s = sources({
      traceRows: [
        '| CM-A1 | [spec.md](./specs/spec.md) **FR-1** | UT-CM-01 | 已满足 |',
        '| CM-B1 | [spec.md](./specs/spec.md) **FR-2** | UT-CM-02 | 待实现 |',
        '| CM-C1 | [spec.md](./specs/spec.md)（注入状态机与三重保护） | UT-CM-03 | 待实现 |',
      ],
    })
    const issues = checkTraceability(s)
    expect(issues).toHaveLength(1)
    expect(summary(issues)[0]).toContain('没有可机验的锚点')
  })
})

describe('context-check · C-6 反向闭合', () => {
  it('规格声明的 CM 在需求清单里不存在 ⇒ 报 1 违规', () => {
    const s = sources({
      specText: specFile(
        ['### FR-1 · 甲（CM-A1）', '### FR-2 · 乙（CM-Z9）'],
        ['UT-CM-01', 'UT-CM-02', 'UT-CM-03'],
      ),
    })
    const issues = checkTraceability(s)
    expect(issues).toHaveLength(1)
    expect(summary(issues)[0]).toContain('CM-Z9')
    expect(summary(issues)[0]).toContain('需求清单')
  })

  it('规格声明的 CM 在追溯表里没指回来 ⇒ 报 1 违规', () => {
    const s = sources({
      traceRows: [
        '| CM-A1 | [spec.md](./specs/spec.md) **FR-1** | UT-CM-01 | 已满足 |',
        '| CM-B1 | [spec.md](./specs/spec.md) **FR-1** | UT-CM-02 | 待实现 |',
        '| CM-C1 | [spec.md](./specs/spec.md) **FR-1** | UT-CM-03 | 待实现 |',
      ],
    })
    const issues = checkTraceability(s)
    expect(issues).toHaveLength(1)
    expect(summary(issues)[0]).toContain('FR-2')
    expect(summary(issues)[0]).toContain('没有指回')
  })
})

describe('context-check · C-6 追溯源文档唯一', () => {
  it('别处再开一张以 CM 编号开头的表 ⇒ 报 1 违规', () => {
    const extra = new Map<string, string>([
      ['docs/other.md', '# 别的文档\n\n## 10. 某节\n\n| CM-A1 | 归属 |\n'],
    ])
    const issues = checkTraceDocUniqueness(extra)
    expect(issues).toHaveLength(1)
    expect(summary(issues)[0]).toContain('只能有一处')
  })

  it('别处也放了锚点 ⇒ 报 1 违规', () => {
    const extra = new Map<string, string>([
      ['docs/other.md', '# 别的文档\n\n<!-- c6:trace -->\n\n正文。\n'],
    ])
    const issues = checkTraceDocUniqueness(extra)
    expect(issues).toHaveLength(1)
    expect(summary(issues)[0]).toContain('c6:trace')
  })

  it('别处提到「双向追溯表」但不是一张表 ⇒ 不报', () => {
    const extra = new Map<string, string>([
      ['docs/other.md', '# 别的文档\n\n本文件引用了双向追溯表。\n'],
    ])
    expect(checkTraceDocUniqueness(extra)).toEqual([])
  })
})

describe('context-check · C-6 锚点定位', () => {
  it('节标题措辞与真实文档不同也照样判定（定位押在锚点而非标题）', () => {
    // 夹具本身用的就是「需求条目」／「追溯对照」两种措辞 ⇒ 基线绿即证明这点
    expect(checkTraceability(sources())).toEqual([])
  })

  it('缺需求清单锚点 ⇒ 报 1 违规并指名锚点', () => {
    const s = sources({
      traceDocText: [
        '# 需求方案',
        '',
        '## 4. 需求清单',
        '',
        '| ID | 需求 |',
        '| --- | --- |',
        '| CM-A1 | 甲需求 |',
        '',
        '## 10. 双向追溯表',
        '',
        '<!-- c6:trace -->',
        '',
        '| CM | 归属 |',
        '| --- | --- |',
        '| CM-A1 | [spec.md](./specs/spec.md) **FR-1** |',
        '',
      ].join('\n'),
    })
    const issues = checkTraceability(s)
    expect(issues).toHaveLength(1)
    expect(summary(issues)[0]).toContain('c6:reqs')
  })

  it('缺追溯表锚点 ⇒ 报 1 违规并指名锚点', () => {
    const s = sources({
      traceDocText: [
        '# 需求方案',
        '',
        '## 4. 需求清单',
        '',
        '<!-- c6:reqs -->',
        '',
        '| ID | 需求 |',
        '| --- | --- |',
        '| CM-A1 | 甲需求 |',
        '',
        '## 10. 双向追溯表',
        '',
        '| CM | 归属 |',
        '| --- | --- |',
        '| CM-A1 | [spec.md](./specs/spec.md) **FR-1** |',
        '',
      ].join('\n'),
    })
    const issues = checkTraceability(s)
    expect(issues).toHaveLength(1)
    expect(summary(issues)[0]).toContain('c6:trace')
  })

  it('锚点之前的 CM 行不算数（只认锚点之后的那张表）', () => {
    const s = sources({
      traceDocText: [
        '# 需求方案',
        '',
        '## 3. 旧版本残留',
        '',
        '| CM-A1 | 陈旧行 |',
        '',
        '## 4. 需求清单',
        '',
        '<!-- c6:reqs -->',
        '',
        '| ID | 需求 |',
        '| --- | --- |',
        '| CM-A1 | 甲需求 |',
        '| CM-B1 | 乙需求 |',
        '| CM-C1 | 丙需求 |',
        '',
        '## 10. 双向追溯表',
        '',
        '<!-- c6:trace -->',
        '',
        '| CM | 归属 |',
        '| --- | --- |',
        '| CM-A1 | [spec.md](./specs/spec.md) **FR-1** |',
        '| CM-B1 | [spec.md](./specs/spec.md) **FR-2** |',
        '| CM-C1 | [spec.md](./specs/spec.md) **FR-1** |',
        '',
      ].join('\n'),
    })
    // 陈旧行若被算进去，CM-A1 会在需求清单里出现两次 ⇒ 报「出现 2 次」
    expect(checkTraceability(s)).toEqual([])
  })
})

describe('context-check · C-6 表格行拆分', () => {
  it('单元格内的转义竖线不切分单元格', () => {
    const s = sources({
      traceRows: [
        '| CM-A1 | [spec.md](./specs/spec.md) **FR-1** | UT-CM-01 | 已满足 |',
        '| CM-B1 | [spec.md](./specs/spec.md) **FR-2** | UT-CM-02 | 待实现 |',
        '| CM-C1 | [spec.md](./specs/spec.md) **FR-1** | `grep -n "a\\|b" file` | 待实现 |',
      ],
    })
    expect(checkTraceability(s)).toEqual([])
  })
})

describe('context-check · C-6 共锚自检（只报数）', () => {
  const rowsOf = (doc: string): NonNullable<ReturnType<typeof traceRowsFromAnchor>> =>
    traceRowsFromAnchor(doc, '<!-- c6:trace -->') ?? []

  /** FR-1 第 1 条首行有两个粗体短语 ⇒ 同指针可挂两个**都合法**的名锚 */
  const dualSpec = [
    '# SPEC',
    '',
    '### FR-1 · 甲',
    '',
    '1. **甲面**：这一条有两个侧面，另一面叫 **乙面**。',
    '',
    '| ID | 判据 | pass 条件 |',
    '| --- | --- | --- |',
    '| UT-CM-01 | 判据 | 条件 |',
    '| UT-CM-02 | 判据 | 条件 |',
    '| UT-CM-03 | 判据 | 条件 |',
    '',
  ].join('\n')

  it('基线：各指针只有自己的名锚（或无名锚）⇒ 不报', () => {
    const s = sources({
      traceRows: [
        '| CM-A1 | [spec.md](./specs/spec.md) FR-1.1:第一条 | UT-CM-01 | 已满足 |',
        '| CM-B1 | [spec.md](./specs/spec.md) FR-2.1:第二条 | UT-CM-02 | 待实现 |',
        '| CM-C1 | [spec.md](./specs/spec.md) FR-1 | UT-CM-03 | 待实现 |',
      ],
    })
    expect(reportCoAnchors(rowsOf(s.traceDoc))).toEqual([])
  })

  it('同指针同名锚的复用不算共锚（复用是正常态）⇒ 不报', () => {
    const rows = [
      '| CM-A1 | [spec.md](./specs/spec.md) FR-1.1:第一条 | UT-CM-01 | 已满足 |',
      '| CM-B1 | [spec.md](./specs/spec.md) FR-2.1:第一条 | UT-CM-02 | 待实现 |',
      '| CM-C1 | [spec.md](./specs/spec.md) FR-1.1:第一条 | UT-CM-03 | 待实现 |',
    ]
    const s = sources({ traceRows: rows })
    expect(reportCoAnchors(rowsOf(s.traceDoc))).toEqual([])
  })

  it('验收：两行以不同名锚锚同一条款——判定全绿、报告列出指针与两行', () => {
    // 判定全绿（两个名锚都是该条合法短语）而语义分叉只有共锚自检看得见
    const s = sources({
      specText: dualSpec,
      traceRows: [
        '| CM-A1 | [spec.md](./specs/spec.md) FR-1.1:甲面 | UT-CM-01 | 已满足 |',
        '| CM-B1 | [spec.md](./specs/spec.md) FR-1 | UT-CM-02 | 待实现 |',
        '| CM-C1 | [spec.md](./specs/spec.md) FR-1.1:乙面 | UT-CM-03 | 待实现 |',
      ],
    })
    expect(checkTraceability(s)).toEqual([])
    const report = reportCoAnchors(rowsOf(s.traceDoc))
    expect(report).toHaveLength(1)
    expect(report[0]).toContain('FR-1.1')
    expect(report[0]).toContain('CM-A1 第 ')
    expect(report[0]).toContain('CM-C1 第 ')
    expect(report[0]).toContain('甲面')
    expect(report[0]).toContain('乙面')
    // 分级：两行验收 ID 互不重叠 ⇒ 不标交集（更像正当多面）
    expect(report[0]).not.toContain('验收 ID 有交集')
  })

  it('分级：两行共用同一验收 ID ⇒ 行尾标「验收 ID 有交集」（更像分叉，优先看）', () => {
    const s = sources({
      specText: dualSpec,
      traceRows: [
        '| CM-A1 | [spec.md](./specs/spec.md) FR-1.1:甲面 | UT-CM-01 | 已满足 |',
        '| CM-B1 | [spec.md](./specs/spec.md) FR-1 | UT-CM-02 | 待实现 |',
        '| CM-C1 | [spec.md](./specs/spec.md) FR-1.1:乙面 | UT-CM-01 | 待实现 |',
      ],
    })
    const report = reportCoAnchors(rowsOf(s.traceDoc))
    expect(report).toHaveLength(1)
    expect(report[0]).toContain('验收 ID 有交集')
    expect(report[0]).toContain('UT-CM-01')
  })
})

describe('context-check · 趋势落盘', () => {
  const report = {
    at: '2026-11-04T00:00:00.000Z',
    errors: 0,
    c5: 23,
    c5UpperBound: 23,
    c5OverBy: 0,
    c5SuggestLowerBound: null,
    coAnchors: 1,
    coAnchorItems: [
      'docs/specs/x.md FR-1.1 被不同名锚锚定：CM-A1 第 1 行（甲）、CM-B1 第 2 行（乙）',
    ],
  }

  it('字段闭集：写入的 JSON 只含趋势字段（含 C-5 棘轮计数/上界/超出量/下调建议），计数可按轮对比', () => {
    const path = join(tempDir('ctx-check-report-'), 'nested/context-check.json')
    expect(writeContextReport(report, path)).toBe(path)
    const read = JSON.parse(readFileSync(path, 'utf8')) as typeof report
    expect(Object.keys(read).sort()).toEqual([
      'at',
      'c5',
      'c5OverBy',
      'c5SuggestLowerBound',
      'c5UpperBound',
      'coAnchorItems',
      'coAnchors',
      'errors',
    ])
    expect(read.coAnchors).toBe(1)
    expect(read.c5).toBe(23)
    expect(read.c5UpperBound).toBe(23)
    expect(read.c5OverBy).toBe(0)
    // `null` 是**有效值**（= 明确无须下调），必须与「字段缺省」区分
    expect(read.c5SuggestLowerBound).toBeNull()
  })

  it('下调建议随结论落盘：写进去的数字原样可读（面板据此提示）', () => {
    const path = join(tempDir('ctx-check-report-'), 'suggest.json')
    const withSuggest = { ...report, c5: 20, c5SuggestLowerBound: 20 }
    expect(writeContextReport(withSuggest, path)).toBe(path)
    const read = JSON.parse(readFileSync(path, 'utf8')) as typeof withSuggest
    expect(read.c5SuggestLowerBound).toBe(20)
  })

  it('写失败返回 null 不抛（落盘是证据不是闸）', () => {
    const dir = tempDir('ctx-check-fail-')
    const blocked = join(dir, 'blocked')
    writeFileSync(blocked, 'x') // 先放一个同名文件，让 mkdir 必败
    expect(writeContextReport(report, join(blocked, 'sub/context-check.json'))).toBeNull()
  })
})

/* ════════════════════════════════════════════════════════ 本机多轮历史 */

/**
 * 历史文件的判据。
 *
 * ## 它防什么
 *
 * ① **「单轮覆盖」被误当成趋势**：`context-check.json` 每轮同名覆盖，若历史的追加逻辑
 *    写错（如每次从头写），面板会永远只画一个点；
 * ② **历史无限膨胀**：不截断的话文件随提交次数线性增长；
 * ③ **读坏文件就崩**：历史是追加产物，半截 JSON 应当视作「空历史从头记」，而不是炸掉闸。
 */
describe('context-check · 本机多轮历史', () => {
  const runOf = (over: Partial<ContextCheckRun> = {}): ContextCheckRun => ({
    at: '2026-11-05T00:00:00.000Z',
    source: 'local',
    errors: 0,
    c5: 23,
    c5UpperBound: 23,
    c5OverBy: 0,
    c5SuggestLowerBound: null,
    coAnchors: 0,
    ...over,
  })

  it('空历史追加一轮 ⇒ schema 1、只有本轮', () => {
    const h = appendContextHistory(null, runOf())
    expect(h.schema).toBe(1)
    expect(h.runs).toHaveLength(1)
  })

  it('⚠️ 追加不丢已有轮次（否则趋势永远只有一个点）', () => {
    const h = appendContextHistory(
      appendContextHistory(null, runOf({ c5: 23 })),
      runOf({ c5: 24, at: '2026-11-05T01:00:00.000Z' }),
    )
    expect(h.runs.map((r) => r.c5)).toEqual([23, 24])
  })

  it('⚠️ 超限只截最旧（保留最近 50 轮，最新一轮不丢）', () => {
    let h: ReturnType<typeof appendContextHistory> = { schema: 1, runs: [] }
    for (let i = 0; i < 51; i += 1) h = appendContextHistory(h, runOf({ c5: i }))
    expect(h.runs).toHaveLength(50)
    expect(h.runs[0]?.c5).toBe(1)
    expect(h.runs[49]?.c5).toBe(50)
  })

  it('写入后可回读（round-trip），字段闭集只含计数（不含 coAnchorItems）', () => {
    const path = join(tempDir('ctx-check-hist-'), 'context-check-history.json')
    const h = appendContextHistory(null, runOf({ c5: 20, c5SuggestLowerBound: 20 }))
    expect(writeContextHistory(h, path)).toBe(path)
    const read = readContextHistory(path)
    expect(read?.runs[0]?.c5).toBe(20)
    expect(read?.runs[0]?.c5SuggestLowerBound).toBe(20)
    expect(Object.keys(read?.runs[0] ?? {}).sort()).toEqual([
      'at',
      'c5',
      'c5OverBy',
      'c5SuggestLowerBound',
      'c5UpperBound',
      'coAnchors',
      'errors',
      'source',
    ])
  })

  it('⚠️ 追加轮次必须保留 merges（否则下一次 context:check 会清空合并清单）', () => {
    const base: ContextCheckHistory = {
      schema: 1,
      runs: [],
      merges: [
        { at: '2026-11-05T06:00:00.000Z', from: 'ci.json', accepted: 1, dropped: 0, added: 1 },
      ],
    }
    const h = appendContextHistory(base, runOf())
    expect(h.merges).toHaveLength(1)
    expect(h.merges?.[0]?.from).toBe('ci.json')
  })

  it('⚠️ 读坏历史（非法 JSON／schema 不匹配）⇒ null，视作空历史从头记（不崩）', () => {
    const dir = tempDir('ctx-check-hist-bad-')
    const bad = join(dir, 'bad.json')
    writeFileSync(bad, '{')
    expect(readContextHistory(bad)).toBeNull()

    const wrongSchema = join(dir, 'wrong.json')
    writeFileSync(wrongSchema, JSON.stringify({ schema: 999, runs: [] }))
    expect(readContextHistory(wrongSchema)).toBeNull()
  })
})

/* ════════════════════════════════════════════════════════ FR-4 · C-5 棘轮 */

/**
 * FR-4 棘轮的变异样本。
 *
 * ## 它判什么（每条都是「改坏一处 ⇒ 必须红」）
 *
 * 棘轮的失效方向有四种，**每一种都比「不判」更隐蔽**：
 * ① 删掉基线文件（拆掉棘轮）；② 只改上界不改 c5Items（基线自洽被破坏）；
 * ③ 只改上界不改 c5History（上调不留痕）；④ 新增一条未回指（真实恶化）。
 * ⇒ 四条各造一份夹具，逐条断言「恰好报 1 处且指名」。
 */
describe('context-check · FR-4 棘轮（C-5 上界）', () => {
  const base = (over: Partial<C5RatchetBaseline> = {}): C5RatchetBaseline => ({
    note: '测试夹具',
    c5UpperBound: 2,
    c5Items: ['a.md → x.md', 'b.md → y.md'],
    c5History: [{ at: '2026-11-05', value: 2, reason: '首次建基线' }],
    ...over,
  })

  it('计数 == 上界 ⇒ 无违规、无下调建议（只降不升的常态）', () => {
    const r = checkC5Ratchet(['a.md → x.md', 'b.md → y.md'], base())
    expect(r.issues).toEqual([])
    expect(r.suggestLowerBound).toBeNull()
  })

  it('⚠️ 变异 ①：基线缺失 ⇒ 红（删掉基线等于拆掉棘轮，不得静默放行）', () => {
    const r = checkC5Ratchet(['a.md → x.md'], null)
    expect(r.issues).toHaveLength(1)
    expect(r.issues[0]?.rule).toBe('C-5')
    expect(r.issues[0]?.message).toContain('缺失')
  })

  it('⚠️ 变异 ②：上界与 c5Items 条数不一致 ⇒ 红（改上界必须同步快照）', () => {
    const r = checkC5Ratchet(['a.md → x.md', 'b.md → y.md'], base({ c5Items: ['a.md → x.md'] }))
    expect(r.issues).toHaveLength(1)
    expect(r.issues[0]?.message).toContain('条目数')
  })

  it('⚠️ 变异 ③：上界与 c5History 末项 value 不一致 ⇒ 红（上调/下调必须留痕）', () => {
    const r = checkC5Ratchet(
      [],
      base({ c5History: [{ at: '2026-11-05', value: 1, reason: '旧账' }] }),
    )
    expect(r.issues).toHaveLength(1)
    expect(r.issues[0]?.message).toContain('留痕')
  })

  it('⚠️ 变异 ④：本轮多出一条未回指 ⇒ 红，并指出是哪一条、差多少', () => {
    const r = checkC5Ratchet(['a.md → x.md', 'b.md → y.md', 'new.md → z.md'], base())
    expect(r.issues).toHaveLength(1)
    expect(r.issues[0]?.message).toContain('新增 1 条')
    expect(r.issues[0]?.message).toContain('new.md → z.md')
  })

  it('计数下降 ⇒ **不**判红，只给下调建议（上界是防恶化，不是目标值）', () => {
    const r = checkC5Ratchet(['a.md → x.md'], base())
    expect(r.issues).toEqual([])
    expect(r.suggestLowerBound).toBe(1)
  })

  it('parse：非法 JSON ⇒ null；字段不齐 ⇒ null；合法基线 ⇒ 原样返回', () => {
    expect(parseC5RatchetBaseline('{')).toBeNull()
    expect(parseC5RatchetBaseline(JSON.stringify({ c5UpperBound: 1 }))).toBeNull()
    expect(parseC5RatchetBaseline(JSON.stringify(base()))).toEqual(base())
  })

  it('真实仓库腿：入仓基线可解析，且当前 C-5 计数与上界一致（棘轮此刻是绿的）', () => {
    // 这条腿防「基线文件被写成不可解析的形状」而其它用例都用夹具看不出来。
    const root = join(dirname(fileURLToPath(import.meta.url)), '..')
    const parsed = parseC5RatchetBaseline(
      readFileSync(join(root, 'docs', 'context-check-baseline.json'), 'utf8'),
    )
    expect(parsed).not.toBeNull()
    expect(parsed?.c5UpperBound).toBe(parsed?.c5Items.length)

    const open = reportHeaderClosure()
    const r = checkC5Ratchet(open, parsed)
    expect(r.issues).toEqual([])
  })
})

/* ------------------------------------------------------------------ C-7 · 头部引用形态 */

describe('context-check · C-7 头部引用形态（2026-11-07）', () => {
  const specsDir = tempDir('ov-c7-specs-')
  const names = ['a.md', 'b.md', 'c.md']
  for (const n of names) writeFileSync(join(specsDir, n), `# ${n}\n`)
  const read = (p: string) => readFileSync(p, 'utf8')
  const line = (body: string) => `| 下游设计 | ${body} |`

  const base = (over: Partial<C7BaselineLike> = {}): C7BaselineLike => ({
    note: '夹具',
    c7UpperBound: 1,
    c7Items: ['a.md:2 → b.md'],
    c7History: [{ at: '2026-11-07', value: 1, reason: '首次建基线' }],
    ...over,
  })

  it('⚠️ 裸名引用（带路径反引号）⇒ 命中；markdown 链接 ⇒ 不命中', () => {
    writeFileSync(join(specsDir, 'a.md'), `# a\n${line('`docs/specs/b.md` 的展示面')}\n`)
    writeFileSync(join(specsDir, 'c.md'), `# c\n${line('[b.md](./b.md) 的展示面')}\n`)
    const hits = reportNonLinkedRefs(specsDir, read)
    expect(hits).toHaveLength(1)
    expect(hits[0]?.file).toBe('a.md')
    expect(hits[0]?.target).toBe('b.md')
  })

  it('⚠️ 头部两行之外的裸名引用不命中（只看前 20 行的 | 上游 / | 下游设计）', () => {
    writeFileSync(join(specsDir, 'a.md'), `# a\n\n正文提到 \`docs/specs/b.md\` 作为讨论对象\n`)
    expect(reportNonLinkedRefs(specsDir, read)).toEqual([])
  })

  it('⚠️ 提到非 specs 目录的文件（design.md）不命中 —— 它不是 specs 成员', () => {
    writeFileSync(join(specsDir, 'a.md'), `# a\n${line('design.md §5 的数据模型')}\n`)
    expect(reportNonLinkedRefs(specsDir, read)).toEqual([])
  })

  it('C-7 棘轮：计数 == 上界 ⇒ 绿；超上界 ⇒ 红并给出新增条目', () => {
    const hit = (file: string, lineNo: number, target: string) => ({
      file,
      line: lineNo,
      target,
      excerpt: 'x',
    })
    expect(checkC7Ratchet([hit('a.md', 2, 'b.md')], base()).issues).toEqual([])
    const over = [hit('a.md', 2, 'b.md'), hit('c.md', 2, 'b.md')]
    const r = checkC7Ratchet(over, base())
    expect(r.issues).toHaveLength(1)
    expect(r.issues[0]?.message).toContain('新增 1 处')
  })

  it('⚠️ C-7 变异：基线缺失 ⇒ 红；上界与条目数不一致 ⇒ 红；留痕不符 ⇒ 红', () => {
    const hit = { file: 'a.md', line: 2, target: 'b.md', excerpt: 'x' }
    expect(checkC7Ratchet([hit], null).issues).toHaveLength(1)
    expect(
      checkC7Ratchet([hit], base({ c7Items: [] })).issues.some((i) => i.message.includes('条目数')),
    ).toBe(true)
    expect(
      checkC7Ratchet(
        [hit],
        base({ c7History: [{ at: '2026-11-07', value: 3, reason: '旧' }] }),
      ).issues.some((i) => i.message.includes('留痕')),
    ).toBe(true)
  })

  it('真实仓库腿：入仓的 C-7 基线可解析且当前计数 == 上界（棘轮此刻是绿的）', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..')
    const raw = readFileSync(join(root, 'docs', 'context-check-c7-baseline.json'), 'utf8')
    const parsed = JSON.parse(raw) as C7BaselineLike
    expect(parsed.c7UpperBound).toBe(parsed.c7Items.length)
    expect(parsed.c7History.at(-1)?.value).toBe(parsed.c7UpperBound)
    const hits = reportNonLinkedRefs(join(root, 'docs', 'specs'), read)
    expect(checkC7Ratchet(hits, parsed).issues).toEqual([])
  })
})

/** C-7 基线形状（与脚本内的接口同构；测试内联避免导出私有类型） */
interface C7BaselineLike {
  note: string
  c7UpperBound: number
  c7Items: string[]
  c7History: { at: string; value: number; reason: string }[]
}
