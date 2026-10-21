import { Icon, type IconName } from '../ui/icons'
import { chipTone } from '../ui/styles'
import { MASTERY_STATE_LABELS, MASTERY_STATE_TONE, type MasteryState } from '@openvibe/shared'

/**
 * M9 v1.6 **P3.2 · 掌握度三态 chip**（`m9-dev-language-roadmap.md` §3.3 / §3.5）。
 *
 * ## 它是什么
 *
 * 一枚 chip 显示「这个知识点在本项目里的状态」。⚠️ **文案不在本文件** ——
 * 三条文案取自 `@openvibe/shared` 的 `MASTERY_STATE_LABELS`（P2 落的），
 * **口径只留一处**：改文案只改那一个常量。
 *
 * ## ⚠️ 两条文案纪律（DL-05 / §6.3 第 2 条）
 *
 * - **不得出现「你已掌握」** —— 这套推断**只认得出「用过」**（§3.3 末段）；
 * - **不得出现「未触及」三个字** —— 一律写「本项目未涉及」。
 *
 * ⇒ 本文件在 DL-05 文案守卫的扫描范围内（packages 与 apps 的 src 目录）⇒ 它自己也不能写那两个字。
 *
 * ## ⚠️ chip 永远配图标 ＋ 文字
 *
 * DESIGN.md chip 纪律：颜色**不单独承载语义** ⇒ 每个态配一个图标。
 */
const ICONS: Record<MasteryState, IconName> = {
  unused: 'info',
  active: 'pulse',
  mastered: 'check',
}

export interface MasteryChipProps {
  state: MasteryState
}

export function MasteryChip({ state }: MasteryChipProps) {
  return (
    <span className={chipTone(MASTERY_STATE_TONE[state])}>
      <Icon name={ICONS[state]} size={12} />
      {MASTERY_STATE_LABELS[state]}
    </span>
  )
}
