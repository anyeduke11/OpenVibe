import type { ReactNode } from 'react'
import type { MatchRange, TermMatch, TermOut } from '@openvibe/shared'
import { zh } from '../../i18n/zh'
import { btnGhost, chipCls } from '../ui/styles'

export interface TermRowView {
  term: TermOut
  matches: TermMatch[]
}

const STATUS_STYLE: Record<TermOut['status'], string> = {
  draft: 'border-zinc-200 bg-zinc-100 text-zinc-600',
  active: 'border-emerald-200 bg-emerald-50 text-emerald-700',
}

/** 命中片段高亮（m3 FR-3.2）：按偏移切片包 <mark>，区间已由服务端合并去叠 */
function Highlight(props: { text: string; ranges: MatchRange[] }) {
  const { text, ranges } = props
  if (ranges.length === 0) return <>{text}</>
  const sorted = [...ranges].sort((a, b) => a.start - b.start)
  const nodes = [] as ReactNode[]
  let cursor = 0
  sorted.forEach((r, i) => {
    if (r.start < cursor) return
    if (r.start > cursor) nodes.push(text.slice(cursor, r.start))
    nodes.push(<mark key={i} className="rounded bg-amber-100 px-0.5">{text.slice(r.start, r.end)}</mark>)
    cursor = r.end
  })
  if (cursor < text.length) nodes.push(text.slice(cursor))
  return <>{nodes}</>
}

const rangesOf = (matches: TermMatch[], field: TermMatch['field']): MatchRange[] =>
  matches.filter((m) => m.field === field).map((m) => ({ start: m.start, end: m.end }))

export function TermsTable(props: {
  rows: TermRowView[]
  selected: string[]
  loading: boolean
  searching: boolean
  onToggle: (id: string) => void
  onSelectAll: (ids: string[]) => void
  onEdit: (term: TermOut) => void
  onDelete: (term: TermOut) => void
}) {
  const { rows, selected } = props
  const selectedSet = new Set(selected)
  const allShown = rows.length > 0 && rows.every((r) => selectedSet.has(r.term.id))

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-zinc-100 px-5 py-2 text-xs">
        <label className="flex items-center gap-1.5 text-zinc-600">
          <input
            type="checkbox"
            checked={allShown}
            onChange={() =>
              props.onSelectAll(allShown ? [] : rows.map((r) => r.term.id))
            }
          />
          {zh.terms.selection.allShown}
        </label>
        <span className="text-zinc-400">{zh.terms.selection.label(selected.length)}</span>
        {selected.length > 0 && (
          <button className="text-zinc-400 underline hover:text-zinc-700" onClick={() => props.onSelectAll([])}>
            {zh.terms.selection.clear}
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {props.loading && <p className="p-6 text-sm text-zinc-400">加载中…</p>}
        {!props.loading && rows.length === 0 && (
          <p className="p-6 text-sm text-zinc-400">
            {props.searching ? zh.terms.noResults : zh.terms.empty}
          </p>
        )}
        {rows.length > 0 && (
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-white text-left text-xs text-zinc-500">
              <tr className="border-b border-zinc-200">
                <th className="w-8 px-5 py-2" />
                <th className="w-56 px-2 py-2">{zh.terms.columns.zh}</th>
                <th className="w-40 px-2 py-2">{zh.terms.columns.en}</th>
                <th className="w-44 px-2 py-2">{zh.terms.columns.aliases}</th>
                <th className="px-2 py-2">{zh.terms.columns.definition}</th>
                <th className="w-36 px-2 py-2">{zh.library.filters.status}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ term, matches }) => (
                <tr
                  key={term.id}
                  className={`border-b border-zinc-100 align-top hover:bg-zinc-50 ${
                    selectedSet.has(term.id) ? 'bg-brand-soft/40' : ''
                  }`}
                >
                  <td className="px-5 py-2.5">
                    <input
                      type="checkbox"
                      aria-label={term.zh ?? term.en}
                      checked={selectedSet.has(term.id)}
                      onChange={() => props.onToggle(term.id)}
                    />
                  </td>
                  <td className="px-2 py-2.5">
                    <button
                      className="text-left font-medium text-zinc-900 hover:text-brand"
                      onClick={() => props.onEdit(term)}
                    >
                      <Highlight text={term.zh ?? '—'} ranges={rangesOf(matches, 'zh')} />
                    </button>
                  </td>
                  <td className="px-2 py-2.5 text-zinc-700">
                    <Highlight text={term.en ?? '—'} ranges={rangesOf(matches, 'en')} />
                  </td>
                  <td className="px-2 py-2.5 text-zinc-500">
                    <Highlight text={term.aliases.join('、')} ranges={rangesOf(matches, 'aliases')} />
                  </td>
                  <td className="px-2 py-2.5 text-zinc-600">
                    <span className="line-clamp-2">
                      <Highlight text={term.definition} ranges={rangesOf(matches, 'definition')} />
                    </span>
                    {term.example !== '' && (
                      <span className="mt-1 line-clamp-1 block text-[11px] text-zinc-400">
                        例：{term.example}
                      </span>
                    )}
                    {term.tags.length > 0 && (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {term.tags.map((t) => (
                          <span key={t} className={`${chipCls} border-zinc-200 bg-zinc-50 text-zinc-600`}>
                            #{t}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="flex flex-wrap items-center gap-1">
                      <span className={`${chipCls} ${STATUS_STYLE[term.status]}`}>
                        {zh.terms.status[term.status]}
                      </span>
                      <span className={`${chipCls} border-zinc-200 bg-white text-zinc-500`}>
                        {term.source === 'openvibe-seed' ? zh.terms.source.seed : zh.terms.source.manual}
                      </span>
                      <button className={btnGhost} onClick={() => props.onEdit(term)}>
                        {zh.library.edit}
                      </button>
                      <button className={btnGhost} onClick={() => props.onDelete(term)}>
                        {zh.library.delete}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
