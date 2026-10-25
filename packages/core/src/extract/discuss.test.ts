import { describe, expect, it } from 'vitest'
import { splitByRefs } from './discuss'

/**
 * AN2 · discuss 切段纯函数（红线 9 的落点：来源编号由服务端校验，LLM 只能引用）。
 * 端到端腿在 apps/server/test/discuss.api.test.ts（fake runner）。
 */

describe('splitByRefs（<ref:n> 切段与编号校验）', () => {
  it('标记切换来源：开头无标记文本是无来源段，标记后的文本归该来源', () => {
    const segs = splitByRefs('项目在阶段 3。<ref:0>清单剩 2 项。<ref:2>日志有 5 条。', 3)
    expect(segs).toEqual([
      { text: '项目在阶段 3。', source_ref: null },
      { text: '清单剩 2 项。', source_ref: 0 },
      { text: '日志有 5 条。', source_ref: 2 },
    ])
  })

  it('编号越界 ⇒ source_ref=null（LLM 发明的来源不被采信）；相邻无标注文本合并', () => {
    const segs = splitByRefs('A<ref:9> B', 2)
    // 标记越界 ⇒ 前后都归无来源；相邻同 null 合并（标记位置的空格随 trim 丢失，属预期）
    expect(segs).toEqual([{ text: 'AB', source_ref: null }])
  })

  it('相邻同源标记合并为一段；标记前文本归无来源；无标记全文是单段无来源', () => {
    // 甲在首个标记之前 ⇒ 无来源段；乙丙连续引用来源 1 ⇒ 合并一段
    expect(splitByRefs('甲<ref:1>乙<ref:1>丙', 2)).toEqual([
      { text: '甲', source_ref: null },
      { text: '乙丙', source_ref: 1 },
    ])
    expect(splitByRefs('没有任何标记', 2)).toEqual([{ text: '没有任何标记', source_ref: null }])
  })

  it('空回答 ⇒ 空段列表', () => {
    expect(splitByRefs('', 2)).toEqual([])
  })
})
