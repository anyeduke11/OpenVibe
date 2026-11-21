import { useMemo, useState } from 'react'
import { COVERAGE, STATUS_META, coverageTotals, type CapabilityStatus } from '../data/coverage'
import { Dialog, DialogPanel } from './ui/Dialog'
import { Icon } from './ui/icons'
import { chipTone } from './ui/styles'

/**
 * 覆盖地图（原型顶栏「覆盖地图」按钮的弹层）。
 *
 * ## 它回答什么
 *
 * 「产品承诺了什么、做到哪一步、凭据在哪」。数据源 `data/coverage.ts`，
 * 口径与迁移说明写在该文件头。
 *
 * ## 为什么状态筛选是「减法」而不是「多选」
 *
 * 大多数时候要看的是「**还没做的有哪些**」（design + no），偶尔看「已上线的有哪些」。
 * 单选 + 「全部」足够覆盖这两种读法，且按钮不会退化成一排同形的开关
 * （那正是 DESIGN.md 说的「操作面密度」问题）。
 */

const FILTERS: { value: CapabilityStatus | 'all'; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'ok', label: '已上线' },
  { value: 'partial', label: '部分就绪' },
  { value: 'design', label: '设计稿' },
  { value: 'no', label: '裁定不做' },
]

export function CoverageMapDialog(props: { open: boolean; onClose: () => void }) {
  const [filter, setFilter] = useState<CapabilityStatus | 'all'>('all')
  const [q, setQ] = useState('')
  const totals = useMemo(() => coverageTotals(), [])

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return COVERAGE.map((g) => ({
      ...g,
      items: g.items.filter((it) => {
        if (filter !== 'all' && it.status !== filter) return false
        if (needle === '') return true
        return `${it.id} ${it.name} ${it.source}`.toLowerCase().includes(needle)
      }),
    })).filter((g) => g.items.length > 0)
  }, [filter, q])

  const shown = groups.reduce((n, g) => n + g.items.length, 0)

  return (
    <Dialog open={props.open} onOpenChange={(v) => !v && props.onClose()}>
      <DialogPanel
        title="覆盖地图"
        width="w-[min(880px,100vw)]"
        footer={
          <span className="text-xs text-ink-muted">
            共 {String(shown)} 项 · 数据源{' '}
            <span className="mono">apps/web/src/data/coverage.ts</span>
          </span>
        }
      >
        {/* 汇总格：四态各多少 —— 一眼看出「还差多少」 */}
        <div className="mb-4 grid grid-cols-4 gap-2 max-sm:grid-cols-2">
          {(Object.keys(STATUS_META) as CapabilityStatus[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(filter === s ? 'all' : s)}
              aria-pressed={filter === s}
              className={`rounded-md border px-3 py-2 text-left transition-colors ${
                filter === s
                  ? 'border-accent-line bg-accent-soft'
                  : 'border-line bg-panel hover:bg-panel-2'
              }`}
            >
              <div className="text-xs text-ink-faint">{STATUS_META[s].label}</div>
              <div className="text-xl font-semibold tabular-nums text-ink">{String(totals[s])}</div>
            </button>
          ))}
        </div>

        {/* 筛选行：搜索 + 状态单选 */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜编号 / 能力名 / 出处…"
            aria-label="搜索能力位"
            className="w-56 rounded-sm border border-line-strong bg-panel px-2.5 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent-soft"
          />
          <div className="inline-flex flex-wrap gap-0.5 rounded-sm border border-line bg-panel-2 p-0.5">
            {FILTERS.map((f) => {
              const on = f.value === filter
              return (
                <button
                  key={f.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setFilter(f.value)}
                  className={`rounded-[4px] px-2.5 py-1 text-xs transition-colors ${
                    on ? 'bg-panel font-medium text-ink shadow-1' : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {f.label}
                </button>
              )
            })}
          </div>
          {filter !== 'all' && (
            <button
              type="button"
              onClick={() => setFilter('all')}
              className="text-xs text-ink-muted hover:text-ink"
            >
              清除状态筛选
            </button>
          )}
        </div>

        {/* 分组表：组名 + 能力位行（编号 / 名称 / 状态 / 出处） */}
        <div className="flex flex-col gap-4">
          {groups.length === 0 && (
            <p className="py-8 text-center text-sm text-ink-faint">没有命中的能力位。</p>
          )}
          {groups.map((g) => (
            <section key={g.group}>
              <h3 className="mb-1.5 flex items-baseline gap-2 text-[13px] font-semibold text-ink">
                {g.group}
                <span className="text-xs font-normal tabular-nums text-ink-faint">
                  {String(g.items.length)}
                </span>
              </h3>
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-line text-left text-[11.5px] text-ink-faint">
                    <th className="w-20 py-1.5 pr-2 font-medium">编号</th>
                    <th className="py-1.5 pr-2 font-medium">能力</th>
                    <th className="w-24 py-1.5 pr-2 font-medium">状态</th>
                    <th className="w-[38%] py-1.5 font-medium">出处</th>
                  </tr>
                </thead>
                <tbody>
                  {g.items.map((it) => (
                    <tr key={it.id} className="border-b border-line-hair last:border-b-0">
                      <td className="py-2 pr-2 align-top">
                        <span className="mono text-[11.5px] text-ink-muted">{it.id}</span>
                      </td>
                      <td className="py-2 pr-2 align-top text-ink-body">{it.name}</td>
                      <td className="py-2 pr-2 align-top">
                        <span className={chipTone(STATUS_META[it.status].tone)}>
                          <Icon
                            name={
                              it.status === 'ok'
                                ? 'check'
                                : it.status === 'no'
                                  ? 'x'
                                  : it.status === 'design'
                                    ? 'clock'
                                    : 'info'
                            }
                            size={11}
                          />
                          {STATUS_META[it.status].label}
                        </span>
                      </td>
                      <td className="py-2 align-top">
                        <span className="mono break-all text-[11.5px] text-ink-muted">
                          {it.source}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      </DialogPanel>
    </Dialog>
  )
}
