import { diffLines } from 'diff'
import { zh } from '../../i18n/zh'

/** 行级 diff（m1 FR-4.2：jsdiff diffLines + 行高亮） */
export function DiffViewer(props: { oldText: string; newText: string }) {
  const parts = diffLines(props.oldText, props.newText)
  return (
    <div className="mono overflow-auto rounded-md border border-line bg-panel-2 text-xs">
      <div className="border-b border-line bg-panel px-3 py-1.5 text-[11px] text-ink-muted">
        {zh.versions.compare}
      </div>
      {parts.map((part, index) => {
        const tone = part.added
          ? 'bg-ok-soft text-ok'
          : part.removed
            ? 'bg-danger-soft text-danger'
            : 'bg-panel text-ink-body'
        const sign = part.added ? '+' : part.removed ? '−' : ' '
        const lines = part.value.replace(/\n$/, '').split('\n')
        return (
          <div key={index} className={tone}>
            {lines.map((line, i) => (
              <div key={i} className="whitespace-pre-wrap px-3 leading-5">
                <span className="mr-2 select-none opacity-50">{sign}</span>
                {line === '' ? ' ' : line}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
