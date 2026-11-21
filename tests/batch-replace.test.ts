import { describe, expect, it } from 'vitest'
import {
  batchReplace,
  findNestedLinks,
  headerLineFilter,
  replaceLine,
  scanSpecsRefs,
  type TokenScanner,
} from '../scripts/batch-replace'

/**
 * `tests/batch-replace.test.ts` —— 批量文本替换工具（`scripts/batch-replace.ts`）的判据。
 *
 * ## 它挡什么
 *
 * 这个工具的存在理由就是**前两次手写批量脚本翻车**（见工具文件头）：
 * ① 白名单 —— 不碰表外文件；② 单遍 —— 产物不被二次扫描；③ 嵌套自检 —— 命中即整文件不落盘。
 * 三支纪律各自有对应用例，**缺一支就等于工具白做**。
 *
 * 另有一支「判据同口径」用例：改写器产出的链接必须被 C-7 的 `reportNonLinkedRefs` 判为合规。
 */

const NAMES = new Set(['m6a-playbook.md', 'm6b-output-bundle.md', 'm3-glossary.md'])

/* ── ① 单遍：replaceLine ─────────────────────────────────────────── */

describe('replaceLine · 单遍替换', () => {
  it('产物含可匹配文本也不再被扫（结构上不可能嵌套）', () => {
    // 规则：把 `X` 换成 `[X](./X)` —— 产物里又出现了 `X`，单遍下不得再替换
    const scan: TokenScanner = (line) =>
      [...line.matchAll(/X/g)].map((m) => ({
        start: m.index ?? 0,
        end: (m.index ?? 0) + 1,
        to: '[X](./X)',
      }))
    const r = replaceLine('a X b', scan, { file: 'f', lineNo: 1 })
    expect(r.text).toBe('a [X](./X) b')
    expect(r.edits).toHaveLength(1)
  })

  it('重叠 token：先命中者优先，被覆盖者丢弃', () => {
    const scan: TokenScanner = () => [
      { start: 0, end: 5, to: 'AAA' },
      { start: 2, end: 7, to: 'BBB' },
      { start: 8, end: 9, to: 'CCC' },
    ]
    const r = replaceLine('abcdefg_h', scan, { file: 'f', lineNo: 1 })
    expect(r.text).toBe('AAAfg_CCC')
    expect(r.edits.map((e) => e.to)).toEqual(['AAA', 'CCC'])
  })

  it('to=null 的 token 占位：其内部不再被别的 token 命中', () => {
    const scan: TokenScanner = () => [
      { start: 0, end: 10, to: null },
      { start: 3, end: 5, to: 'ZZ' },
    ]
    const r = replaceLine('0123456789', scan, { file: 'f', lineNo: 1 })
    expect(r.text).toBe('0123456789')
    expect(r.edits).toHaveLength(0)
  })
})

/* ── ② 嵌套自检：findNestedLinks ────────────────────────────────── */

describe('findNestedLinks · 嵌套签名', () => {
  it('合法链接不报', () => {
    expect(findNestedLinks('见 [m6a-playbook.md](./m6a-playbook.md)。')).toEqual([])
  })

  it('`[[` 签名报命中', () => {
    const hits = findNestedLinks('[[x.md](./x.md)](./x.md)')
    expect(hits.length).toBeGreaterThan(0)
  })

  it('剥掉合法链接后仍剩 `](` 报命中', () => {
    expect(findNestedLinks('[a](b) [c](d)](e)').length).toBeGreaterThan(0)
  })
})

/* ── ③ 白名单 + 批量驱动 ────────────────────────────────────────── */

