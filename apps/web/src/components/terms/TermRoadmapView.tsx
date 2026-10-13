import { useMemo, useState } from 'react'
import { TERM_ROADMAP, type TermOut } from '@openvibe/shared'
import { zh } from '../../i18n/zh'
import { useRoadmapOrder } from '../../hooks/useRoadmapOrder'
import { useTermMutations } from '../../hooks/useTerms'
import { CHIP_TONES, chipCls, chipPressed, chipTone } from '../ui/styles'

// 可按压的 chip：选中与未选中在形制层择一。chipTone('default') 与 chipPressed 各自
// 带 border/bg/text 三个色类，叠加只会让 Tailwind 任意挑一个生效（顺序不由源码决定），
// 所以这里不叠加，三元也不散进 JSX。
const toggleChip = (on: boolean): string =>
  `${chipCls} ${on ? chipPressed : `${CHIP_TONES.default} hover:bg-panel`}`
import { toast } from '../ui/Toaster'

/** 文案随组件走（TermsPage 是懒加载 chunk） */
const zhRoadmap = {
  view: '学习路线',
  station: (n: number) => `第 ${n} 站`,
  count: (n: number) => `${n} 条`,
  loose: '未入路线',
  looseHint: '这些词条的标签不在学习路线里。用行尾下拉「归组」写入路线标签（一次归位、永久生效），或点编辑手动处理。',
  emptyGroup: '（暂无）',
  related: (n: number) => `关联 ${n}`,
  empty: '库为空——先导入或新建词条。',
  reorder: '调整顺序',
  reordering: '完成调整',
  resetOrder: '恢复默认顺序',
  orderReset: '已恢复默认顺序',
  moveUp: '上移一站',
  moveDown: '下移一站',
  regroupPlaceholder: '归组到…',
  regrouped: (name: string) => `「${name}」已归组`,
}

interface RoadmapTerm {
  term: TermOut
  brief: string
}

interface StationView {
  id: string
  title: string
  stationNo: number
  groups: { name: string; terms: RoadmapTerm[] }[]
  loose: RoadmapTerm[]
  total: number
}

const briefOf = (t: TermOut): string => {
  const line = t.definition.split('\n').find((l) => l.trim() !== '') ?? ''
  return line.length > 64 ? `${line.slice(0, 64)}…` : line
}

/**
 * 学习路线视图（DEV-0076 分站展示 / DEV-0077 顺序可调 + 改名韧性归组）：
 * - 站顺序可调：「调整顺序」模式里 ↑↓ 移站，顺序存 localStorage（按稳定站 id，
 *   归一合并前向兼容）；导航 chips 与站编号随当前顺序重算。词条归属不动。
 * - 未入路线词条：行尾「归组」下拉把路线标签写入词条 tags（数据层修复，
 *   一次归位永久生效；追加语义，不破坏其他自定义标签）。
 * - 搜索/标签/状态筛选复用页面已过滤行；点词条进编辑抽屉。
 */
