import { useState, type ReactNode } from 'react'
import { btnGhost, btnPrimary, btnSecondary, h1SubCls } from '../ui/styles'
import { modeEntryPlan, type ModeChoice } from '@openvibe/shared'

/**
 * M9 v1.6 **P1e.2 · 首次进入的一次性提问**（`m9-dev-plan-2026-10.md` §6.6 · **DL-38**）。
 *
 * ## 它是什么
 *
 * §3.19 的形态：**一个问题、两个选项、一个出口**。
 * ⚠️ 「首个界面不许被做成问卷」—— 问多了就把「我不知道该选哪个」的人挡在门外。
 *
 * | 选项 | 答后行为 |
 * |---|---|
 * | 速成（唯一主动作） | 落到速成；精通/熟悉**在首屏折叠成一行**「以后要深入再来」 |
 * | 以后要深入再来（折叠行） | 展示两门语言的精通路线对比，**不折叠** |
 * | **「跳过，按默认走」** | 与选速成**逐字一致**（判据 DL-38 断这条） |
 *
 * ## ⚠️ 为什么「跳过」与「速成」是**同一个代码入口**
 *
 * §3.19 第 3 条 + v1.3 的设计原话：「**跳过与选速成走同一个代码入口**，
 * 让 DL-38 的『渲染逐字相同』成为结构上必然」。
 * ⇒ 本组件**只有一个出口** `onAnswer(choice)`，跳过与速成都调 `choose('vibe')`。
 *   若将来有人给「跳过」另开一个分支，DL-38 的快照比对会立刻红。
 *
 * ## ⚠️ 作答**不落 `lang_*`**
 *
 * §3.19 第 3 条：选项属用户偏好，**不得写进 `lang_topic_state`，也不得进
 * `lang_profiles` 派生任何状态**。理由与 DL-34 同源：一旦模式选择能影响状态，
 * 速成就又变成「更容易点亮」的路径，§2.2 拒绝的自评清单从后门回来了。
 * ⇒ `onAnswer` 的载荷只有 `'vibe' | 'master'` 两个字符串，**没有任何知识点 id**。
 *
 * ## ⚠️ 折叠的那一行**必须一直可点**
 *
 * §3.19 第 4 条：若用户答了速成、半年后想深入，**不能因为「首屏折叠」就找不到精通**。
 * 这是答错时的唯一兜底，藏起来等于没有兜底。
 * ⇒ 折叠行在提问屏与速成落点屏**都在**，都是可点的按钮。
 *
 * ## ⚠️ 文案不进 i18n
 *
 * `i18n/zh.ts` 正被并行会话改动 ⇒ 文案就地定义在 `L` 里（与 `TermFilterBar` 同惯例）。
 */
const L = {
  question: '这套指南你打算怎么用',
  /** 唯一主动作（§3.19 表第一行） */
  vibeOption: '直接带着 AI 写项目，我只需要看懂它在写什么',
  /** 折叠行 —— 精通/熟悉的首屏入口，必须常驻可点 */
  collapsedDeepModes: '以后要深入再来',
  /** 出口（必需项，不是可选项） */
  skip: '跳过，按默认走',
  vibeLandingNote: '默认按速成走：看懂并能提问。',
  masterLandingTitle: '两门语言的精通路线',
  routeLine: (lang: string, master: number, familiar: number): string =>
    `${lang} · 精通 ${master} 站 · 熟悉 ${familiar} 站`,
} as const

/** 两种落点（§3.19 只有这两个：答速成 / 答系统学；「跳过」归速成）。 */
export type { ModeChoice }

/** 一门语言的路线概览（答「系统学」时展示，不折叠）。 */
export interface ModeRouteSummary {
  lang: 'python' | 'go'
  /** 精通路线站数 */
  masterStations: number
  /** 熟悉路线站数 */
  familiarStations: number
}

export interface ModeOnboardingProps {
  /** 已持久化的回答（`null` = 首次进入 ⇒ 提问屏）。§3.19 第 1 条：只问一次。 */
  initialAnswer?: ModeChoice | null
  /** **唯一**的作答出口 —— 跳过与速成都走它 */
  onAnswer: (choice: ModeChoice) => void
  /** 精通路线对比（答「以后要深入再来」时展示） */
  masterRoutes?: readonly ModeRouteSummary[]
  /** 速成落点页的内容（P3 接真实页面；本组件只管模式选择 chrome） */
  children?: ReactNode
}

/**
 * 首次进入的一次性提问。
 *
 * @param props 见 {@link ModeOnboardingProps}
 */
export function ModeOnboarding(props: ModeOnboardingProps) {
  const { initialAnswer = null, onAnswer, masterRoutes = [], children } = props
  const [choice, setChoice] = useState<ModeChoice | null>(initialAnswer)
  // ⚠️ **入口形态由 shared 的 `modeEntryPlan` 说了算**（折叠纪律的单一出处）：
  //   「折叠」与「隐藏」是两件事 —— 折叠是收成一行、那一行一直可点；
  //   隐藏是把精通/熟悉整段拿掉 ⇒ 半年后想深入的用户找不到入口（§3.19 第 4 条）。
  const entry = modeEntryPlan(choice)

  const choose = (c: ModeChoice): void => {
    setChoice(c)
    onAnswer(c)
  }

  // ⚠️ 「跳过，按默认走」与速成**共用这一个入口** ⇒ 渲染逐字相同是结构上必然（DL-38）
  const chooseVibe = (): void => choose('vibe')

  if (entry.showMasterRoutes) {
    return (
      <section aria-label="精通路线对比">
        <h2 className="text-base font-semibold">{L.masterLandingTitle}</h2>
        <ul className="flex flex-col gap-1 text-sm">
          {masterRoutes.map((r) => (
            <li key={r.lang}>
              {L.routeLine(
                r.lang === 'python' ? 'Python' : 'Go',
                r.masterStations,
                r.familiarStations,
              )}
            </li>
          ))}
        </ul>
      </section>
    )
  }

  if (choice === null) {
    return (
      <section aria-label="模式选择">
        <h2 className="text-base font-semibold">{L.question}</h2>
        {/* 唯一主动作 —— 主问题问的就是「怎么用」，默认答案是速成 */}
        <button type="button" className={btnPrimary} onClick={chooseVibe}>
          {L.vibeOption}
        </button>
        {/* 精通/熟悉**折叠成一行**（不是两张卡，也不是隐藏） */}
        {entry.collapsedDeepModes && (
          <button type="button" className={btnSecondary} onClick={() => choose('master')}>
            {L.collapsedDeepModes}
          </button>
        )}
        {/* 出口：必需项。走的是与速成同一个入口 */}
        <button type="button" className={btnGhost} onClick={chooseVibe}>
          {L.skip}
        </button>
      </section>
    )
  }

  return (
    <section aria-label="速成模式">
      {children}
      <p className={h1SubCls}>{L.vibeLandingNote}</p>
      {/* 折叠行在速成落点屏**仍然常驻可点**（§3.19 第 4 条） */}
      {entry.collapsedDeepModes && (
        <button type="button" className={btnSecondary} onClick={() => choose('master')}>
          {L.collapsedDeepModes}
        </button>
      )}
    </section>
  )
}
