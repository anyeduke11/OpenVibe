/**
 * `packages/core/src/source-scan/subset-check.ts` —— **DL-19 的可执行判定式**
 * （`m9-dev-language-roadmap.md` §3.8.2 第 3 条 / §7 DL-19）
 *
 * ## 它断什么
 *
 * §3.8.2：「回退只允许**精度下降**，不允许**结果减少** ——
 * parser 认出的集合必须 ⊇ 正则认出的集合」。
 *
 * ⚠️ **如果 regex 认出一项而 parser 认不出，那是 parser 的缺陷不是「正则更宽」，必须红。**
 *
 * ## ⚠️ 为什么要做成**纯函数**
 *
 * 变异腿要喂**改过的数据**（「给某个模式配一个比它的解析器判定更宽的正则」）
 * ⇒ 判定式不能自己做 IO ⇒ 吃两组集合、吐违规对。
 */

/**
 * 一条命中的**身份**（不含模式串 —— 两条路径的模式串文本不同，比不了）。
 *
 * ⚠️ 字段名是 **`spec_id`**（原始命中的字段名）—— 用错字段名会让所有命中塌成
 *   同一个 `undefined` 命名空间 ⇒ 比较结果**看着有违规、其实是键算错了**
 *   （本轮实测踩到过：真实样本上的 DL-19 一开始报的「违规」全是这个原因）。
 */
export interface HitKey {
  spec_id: string
  file: string
  line: number
}

/** 把一条命中压成可比对的键。 */
export function hitKey(k: HitKey): string {
  return `${k.spec_id}|${k.file}|${String(k.line)}`
}

/**
 * 找出「正则多认出来、解析器没认出来」的命中。
 *
 * @param parserHits 解析器认出的键集合
 * @param heuristicHits 正则认出的键集合
 * @returns 违规的键（**空数组 = 满足 ⊇**）
 */
export function findSubsetViolations(
  parserHits: ReadonlySet<string>,
  heuristicHits: ReadonlySet<string>,
): string[] {
  const out: string[] = []
  for (const key of heuristicHits) {
    if (!parserHits.has(key)) out.push(key)
  }
  return out.sort()
}
