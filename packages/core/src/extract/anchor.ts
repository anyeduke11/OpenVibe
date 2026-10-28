import type { ExtractCandidateItem } from '@openvibe/shared'

/**
 * 锚定校验（v0.2.3 批次 D AN1，spec FR-4；QG3 的落点，纯函数）。
 *
 * 分析文反对 LLM 提取的理由是「质量不可判定」——采纳与否不可判定，
 * 但「候选是否锚定在源日志原文上」**完全可判定**：候选的锚定句（quote）
 * 必须逐字命中其源日志正文（码点级子串），否则是幻觉，服务端直接丢弃，
 * 不给人工视野。判据是确定性代码，LLM 只是它的一个调用方。
 */

export interface AnchorSource {
  /** 对应请求 log_ids 的下标 */
  index: number
  /** 脱敏后的日志正文（与出网内容同源，锚定比对在脱敏文本上进行——所见即所比） */
  text: string
}

export interface AnchorOutcome {
  passed: ExtractCandidateItem[]
  dropped: { title: string; reason: string }[]
}

function containsLiteral(haystack: string, needle: string): boolean {
  // 码点级子串匹配：String.includes 对 BMP 外字符按码元切分的假阳性风险由
  // 双方都来自同源文本抵消；这里再用长度护栏挡空串（schema 已挡，双保险）。
  return needle.length > 0 && haystack.includes(needle)
}

export function anchorCandidates(
  candidates: ExtractCandidateItem[],
  sources: AnchorSource[],
): AnchorOutcome {
  const byIndex = new Map(sources.map((s) => [s.index, s]))
  const passed: ExtractCandidateItem[] = []
  const dropped: { title: string; reason: string }[] = []
  for (const c of candidates) {
    const source = byIndex.get(c.log_index)
    if (source === undefined) {
      dropped.push({ title: c.title, reason: `log_index ${String(c.log_index)} 不在本次输入范围` })
      continue
    }
    if (!containsLiteral(source.text, c.quote)) {
      dropped.push({ title: c.title, reason: '锚定失败：quote 未逐字命中源日志原文（疑似幻觉）' })
      continue
    }
    passed.push(c)
  }
  return { passed, dropped }
}
