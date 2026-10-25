import { describe, expect, it } from 'vitest'
import { anchorCandidates, type AnchorSource } from './anchor'
import type { ExtractCandidateItem } from '@openvibe/shared'

/**
 * 锚定校验纯函数的独立测试（spec FR-4.3：用例全部不依赖网络，先于 LLM 接线成立）。
 * 端到端腿在 apps/server/test/extract.api.test.ts 的 EXT-02（fake runner）。
 */

const c = (over: Partial<ExtractCandidateItem> = {}): ExtractCandidateItem => ({
  kind: 'term',
  title: '某候选',
  body: '某正文',
  quote: '原文句',
  log_index: 0,
  ...over,
})

const src = (index: number, text: string): AnchorSource => ({ index, text })

describe('anchorCandidates（QG3 幻觉防线，纯函数）', () => {
  it('quote 逐字命中 ⇒ passed；任一字符不同 ⇒ dropped（不是模糊匹配）', () => {
    const { passed, dropped } = anchorCandidates([c()], [src(0, '日志里有原文句，就是这样。')])
    expect(passed).toHaveLength(1)
    const miss = anchorCandidates([c({ quote: '原文句 ' })], [src(0, '日志里有原文句，就是这样。')])
    expect(miss.passed).toHaveLength(0)
    expect(miss.dropped[0]?.reason).toContain('锚定失败')
  })

  it('log_index 越界（不在本次输入范围）⇒ dropped 且 reason 指明', () => {
    const { dropped } = anchorCandidates([c({ log_index: 3 })], [src(0, 'a'), src(1, 'b')])
    expect(dropped[0]?.reason).toContain('不在本次输入范围')
  })

  it('多日志：候选锚到正确的下标（#1 的 quote 不会因 #0 也含相似句而错判）', () => {
    const sources = [src(0, '相似句 环境型红'), src(1, '真正的锚 环境型红 真正的锚')]
    const { passed } = anchorCandidates([c({ quote: '真正的锚', log_index: 1 })], sources)
    expect(passed).toHaveLength(1)
    // 同 quote 指错下标（#0 里没有「真正的锚」）⇒ 丢弃
    const wrong = anchorCandidates([c({ quote: '真正的锚', log_index: 0 })], sources)
    expect(wrong.passed).toHaveLength(0)
  })

  it('quote 跨行（含换行）也能命中——比对对象是整段正文文本', () => {
    const { passed } = anchorCandidates(
      [c({ quote: '第一行\n第二行' })],
      [src(0, '前置\n第一行\n第二行\n后置')],
    )
    expect(passed).toHaveLength(1)
  })

  it('重复候选（同 quote 两条）各自独立判定，均命中则均通过', () => {
    const { passed } = anchorCandidates([c({ title: 'A' }), c({ title: 'B' })], [src(0, '含原文句')])
    expect(passed.map((p) => p.title)).toEqual(['A', 'B'])
  })

  it('空候选列表 ⇒ 两边皆空（宁缺毋滥的出口）', () => {
    const out = anchorCandidates([], [src(0, 'x')])
    expect(out.passed).toEqual([])
    expect(out.dropped).toEqual([])
  })
})
