// `tests/doc-table.test.ts` —— Markdown 表格单元格级定位工具的判据测试（2026-10-26）。
//
// ## 它断什么
//
// 规格文档的表格断言此前用**整行字面量**当锚点，而 prettier 会给表格对齐列宽（加空格）
// ⇒ 锚点里的空格数一改，断言就失配（2026-10-26 实测：9 个测试因此红）。
//
// ⇒ 本文件钉住新工具 `tests/support/doc-table.ts` 的三条性质：
//   ① **排版无关**：表格列宽怎么变，锚点都该照样命中；
//   ② **内容敏感**：单元格里**数字**改了，必须失配（否则断言变成恒绿）；
//   ③ **打空即报错**：锚点找不到就抛错，不静默放过（变异腿打空必须立刻知道）。
import { describe, expect, it } from 'vitest'
import {
  cellsMatch,
  findRow,
  findRowWhere,
  isSeparatorRow,
  normalizeCell,
  replaceCell,
  sectionOf,
  splitRow,
} from '../packages/core/src/test-support/doc-table'

/** 一张真实形态的表格（列宽刻意不对齐，模拟 prettier 排版前） */
const TABLE = [
  '| 档位 | 数量 | 占比 |',
  '|---|---|---|',
  '| **语言知识点** | 45 | **53.6%** |',
  '| **库级** | 30 | **35.7%** |',
].join('\n')

describe('doc-table · 单元格拆分与规范化', () => {
  it('拆出单元格序列，去掉 Markdown 强调标记', () => {
    expect(splitRow('| **语言知识点** | 45 | **53.6%** |')).toEqual(['语言知识点', '45', '53.6%'])
  })

  it('代码标记也去掉（`**` 与反引号各一层）', () => {
    expect(normalizeCell('`master`')).toBe('master')
    expect(normalizeCell('**必学**')).toBe('必学')
  })

  it('⚠️ 格内局部标记也剥掉（规格表常见混合形态）', () => {
    // `**精通** `master`` 与 `` `official` 官方文档 `` 这两种形态，
    // 只处理「整格包裹」会留下残渣 ⇒ 锚点根本写不出来
    expect(normalizeCell('**精通** `master`')).toBe('精通 master')
    expect(normalizeCell('`official` 官方文档')).toBe('official 官方文档')
  })

  it('分隔行被识别出来（不能当数据行）', () => {
    expect(isSeparatorRow(splitRow('|---|---|---|'))).toBe(true)
    expect(isSeparatorRow(splitRow('| a | b |'))).toBe(false)
  })

  it('非表格行拆出空数组', () => {
    expect(splitRow('普通文本')).toEqual([])
  })
})

describe('doc-table · 行匹配', () => {
  it('pattern 比行短 ⇒ 只比前面那些格（其余列不参与）', () => {
    // 规格表常有「含义」这类长文本列 ⇒ 锚点只给稳定的头几列
    expect(cellsMatch(['a', 'b', '很长的一列'], ['a', 'b'])).toBe(true)
  })

  it('pattern 引用的列数超出该行 ⇒ 不匹配', () => {
    expect(cellsMatch(['a'], ['a', 'b'])).toBe(false)
  })

  it('列数相同且逐格相同 ⇒ 匹配', () => {
    expect(cellsMatch(['a', 'b'], ['a', 'b'])).toBe(true)
  })
})

describe('doc-table · 排版无关（这条是本工具存在的理由）', () => {
  it('⚠️ 同一张表，列宽改了 ⇒ 锚点照样命中', () => {
    const realigned = [
      '| 档位           | 数量   | 占比      |',
      '|----------------|--------|-----------|',
      '| **语言知识点** | 45     | **53.6%** |',
      '| **库级**       | 30     | **35.7%** |',
    ].join('\n')
    const pattern = ['语言知识点', '45', '53.6%']
    expect(findRow(TABLE, pattern)).toContain('语言知识点')
    expect(findRow(realigned, pattern)).toContain('语言知识点')
  })

  it('⚠️ 列的顺序变了 ⇒ 不命中（那是另一张表的行）', () => {
    expect(() => findRow(TABLE, ['45', '语言知识点'])).toThrow(/找不到匹配行/)
  })
})

