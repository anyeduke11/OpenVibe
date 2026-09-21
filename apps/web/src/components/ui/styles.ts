// Tailwind 类组合的单一出处（dev-plan §5.5：仅浅色、无组件库锁定）
export const btnBase =
  'inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50'

export const btnPrimary = `${btnBase} border-brand bg-brand text-white hover:bg-brand/90`
export const btnGhost = `${btnBase} border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50`
export const btnDanger = `${btnBase} border-red-200 bg-red-50 text-red-700 hover:bg-red-100`

export const inputCls =
  'w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/30'

export const labelCls = 'mb-1 block text-xs font-medium text-zinc-500'

export const chipCls = 'inline-flex items-center rounded border px-1.5 py-0.5 text-[11px]'
