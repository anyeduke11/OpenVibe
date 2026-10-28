import { useState } from 'react'
import type { PlatformMark, PromptOut } from '@openvibe/shared'
import { lane } from '../../i18n/lane-assets'
import { zh } from '../../i18n/zh'
import type { PromptFilters } from '../../hooks/usePrompts'
import { AssetEmpty, AssetError, AssetNoResults, AssetSkeleton } from '../library/AssetStates'
import { Icon, type IconName } from '../ui/icons'
import {
  btnDanger,
  btnGhost,
  btnPrimary,
  btnSecondary,
  chipTone,
  rowCls,
  tagCls,
  tagMonoCls,
} from '../ui/styles'

/**
 * 状态 chip 归到六形制，且**恒为三通道**（图标 + 文字 + 颜色）。
 * 废止态不再另配灰阶：删除线已经把「不可用」说尽了，颜色若再单独变弱
 * 就成了颜色单义承载语义（DESIGN.md chip 纪律 ①）。
 */
const STATUS: Record<PromptOut['status'], { cls: string; icon: IconName }> = {
  draft: { cls: chipTone('default'), icon: 'doc' },
  active: { cls: chipTone('ok'), icon: 'check' },
  deprecated: { cls: `${chipTone('default')} line-through`, icon: 'alert' },
}

export function PromptList(props: {
  items: PromptOut[]
  total: number
  filters: PromptFilters
  loading: boolean
  error: string | null
  /** 当前是否有筛选条件在生效——决定空态给「新建」还是「清除筛选」 */
  filtered: boolean
  onClearFilters: () => void
  onRetry: () => void
  onCreate: () => void
  onEdit: (prompt: PromptOut) => void
  onCopy: (prompt: PromptOut) => void
  onDelete: (prompt: PromptOut) => void
  onPageChange: (page: number) => void
}) {
  const [openRow, setOpenRow] = useState<string | null>(null)
  const { items, total, filters } = props
  const pages = Math.max(1, Math.ceil(total / (filters.size ?? 20)))

  // 四态互斥且穷尽：加载 → 错误 → 无结果 → 空 → 列表
  const body = () => {
    if (props.loading) return <AssetSkeleton rows={7} />
    if (props.error !== null)
      return <AssetError message={props.error} onRetry={props.onRetry} retrying={false} />
    if (items.length === 0)
      return props.filtered ? (
        <AssetNoResults what="提示词" onClear={props.onClearFilters} />
      ) : (
        <AssetEmpty
          message={zh.library.empty}
          action={
            <button className={btnPrimary} onClick={props.onCreate}>
              <Icon name="plus" size={12} />
              {zh.library.newPrompt}
            </button>
          }
        />
      )
    return (
      <ul>
        {items.map((p) => {
          const status = STATUS[p.status]
          const open = openRow === p.id
          return (
            <li key={p.id} className={`${rowCls} group px-5 py-2`}>
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <button
                    className="block max-w-full truncate text-left text-sm font-medium text-ink-body transition-colors hover:text-accent"
                    onClick={() => props.onEdit(p)}
                  >
                    {p.title}
                  </button>
                  {p.description !== '' && (
                    <p className="mt-0.5 line-clamp-1 text-xs text-ink-muted">{p.description}</p>
                  )}
                  <div className="mt-1 flex items-center gap-1.5 overflow-hidden">
                    {/* chip = 状态（三通道） */}
                    <span className={`${status.cls} shrink-0 gap-1 whitespace-nowrap`}>
                      <Icon name={status.icon} size={11} />
                      {zh.library.status[p.status]}
                    </span>
                    {/* tag = 元信息（平台名 / 标签 / 变量 / 路径），纯文字无图标 */}
                    {p.platformMarks.map((m: PlatformMark) => (
                      <span key={m} className={`${tagMonoCls} shrink-0`}>
                        {m}
                      </span>
                    ))}
                    {p.tags.map((t) => (
                      <span key={t} className={`${tagCls} shrink-0`}>
                        #{t}
                      </span>
                    ))}
                    {p.variables.length > 0 && (
                      <span
                        className={`${tagMonoCls} shrink-0 border-warn-line bg-warn-soft text-warn`}
                      >
                        {`{{${p.variables.join(', ')}}}`}
                      </span>
                    )}
                    <span className="mono truncate text-[11px] text-ink-faint">{p.folderPath}</span>
                  </div>
                </div>

                {/* 行内动作：只露主操作「复制」，其余进「更多」（DESIGN.md 操作面密度） */}
                <div className="flex shrink-0 items-center gap-1">
                  <button className={btnGhost} onClick={() => props.onCopy(p)}>
                    <Icon name="copy" size={12} />
                    {zh.library.copy}
                  </button>
                  <button
                    className={btnGhost}
                    aria-expanded={open}
                    aria-label={open ? lane.row.fewer : lane.row.more}
                    onClick={() => setOpenRow(open ? null : p.id)}
                  >
                    <Icon name={open ? 'x' : 'list'} size={12} />
                    {open ? lane.row.fewer : lane.row.more}
                  </button>
                </div>
              </div>

              {open && (
                <div className="mt-1.5 flex items-center gap-1.5 border-t border-line-hair pt-1.5">
                  <span className="text-[11px] text-ink-muted">{zh.library.useAs[p.useAs]}</span>
                  <span className="ml-auto" />
                  <button className={btnSecondary} onClick={() => props.onEdit(p)}>
                    <Icon name="doc" size={12} />
                    {zh.library.edit}
                  </button>
                  <button className={btnDanger} onClick={() => props.onDelete(p)}>
                    <Icon name="trash" size={12} />
                    {zh.library.delete}
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-auto">{body()}</div>

      <div className="flex shrink-0 items-center justify-between border-t border-line-hair px-5 py-1.5 text-xs text-ink-muted">
        <span className="tabular-nums">{zh.library.total(total)}</span>
        <div className="flex items-center gap-2">
          <button
            className={btnGhost}
            disabled={filters.page <= 1}
            onClick={() => props.onPageChange(filters.page - 1)}
          >
            <Icon name="back" size={12} />
            {zh.library.prevPage}
          </button>
          <span className="tabular-nums">{zh.library.page(filters.page)}</span>
          <button
            className={btnGhost}
            disabled={filters.page >= pages}
            onClick={() => props.onPageChange(filters.page + 1)}
          >
            {zh.library.nextPage}
            <Icon name="fwd" size={12} />
          </button>
        </div>
      </div>
    </div>
  )
}
