import { lane } from '../../i18n/lane-assets'
import { CHIP_TONES, chipCls } from '../ui/styles'

/**
 * 超量折叠的取中规则 —— 文件夹条与标签条共用这一份。
 *
 * `selected` 落在折叠线之后时补在末尾：筛完的项被折起来，用户只会觉得「筛没了」。
 */
export function foldChips<T>(
  all: T[],
  selected: T | undefined,
  limit: number,
  expanded: boolean,
): { shown: T[]; hidden: number; collapsible: boolean } {
  const collapsible = all.length > limit
  const idx = selected === undefined ? -1 : all.indexOf(selected)
  const shown =
    !collapsible || expanded
      ? all
      : idx >= limit
        ? [...all.slice(0, limit), all[idx] as T]
        : all.slice(0, limit)
  return { shown, hidden: all.length - shown.length, collapsible }
}

/**
 * 「更多 +N」/「收起」那对 chip —— 折叠状态由调用方持有。
 *
 * 展开文案由调用方给：文件夹条与标签条各有自己的 i18n 键（`lane.row.more` /
 * `lane.filter.more`），不在这里二选一；收起文案两处同源，直接取 `lane.row.fewer`。
 */
export function MoreChips(props: {
  collapsible: boolean
  expanded: boolean
  hidden: number
  moreLabel: string
  onToggle: (next: boolean) => void
}) {
  if (!props.collapsible) return null
  const cls = `${chipCls} shrink-0 ${CHIP_TONES.default} hover:bg-panel`
  return props.expanded ? (
    <button type="button" className={cls} onClick={() => props.onToggle(false)}>
      {lane.row.fewer}
    </button>
  ) : (
    <button type="button" className={cls} onClick={() => props.onToggle(true)}>
      {props.moreLabel} +{String(props.hidden)}
    </button>
  )
}
