import { CompletenessMark } from './CompletenessMark'
import { Icon } from '../ui/icons'
import { chipTone } from '../ui/styles'
import type { RoadmapStation } from '@openvibe/shared'

/**
 * M9 v1.6 **P3.2 · 站列**（`m9-dev-language-roadmap.md` §3.5 · dev-plan §6.9 P3.2）。
 *
 * ## 它是什么
 *
 * 主视图的**左半边**：竖排的站（§3.6 的八站），每站带**完整度标记**。
 * 右半边是**当前层**（DAG 的一层，见 `TopicLayer`）。
 *
 * ## ⚠️ 站号从 1 起
 *
 * 库里 `stage_id` 是 0 起、界面上是「第 N 站」⇒ 换算只在 `stageNoOf` 一处。
 *
 * ## ⚠️ 站名来自**库**（`lang_topics.stage_id` 对应的站名），不在本文件写死
 *
 * 站名是**关于阶段的结论**（DL-40 的同款纪律）⇒ 组件不维护第二份站名表。
 */
const L = {
  station: (n: number) => `第 ${String(n)} 站`,
  current: '当前',
} as const

export interface StageColumnProps {
  stations: readonly RoadmapStation[]
  /** 当前站（**1 起**） */
  currentStage: number
  /** 当前选中的站（**1 起**；null = 没选） */
  selectedStage: number | null
  onSelect: (stageNo: number) => void
}

export function StageColumn(props: StageColumnProps) {
  const { stations, currentStage, selectedStage, onSelect } = props
  return (
    <nav aria-label="学习路线站列" className="flex w-[168px] shrink-0 flex-col gap-1">
      {stations.map((s) => {
        const isCurrent = s.stage_no === currentStage
        const isSelected = s.stage_no === selectedStage
        return (
          <button
            key={s.stage_id}
            type="button"
            aria-current={isCurrent ? 'true' : undefined}
            className={`flex flex-col gap-1 rounded-md border px-2.5 py-2 text-left transition-colors ${
              isSelected
                ? 'border-accent-line bg-accent-soft'
                : 'border-line bg-panel hover:border-line-strong'
            }`}
            onClick={() => onSelect(s.stage_no)}
          >
            <span className="flex items-center gap-1.5">
              <span className="text-[11.5px] text-ink-faint">{L.station(s.stage_no)}</span>
              {isCurrent ? (
                <span className={chipTone('accent')}>
                  <Icon name="target" size={11} />
                  {L.current}
                </span>
              ) : null}
            </span>
            <span className="text-sm text-ink">{s.name}</span>
            <CompletenessMark station={s} />
          </button>
        )
      })}
    </nav>
  )
}
