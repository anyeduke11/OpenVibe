import { LANGUAGE_ASPECTS, LEARNING_ORDER } from '@openvibe/shared'

/**
 * M9 v1.6 **P3.5 · 语言对照表**（`m9-dev-language-roadmap.md` §3.22.2 · dev-plan §6.9 P3.5）。
 *
 * ## 它是什么
 *
 * **8 个维度**上两门语言的逐格对照（Python 一列 / Go 一列），
 * 外加**选学顺序 3 条**（§3.22.3，同一块静态面板的另一半）。
 *
 * ## ⚠️ 这张表是 §3.21「Python 主线 / Go 选学」那条裁定的**论据来源**
 *
 * §3.22.2 明写：「并发模型」与「典型领域」两行正是 owner 把 Go 定为选学的理由
 * ⇒ 界面上的 Go「选学」提示语**应引用本表**，而不是另写一句。
 *
 * ## ⚠️ 逐格照抄，不润色
 *
 * 每一格都是 spec §3.22.2 的原句 ⇒ 由 `m9-panels.test.ts` 的逐格对账钉住。
 */
const L = {
  python: 'Python',
  go: 'Go（Golang）',
  order: '选学顺序',
  orderHint: '先学哪门——三条路线，按你的起点挑一条。',
} as const

export function LanguageCompare() {
  return (
    <section aria-label="语言对照" className="flex flex-col gap-2">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr>
            <th className="w-[84px] px-2 py-1.5 text-[11.5px] font-medium text-ink-faint">维度</th>
            <th className="px-2 py-1.5 text-[11.5px] font-medium text-ink-faint">{L.python}</th>
            <th className="px-2 py-1.5 text-[11.5px] font-medium text-ink-faint">{L.go}</th>
          </tr>
        </thead>
        <tbody>
          {LANGUAGE_ASPECTS.map((a) => (
            <tr key={a.aspect} className="border-t border-line-hair align-top">
              <th scope="row" className="px-2 py-2 text-[13.5px] font-medium text-ink">
                {a.aspect}
              </th>
              <td className="px-2 py-2 text-[13.5px] leading-[1.6] text-ink-body">{a.python}</td>
              <td className="px-2 py-2 text-[13.5px] leading-[1.6] text-ink-body">{a.go}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 选学顺序（§3.22.3 · 同一块静态面板的另一半） */}
      <section aria-label={L.order} className="mt-1 flex flex-col gap-1.5">
        <header className="flex flex-wrap items-baseline gap-2">
          <h3 className="text-sm font-semibold text-ink">{L.order}</h3>
          <span className="text-[11.5px] text-ink-faint">{L.orderHint}</span>
        </header>
        <ol className="flex flex-col gap-1.5">
          {LEARNING_ORDER.map((o) => (
            <li key={o.no} className="rounded-md border border-line bg-panel px-3 py-2">
              <span className="text-sm text-ink">{o.route}</span>
              <p className="mt-1 text-[13.5px] leading-[1.6] text-ink-body">{o.detail}</p>
            </li>
          ))}
        </ol>
      </section>
    </section>
  )
}
