import { describe, expect, it } from 'vitest'
import { estimateTokens, SIZE_WARN_THRESHOLD } from './size'

/**
 * m6a FR-6.2 + 验收 8。这些数字是**规格里的口径**（粗估常数，不是任何 tokenizer 实测曲线），
 * 改动系数即 B 级变更：数字会进 TERMS.md 相关的展示与 warn 判定。
 */
describe('estimateTokens（CORE-SIZE-01..05）', () => {
  it('CORE-SIZE-01: 空串 → 全零', () => {
    expect(estimateTokens('')).toEqual({ codePoints: 0, cjk: 0, other: 0, approxTokens: 0 })
  })

  it('CORE-SIZE-02: 401 个 ASCII → ceil(401/4) = 101（向上取整生效）', () => {
    expect(estimateTokens('a'.repeat(401))).toMatchObject({ other: 401, approxTokens: 101 })
  })

  it('CORE-SIZE-03: 20 个汉字 → ceil(20×1.2) = 24（CJK 系数生效）', () => {
    expect(estimateTokens('汉'.repeat(20))).toMatchObject({ cjk: 20, approxTokens: 24 })
  })

  it('CORE-SIZE-04: 非 BMP 按码点计，代理对不虚增', () => {
    const s = 'a\u{1F600}b'
    expect(s.length, '夹具本身必须是 UTF-16 长度 4').toBe(4)
    expect(estimateTokens(s)).toEqual({ codePoints: 3, cjk: 0, other: 3, approxTokens: 1 })
  })

  it('CORE-SIZE-05: 中英混合 = 两系数之和向上取整；全角标点计入 CJK', () => {
    expect(estimateTokens('汉字abc')).toMatchObject({
      codePoints: 5,
      cjk: 2,
      other: 3,
      approxTokens: 4,
    })
    expect(estimateTokens('提示词，包含全角标点。')).toMatchObject({
      codePoints: 11,
      cjk: 11,
      approxTokens: 14,
    })
    expect(SIZE_WARN_THRESHOLD).toBe(12_000)
  })

  it('负向：口径不是 chars/4 —— 同一串中文的估算不低于码点数', () => {
    const s = '提示词'
    expect(estimateTokens(s).approxTokens).toBeGreaterThanOrEqual(s.length)
  })
})
