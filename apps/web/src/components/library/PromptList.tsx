import type { PlatformMark, PromptOut } from '@openvibe/shared'
import { zh } from '../../i18n/zh'
import type { PromptFilters } from '../../hooks/usePrompts'
import { btnGhost, chipCls } from '../ui/styles'

const STATUS_STYLE: Record<PromptOut['status'], string> = {
  draft: 'border-line bg-fill text-ink-muted',
  active: 'border-success-200 bg-success-50 text-success-700',
  deprecated: 'border-line-strong bg-panel text-ink-faint line-through',
}

export function PromptList(props: {
  items: PromptOut[]
  total: number
  filters: PromptFilters
  loading: boolean
  onEdit: (prompt: PromptOut) => void
  onCopy: (prompt: PromptOut) => void
  onDelete: (prompt: PromptOut) => void
  onPageChange: (page: number) => void
}) {
  const { items, total, filters } = props
  const pages = Math.max(1, Math.ceil(total / (filters.size ?? 20)))

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-auto">
        {props.loading && <p className="p-6 text-sm text-ink-faint">加载中…</p>}
        {!props.loading && items.length === 0 && (
          <p className="p-6 text-sm text-ink-faint">{zh.library.empty}</p>
        )}
        <ul>
          {items.map((p) => (
            <li
              key={p.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', p.id)
                e.dataTransfer.effectAllowed = 'move'
              }}
              className="border-b border-line-hair px-5 py-3 hover:bg-fill-soft"
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <button
                    className="truncate text-left text-sm font-medium text-ink-strong hover:text-brand"
                    onClick={() => props.onEdit(p)}
                  >
                    {p.title}
                  </button>
                  {p.description !== '' && (
                    <p className="mt-0.5 line-clamp-1 text-xs text-ink-subtle">{p.description}</p>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className={`${chipCls} ${STATUS_STYLE[p.status]}`}>
                      {zh.library.status[p.status]}
                    </span>
                    <span className={`${chipCls} border-info-200 bg-info-50 text-info-700`}>
                      {zh.library.useAs[p.useAs]}
                    </span>
                    {p.platformMarks.map((m: PlatformMark) => (
                      <span key={m} className={`${chipCls} border-line bg-panel text-ink-subtle`}>
                        {m}
                      </span>
                    ))}
                    {p.tags.map((t) => (
                      <span
                        key={t}
                        className={`${chipCls} border-line bg-fill-soft text-ink-muted`}
                      >
                        #{t}
                      </span>
                    ))}
                    {p.variables.length > 0 && (
                      <span
                        className={`${chipCls} mono border-warn-200 bg-warn-50 text-warn-700`}
                      >
                        {`{{${p.variables.join(', ')}}}`}
                      </span>
                    )}
                    <span className="mono text-[11px] text-ink-faint">{p.folderPath}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button className={btnGhost} onClick={() => props.onCopy(p)}>
                    {zh.library.copy}
                  </button>
                  <button className={btnGhost} onClick={() => props.onEdit(p)}>
                    {zh.library.edit}
                  </button>
                  <button className={btnGhost} onClick={() => props.onDelete(p)}>
                    {zh.library.delete}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-center justify-between border-t border-line-hair px-5 py-2 text-xs text-ink-subtle">
        <span>{zh.library.total(total)}</span>
        <div className="flex items-center gap-2">
          <button
            className={btnGhost}
            disabled={filters.page <= 1}
            onClick={() => props.onPageChange(filters.page - 1)}
          >
            {zh.library.prevPage}
          </button>
          <span>{zh.library.page(filters.page)}</span>
          <button
            className={btnGhost}
            disabled={filters.page >= pages}
            onClick={() => props.onPageChange(filters.page + 1)}
          >
            {zh.library.nextPage}
          </button>
        </div>
      </div>
    </div>
  )
}