export function TermRoadmapView(props: {
  terms: TermOut[]
  loading: boolean
  onEdit: (term: TermOut) => void
}) {
  const [openStations, setOpenStations] = useState<Set<string>>(() => new Set())
  const [ordering, setOrdering] = useState(false)
  const { order, isCustom, move, reset } = useRoadmapOrder()
  const { update } = useTermMutations()

  const stations: StationView[] = useMemo(() => {
    const byId = new Map(TERM_ROADMAP.map((stage, i) => [stage.id, { stage, no: i + 1 }]))
    const ordered = order
      .map((id) => byId.get(id))
      .filter((x) => x !== undefined)
      .map((x, i) => ({
        id: x.stage.id,
        title: x.stage.title,
        stationNo: i + 1,
        groups: x.stage.groups.map((name) => ({ name, terms: [] as RoadmapTerm[] })),
        loose: [] as RoadmapTerm[],
        total: 0,
      }))
    const loose: StationView = {
      id: '__loose',
      title: zhRoadmap.loose,
      stationNo: ordered.length + 1,
      groups: [],
      loose: [],
      total: 0,
    }
    const all = [...ordered, loose]
    for (const term of props.terms) {
      const brief = briefOf(term)
      let placed = false
      for (const s of all) {
        const stage = TERM_ROADMAP.find((x) => x.id === s.id)
        const tag = term.tags.find((t) => stage?.groups.includes(t))
        if (tag === undefined || s.id === '__loose') continue
        s.groups.find((g) => g.name === tag)?.terms.push({ term, brief })
        placed = true
        break
      }
      if (!placed) loose.loose.push({ term, brief })
    }
    for (const s of all) {
      for (const g of s.groups) s.total += g.terms.length
      s.total += s.loose.length
    }
    return all.filter((s) => s.total > 0)
  }, [props.terms, order])

  const regroup = (term: TermOut, groupName: string) => {
    // 只追加组标签（组∈某站 groups 即完成归属）；词条原有自定义标签一律保留
    const tags = [...new Set([...term.tags, groupName])].filter((t) => t.trim() !== '')
    update.mutate(
      { id: term.id, patch: { tags } },
      {
        onSuccess: () => toast(zhRoadmap.regrouped(term.zh ?? term.en ?? '')),
        onError: (e: Error) => toast(e.message, 'error'),
      },
    )
  }

  if (props.loading) return <p className="px-5 py-6 text-sm text-ink-faint">{zh.common.loading}</p>
  if (props.terms.length === 0)
    return <p className="px-5 py-6 text-sm text-ink-muted">{zhRoadmap.empty}</p>

  return (
    <div className="px-5 py-4">
      <nav className="mb-3 flex flex-wrap items-center gap-1.5">
        {stations.map((s) => (
          <button
            key={s.id}
            className={`${chipTone('default')} cursor-pointer hover:border-line-strong`}
            onClick={() => {
              document.getElementById(`roadmap-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              setOpenStations((prev) => new Set(prev).add(s.id))
            }}
          >
            {zhRoadmap.station(s.stationNo)} {s.title} · {zhRoadmap.count(s.total)}
          </button>
        ))}
        <span className="ml-auto flex items-center gap-1.5">
          {isCustom && !ordering && (
            <button className={`${chipTone('warn')} cursor-pointer`} onClick={reset}>
              {zhRoadmap.resetOrder}
            </button>
          )}
          <button
            className={`${toggleChip(ordering)} cursor-pointer`}
            aria-pressed={ordering}
            onClick={() => setOrdering((v) => !v)}
          >
            {ordering ? zhRoadmap.reordering : zhRoadmap.reorder}
          </button>
        </span>
      </nav>

      <div className="space-y-3">
        {stations.map((s) => {
          const open = openStations.has(s.id) || (openStations.size === 0 && s === stations[0])
          return (
            <section
              key={s.id}
              id={`roadmap-${s.id}`}
              className="scroll-mt-16 rounded-lg border border-line bg-panel"
            >
              <details
                open={open}
                onToggle={(e) => {
                  const el = e.currentTarget
                  setOpenStations((prev) => {
                    const next = new Set(prev)
                    if (el.open) next.add(s.id)
                    else next.delete(s.id)
                    return next
                  })
                }}
              >
                <summary className="flex cursor-pointer items-center gap-2 px-4 py-2.5">
                  <span className="text-sm font-semibold text-ink-body">
                    {zhRoadmap.station(s.stationNo)} · {s.title}
                  </span>
                  <span className={chipTone('default')}>
                    {zhRoadmap.count(s.total)}
                  </span>
                  {ordering && s.id !== '__loose' && (
                    <span className="ml-auto flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        className={`${chipTone('default')} cursor-pointer hover:bg-panel`}
                        disabled={s.stationNo <= 1}
                        onClick={() => move(s.id, -1)}
                        title={zhRoadmap.moveUp}
                      >
                        ↑
                      </button>
                      <button
                        className={`${chipTone('default')} cursor-pointer hover:bg-panel`}
                        disabled={s.stationNo >= stations.length - 1}
                        onClick={() => move(s.id, 1)}
                        title={zhRoadmap.moveDown}
                      >
                        ↓
                      </button>
                    </span>
                  )}
                </summary>
                <div className="space-y-3 border-t border-line-hair px-4 py-3">
                  {s.id === '__loose' && s.loose.length > 0 && (
                    <p className="text-[11px] text-warn">{zhRoadmap.looseHint}</p>
                  )}
                  {s.groups
                    .filter((g) => g.terms.length > 0)
                    .map((g) => (
                      <div key={g.name}>
                        <p className="mb-1 text-[11px] font-medium text-ink-muted">
                          {g.name} · {zhRoadmap.count(g.terms.length)}
                        </p>
                        <ul className="space-y-1">
                          {g.terms.map(({ term, brief }) => (
                            <li key={term.id}>
                              <button
                                className="w-full rounded px-2 py-1 text-left hover:bg-panel-2"
                                onClick={() => props.onEdit(term)}
                              >
                                <span className="text-xs font-medium text-ink-body">{term.zh ?? '—'}</span>
                                {term.en !== null && term.en !== '' && (
                                  <span className="ml-1.5 text-[11px] text-ink-faint">{term.en}</span>
                                )}
                                {brief !== '' && (
                                  <span className="ml-2 text-[11px] text-ink-muted">{brief}</span>
                                )}
                                {term.relatedTermIds.length > 0 && (
                                  <span className="ml-2 text-[10px] text-accent">
                                    {zhRoadmap.related(term.relatedTermIds.length)}
                                  </span>
                                )}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  {s.id === '__loose' && s.loose.length > 0 && (
                    <div>
                      <ul className="space-y-1">
                        {s.loose.map(({ term, brief }) => (
                          <li key={term.id} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-panel-2">
                            <button
                              className="min-w-0 flex-1 text-left"
                              onClick={() => props.onEdit(term)}
                            >
                              <span className="text-xs font-medium text-ink-body">{term.zh ?? '—'}</span>
                              {term.en !== null && term.en !== '' && (
                                <span className="ml-1.5 text-[11px] text-ink-faint">{term.en}</span>
                              )}
                              {brief !== '' && <span className="ml-2 text-[11px] text-ink-muted">{brief}</span>}
                            </button>
                            <select
                              className="shrink-0 rounded border border-line bg-panel px-1.5 py-0.5 text-[11px]"
                              value=""
                              aria-label={zhRoadmap.regroupPlaceholder}
                              onChange={(e) => {
                                if (e.target.value !== '') regroup(term, e.target.value)
                              }}
                            >
                              <option value="">{zhRoadmap.regroupPlaceholder}</option>
                              {TERM_ROADMAP.map((stage) => (
                                <optgroup key={stage.id} label={stage.title}>
                                  {stage.groups.map((g) => (
                                    <option key={g} value={g}>
                                      {g}
                                    </option>
                                  ))}
                                </optgroup>
                              ))}
                            </select>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </details>
            </section>
          )
        })}
      </div>
    </div>
  )
}
