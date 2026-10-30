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
    // ⚠️ 根元素用 `shrink-0` 而非 `min-w-0`：外层 `AssetFilterBar` 的轨道是**刻意**的
    // `overflow-x-auto`（其文档写明「单行筛选条：横向滚动、永不换行」）。本组若可缩，
    // 会被轨道挤成「盒子比内容窄」——而组内 chip 全是 `shrink-0`（内容不缩），
    // 于是内容溢出盒子并**盖住右邻**（实测 `/terms`：「更多标签 +42」压住 L2/L3/只看完懂，
    // 三者互相重叠不可点；`/library`：文件夹条溢出盖住标签条首个 chip）。
    // 与 `TermFilterBar` 同款：宁可让轨道横向滚动，也不让内容互相压盖。
    <div className="flex shrink-0 items-center gap-1.5">
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
