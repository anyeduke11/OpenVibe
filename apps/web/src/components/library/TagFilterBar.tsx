import { useState } from 'react'
import { lane } from '../../i18n/lane-assets'
import { zh } from '../../i18n/zh'
import { Icon } from '../ui/icons'
import { toggleChip } from '../ui/styles'
import { MoreChips, foldChips } from './foldChips'

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

  const { shown, hidden, collapsible } = foldChips(props.tags, props.selected, limit, expanded)

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
      <MoreChips
        collapsible={collapsible}
        expanded={expanded}
        hidden={hidden}
        moreLabel={lane.filter.more}
        onToggle={setExpanded}
      />
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
