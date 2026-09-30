// Tailwind 类组合的单一出处（dev-plan §5.5）。
// 设计系统见 DESIGN.md「墨松账本 · 书斋版」：
// 朱砂 btnPrimary 只给「使生效」类动作（注入/应用/保存/确认），绿色退居激活态与链接。
export const btnBase =
  'inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50'

export const btnPrimary = `${btnBase} border-seal bg-seal text-on-seal hover:bg-seal-deep`
export const btnGhost = `${btnBase} border-line bg-panel text-ink-body hover:border-line-strong hover:bg-fill-soft`
// 危险动作与朱砂互斥（DESIGN.md Colors）：灰底红字描边形制 + 调用点二次确认
export const btnDanger = `${btnBase} border-line-strong bg-transparent text-danger-700 hover:border-danger-600`

export const inputCls =
  'w-full rounded-sm border border-line-strong bg-panel px-3 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/30'

export const labelCls = 'mb-1 block text-xs font-medium text-ink-subtle'

export const chipCls = 'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px]'
