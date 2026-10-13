// Tailwind 类组合的单一出处（dev-plan §5.5）。
// 设计系统见 DESIGN.md「暖纸 · 可读性工作台（V2）」：
// 赭石 btnPrimary 只给「使生效」类动作（注入/应用/保存/确认），ok 退居状态位（一致/通过/监听）。
export const btnBase =
  'inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50'

// 形制注记（2026-10-03 换肤收口轮）：btnPrimary 暂只到 V2 颜色三件套。
// DESIGN.md FR-5.1 的 shadow-1 与 focus-visible 2px 环未随本笔落——入口预算只剩
// ~20B 余量（bundle:check 300kB 闸），组件形制升级归 UI 轮（DEV-0080 代码轮 Phase B）。
export const btnPrimary = `${btnBase} border-accent bg-accent text-on-accent hover:bg-accent-deep`
export const btnGhost = `${btnBase} border-line bg-panel text-ink-body hover:border-line-strong hover:bg-panel-2`
// 危险动作与强调互斥（DESIGN.md Components）：danger-soft 底 + danger-line 描边 + danger 字，hover 转实心 + 调用点二次确认
export const btnDanger = `${btnBase} border-danger-line bg-danger-soft text-danger hover:bg-danger hover:text-panel`

export const inputCls =
  'w-full rounded-sm border border-line-strong bg-panel px-3 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30'

export const labelCls = 'mb-1 block text-xs font-medium text-ink-muted'

export const chipCls = 'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px]'
