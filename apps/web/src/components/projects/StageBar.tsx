import type { Stage } from '@openvibe/shared'
import { zh } from '../../i18n/zh'

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
              className={`flex h-full flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left transition-colors ${
                isCurrent
                  ? 'border-brand bg-brand-soft text-brand'
                  : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300'
              }`}
            >
              <span className="text-xs font-medium">
                {String(i + 1)}. {stage.name} {allDone && zh.projects.detail.stageAllDone}
              </span>
              <span className="text-[11px] opacity-80">
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
