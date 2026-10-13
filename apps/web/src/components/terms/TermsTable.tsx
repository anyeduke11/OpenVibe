import type { ReactNode } from 'react'
import type { MatchRange, TermMatch, TermOut } from '@openvibe/shared'
import { zh } from '../../i18n/zh'
import { btnGhost, chipTone, ledgerHeadCls } from '../ui/styles'

export interface TermRowView {
  term: TermOut
  matches: TermMatch[]
}

const STATUS_STYLE: Record<TermOut['status'], string> = {
  draft: chipTone('default'),
  active: chipTone('ok'),
}

const STATUS_ICON: Record<TermOut['status'], ReactNode> = {
  draft: (
    <svg viewBox="0 0 16 16" className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M11.5 2.5l2 2L6 12l-2.5.5L4 10l7.5-7.5z" />
    </svg>
  ),
  active: (
    <svg viewBox="0 0 16 16" className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M3.5 8.5l3 3 6-6.5" />
    </svg>
  ),
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
    nodes.push(<mark key={i} className="rounded bg-warn-soft px-0.5">{text.slice(r.start, r.end)}</mark>)
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
      <div className="flex items-center gap-2 border-b border-line-hair px-5 py-2 text-xs">
        <label className="flex items-center gap-1.5 text-ink-muted">
          <input
            type="checkbox"
            checked={allShown}
            onChange={() =>
              props.onSelectAll(allShown ? [] : rows.map((r) => r.term.id))
            }
          />
          {zh.terms.selection.allShown}
        </label>
        <span className="tabular-nums text-ink-faint">{zh.terms.selection.label(selected.length)}</span>
        {selected.length > 0 && (
          <button className="text-ink-faint underline hover:text-ink-body" onClick={() => props.onSelectAll([])}>
            {zh.terms.selection.clear}
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {props.loading && <p className="p-6 text-sm text-ink-faint">加载中…</p>}
        {!props.loading && rows.length === 0 && (
          <p className="p-6 text-sm text-ink-faint">
            {props.searching ? zh.terms.noResults : zh.terms.empty}
          </p>
        )}
        {rows.length > 0 && (
          <table className="w-full border-collapse text-sm">
            <thead className={`sticky top-0 bg-panel text-left ${ledgerHeadCls}`}>
              <tr className="border-b border-line">
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
                  className={`border-b border-line-hair align-top hover:bg-panel-2 ${
                    selectedSet.has(term.id) ? 'bg-accent-soft/40' : ''
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
                      className="text-left text-[16px] font-semibold text-ink-body hover:text-accent"
                      onClick={() => props.onEdit(term)}
                    >
                      <Highlight text={term.zh ?? '—'} ranges={rangesOf(matches, 'zh')} />
                    </button>
                  </td>
                  <td className="px-2 py-2.5 text-ink-muted">
                    <Highlight text={term.en ?? '—'} ranges={rangesOf(matches, 'en')} />
                  </td>
                  <td className="px-2 py-2.5 text-ink-muted">
                    <Highlight text={term.aliases.join('、')} ranges={rangesOf(matches, 'aliases')} />
                  </td>
                  <td className="px-2 py-2.5 text-ink-muted">
                    <span className="line-clamp-2">
                      <Highlight text={term.definition} ranges={rangesOf(matches, 'definition')} />
                    </span>
                    {term.example !== '' && (
                      <span className="mt-1 line-clamp-1 block text-[11px] text-ink-faint">
                        例：{term.example}
                      </span>
                    )}
                    {term.tags.length > 0 && (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {term.tags.map((t) => (
                          <span key={t} className={chipTone('default')}>
                            #{t}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="flex flex-wrap items-center gap-1">
                      <span className={`${STATUS_STYLE[term.status]} gap-1`}>
                        {STATUS_ICON[term.status]}
                        {zh.terms.status[term.status]}
                      </span>
                      <span className={chipTone('default')}>
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