describe('batchReplace · 白名单与落盘粒度', () => {
  it('只读白名单内的文件（表外文件一次都不碰）', () => {
    const read = new Map<string, string>([
      ['in.md', '| 下游设计 | m6a-playbook.md |\n'],
      ['out.md', '| 下游设计 | m6a-playbook.md |\n'],
    ])
    const touched: string[] = []
    const stats = batchReplace({
      files: ['in.md'],
      scan: scanSpecsRefs(NAMES),
      lineFilter: headerLineFilter,
      readFile: (f) => {
        touched.push(f)
        return read.get(f) ?? ''
      },
      writeFile: () => {},
    })
    expect(touched).toEqual(['in.md'])
    expect(stats.filesChanged).toEqual(['in.md'])
  })

  it('dry-run（缺省）不落盘', () => {
    const written: string[] = []
    const stats = batchReplace({
      files: ['in.md'],
      scan: scanSpecsRefs(NAMES),
      lineFilter: headerLineFilter,
      readFile: () => '| 下游设计 | m6a-playbook.md |\n',
      writeFile: (f) => written.push(f),
    })
    expect(written).toEqual([])
    expect(stats.dryRun).toBe(true)
    expect(stats.totalEdits).toBe(1)
  })

  it('嵌套自检不过 ⇒ 该文件整体不落盘', () => {
    const written: string[] = []
    const nesting: TokenScanner = (line) =>
      [...line.matchAll(/m6a-playbook\.md/g)].map((m) => ({
        start: m.index ?? 0,
        end: (m.index ?? 0) + m[0].length,
        to: '[[m6a-playbook.md](./m6a-playbook.md)](./m6a-playbook.md)',
      }))
    const stats = batchReplace({
      files: ['in.md'],
      scan: nesting,
      readFile: () => '| 下游设计 | m6a-playbook.md |\n',
      writeFile: (f) => written.push(f),
      dryRun: false,
    })
    expect(written).toEqual([])
    expect(stats.blockedFiles).toEqual(['in.md'])
    expect(stats.filesChanged).toEqual([])
    expect(stats.nestedViolations).toHaveLength(1)
  })

  it('行过滤器放行之外的行原样保留', () => {
    const src = '| 下游设计 | m6a-playbook.md |\n正文里也提到 m6a-playbook.md，不动。\n'
    const stats = batchReplace({
      files: ['in.md'],
      scan: scanSpecsRefs(NAMES),
      lineFilter: headerLineFilter,
      readFile: () => src,
      writeFile: () => {},
    })
    expect(stats.totalEdits).toBe(1)
  })
})

/* ── ④ 预设扫描器：C-7 三种形态 ─────────────────────────────────── */

describe('scanSpecsRefs · C-7 引用形态', () => {
  const scan = scanSpecsRefs(NAMES)
  const ctx = { file: 'f.md', lineNo: 1 }
  const conv = (line: string): string => replaceLine(line, scan, ctx).text

  it('带路径反引号 → 链接', () => {
    expect(conv('| 下游设计 | `docs/specs/m6a-playbook.md` |')).toBe(
      '| 下游设计 | [m6a-playbook.md](./m6a-playbook.md) |',
    )
  })

  it('带路径裸写 → 链接', () => {
    expect(conv('| 下游设计 | docs/specs/m6a-playbook.md |')).toBe(
      '| 下游设计 | [m6a-playbook.md](./m6a-playbook.md) |',
    )
  })

  it('裸名（带反引号）→ 链接（反引号被吃掉）', () => {
    expect(conv('| 下游设计 | `m3-glossary.md` |')).toBe(
      '| 下游设计 | [m3-glossary.md](./m3-glossary.md) |',
    )
  })

  it('已是链接 → 原样保留，不产生嵌套', () => {
    const line = '| 下游设计 | [m6a-playbook.md](./m6a-playbook.md) |'
    expect(conv(line)).toBe(line)
  })

  it('不在 names 集合里的文件名不动', () => {
    const line = '| 下游设计 | package.md 与 other.md |'
    expect(conv(line)).toBe(line)
  })

  it('同一行多个引用全部转换', () => {
    expect(conv('| 下游设计 | m6a-playbook.md 与 m6b-output-bundle.md |')).toBe(
      '| 下游设计 | [m6a-playbook.md](./m6a-playbook.md) 与 [m6b-output-bundle.md](./m6b-output-bundle.md) |',
    )
  })
})

/* ── ⑤ 行过滤器 ────────────────────────────────────────────────── */

describe('headerLineFilter', () => {
  it('只放行 | 上游 / | 下游设计 两行', () => {
    expect(headerLineFilter('| 上游 | 无 |')).toBe(true)
    expect(headerLineFilter('| 下游设计 | x |')).toBe(true)
    expect(headerLineFilter('正文提到 m6a-playbook.md')).toBe(false)
    expect(headerLineFilter('| 状态 | 已落地 |')).toBe(false)
  })
})
