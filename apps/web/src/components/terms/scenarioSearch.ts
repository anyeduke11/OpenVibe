import type { TermOut } from '@openvibe/shared'

/**
 * 场景句回退搜索（m3-terms-learning FR-5.2）。
 *
 * **只在术语名/定义/别名一条都没命中时才启用**，命中场景句的结果也**不与术语名命中混排**
 * —— 这是 FR-5.2 自己写的处置：场景句是自由文本，中文子串匹配天然有噪声
 * （搜「表单」会命中大量无关句），靠「排后」而不是靠索引来消。
 *
 * ⚠️ 刻意**不进 `fts_terms`**：那要 DROP 虚拟表 ＋ 重建 ＋ 重灌 ＋ 改三个触发器，
 * 而 `TermsRepo.list()` 本来就是全量取回后前端筛选，这个函数跑在全量结果上，
 * 数据流一点没变。理由与 `0009_terms_scenario.sql` 注释里写的一致。
 *
 * ⚠️ **真正吃劲的是下面那句 `q === ''` 的早退，不是「空场景句不匹配」**：
 * 原先这里还多写了一条 `if (s === '') return false`，注释说它防「空串包含一切」。
 * 实测跑变异腿发现那条是**死代码** —— 空串并不包含任何非空查询，`''.includes('a')` 恒为 false，
 * 而 `q` 在早退之后保证非空。⚠️ 保留它等于留一行永不执行的分支 ＋ 一条**永远抓不住它的判据**
 * （那条判据曾标着「防空串包含一切」，M4 变异腿删掉守卫后 17 支全绿，当场暴露）。
 * ⇒ 已删除。判据改为盯真正起作用的那句：查询词去空白后为空时必须不返回任何结果。
 */
export function searchByScenario(query: string, terms: TermOut[]): TermOut[] {
  const q = query.trim()
  if (q === '') return []
  const lower = q.toLowerCase()
  return terms.filter((t) => t.scenario.toLowerCase().includes(lower))
}
