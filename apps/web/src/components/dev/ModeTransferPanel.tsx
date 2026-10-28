import { useId } from 'react'
import { Dialog, DialogPanel, DialogTrigger } from '../ui/Dialog'
import { Icon } from '../ui/icons'
import { btnGhost, btnPrimary, noteCls, noteTitleCls } from '../ui/styles'
import type { TransferPlan } from '@openvibe/shared'

/**
 * M9 v1.6 **P1e.1 · 速成转档弹层**（`m9-dev-plan-2026-10.md` §6.6 · **DL-37**）。
 *
 * ## 它是什么
 *
 * 速成专区**底部**的一行「这些学够了，下一步 →」。点了**不切模式**，
 * 而是弹出一条**分叉路线**，只讲两件事（§3.18）：
 *
 * 1. **你已经站在哪** —— 已点亮的速成必学逐条映射到精通路线的站位；
 * 2. **还差多少** —— 精通路线还剩几站。
 *
 * ## ⚠️ 转档**只给位置，不给结论**（§3.18 的核心纪律）
 *
 * 点亮一条速成必学 **≠** 完成那一站 —— 精通路线在那一站还要更多条目、更深的 `depth`。
 * ⇒ 文案只能写「**你已经站到第 N 站之前**」，**不许写「你已完成第 N 站」**。
 * ⇒ 本组件的文案常量里**没有**「已完成」三个字，且单测按渲染结果断这一点。
 *
 * ## ⚠️ 一条都没点亮时不许空白或 0
 *
 * §3.18：一条都没点亮时，文案必须回到「精通路线完整 N 站，从第 1 站开始」，
 * **不许显示空白或 0**（与 DL-07、DL-35 同款：空白会被读成「功能坏了」）。
 *
 * ## ⚠️ 映射是查表，不是维护
 *
 * 站位直接取 `lang_topics.stage_id`（**不新建表、不新建映射表**）——
 * 一张「速成→精通对照表」等着人手工维护，而手工维护的对照表第一个月就会和知识点改动脱节。
 * ⇒ 本组件**只收** `computeTransferPlan` 算好的 `plan`，自己不查库、不维护对照。
 *
 * ## ⚠️ 文案不进 i18n
 *
 * `i18n/zh.ts` 正被并行会话改动，往里加键必然混稿 ⇒ 文案就地定义在 `L` 里
 * （与 `TermFilterBar` 同惯例）。
 */
const L = {
  trigger: '这些学够了，下一步 →',
  title: '接下来往哪儿走',
  /** 「你的 6 条速成必学落在第 1–2 站」 */
  litRange: (n: number, from: number, to: number): string =>
    `你的 ${n} 条速成必学落在第 ${from}–${to} 站`,
  /** ⚠️ 只给位置，不给结论 */
  position: (from: number): string => `你已经站到第 ${from} 站之前`,
  remaining: (k: number): string => `精通路线还剩 ${k} 站`,
  /** 一条都没点亮时的回落文案（不许空白、不许 0） */
  empty: (m: number): string => `精通路线完整 ${m} 站，从第 1 站开始`,
  reminderTitle: '两件事不是同一件事的多少之差',
  reminder: '速成是看懂并能提问，精通是能独立写出 —— 两者不是同一件事的多少之差。',
  goMaster: '看看精通路线',
} as const

export interface ModeTransferPanelProps {
  /** 当前语言（决定「精通路线」指哪一门） */
  lang: 'python' | 'go'
  /** 转档计划 —— 由 `@openvibe/shared` 的 `computeTransferPlan` 算出，本组件不重算 */
  plan: TransferPlan
  /** 「看看精通路线」的落点（P3 接页面跳转；不给就不渲染那颗按钮） */
  onGoMaster?: () => void
}

/**
 * 速成转档弹层。
 *
 * @param props 见 {@link ModeTransferPanelProps}
 */
export function ModeTransferPanel(props: ModeTransferPanelProps) {
  const { lang, plan, onGoMaster } = props
  const bodyId = useId()
  const lit = plan.litRequiredCount > 0

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" className={btnGhost} aria-describedby={bodyId}>
          <Icon name="fwd" size={14} />
          {L.trigger}
        </button>
      </DialogTrigger>
      <DialogPanel
        title={L.title}
        footer={
          onGoMaster === undefined ? undefined : (
            <button type="button" className={btnPrimary} onClick={onGoMaster}>
              {L.goMaster}
            </button>
          )
        }
      >
        <div id={bodyId} className="flex flex-col gap-2 text-sm">
          {lit ? (
            <>
              <p>{L.litRange(plan.litRequiredCount, plan.stationFrom!, plan.stationTo!)}</p>
              <p>{L.position(plan.stationFrom!)}</p>
            </>
          ) : (
            <p>{L.empty(plan.totalStations)}</p>
          )}
          <p>{L.remaining(plan.remainingStations)}</p>
          <div className={noteCls('info')}>
            <strong className={noteTitleCls}>{L.reminderTitle}</strong>
            {L.reminder}
          </div>
          {/* 语言名只做一次定位用（两门并行时读者需要知道说的是哪门） */}
          <p className="text-xs text-ink-muted">{lang === 'python' ? 'Python' : 'Go'}</p>
        </div>
      </DialogPanel>
    </Dialog>
  )
}
