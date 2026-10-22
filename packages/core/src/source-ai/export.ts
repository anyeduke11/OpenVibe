/**
 * `packages/core/src/source-ai/export.ts` —— **解读结果的导出**（增强 4）
 *
 * ## 它是什么
 *
 * 把一次 T2 解读的**结果**排成一份 Markdown，交给用户**主动保存**到自己的磁盘上。
 *
 * ## ⚠️ 为什么是「用户主动保存」而不是「自动留存」
 *
 * §3.8 三条线第 3 条：「解读结果**不自动入库**」⇒
 * - **不写库**（台账只留指纹与计数）—— 这条 P5 已经守住；
 * - **不自动落文件** —— 解读完就刷新即丢，用户可能正想留着慢慢看。
 * ⇒ 解法是给一个**显式的保存动作**：产物落在用户自己的磁盘上，
 *   仍然是「只展示、不留存」在**本机状态**里的形态（不进库、不外传）。
 *
 * ## ⚠️ 导出物必须**不含绝对路径**（DL-18 的同一条纪律，出口在另一头）
 *
 * 入参那一头做了一次脱敏（`redact.ts`），但**出口**这一头也要再兜一道：
 * ⚠️ **AI 的解读文字里可能带出绝对路径** —— 我们的组装器只管住了「我们发出去的
 *   那份内容」，管不住「模型回来说了什么」⇒ 导出前把所有自由文本再过一遍脱敏。
 *
 * ⚠️ 这与「守卫自证」配套：**先断言脏值确实含危险字符**，否则
 *   「导出后没有绝对路径」这条断言可能是**恒真**的。
 */
import { redactAbsolutePaths } from './redact'
import type { SourceInterpretSummary } from '@openvibe/shared'

/** 导出的选项。 */
export interface ExportInterpretOptions {
  /**
   * 项目根（**绝对路径**）—— 用来把「项目内的绝对路径」换成相对路径。
   *
   * ⚠️ **必须给**：不给就脱不掉「项目内的绝对路径」⇒ 导出物会带着
   *   本机目录结构落到用户的文件里。
   */
  projectRoot: string
}

/** 状态的文案（**三档不混**）。 */
const STATUS_TEXT: Record<SourceInterpretSummary['status'], string> = {
  ok: '已解读',
  failed: '解读失败',
  unavailable: '解读不可用',
}

/** 脱敏一段自由文本（AI 的解读、风险点、失败原因都可能带路径）。 */
function safe(text: string, projectRoot: string): string {
  return redactAbsolutePaths(text, projectRoot)
}

/**
 * 把一次解读结果排成 Markdown。
 *
 * ⚠️ **产物里没有源码正文** —— 导出的只有「解读文字 ＋ 计数 ＋ 指纹 ＋ 分歧」。
 *   片段正文从进 `summary` 的那一刻起就不在里面（`summary` 的形状里装不下）。
 */
export function formatInterpretMarkdown(
  summary: SourceInterpretSummary,
  opts: ExportInterpretOptions,
): string {
  const root = opts.projectRoot
  const lines: string[] = []

  lines.push('# 源码解读结果')
  lines.push('')
  lines.push(`- 项目：${safe(summary.project_id, root)}`)
  lines.push(`- 状态：${STATUS_TEXT[summary.status]}`)
  lines.push(`- 送出的片段：${String(summary.fragment_count)} 条`)
  lines.push(`- 解读回来：${String(summary.item_count)} 条`)
  lines.push(`- 风险点：${String(summary.risk_count)} 条`)
  lines.push(`- 与确定性层的分歧：${String(summary.divergence_count)} 条`)
  // ⚠️ 指纹**不含正文**（正文进 sha256，不进台账，也不进这里）⇒ 可以放心导出
  lines.push(`- 入参指纹：${summary.input_hash ?? '（无）'}`)
  // ⚠️ **谁答的**（增强 4：provider 可以多份并存 ⇒ 复盘第一问题就是「哪家答的」）
  lines.push(`- 解读方：${summary.provider.trim() === '' ? '（未知）' : summary.provider}`)
  // ⚠️ **用量**（**只落计数** —— 数字，不是内容 ⇒ 可以放心导出）
  if (summary.usage !== null) {
    lines.push(
      `- 用量：输入 ${String(summary.usage.prompt_tokens)} token，输出 ${String(summary.usage.completion_tokens)} token，合计 ${String(summary.usage.total_tokens)} token`,
    )
  }
  if (summary.failure_reason !== null) {
    lines.push(`- 失败原因：${safe(summary.failure_reason, root)}`)
  }
  lines.push('')
  lines.push('> 这份文件由你主动保存；解读结果**没有写进本机数据库**。')
  lines.push('')

  // ── 分歧（DL-09：两处并列；**为 0 也要显示**）────────────────────────
  lines.push(`## 与确定性层的分歧（${String(summary.divergence_count)}）`)
  lines.push('')
  if (summary.divergences.length === 0) {
    lines.push('没有分歧：AI 的说法与判定层一致。')
  } else {
    for (const d of summary.divergences) {
      lines.push(
        `- ${safe(d.topic_slug, root)} —— 确定性层：${d.deterministic_state}；AI 声称：${d.ai_state}`,
      )
    }
  }
  lines.push('')

  // ── 逐条解读 ─────────────────────────────────────────────────────────
  lines.push('## 逐条解读')
  lines.push('')
  if (summary.items.length === 0) {
    lines.push('（没有解读结果）')
  } else {
    for (const item of summary.items) {
      lines.push(`### ${safe(item.topic_slug, root)}`)
      lines.push('')
      lines.push(safe(item.summary, root))
      lines.push('')
      lines.push('风险点：')
      if (item.risks.length === 0) {
        lines.push('- （无）')
      } else {
        for (const r of item.risks) lines.push(`- ${safe(r, root)}`)
      }
      lines.push('')
    }
  }

  return `${lines.join('\n')}\n`
}
