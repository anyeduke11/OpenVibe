import type { Stage } from '@openvibe/shared'
import { zh } from '../../i18n/zh'
import { Icon } from '../ui/icons'
import { chipTone } from '../ui/styles'

/** 阶段条（m5 FR-3.1）：按快照顺序展示，当前阶段高亮，全勾标 ✅ */
export function StageBar(props: {
  stages: Stage[]
  current: string | null
  doneCount: (stageName: string) => number
  onSwitch: (stageName: string) => void
}) {
  return (
    <ol className="flex flex-wrap items-stretch gap-1.5">
      {props.stages.map((stage, i) => {
        const total = stage.checklist.length
        const done = props.doneCount(stage.name)
        const allDone = total > 0 && done === total
        const isCurrent = props.current === stage.name
        return (
          <li key={stage.name}>
            <button
              type="button"
              onClick={() => props.onSwitch(stage.name)}
              aria-current={isCurrent ? 'step' : undefined}
              className={`flex h-full flex-col items-start gap-0.5 rounded-sm border px-2.5 py-1.5 text-left transition-colors ${
                isCurrent
                  ? 'border-accent-line bg-accent-soft text-accent-deep'
                  : 'border-line bg-panel text-ink-muted hover:border-line-strong'
              }`}
            >
              <span className="text-xs font-medium">
                {`${String(i + 1)}. ${stage.name}`}
                {/* 全勾用状态 chip 说，不用 ✅（emoji 不做设计元素，DESIGN.md Don'ts） */}
                {allDone && (
                  <span className={chipTone('ok')}>
                    <Icon name="check" size={10} />
                    {zh.projects.detail.stageAllDone}
                  </span>
                )}
              </span>
              <span className="text-[11px] text-ink-muted">
                {zh.projects.detail.progress(
                  total === 0 ? 0 : Math.round((done / total) * 100),
                  done,
                  total,
                )}
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}
