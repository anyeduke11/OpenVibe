import { useState } from 'react'
import { lane } from '../../i18n/lane-assets'
import { zh } from '../../i18n/zh'
import { Icon } from '../ui/icons'
import { CHIP_TONES, chipCls, chipPressed } from '../ui/styles'

// 可按压的筛选 chip：选中与未选中在形制层择一。chipCls + CHIP_TONES.default / chipPressed
// 各自带 border/bg/text 三个色类，叠加只会让 Tailwind 任意挑一个生效（顺序不由源码决定），
// 所以这里不叠加，三元也不散进 JSX。与 TermRoadmapView 的 toggleChip 同一条纪律。
const toggleChip = (on: boolean): string =>
  `${chipCls} shrink-0 transition-colors ${on ? chipPressed : `${CHIP_TONES.default} hover:bg-panel`}`

/**
 * 标签过滤条（m1 FR-3.4 单选切换）：**单行** + 超量折叠。
 *
 * 两处收紧，都是为了页头高度可预测：
 *  1. 不换行——外层 AssetFilterBar 已经是 `overflow-x-auto whitespace-nowrap` 的轨道，
 *     这里再输出一个 `flex-wrap` 就会把轨道撑成两行。
 *  2. 默认只露前 `limit` 个，其余收进「更多标签」——标签数随用户资产增长，
 *     早先几十个 chip 平铺正是正文被顶到折叠线以下的直接原因。
 *     选中的标签永远可见：筛完之后被折叠隐藏，用户会觉得「筛没了」。
 */
export function TagFilterBar(props: {
  tags: string[]
  selected: string | undefined
  onToggle: (tag: string | undefined) => void
  limit?: number
}) {
  const [expanded, setExpanded] = useState(false)
  const limit = props.limit ?? 8
  if (props.tags.length === 0) return null

  const selectedIdx = props.selected === undefined ? -1 : props.tags.indexOf(props.selected)
  const collapsible = props.tags.length > limit
  const shown =
    !collapsible || expanded
      ? props.tags
      : selectedIdx >= limit
        ? [...props.tags.slice(0, limit), props.tags[selectedIdx] as string]
        : props.tags.slice(0, limit)
  const hidden = props.tags.length - shown.length

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className="flex shrink-0 items-center gap-1 text-xs text-ink-muted">
        <Icon name="filter" size={11} />
        {lane.filter.tags}
      </span>
      {shown.map((tag) => {
        const on = props.selected === tag
        return (
          <button
            key={tag}
            type="button"
            aria-pressed={on}
            onClick={() => props.onToggle(on ? undefined : tag)}
            className={toggleChip(on)}
          >
            {tag}
          </button>
        )
      })}
      {collapsible && !expanded && (
        <button
          type="button"
          className={`${chipCls} shrink-0 ${CHIP_TONES.default} hover:bg-panel`}
          onClick={() => setExpanded(true)}
        >
          {lane.filter.more} +{String(hidden)}
        </button>
      )}
      {collapsible && expanded && (
        <button
          type="button"
          className={`${chipCls} shrink-0 ${CHIP_TONES.default} hover:bg-panel`}
          onClick={() => setExpanded(false)}
        >
          {lane.row.fewer}
        </button>
      )}
      {props.selected !== undefined && (
        <button
          type="button"
          className="shrink-0 text-xs text-accent underline underline-offset-2 hover:text-accent-deep"
          onClick={() => props.onToggle(undefined)}
        >
          {zh.common.clearFilter}
        </button>
      )}
    </div>
  )
}
