import type { ReactNode } from 'react'
import { zh } from '../../i18n/zh'
import { SelectAllBar } from './SelectAllBar'
import { Icon } from './icons'
import { btnGhost } from './styles'

/**
 * 台账表的骨架件：外层「全选条 + 滚动区」两件套，词条表与技巧表共用。
 *
 * 两张表此前各写一份，结构与文案键完全一致；差异只有 `text`（`zh.*.selection`）
 * 与全选时取哪种 id，都留在调用点。
 */
export function LedgerShell(props: {
  allShown: boolean
  count: number
  text: { allShown: string; label: (n: number) => string; clear: string }
  onToggleAll: () => void
  onClear: () => void
  children: ReactNode
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SelectAllBar
        allShown={props.allShown}
        count={props.count}
        text={props.text}
        onToggleAll={props.onToggleAll}
        onClear={props.onClear}
      />
      <div className="min-h-0 flex-1 overflow-auto">{props.children}</div>
    </div>
  )
}

/**
 * 台账行尾的「编辑 + 删除」—— 词条表与技巧表共用。
 *
 * `label` 只进删除按钮的无障碍名：每行都有「删除」，读屏必须能分辨删的是哪一行。
 */
export function RowActions(props: { label: string; onEdit: () => void; onDelete: () => void }) {
  return (
    <span className="ml-auto flex shrink-0 items-center gap-1">
      <button className={`${btnGhost} shrink-0 whitespace-nowrap px-2`} onClick={props.onEdit}>
        {zh.library.edit}
      </button>
      <button
        className={`${btnGhost} shrink-0 px-2`}
        aria-label={`${zh.library.delete} ${props.label}`}
        onClick={props.onDelete}
      >
        <Icon name="trash" size={12} />
      </button>
    </span>
  )
}
