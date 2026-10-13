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
export const chipCls = 'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] leading-[1.7]'

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
