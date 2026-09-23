import type { FlywheelStatsOut } from '@openvibe/shared'
import { zh } from '../../i18n/zh'

const ITEMS: { key: keyof FlywheelStatsOut; label: string }[] = [
  { key: 'assets', label: zh.flywheel.assets },
  { key: 'packs', label: zh.flywheel.packs },
  { key: 'injections', label: zh.flywheel.injections },
  { key: 'reflows', label: zh.flywheel.reflows },
  { key: 'loops', label: zh.flywheel.loops },
]

/**
 * 顶栏常驻五项（onboarding FR-3.1，props 形状见 dev-plan §5.2）。
 * 数字为 0 时显示占位文案而非「0」（spec §4.3），首启不至于满屏零。
 */
export function FlywheelCard(props: FlywheelStatsOut) {
  return (
    <section
      aria-label={zh.flywheel.title}
      title={zh.flywheel.tooltip}
      className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-zinc-200 bg-white px-6 py-2"
    >
      <span className="text-[11px] font-medium text-zinc-400">{zh.flywheel.title}</span>
      {ITEMS.map((item) => {
        const value = props[item.key]
        return (
          <span key={item.key} className="flex items-baseline gap-1.5">
            <span className="text-xs text-zinc-500">{item.label}</span>
            <span className={`text-sm font-semibold ${value === 0 ? 'text-zinc-300' : 'text-brand'}`}>
              {value === 0 ? zh.flywheel.placeholder : String(value)}
            </span>
          </span>
        )
      })}
      <span className="ml-auto text-[11px] text-zinc-400">{zh.flywheel.hint}</span>
    </section>
  )
}
