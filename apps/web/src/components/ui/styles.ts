// Tailwind 类组合的单一出处（dev-plan §5.5）。
// 视觉口径单源是 DESIGN.md「暖纸 · 可读性工作台（V2）」的 Components 段；
// 本文件是那段的**代码实现**，两者逐条对应，改一处必须同批改另一处。
//
// 一条纪律贯穿全站：**颜色只走语义 token**（accent / ok / warn / danger / info + 各自的
// -soft / -line 配对），调用点不得写字面色阶——`tests/design-tokens.test.ts` 四道闸钉住这件事。
// 形制名（左列）对应 DESIGN.md 的组件名（右列注释），改组件名时两处一起改。

export const btnBase =
  'inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm transition-colors ' +
  // focus-visible 2px accent outline + 2px offset（DESIGN.md button-primary；
  // 用 focus-visible 而非 focus，鼠标点击不该留下环）
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ' +
  // disabled 40%（DESIGN.md 写死 40%，不是 50%——50% 在暖纸底上仍读得出「可点」）
  'disabled:cursor-not-allowed disabled:opacity-40'

// 强调动作只给「使生效」类（注入/应用/保存/确认）；ok 退居状态位（一致/通过/监听）。
export const btnPrimary = `${btnBase} border-accent bg-accent text-on-accent shadow-1 hover:bg-accent-deep`
export const btnSecondary = `${btnBase} border-line-strong bg-panel text-ink-body hover:border-ink-muted hover:bg-panel-2`
export const btnGhost = `${btnBase} border-line bg-panel text-ink-body hover:border-line-strong hover:bg-panel-2`
// 危险动作与强调互斥（DESIGN.md Components）：danger-soft 底 + danger-line 描边 + danger 字，
// hover 转实心 + 调用点二次确认并给出影响范围。
export const btnDanger = `${btnBase} border-danger-line bg-danger-soft text-danger hover:bg-danger hover:text-panel`

export const inputCls =
  'w-full rounded-sm border border-line-strong bg-panel px-3 py-1.5 text-sm ' +
  'focus:border-accent focus:outline-none ' +
  // 全站唯一允许的光晕：同色相低透明的 accent-soft，3px（DESIGN.md input/field）
  'focus:ring-[3px] focus:ring-accent-soft ' +
  'focus-visible:outline-none'

export const labelCls = 'mb-1 block text-xs font-medium text-ink-muted'

/** chip 基座：full 圆角 + 11px/1.7 行高（DESIGN.md chip） */
export const chipCls =
  'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] leading-[1.7]'

/**
 * chip 六形制（DESIGN.md chip）。每形制都是「soft 底 + 同色系 line + 同色系 solid 字」三件套。
 * 纪律两条：① 永远配图标 + 文字，不靠颜色单义承载语义；② 可按压的筛选 chip 用 `aria-pressed`，
 * 选中态走 `chipAccentPressed` 而不是本表的某一形。
 */
export const CHIP_TONES = {
  default: 'border-line bg-panel-sunk text-ink-muted',
  accent: 'border-accent-line bg-accent-soft text-accent-deep',
  ok: 'border-ok-line bg-ok-soft text-ok',
  warn: 'border-warn-line bg-warn-soft text-warn',
  danger: 'border-danger-line bg-danger-soft text-danger',
  info: 'border-info-line bg-info-soft text-info',
} as const
export type ChipTone = keyof typeof CHIP_TONES

export const chipTone = (tone: ChipTone): string => `${chipCls} ${CHIP_TONES[tone]}`

/** 可按压的筛选 chip 的选中态（DESIGN.md chip 第二句） */
export const chipPressed = 'border-accent-line bg-accent-soft text-accent-deep'

/**
 * 可按压筛选 chip 的三元：选中态 `chipPressed`，未选中 default 形制。
 *
 * ⚠️ chipCls 与两种形制各自带 border / bg / text 三个色类，叠加只会让 Tailwind 任意挑一个
 * 生效（顺序不由源码决定），所以在**形制层**择一，三元不散进 JSX。
 */
export const toggleChip = (on: boolean): string =>
  `${chipCls} shrink-0 transition-colors ${on ? chipPressed : `${CHIP_TONES.default} hover:bg-panel`}`

/**
 * **筛选 chip**（M9 资源页 · owner 2026-10-22 的「支持筛选」）。
 *
 * ⚠️ **为什么单独两个而不是直接用 `chipCls`**：筛选 chip 是**可按压的**
 * （DESIGN.md：可按压的筛选 chip 用 `aria-pressed`，选中态转 `accent-soft` ＋ `accent-deep`），
 * 而 `chipCls` 是**状态 chip**（图标 ＋ 文字 ＋ 颜色三通道）⇒ 两者形状不同、职责不同。
 *
 * ⚠️ **类组合只此一处**：调用点不许再拼一遍圆角/描边/字号
 * （拼一遍就等于多一份口径 ⇒ 两处会漂）。
 */
export const filterChipCls =
  'rounded-full border border-line px-2.5 py-1 text-[12px] text-ink-muted'
export const filterChipActiveCls = `${filterChipCls} ${chipPressed}`

/**
 * note 四态（DESIGN.md note）：`*-soft` 底 + `*-line` 描边 + 加粗标题行 + `ink-body` 正文。
 * 与 chip 的分工：note 承载成段说明，chip 承载单点状态。
 */
export const NOTE_TONES = {
  info: 'border-info-line bg-info-soft',
  ok: 'border-ok-line bg-ok-soft',
  warn: 'border-warn-line bg-warn-soft',
  danger: 'border-danger-line bg-danger-soft',
} as const
export type NoteTone = keyof typeof NOTE_TONES

