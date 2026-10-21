/**
 * `packages/core/src/source-ai/divergence.ts` —— **分歧判定**（P5.3 · DL-09）
 * （`m9-dev-language-roadmap.md` §3.8 三条线第 3 条 / §7 DL-09）
 *
 * ## 它断什么
 *
 * DL-09：「**AI 结果不得绕过判定层**」——
 * 「注入「AI 说已掌握、确定性层说未触及」⇒ **必须显式标注分歧**」。
 *
 * ## ⚠️ 判定层是**权威**，AI 只是**另一个说法**
 *
 * §3.8 三条线第 3 条：「解读结果**不自动入库** —— AI 产出的知识点/术语一律走
 * M8 回流 ＋ 人工确认」。
 * ⇒ 分歧**只标注**，**不改写**掌握度。
 *   确定性层给什么状态，界面就显示什么状态；AI 的说法被摆在旁边。
 *
 * ## ⚠️ 「AI 没提」与「AI 说了且一致」不是一回事
 *
 * AI 只在**带 `claim_state`** 时才参与比对。
 * ⇒ **没带 claim 的条目一律不算分歧**（否则每次解读都会凭空多出「分歧」）。
 */
import type { InterpretDivergence, MasteryState, SourceInterpretItem } from '@openvibe/shared'

/**
 * 找出 AI 声称与确定性层**不一致**的条目。
 *
 * ⚠️ **纯函数**（不做 I/O、不看时钟）⇒ 变异腿可以喂假数据。
 *
 * @param items AI 的解读条目
 * @param deterministicStates slug → 确定性层的状态（权威）
 * @returns 分歧明细（**按 slug 排序**，可复现）
 */
export function findDivergences(
  items: readonly SourceInterpretItem[],
  deterministicStates: ReadonlyMap<string, MasteryState>,
): InterpretDivergence[] {
  const out: InterpretDivergence[] = []
  for (const item of items) {
    // ⚠️ AI 没声称掌握度 ⇒ 不参与比对（不是分歧）
    if (item.claim_state === null || item.claim_state === undefined) continue
    const det = deterministicStates.get(item.topic_slug)
    // ⚠️ 确定性层**没有**这个知识点的结论（不在本项目里）⇒ 不比对
    //   （「没结论」与「结论不同」不是一回事）
    if (det === undefined) continue
    if (det === item.claim_state) continue
    out.push({
      topic_slug: item.topic_slug,
      deterministic_state: det,
      ai_state: item.claim_state,
    })
  }
  return out.sort((a, b) => a.topic_slug.localeCompare(b.topic_slug))
}

/**
 * 分歧的**界面文案**（**两处并列**：确定性层 ＋ AI 的声称都要出现）。
 *
 * ⚠️ 文案里**不许**出现「已掌握」这种断言式措辞之外的越界表述 ——
 *   确定性层的标签取自 `MASTERY_STATE_LABELS`（P2 的口径单源）。
 */
export function divergenceText(d: InterpretDivergence): string {
  return `确定性层：${d.deterministic_state}；AI 声称：${d.ai_state}`
}
