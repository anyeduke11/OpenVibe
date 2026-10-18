import type { ReactNode } from 'react'
import type { MatchRange, TermMatch, TermOut } from '@openvibe/shared'
import { zh } from '../../i18n/zh'
import {
  AssetEmpty,
  AssetError,
  AssetNoResults,
  AssetSkeleton,
} from '../library/AssetStates'
import { Icon, type IconName } from '../ui/icons'
import { btnGhost, btnPrimary, chipTone, ledgerHeadCls, tagCls } from '../ui/styles'

export interface TermRowView {
  term: TermOut
  matches: TermMatch[]
}

/** 状态 = 三通道（图标 + 文字 + 颜色），颜色只是第三通道 */
const STATUS: Record<TermOut['status'], { cls: string; icon: IconName }> = {
  draft: { cls: chipTone('default'), icon: 'doc' },
  active: { cls: chipTone('ok'), icon: 'check' },
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
    nodes.push(
      <mark key={i} className="rounded-sm bg-warn-soft px-0.5 text-warn">
        {text.slice(r.start, r.end)}
      </mark>,
    )
    cursor = r.end
  })
  if (cursor < text.length) nodes.push(text.slice(cursor))
  return <>{nodes}</>
}

const rangesOf = (matches: TermMatch[], field: TermMatch['field']): MatchRange[] =>
  matches.filter((m) => m.field === field).map((m) => ({ start: m.start, end: m.end }))

/**
 * 词条台账表（DESIGN.md ledger-table）。
 * 四态齐：加载走骨架、错误给 note + 重试、无结果给「清除筛选」、真空给「新建词条」。
 */
export function TermsTable(props: {
  rows: TermRowView[]
  selected: string[]
  loading: boolean
  error: string | null
  searching: boolean
  filtered: boolean
  onClearFilters: () => void
  onRetry: () => void
  onCreate: () => void
  onToggle: (id: string) => void
  onSelectAll: (ids: string[]) => void
  onEdit: (term: TermOut) => void
  onDelete: (term: TermOut) => void
}) {
  const { rows, selected } = props
  const selectedSet = new Set(selected)
  const allShown = rows.length > 0 && rows.every((r) => selectedSet.has(r.term.id))

  const body = () => {
    if (props.loading) return <AssetSkeleton rows={8} />
    if (props.error !== null) return <AssetError message={props.error} onRetry={props.onRetry} />
    if (rows.length === 0)
      return props.filtered ? (
        <AssetNoResults what="词条" onClear={props.onClearFilters} />
      ) : (
        <AssetEmpty
          message={zh.terms.empty}
          action={
            <button className={btnPrimary} onClick={props.onCreate}>
              <Icon name="plus" size={12} />
              {zh.terms.newTerm}
            </button>
          }
        />
      )
    return (
      // `table-fixed`：默认 table-auto 会把定义列撑到内容宽度，把右侧状态/动作列压到
      // 中文逐字竖排。固定后「定义」是唯一弹性列，长文本由 line-clamp 兜住（见下）。
      <table className="w-full table-fixed border-collapse text-sm">
        <thead className={`sticky top-0 z-10 bg-panel text-left ${ledgerHeadCls}`}>
          <tr className="border-b border-line">
            <th className="w-8 px-5 py-1.5" />
            <th className="w-48 px-2 py-1.5">{zh.terms.columns.zh}</th>
            <th className="w-36 px-2 py-1.5">{zh.terms.columns.en}</th>
            <th className="w-40 px-2 py-1.5">{zh.terms.columns.aliases}</th>
            <th className="px-2 py-1.5">{zh.terms.columns.definition}</th>
            {/* 台账表的最后一列是动作，不占固定宽——动作区随内容收缩 */}
            <th className="w-64 px-2 py-1.5">{zh.library.filters.status}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ term, matches }) => {
            const status = STATUS[term.status]
            return (
              <tr
                key={term.id}
                className={`border-b border-line-hair align-top hover:bg-panel-2 ${
                  selectedSet.has(term.id) ? 'bg-accent-soft' : ''
                }`}
              >
                <td className="px-5 py-2">
                  <input
                    type="checkbox"
                    aria-label={term.zh ?? term.en}
                    checked={selectedSet.has(term.id)}
                    onChange={() => props.onToggle(term.id)}
                  />
                </td>
                {/* 头词 16px/600（DESIGN.md term-row，无 ruby 注音展示） */}
                <td className="px-2 py-2">
                  <button
                    className="text-left text-[16px] font-semibold leading-tight text-ink-body transition-colors hover:text-accent"
                    onClick={() => props.onEdit(term)}
                  >
                    <Highlight text={term.zh ?? '—'} ranges={rangesOf(matches, 'zh')} />
                  </button>
                  {term.tags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {term.tags.map((t) => (
                        <span key={t} className={tagCls}>
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-2 py-2 text-ink-muted">
                  <Highlight text={term.en ?? '—'} ranges={rangesOf(matches, 'en')} />
                </td>
                <td className="px-2 py-2 text-ink-muted">
                  <Highlight
                    text={term.aliases.join('、')}
                    ranges={rangesOf(matches, 'aliases')}
                  />
                </td>
                {/* 定义 13.5px/1.65，两行截断；超长内容因此不撑破列宽 */}
                <td className="px-2 py-2 text-[13.5px] leading-[1.65] text-ink-muted">
                  <span className="line-clamp-2">
                    <Highlight text={term.definition} ranges={rangesOf(matches, 'definition')} />
                  </span>
                  {term.example !== '' && (
                    <span className="mt-0.5 line-clamp-1 text-[11px] text-ink-faint">
                      例：{term.example}
                    </span>
                  )}
                </td>
                <td className="px-2 py-2">
                  <div className="flex items-center gap-1">
                    <span className={`${status.cls} shrink-0 gap-1 whitespace-nowrap`}>
                      <Icon name={status.icon} size={11} />
                      {zh.terms.status[term.status]}
                    </span>
                    {/* 来源是元信息不是状态 → tag，不是 chip */}
                    <span className={`${tagCls} shrink-0 whitespace-nowrap`}>
                      {term.source === 'openvibe-seed' ? zh.terms.source.seed : zh.terms.source.manual}
                    </span>
                    <span className="ml-auto flex shrink-0 items-center gap-1">
                      <button className={`${btnGhost} shrink-0 whitespace-nowrap px-2`} onClick={() => props.onEdit(term)}>
                        {zh.library.edit}
                      </button>
                      <button
                        className={`${btnGhost} shrink-0 px-2`}
                        aria-label={`${zh.library.delete} ${term.zh ?? term.en ?? term.id}`}
                        onClick={() => props.onDelete(term)}
                      >
                        <Icon name="trash" size={12} />
                      </button>
                    </span>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-line-hair px-5 py-1.5 text-xs">
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
          <button
            className="text-accent underline underline-offset-2 hover:text-accent-deep"
            onClick={() => props.onSelectAll([])}
          >
            {zh.terms.selection.clear}
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">{body()}</div>
    </div>
  )
}
