import { describe, expect, it } from 'vitest'
import { snippetFailureText } from './sourceFailureText'

/**
 * M9 增强 2 · **「读不到」的原因 ⇒ 文案**（`sourceFailureText.ts`）
 *
 * ## 它断什么
 *
 * 判据是「不同原因必须显示**不同**文案」——
 * ⚠️ 若四种原因都落进同一个兜底分支，用户看到的就是同一句废话
 *   （分不清「文件被删了」与「路径越界」⇒ 也不知道该做什么）。
 *
 * ## ⚠️ 这条断言天然可能**恒真**
 *
 * 「文案不同」这条断言若写成「不含某个字」，很容易变成恒真。
 * ⇒ 这里断的是**集合大小**：六个原因 ⇒ 六段**互不相同**的文案。
 */
describe('M9 增强 2 · 片段读取失败原因的文案', () => {
  const REASONS = [
    'file_missing',
    'out_of_project',
    'line_out_of_range',
    'too_large',
    'unreadable',
    'not_loaded',
  ] as const

  it('① 六个原因 ⇒ 六段**互不相同**的文案（不许塌成一个兜底）', () => {
    const texts = REASONS.map((r) => snippetFailureText(r))
    expect(new Set(texts).size).toBe(REASONS.length)
  })

  it('② 每种文案都说得清**为什么**（含该原因的关键信息）', () => {
    expect(snippetFailureText('file_missing')).toContain('文件')
    expect(snippetFailureText('out_of_project')).toContain('项目')
    expect(snippetFailureText('line_out_of_range')).toContain('短')
    expect(snippetFailureText('too_large')).toContain('上限')
    expect(snippetFailureText('unreadable')).toContain('读不到')
    expect(snippetFailureText('not_loaded')).toContain('没有加载')
  })

  it('③ 原因未知（`null`）⇒ 走**兜底**（不是抛错、也不是空串）', () => {
    const text = snippetFailureText(null)
    expect(text.length).toBeGreaterThan(0)
    expect(text).toBe(snippetFailureText(undefined))
  })
})
