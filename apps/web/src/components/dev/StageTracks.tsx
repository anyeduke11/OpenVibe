import { useState } from 'react'
import { Icon } from '../ui/icons'
import { chipTone, noteCls, noteTitleCls } from '../ui/styles'
import { PROFILE_LABELS, type StageTrack } from '@openvibe/shared'

/**
 * M9 v1.6 **P1f.3 · 阶段 × 轨道视图**（`m9-dev-plan-2026-10.md` §6.7 · **DL-40**）。
 *
 * ## 它是什么
 *
 * §3.21 第 1 条：源文档的口径是「**评测工作的语言主线是 Python**（写 checker、跑评测框架、
 * 处理数据集），**Go 只在云原生 / 高性能 / 并发压测方向选学**」。
 * ⇒ ① 界面两门**不得再等权并排**，Go 侧必须带「选学」字样并写清适用方向；
 *   ② Go **默认收起**而不是并列展示。
 *
 * ## ⚠️ 「Go 默认收起」≠ 「把 Go 藏起来」
 *
 * ⚠️ **DL-14 本身不变**（两门数据都在、可筛选）—— 收起的只是**默认落点**，
 *   不是把 Go 从产品里拿掉。⇒ 收起的那一行**必须可点**（展开后能看到 Go 轨道与其要点）。
 *
 * ## ⚠️ 本阶段**没有** Go 轨道时，界面**不造一个空条目**
 *
 * 阶段 0/1 在源文档里**根本没有** Go 轨道（§3.21 第 2 条：那是**关于阶段的结论**）⇒
 * 界面**不渲染** Go 那一块 —— 造一个「本阶段无 Go 轨道」的空卡，
 * 等于把「没有这条轨道」说成「有一条可选轨道」。
 *
 * ## ⚠️ 阶段 2 的 Python 要**如实暴露缺口**
 *
 * 源文档那一格自相矛盾（`mode:"mas"` 却叫「熟悉 → 精通」）⇒ 界面显示**派生出的那一档**
 * （熟悉）**并把标注显示出来**，不把「熟悉 → 精通」当成第三档摆出来（§6.3 第 8 条）。
 */
const L = {
  pythonMain: '主线',
  goOptional: '选学',
  goDirection: '云原生 / 高性能 / 并发压测方向',
  expandGo: '展开 Go 选学',
  collapseGo: '收起 Go 选学',
  goTagline: 'Go 只在云原生 / 高性能 / 并发压测方向选学',
} as const

export interface StageTracksProps {
  /** 当前阶段（`null` = 还没进阶段） */
  stageId: number | null
  /** 该阶段的轨道行（`lang_stage_tracks`） */
  tracks: readonly StageTrack[]
}

export function StageTracks(props: StageTracksProps) {
  const { stageId, tracks } = props
  // ⚠️ Go **默认收起**（§3.21 第 1 条 ②）—— 收起的是默认落点，不是数据
  const [goOpen, setGoOpen] = useState(false)

  const rows = stageId === null ? [] : tracks.filter((t) => t.stage_id === stageId)
  const python = rows.find((t) => t.lang === 'python')
  const go = rows.find((t) => t.lang === 'go')

  if (python === undefined) {
    return (
      <section aria-label="阶段轨道">
        <p className="text-sm text-ink-muted">还没有选定阶段</p>
      </section>
    )
  }

  return (
    <section aria-label="阶段轨道">
      <div className="flex flex-col gap-2">
        <article
          aria-label="Python 轨道"
          className="rounded-md border border-line bg-panel px-3 py-2"
        >
          <header className="flex items-center gap-2">
            <strong className="text-sm">Python</strong>
            <span className={chipTone('accent')}>
              <Icon name="check" size={12} />
              {L.pythonMain}
            </span>
            <span className="text-xs text-ink-muted">{PROFILE_LABELS[python.profile]}</span>
          </header>
          {python.note !== null && (
            <div className={noteCls('warn')}>
              <strong className={noteTitleCls}>本阶段还需向精通推进</strong>
              {python.note}
            </div>
          )}
          <ul className="mt-1 flex flex-col gap-0.5 text-sm text-ink-body">
            {python.goals.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </article>

        {go !== undefined && (
          <article
            aria-label="Go 轨道"
            className="rounded-md border border-line bg-panel px-3 py-2"
          >
            <header className="flex items-center gap-2">
              <strong className="text-sm">Go</strong>
              <span className={chipTone('default')}>
                <Icon name="book" size={12} />
                {L.goOptional}
              </span>
              <span className="text-xs text-ink-muted">{PROFILE_LABELS[go.profile]}</span>
              <button
                type="button"
                className="ml-auto text-xs text-ink-muted underline"
                aria-expanded={goOpen}
                onClick={() => setGoOpen((v) => !v)}
              >
                {goOpen ? L.collapseGo : L.expandGo}
              </button>
            </header>
            {goOpen ? (
              <ul className="mt-1 flex flex-col gap-0.5 text-sm text-ink-body">
                {go.goals.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-ink-muted">{L.goTagline}</p>
            )}
          </article>
        )}
      </div>
    </section>
  )
}
