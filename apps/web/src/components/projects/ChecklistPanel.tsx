import type { Stage } from '@openvibe/shared'
import { zh } from '../../i18n/zh'
import { cardBodyCls, cardCls, cardHeadCls, emptyHintCls, tagMonoCls } from '../ui/styles'

export interface OrphanStageState {
  stageName: string
  items: { itemId: string; checkedAt: string }[]
}

/** 阶段清单（m5 FR-3.2/3.3）：勾选即时保存；快照外的历史勾选单列不计数 */
export function ChecklistPanel(props: {
  stage: Stage | undefined
  stageProgress: (done: number, total: number) => string
  isChecked: (itemId: string) => boolean
  onToggle: (itemId: string, checked: boolean) => void
  busyItemId: string | null
  orphans: OrphanStageState[]
  projectProgressLine: string
}) {
  const { stage } = props
  return (
    <section className={cardCls}>
      <header className={cardHeadCls}>
        <h2 className="text-xs font-semibold text-ink-muted">{zh.projects.checklist.title}</h2>
        {stage !== undefined && (
          <span className="text-xs text-ink-muted">
            {props.stageProgress(
              stage.checklist.filter((c) => props.isChecked(c.id)).length,
              stage.checklist.length,
            )}
          </span>
        )}
        <span className="ml-auto text-[11px] text-ink-faint">{props.projectProgressLine}</span>
      </header>
      <div className={cardBodyCls}>
        {stage === undefined ? (
          <div className={emptyHintCls}>
            <p>{zh.projects.checklist.empty}</p>
          </div>
        ) : (
          <ul className="space-y-0.5">
            {stage.checklist.map((item) => {
              const on = props.isChecked(item.id)
              return (
                <li key={item.id}>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={on}
                      disabled={props.busyItemId === item.id}
                      onChange={(e) => props.onToggle(item.id, e.target.checked)}
                    />
                    <span className={on ? 'text-ink-faint line-through' : 'text-ink-body'}>
                      {item.text}
                    </span>
                    <span className={`${tagMonoCls} ml-auto shrink-0`}>{item.id}</span>
                  </label>
                </li>
              )
            })}
            {stage.checklist.length === 0 && (
              <li className="py-1 text-sm text-ink-faint">{zh.projects.checklist.empty}</li>
            )}
          </ul>
        )}

        {stage !== undefined && stage.artifacts.length > 0 && (
          <p className="mt-2 text-[11px] text-ink-muted">
            {zh.flows.editor.artifacts}: {stage.artifacts.join('、')}
          </p>
        )}

        {props.orphans.length > 0 && (
          <details className="mt-2 rounded-md border border-line-hair bg-panel-2 px-3 py-2">
            <summary className="cursor-pointer text-[11px] text-ink-muted">
              {zh.projects.checklist.removedStage}（{String(props.orphans.length)}）
            </summary>
            <p className="mt-1 text-[11px] text-ink-faint">{zh.projects.checklist.removedHint}</p>
            <ul className="mt-1 space-y-0.5 text-[11px] text-ink-muted">
              {props.orphans.map((o) => (
                <li key={o.stageName}>
                  {o.stageName}: {o.items.map((i) => i.itemId).join(', ')}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  )
}
