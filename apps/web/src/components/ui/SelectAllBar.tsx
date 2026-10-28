/**
 * 台账表的全选条：全选框 + 已选计数 + 条件出现的「清空选择」。
 *
 * 词条表与技巧表此前各写一份，结构与文案键完全一致（`zh.*.selection`），
 * 差别只在 id 取值，故把差异留在调用点的 `onToggleAll` 里。
 */
export function SelectAllBar(props: {
  allShown: boolean
  count: number
  text: { allShown: string; label: (n: number) => string; clear: string }
  onToggleAll: () => void
  onClear: () => void
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-line-hair px-5 py-1.5 text-xs">
      <label className="flex items-center gap-1.5 text-ink-muted">
        <input type="checkbox" checked={props.allShown} onChange={props.onToggleAll} />
        {props.text.allShown}
      </label>
      <span className="tabular-nums text-ink-faint">{props.text.label(props.count)}</span>
      {props.count > 0 && (
        <button
          className="text-accent underline underline-offset-2 hover:text-accent-deep"
          onClick={props.onClear}
        >
          {props.text.clear}
        </button>
      )}
    </div>
  )
}