export const noteCls = (tone: NoteTone): string =>
  `rounded-md border px-3 py-2 text-sm ${NOTE_TONES[tone]}`

export const noteTitleCls = 'mb-0.5 block text-xs font-bold'

/** empty-hint：`line-strong` 虚线框 + 一句话 + 一个下一步 CTA（DESIGN.md 明确不是「暂无数据」） */
export const emptyHintCls =
  'flex flex-col items-start gap-2 rounded-md border border-dashed border-line-strong px-4 py-6 text-sm text-ink-faint'

/** 行列表行（DESIGN.md rows）：hover panel-2 + aria-selected 转 accent-soft，长文本两行截断 */
export const rowCls =
  'border-b border-line-hair hover:bg-panel-2 aria-selected:bg-accent-soft aria-selected:text-accent-deep'

/** 表头（DESIGN.md ledger-table）：11.5px ink-faint + line 底线；数字列配 tabular-nums 右对齐 */
export const ledgerHeadCls = 'text-[11.5px] text-ink-faint'
export const ledgerNumCls = 'tabular-nums text-right'

/**
 * tag = 元信息标签，chip = 状态。
 *
 * 为什么要分两个（DEMO 收口轮的实测结论）：DESIGN.md 要求 chip 恒为「图标 + 文字 + 颜色」
 * 三通道，因为 chip 在这套设计里**承载状态**。但清单一数，有 39 处 chip 装的是
 * `v5`、`pkg@ver`、平台名、变量名这类**没有状态语义**的元信息——硬塞图标只会变噪音。
 * 于是：`.chip` 收窄为状态（永远图标+文字），元信息走 `.tag`（纯文字、无状态语气）。
 * 这条不变量由 QA 断言钉住，不是靠自觉。
 */
export const tagCls =
  'inline-flex max-w-full items-center gap-1 rounded-sm border border-line-hair bg-panel-2 px-2 py-px ' +
  'text-[11.5px] leading-[1.7] text-ink-muted'
export const tagMonoCls = `${tagCls} mono text-[11.5px]`
export const tagTone = (tone: 'accent' | 'ok' | 'warn' | 'danger' | 'info'): string =>
  `${tagCls} ${
    {
      accent: 'border-accent-line bg-accent-soft text-accent-deep',
      ok: 'border-ok-line bg-ok-soft text-ok',
      warn: 'border-warn-line bg-warn-soft text-warn',
      danger: 'border-danger-line bg-danger-soft text-danger',
      info: 'border-info-line bg-info-soft text-info',
    }[tone]
  }`

/** 卡片：panel 底 + line 描边 + 10px 圆角 + 极轻暖影（DESIGN.md card / Elevation） */
export const cardCls = 'rounded-md border border-line bg-panel shadow-1'
export const cardHeadCls =
  'flex min-h-11 items-center gap-2.5 border-b border-line-hair px-3.5 py-2.5'
export const cardBodyCls = 'px-3.5 py-3'
export const cardFootCls = 'flex items-center gap-2 border-t border-line-hair px-3.5 py-2.5'

/**
 * 统计卡（DESIGN.md stat）：键 12px ink-faint / 值 27px 600 ink tabular-nums / 注 12px ink-muted。
 * `hero` 变体给北极星那一格——强调底只此一处。
 */
export const statCls = `${cardCls} px-3.5 py-3`
export const statHeroCls = `${statCls} border-accent-line bg-accent-soft`

/** 进度条 6px：line-hair 槽 + accent 实心段；超阈转 warn（只提示不阻断） */
export const meterCls = 'h-1.5 overflow-hidden rounded-full bg-line-hair'
export const meterFillCls = 'block h-full min-w-[3px] rounded-full bg-accent'

/**
 * segmented tabs（DESIGN.md tabs）：**段数由数据给**。
 * 注入冲突处置用它——DRIFT 三档（以包为准/保留本地/跳过）、CONFLICT 两档（以包为准/跳过，
 * 本包从未拥有该文件，「保留本地」无从成立）。不要硬写三档，取数见 core/inject/planner.ts。
 */
export const segCls = 'inline-flex gap-0.5 rounded-sm border border-line bg-panel-2 p-0.5'
export const segItemCls =
  'inline-flex items-center gap-1 rounded-[4px] px-2.5 py-1 text-xs transition-colors ' +
  'text-ink-muted hover:text-ink aria-pressed:bg-panel aria-pressed:text-ink aria-pressed:shadow-1'

/** 骨架屏（DESIGN.md skeleton）：panel-2 底，只做渐隐，不做位移 */
export const skelCls = 'animate-pulse rounded-sm bg-panel-2'

/** 长文本容器：68ch 行长闸门（DESIGN.md Readability Contract 第 3 条） */
export const proseCls = 'max-w-[68ch]'

/**
 * 页标题（DESIGN.md 排印段）：H1 30/600/1.25，负字距只给大字标题（≤ −0.01em）。
 * `sm` 以下按 DESIGN.md Layout 的折叠语义收到 25px——不是 `md`，也不是随手定的 22px。
 * 九个页面各写一遍 `text-[26px] max-md:text-[22px]` 是上一轮的漂移，收口到这里。
 */
export const h1Cls =
  'text-[30px] font-semibold leading-[1.25] tracking-tight text-ink max-sm:text-[25px]'

/** 页标题下的一句说明（13.5px/1.6 ink-muted，DESIGN.md 的「次要」档） */
export const h1SubCls = 'mt-1 text-[13.5px] leading-[1.6] text-ink-muted'
