import { MasteryChip } from './MasteryChip'
import type { RoadmapStation } from '@openvibe/shared'

/**
 * M9 v1.6 **P3.2 · DAG 当前层**（`m9-dev-language-roadmap.md` §3.5 · dev-plan §6.9 P3.2）。
 *
 * ## 它是什么
 *
 * 主视图的**右半边**：当前站那一层的知识点，每条带**三态**。
 *
 * ## ⚠️ 空层不许空白
 *
 * DL-07 的同款纪律：空白会被读成「功能坏了」⇒ 零条时给一句说明（不是「暂无数据」，
 * 而是说清**为什么**是空的）。
 */
const L = {
  layer: (name: string) => `${name} · 当前层`,
  empty: '这一站还没有条目——先从上一站学起。',
  summary: (total: number, lit: number) => `共 ${String(total)} 条 · 已点亮 ${String(lit)} 条`,
} as const

export interface TopicLayerProps {
  /** 当前站（null = 还没选站） */
  station: RoadmapStation | null
  /** 选中的知识点 id */
  selectedTopicId: number | null
  onSelectTopic: (id: number) => void
}

export function TopicLayer({ station, selectedTopicId, onSelectTopic }: TopicLayerProps) {
  if (station === null) {
    return (
      <section aria-label="当前层" className="flex-1">
        <p className="text-sm text-ink-muted">{L.empty}</p>
      </section>
    )
  }
  let lit = 0
  for (const t of station.topics) if (t.state !== 'unused') lit += 1

  return (
    <section aria-label="当前层" className="flex min-w-0 flex-1 flex-col gap-2">
      <header className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-sm font-semibold text-ink">{L.layer(station.name)}</h2>
        <span className="text-[11.5px] text-ink-faint">
          {L.summary(station.topics.length, lit)}
        </span>
      </header>
      {station.topics.length === 0 ? (
        <p className="text-sm text-ink-muted">{L.empty}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {station.topics.map((t) => {
            const selected = t.id === selectedTopicId
            return (
              <li key={t.id}>
                <button
                  type="button"
                  aria-pressed={selected}
                  className={`flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left transition-colors ${
                    selected
                      ? 'border-accent-line bg-accent-soft'
                      : 'border-line bg-panel hover:border-line-strong'
                  }`}
                  onClick={() => onSelectTopic(t.id)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink">{t.title}</span>
                    {t.summary !== '' ? (
                      <span className="block truncate text-[11.5px] text-ink-faint">{t.summary}</span>
                    ) : null}
                  </span>
                  <MasteryChip state={t.state} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
