import type { PlatformMark, PromptOut } from '@openvibe/shared'
import { zh } from '../../i18n/zh'
import type { PromptFilters } from '../../hooks/usePrompts'
import { btnGhost, chipCls } from '../ui/styles'

const STATUS_STYLE: Record<PromptOut['status'], string> = {
  draft: 'border-zinc-200 bg-zinc-100 text-zinc-600',
  active: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  deprecated: 'border-zinc-300 bg-white text-zinc-400 line-through',
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
        {props.loading && <p className="p-6 text-sm text-zinc-400">加载中…</p>}
        {!props.loading && items.length === 0 && (
          <p className="p-6 text-sm text-zinc-400">{zh.library.empty}</p>
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
              className="border-b border-zinc-100 px-5 py-3 hover:bg-zinc-50"
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <button
                    className="truncate text-left text-sm font-medium text-zinc-900 hover:text-brand"
                    onClick={() => props.onEdit(p)}
                  >
                    {p.title}
                  </button>
                  {p.description !== '' && (
                    <p className="mt-0.5 line-clamp-1 text-xs text-zinc-500">{p.description}</p>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className={`${chipCls} ${STATUS_STYLE[p.status]}`}>
                      {zh.library.status[p.status]}
                    </span>
                    <span className={`${chipCls} border-sky-200 bg-sky-50 text-sky-700`}>
                      {zh.library.useAs[p.useAs]}
                    </span>
                    {p.platformMarks.map((m: PlatformMark) => (
                      <span key={m} className={`${chipCls} border-zinc-200 bg-white text-zinc-500`}>
                        {m}
                      </span>
                    ))}
                    {p.tags.map((t) => (
                      <span
                        key={t}
                        className={`${chipCls} border-zinc-200 bg-zinc-50 text-zinc-600`}
                      >
                        #{t}
                      </span>
                    ))}
                    {p.variables.length > 0 && (
                      <span
                        className={`${chipCls} mono border-amber-200 bg-amber-50 text-amber-700`}
                      >
                        {`{{${p.variables.join(', ')}}}`}
                      </span>
                    )}
                    <span className="mono text-[11px] text-zinc-400">{p.folderPath}</span>
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

      <div className="flex items-center justify-between border-t border-zinc-100 px-5 py-2 text-xs text-zinc-500">
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
