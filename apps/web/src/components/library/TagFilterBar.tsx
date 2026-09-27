import { zh } from '../../i18n/zh'

/** 标签过滤条（m1 FR-3.4）：单选切换 */
export function TagFilterBar(props: {
  tags: string[]
  selected: string | undefined
  onToggle: (tag: string | undefined) => void
}) {
  if (props.tags.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-ink-subtle">{zh.common.allTags}</span>
      {props.tags.map((tag) => {
        const on = props.selected === tag
        return (
          <button
            key={tag}
            onClick={() => props.onToggle(on ? undefined : tag)}
            className={`rounded-full border px-2.5 py-0.5 text-xs ${
              on
                ? 'border-brand bg-brand-soft text-brand'
                : 'border-line bg-panel text-ink-muted hover:border-line-strong'
            }`}
          >
            {tag}
          </button>
        )
      })}
      {props.selected !== undefined && (
        <button
          className="text-xs text-ink-faint underline hover:text-ink-body"
          onClick={() => props.onToggle(undefined)}
        >
          {zh.common.clearFilter}
        </button>
      )}
    </div>
  )
}
