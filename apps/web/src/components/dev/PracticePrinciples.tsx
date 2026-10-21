import { Icon } from '../ui/icons'
import { PRACTICE_PRINCIPLES } from '@openvibe/shared'

/**
 * M9 v1.6 **P3.6 · 练习原则常驻提示条**（`m9-dev-language-roadmap.md` §3.22.4
 *   · dev-plan §6.9 P3.6）
 *
 * ## 它是什么
 *
 * **6 条**练习原则的常驻提示。
 *
 * ## ⚠️ **绝不做成可勾选清单**
 *
 * §3.22.4 末段：「6 条原则里没有一条能变成判据」——「少看多敲」要判定就得知道
 * 「敲了多少下」，那是自评；「每周一次 code review」同理。⇒ 做成可勾选清单
 * 就是**假进度条**（§2.2 拒绝的自评清单换了层皮）。
 *
 * ⇒ 因此本组件**没有** checkbox、**没有**「已完成 n/6」这类计数。
 *
 * ## ⚠️ 原则本身**不能变成判据**
 *
 * 所以「6 条」这个数只是**展示**，不是「你完成了多少」—— 两者的区别就是可勾选与否。
 */
const L = {
  title: '练习原则',
  hint: '这六条没有一条能变成判据——所以它们是提示，不是待办。',
} as const

export function PracticePrinciples() {
  return (
    <section aria-label="练习原则" className="flex flex-col gap-2">
      <header className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-sm font-semibold text-ink">{L.title}</h3>
        <span className="text-[11.5px] text-ink-faint">{L.hint}</span>
      </header>
      <ul className="flex flex-col gap-1.5">
        {PRACTICE_PRINCIPLES.map((p) => (
          <li
            key={p.no}
            className="flex items-start gap-2 rounded-md border border-line bg-panel px-3 py-2"
          >
            <Icon name="sparkle" size={13} className="mt-0.5 shrink-0 text-ink-faint" />
            <span className="min-w-0">
              <span className="block text-sm text-ink">{p.principle}</span>
              <span className="block text-[13.5px] leading-[1.6] text-ink-body">{p.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
