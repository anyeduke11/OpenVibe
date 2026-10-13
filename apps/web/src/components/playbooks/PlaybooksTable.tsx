import type { ReactNode } from 'react'
import type { MatchRange, PlaybookMatch, PlaybookOut } from '@openvibe/shared'
import { zh } from '../../i18n/zh'
import { chipCls } from '../ui/styles'

export interface PlaybookRowView {
  playbook: PlaybookOut
  matches: PlaybookMatch[]
}

const STATUS_STYLE: Record<PlaybookOut['status'], string> = {
  draft: 'border-line bg-panel-sunk text-ink-muted',
  published: 'border-ok-line bg-ok-soft text-ok',
}

const STATUS_ICON: Record<PlaybookOut['status'], ReactNode> = {
  draft: (
    <svg viewBox="0 0 16 16" className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M11.5 2.5l2 2L6 12l-2.5.5L4 10l7.5-7.5z" />
    </svg>
  ),
  published: (
    <svg viewBox="0 0 16 16" className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M3.5 8.5l3 3 6-6.5" />
    </svg>
  ),
}

/** 命中片段高亮（m4 FR-2.2 沿用 terms 的高亮口径）：按偏移切片包 <mark>，区间已由服务端合并去叠 */
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

const rangesOf = (matches: PlaybookMatch[], field: PlaybookMatch['field']): MatchRange[] =>
  matches.filter((m) => m.field === field).map((m) => ({ start: m.start, end: m.end }))

/**
 * 技巧表（DESIGN.md 内容面 = 书斋排印；四段 + 反例弱色）。
 * 四态：空 / 加载 / 错误由页面顶栏与本表的空态承担，超长内容在单元格内两行截断呈现——
 * 截断只发生在展示层，入库字节与渲染字节不受影响（m4 §6.8）。
 */
export function PlaybooksTable(props: {
  rows: PlaybookRowView[]
  selected: string[]
  loading: boolean
  error: string | null
  searching: boolean
  onToggle: (id: string) => void
  onSelectAll: (ids: string[]) => void
  onEdit: (playbook: PlaybookOut) => void
  onRetry?: () => void
}) {
  const { rows, selected, loading, error, searching, onToggle, onSelectAll, onEdit } = props
  const selectedSet = new Set(selected)
  const allShown = rows.length > 0 && rows.every((r) => selectedSet.has(r.playbook.id))

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-line-hair px-5 py-2 text-xs">
        <label className="flex items-center gap-1.5 text-ink-muted">
          <input
            type="checkbox"
            checked={allShown}
            onChange={() => onSelectAll(allShown ? [] : rows.map((r) => r.playbook.id))}
          />
          {zh.playbooks.selection.allShown}
        </label>
        <span className="tabular-nums text-ink-faint">
          {zh.playbooks.selection.label(selected.length)}
        </span>
        {selected.length > 0 && (
          <button
            className="text-ink-faint underline hover:text-ink-body"
            onClick={() => onSelectAll([])}
          >
            {zh.playbooks.selection.clear}
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {loading && <p className="p-6 text-sm text-ink-faint">{zh.common.loading}</p>}
        {!loading && error !== null && (
          <div className="space-y-2 p-6 text-sm text-danger">
            <p>{zh.common.failed(error)}</p>
            {props.onRetry && (
              <button
                className="rounded border border-danger-line px-2 py-1 text-xs text-danger"
                onClick={props.onRetry}
              >
                {zh.playbooks.retry}
              </button>
            )}
          </div>
        )}
        {!loading && error === null && rows.length === 0 && (
          <p className="p-6 text-sm text-ink-faint">
            {searching ? zh.playbooks.noResults : zh.playbooks.empty}
          </p>
        )}
        {rows.length > 0 && (
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-panel text-left text-xs text-ink-muted">
              <tr className="border-b border-line">
                <th className="w-8 px-5 py-2" />
                <th className="w-64 px-2 py-2">{zh.playbooks.columns.scenario}</th>
                <th className="w-72 px-2 py-2">{zh.playbooks.columns.problem}</th>
                <th className="px-2 py-2">{zh.playbooks.columns.practice}</th>
                <th className="w-64 px-2 py-2">{zh.playbooks.columns.antiPractice}</th>
                <th className="w-28 px-2 py-2">{zh.playbooks.columns.verified}</th>
                <th className="w-28 px-2 py-2">{zh.playbooks.columns.status}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ playbook, matches }) => (
                <tr
                  key={playbook.id}
                  className={`border-b border-line-hair align-top hover:bg-panel-2 ${
                    selectedSet.has(playbook.id) ? 'bg-accent-soft/40' : ''
                  }`}
                >
                  <td className="px-5 py-2.5">
                    <input
                      type="checkbox"
                      aria-label={playbook.scenario}
                      checked={selectedSet.has(playbook.id)}
                      onChange={() => onToggle(playbook.id)}
                    />
                  </td>
                  <td className="px-2 py-2.5">
                    <button
                      className="text-left text-[15px] font-semibold text-ink-body hover:text-accent"
                      onClick={() => onEdit(playbook)}
                    >
                      <Highlight text={playbook.scenario} ranges={rangesOf(matches, 'scenario')} />
                    </button>
                    {playbook.tags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {playbook.tags.map((t) => (
                          <span key={t} className={`${chipCls} border-line bg-panel-sunk text-ink-muted`}>
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-ink-body">
                    <Highlight text={playbook.problem} ranges={rangesOf(matches, 'problem')} />
                  </td>
                  <td className="px-2 py-2.5 text-ink-body">
                    <div className="line-clamp-3">
                      <Highlight text={playbook.practice} ranges={rangesOf(matches, 'practice')} />
                    </div>
                  </td>
                  {/* 反例弱色一档（DESIGN.md Components：反例不得与正确做法争视觉权重） */}
                  <td className="px-2 py-2.5 text-xs text-ink-muted">
                    {playbook.antiPractice === '' ? (
                      <span className="text-ink-faint">{zh.playbooks.antiPracticeNone}</span>
                    ) : (
                      <div className="line-clamp-3">
                        <Highlight
                          text={playbook.antiPractice}
                          ranges={rangesOf(matches, 'antiPractice')}
                        />
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2.5">
                    {/* 亲测有效用文字标注，不用颜色单义（m4 FR-4.3） */}
                    {playbook.verified ? (
                      <span className={`${chipCls} border-ok-line bg-ok-soft text-ok`}>
                        {zh.playbooks.verifiedMark}
                      </span>
                    ) : (
                      <span className="text-xs text-ink-faint">{zh.playbooks.unverifiedMark}</span>
                    )}
                  </td>
                  <td className="px-2 py-2.5">
                    <span className={`${chipCls} ${STATUS_STYLE[playbook.status]}`}>
                      {STATUS_ICON[playbook.status]}
                      {zh.playbooks.status[playbook.status]}
                    </span>
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