describe('doc-table · 内容敏感（防断言变成恒绿）', () => {
  it('⚠️ 数字改了 ⇒ 失配（抛错，不是静默放过）', () => {
    expect(() => findRow(TABLE, ['语言知识点', '44', '53.6%'])).toThrow(/找不到匹配行/)
  })

  it('⚠️ 首格文字改了 ⇒ 失配', () => {
    expect(() => findRow(TABLE, ['知识点', '45', '53.6%'])).toThrow(/找不到匹配行/)
  })

  it('⚠️ 分隔行不会被误认成数据行', () => {
    // `|---|---|` 的每格规范化后是 `-`，绝不能被当成「档位是 -」的行
    expect(() => findRow(TABLE, ['-', '-', '-'])).toThrow(/找不到匹配行/)
  })
})

describe('doc-table · 打空即报错', () => {
  it('找不到 ⇒ 抛错且错误信息里带上了要找的行', () => {
    expect(() => findRow(TABLE, ['不存在', '1', '2'])).toThrow(/不存在/)
  })
})

describe('doc-table · 单元格替换', () => {
  it('只改目标单元格，其余原样', () => {
    const out = replaceCell(TABLE, ['语言知识点', '45', '53.6%'], 1, '44')
    expect(out).toContain('| **语言知识点** | 44 | **53.6%** |')
    // 另一行不动
    expect(out).toContain('| **库级** | 30 | **35.7%** |')
  })

  it('⚠️ 替换后原文里的数字真的变了（不是只改了个副本）', () => {
    const out = replaceCell(TABLE, ['语言知识点', '45', '53.6%'], 1, '44')
    expect(out).not.toContain('| 45 |')
    expect(out).toContain('| 44 |')
  })

  it('⚠️ 改错了列 ⇒ 断言仍应失配（说明替换位置对得上原文）', () => {
    const out = replaceCell(TABLE, ['语言知识点', '45', '53.6%'], 1, '44')
    expect(() => findRow(out, ['语言知识点', '45', '53.6%'])).toThrow()
    expect(() => findRow(out, ['语言知识点', '44', '53.6%'])).not.toThrow()
  })

  it('列序号越界 ⇒ 抛错（不是静默追加一列）', () => {
    expect(() => replaceCell(TABLE, ['语言知识点', '45', '53.6%'], 9, 'x')).toThrow(/超出/)
  })

  it('找不到匹配行 ⇒ 抛错', () => {
    expect(() => replaceCell(TABLE, ['不存在', '1', '2'], 1, 'x')).toThrow(/找不到匹配行/)
  })
})

describe('doc-table · 按条件定位行', () => {
  const DOC = [
    '| 形态 | 内容 | 落点 |',
    '|---|---|---|',
    '| 入 | 回流：`kind`、`payload` | POST body，zod 经既有 `parseOrThrow` |',
    '| 入 | 查询：路径参 `:id` | path + query，zod 校验 |',
  ].join('\n')

  it('按「首格 + 某列含什么」定位，返回规范化后的单元格序列', () => {
    const cells = findRowWhere(DOC, (c) => c[0] === '入' && c[2]?.includes('POST body') === true)
    expect(cells[0]).toBe('入')
    expect(cells[2]).toContain('parseOrThrow')
  })

  it('⚠️ 两条都满足「首格 = 入」时，条件必须能区分开（否则会取错行）', () => {
    const cells = findRowWhere(DOC, (c) => c[0] === '入' && c[2]?.includes('path + query') === true)
    expect(cells[2]).toContain('zod 校验')
    expect(cells[2]).not.toContain('parseOrThrow')
  })

  it('找不到 ⇒ 抛错（不打空就放过）', () => {
    expect(() => findRowWhere(DOC, (c) => c[0] === '不存在')).toThrow(/找不到满足条件的行/)
  })
})

describe('doc-table · 小节定位', () => {
  const DOC = [
    '### 1.4 三档',
    '| 档位 | 数量 |',
    '|---|---|',
    '| **语言知识点** | 45 |',
    '### 1.5 别的节',
    '| **库级** | 30 |',
  ].join('\n')

  it('限定范围后只在小节内找', () => {
    expect(findRow(DOC, ['语言知识点', '45'], { where: '### 1.4' })).toContain('语言知识点')
    // 「库级」在 1.5 节里 ⇒ 限定 1.4 找不到
    expect(() => findRow(DOC, ['库级', '30'], { where: '### 1.4' })).toThrow(/找不到匹配行/)
  })

  it('小节取到的是「标题行到下一个同级标题」之间的正文', () => {
    const sec = sectionOf(DOC, '### 1.4')
    expect(sec).toContain('语言知识点')
    expect(sec).not.toContain('库级')
  })

  it('找不到小节 ⇒ 抛错', () => {
    expect(() => sectionOf(DOC, '### 9.9')).toThrow(/找不到小节/)
  })
})
