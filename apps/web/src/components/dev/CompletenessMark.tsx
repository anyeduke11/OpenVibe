import { meterCls, meterFillCls } from '../ui/styles'
import { stationCompleteness, type RoadmapStation } from '@openvibe/shared'

/**
 * M9 v1.6 **P3.2 · 完整度标记**（`m9-dev-language-roadmap.md` §3.5 · dev-plan §6.9 P3.2）。
 *
 * ## 它是什么
 *
 * 一站学到了多少：**已点亮 X / 共 Y** ＋ 一条进度条。
 *
 * ## ⚠️ 「点亮」的口径只有一处
 *
 * 取 `stationCompleteness`（`@openvibe/shared`）—— **不是**「掌握」才算点亮：
 * 「在用」与「掌握」都说明这个项目真的用到它了；「未涉及」才是不算。
 * ⇒ 改口径只改那一个函数。
 *
 * ## ⚠️ 空站不显示 0
 *
 * DL-07 / DL-35 同款纪律：空白与 0 会被读成「功能坏了」⇒ 零条时显示一句说明，
 * 不画进度条、不写「0/0」。
 */
const L = {
  lit: (lit: number, total: number) => `已点亮 ${String(lit)} / ${String(total)}`,
  empty: '这一站还没有条目',
} as const

export interface CompletenessMarkProps {
  station: RoadmapStation
}

export function CompletenessMark({ station }: CompletenessMarkProps) {
  const { lit, total, percent } = stationCompleteness(station)
  if (total === 0) {
    return <span className="text-[11.5px] text-ink-faint">{L.empty}</span>
  }
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-[11.5px] tabular-nums text-ink-muted">{L.lit(lit, total)}</span>
      <span className={meterCls} aria-hidden>
        <span className={meterFillCls} style={{ width: `${String(percent)}%` }} />
      </span>
    </span>
  )
}
