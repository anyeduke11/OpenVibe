import {
  DUAL_PLAN,
  DUAL_PLAN_HEADINGS,
  DUAL_PLAN_NOTES,
  type DualPlanSegment,
} from '@openvibe/shared'

/**
 * M9 v1.6 **P3.4 · 双修规划时间线**（`m9-dev-language-roadmap.md` §3.22.1 · dev-plan §6.9 P3.4）。
 *
 * ## 它是什么
 *
 * **9 段**（精通 5 ＋ 熟悉 4）的月度总进度时间线。
 *
 * ## ⚠️ 这是**第三套分段**，与前两套互不映射
 *
 * - 8 站（§3.6）＝ 知识点前置依赖；
 * - 分期路线（§3.17.1）＝ **单语言** × 模式的时间线（21 段）；
 * - 双修规划（本面板）＝ **两门交替**的月度总进度（9 段）。
 *
 * ⇒ 界面**不许**把它与另两套合成一个选择器（合成后用户会以为「选路线 A 就等于进阶段 0」）。
 *
 * ## ⚠️ 段内容**照抄**，不由分期路线推导
 *
 * §3.22.1：分期路线是「Python 精通 5 段 ＋ Go 精通 4 段」**并列**，
 * 双修规划是「先 Python 4 个月、再 Python 2 个月、再 Go 2 个月…」**串行交织** ——
 * 后者的「第 9–10 月 · Go 工程化与并发」在分期路线里对应「Go 精通阶段 2＋3 合并」，
 * **是一个段对两个段** ⇒ 推导规则得现编，而附件没给这条规则 ⇒ 照抄。
 */
const L = {
  master: '精通',
  familiar: '熟悉',
  no: (n: number) => `第 ${String(n)} 段`,
} as const

export interface DualPlanTimelineProps {
  /** 要显示哪套模式（默认两套都显示） */
  profiles?: readonly ('master' | 'familiar')[]
}

export function DualPlanTimeline({ profiles = ['master', 'familiar'] }: DualPlanTimelineProps) {
  const groups: ('master' | 'familiar')[] = profiles.filter(
    (p): p is 'master' | 'familiar' => p === 'master' || p === 'familiar',
  )
  return (
    <section aria-label="双修规划" className="flex flex-col gap-3">
      {groups.map((p) => {
        const segments: DualPlanSegment[] = DUAL_PLAN.filter((s) => s.profile === p)
        return (
          <div key={p} className="flex flex-col gap-1.5">
            <header className="flex flex-wrap items-baseline gap-2">
              <h3 className="text-sm font-semibold text-ink">{DUAL_PLAN_HEADINGS[p]}</h3>
              <span className="text-[11.5px] text-ink-faint">{L[p]}</span>
            </header>
            <p className="text-[13.5px] leading-[1.6] text-ink-muted">{DUAL_PLAN_NOTES[p]}</p>
            <ol className="flex flex-col gap-1.5">
              {segments.map((s) => (
                <li
                  key={`${s.profile}|${String(s.no)}`}
                  className="rounded-md border border-line bg-panel px-3 py-2"
                >
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-[11.5px] tabular-nums text-ink-faint">{L.no(s.no)}</span>
                    <span className="text-[11.5px] text-ink-faint">{s.period}</span>
                    <span className="text-sm text-ink">{s.title}</span>
                  </div>
                  <p className="mt-1 text-[13.5px] leading-[1.6] text-ink-body">{s.detail}</p>
                </li>
              ))}
            </ol>
          </div>
        )
      })}
    </section>
  )
}
