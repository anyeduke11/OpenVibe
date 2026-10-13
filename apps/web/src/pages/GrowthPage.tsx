import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError, apiJson } from '../api/client'
import { useFlywheelStats } from '../hooks/useSettings'
import { useLedger, type LedgerEvent } from '../hooks/useLedger'
import { zh } from '../i18n/zh'
import { FlywheelCard } from '../components/onboarding/FlywheelCard'
import {
  REDLINES,
  STAGES,
  STAGE_MODULES,
  STAGE_WHY,
  isExpert,
  readGrowthState,
  writeGrowthState,
  type Stage,
  type StageModule,
} from '../growth/stage'
import { btnGhost } from '../components/ui/styles'

const MODULE_LABEL: Record<StageModule, string> = {
  prompts: zh.nav.library,
  terms: zh.nav.terms,
  skills: zh.nav.skills,
  flows: zh.nav.flows,
  packs: zh.nav.packs,
}

/** CLI 命令参考（来自 `GET /api/cli/commands`；端点未上线时如实说未上线） */
interface CliCommand {
  name: string
  usage: string
  summary: string
  risk: 'readonly' | 'decision' | 'destructive'
  writesDisk: boolean
  flags: { name: string; value: string; summary: string }[]
}

const RISK_STYLE = {
  readonly: 'chip border-line bg-panel-2 text-ink-muted',
  decision: 'chip border-warn-line bg-warn-soft text-warn',
  destructive: 'chip border-danger-line bg-danger-soft text-danger',
} as const

/**
 * 成长与统计。
 *
 * 三块内容分属不同的成熟度，界面上必须说清：阶段向量与一键越级**现在可用**；
 * 阶段自动判定与台账读取依赖 D29 事件台账（RF1-5，尚未开工），因此这里只呈现
 * 可核对的事实，不拿假信号算一个假的「你已毕业」（见 `growth/stage.ts` 顶部注）。
 */
export function GrowthPage() {
  const [growth, setGrowth] = useState(readGrowthState)
  const stats = useFlywheelStats()
  const ledger = useLedger(200)

  const setStage = useCallback((m: StageModule, s: Stage) => {
    setGrowth((prev) => {
      const next = { ...prev, stages: { ...prev.stages, [m]: s } }
      writeGrowthState(next)
      return next
    })
  }, [])

  const toggleExpert = useCallback((m: StageModule) => {
    setGrowth((prev) => {
      const next = { ...prev, expert: { ...prev.expert, [m]: !prev.expert[m] } }
      writeGrowthState(next)
      return next
    })
  }, [])

  const reset = useCallback(() => {
    const next = {
      stages: { prompts: 0, terms: 0, skills: 0, flows: 0, packs: 0 } as GrowthStages,
      expert: { prompts: false, terms: false, skills: false, flows: false, packs: false },
    }
    writeGrowthState(next)
    setGrowth(next)
  }, [])

  return (
    <div className="flex flex-col gap-4 px-6 py-6 max-md:px-4">
      <header>
        <h1 className="text-[26px] font-semibold tracking-tight text-ink max-md:text-[22px]">
          {zh.growth.title}
        </h1>
        <p className="mt-1 max-w-[68ch] text-[13.5px] text-ink-muted">{zh.growth.subtitle}</p>
      </header>

      {/* 红线 3：阶段可见可解释——这句话永远在，展开即得 */}
      <section className="rounded-md border border-accent-line bg-accent-soft px-4 py-3">
        <p className="text-sm text-ink-body">
          <span className="font-semibold text-accent-deep">{zh.growth.whyLabel}</span>{' '}
          {STAGE_WHY[maxStage(growth.stages)]}
        </p>
      </section>

      <section className="rounded-md border border-line bg-panel shadow-1">
        <div className="flex items-center gap-2 border-b border-line-hair px-4 py-2.5">
          <h2 className="text-sm font-semibold text-ink">{zh.growth.vector.title}</h2>
          <span className="text-[11.5px] text-ink-faint">{zh.growth.vector.hint}</span>
          <button type="button" onClick={reset} className={`${btnGhost} ml-auto !px-2 !py-0.5 !text-[11.5px]`}>
            {zh.growth.vector.reset}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border-b border-line-hair px-4 py-2 text-left text-[11.5px] font-normal text-ink-faint">
                  {zh.growth.vector.module}
                </th>
                {STAGES.map((s) => (
                  <th
                    key={s.code}
                    className="border-b border-line-hair px-2 py-2 text-center text-[11.5px] font-normal text-ink-faint"
                  >
                    F{s.code} {s.name}
                  </th>
                ))}
                <th className="border-b border-line-hair px-4 py-2 text-right text-[11.5px] font-normal text-ink-faint">
                  {zh.growth.vector.expert}
                </th>
              </tr>
            </thead>
            <tbody>
              {STAGE_MODULES.map((m) => (
                <tr key={m}>
                  <td className="border-b border-line-hair px-4 py-2 text-ink-body">
                    {MODULE_LABEL[m]}
                  </td>
                  {STAGES.map((s) => (
                    <td key={s.code} className="border-b border-line-hair px-2 py-2 text-center">
                      <button
                        type="button"
                        aria-pressed={growth.stages[m] === s.code}
                        onClick={() => setStage(m, s.code)}
                        className={`num rounded-sm px-2 py-0.5 text-xs transition-colors ${
                          growth.stages[m] === s.code
                            ? 'bg-accent-soft font-semibold text-accent-deep'
                            : 'text-ink-faint hover:bg-panel-2 hover:text-ink-body'
                        }`}
                      >
                        {s.code}
                      </button>
                    </td>
                  ))}
                  <td className="border-b border-line-hair px-4 py-2 text-right">
                    <button
                      type="button"
                      aria-pressed={isExpert(growth, m)}
                      onClick={() => toggleExpert(m)}
                      className={`chip ${isExpert(growth, m) ? 'border-accent-line bg-accent-soft text-accent-deep' : 'border-line bg-panel-2 text-ink-muted'}`}
                    >
                      {isExpert(growth, m) ? zh.growth.vector.expertOn : zh.growth.vector.expertOff}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-2.5 text-[11.5px] text-ink-faint">{zh.growth.vector.pending}</p>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <section className="overflow-hidden rounded-md border border-line bg-panel shadow-1">
            {stats.data !== undefined ? (
              <FlywheelCard {...stats.data} />
            ) : (
              <p className="px-4 py-4 text-sm text-ink-faint">{zh.common.loading}</p>
            )}
          </section>

          <section className="rounded-md border border-line bg-panel shadow-1">
            <h2 className="border-b border-line-hair px-4 py-2.5 text-sm font-semibold text-ink">
              {zh.growth.redlines.title}
              <span className="ml-2 text-[11.5px] font-normal text-ink-faint">
                {zh.growth.redlines.hint}
              </span>
            </h2>
            <ol className="flex flex-col gap-2 px-4 py-3">
              {REDLINES.map((r, i) => (
                <li key={i} className="flex gap-2.5 text-[13px] text-ink-body">
                  <span className="num shrink-0 text-ink-faint">{i + 1}</span>
                  <span>{r}</span>
                </li>
              ))}
            </ol>
          </section>

          <CliReference />
        </div>

        <LedgerPanel state={ledger} />
      </div>
    </div>
  )
}

type GrowthStages = Record<StageModule, Stage>

function maxStage(stages: GrowthStages): Stage {
  return STAGE_MODULES.reduce<Stage>((acc, m) => (stages[m] > acc ? stages[m] : acc), 0)
}

function CliReference() {
  const [data, setData] = useState<{ items: CliCommand[] } | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading')

  // 端点是本轮新增的；未上线时降级为一句话说明，而不是让整页报错
  useEffect(() => {
    let alive = true
    void apiJson<{ items: CliCommand[] }>('/api/cli/commands')
      .then((d) => {
        if (!alive) return
        setData(d)
        setState('ready')
      })
      .catch((e: unknown) => {
        if (!alive) return
        setState(e instanceof ApiError && e.status === 404 ? 'missing' : 'error')
      })
    return () => {
      alive = false
    }
  }, [])

  return (
    <section className="rounded-md border border-line bg-panel shadow-1">
      <h2 className="border-b border-line-hair px-4 py-2.5 text-sm font-semibold text-ink">
        {zh.growth.cli.title}
        <span className="ml-2 text-[11.5px] font-normal text-ink-faint">{zh.growth.cli.hint}</span>
      </h2>
      {state === 'loading' && (
        <p className="px-4 py-4 text-sm text-ink-faint">{zh.common.loading}</p>
      )}
      {state === 'missing' && (
        <p className="px-4 py-4 text-[13px] text-ink-faint">{zh.growth.cli.missing}</p>
      )}
      {state === 'error' && (
        <p className="px-4 py-4 text-[13px] text-danger">{zh.common.failed('')}</p>
      )}
      {state === 'ready' && data && (
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className="border-b border-line-hair px-4 py-2 text-left text-[11.5px] font-normal text-ink-faint">
                {zh.growth.cli.command}
              </th>
              <th className="border-b border-line-hair px-4 py-2 text-left text-[11.5px] font-normal text-ink-faint">
                {zh.growth.cli.summary}
              </th>
              <th className="border-b border-line-hair px-4 py-2 text-left text-[11.5px] font-normal text-ink-faint">
                {zh.growth.cli.risk}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((c) => (
              <tr key={c.name}>
                <td className="mono border-b border-line-hair px-4 py-2 align-top text-ink-body">
                  {c.usage}
                  {c.flags.length > 0 && (
                    <div className="mt-1 text-[11px] text-ink-faint">
                      {c.flags.map((f) => (
                        <div key={f.name} className="mono">
                          {f.name} {f.value} — {f.summary}
                        </div>
                      ))}
                    </div>
                  )}
                </td>
                <td className="border-b border-line-hair px-4 py-2 align-top text-ink-muted">
                  {c.summary}
                </td>
                <td className="border-b border-line-hair px-4 py-2 align-top">
                  <span className={RISK_STYLE[c.risk]}>
                    {zh.growth.cli.risks[c.risk]}
                    {c.writesDisk ? ` · ${zh.growth.cli.writesDisk}` : ''}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

function LedgerPanel(props: { state: ReturnType<typeof useLedger> }) {
  const { state } = props
  const [filter, setFilter] = useState<string>('')

  const kinds = useMemo(() => {
    const set = new Map<string, number>()
    for (const e of state.data?.items ?? []) set.set(e.name, (set.get(e.name) ?? 0) + 1)
    return [...set.entries()].sort((a, b) => b[1] - a[1])
  }, [state.data])

  const items: LedgerEvent[] = useMemo(() => {
    const all = state.data?.items ?? []
    return filter ? all.filter((e) => e.name === filter) : all
  }, [filter, state.data])

  return (
    <section className="flex min-w-0 flex-col rounded-md border border-line bg-panel shadow-1">
      <h2 className="border-b border-line-hair px-4 py-2.5 text-sm font-semibold text-ink">
        {zh.workbench.ledger.title}
        <span className="ml-2 rounded-sm border border-line-hair bg-panel-2 px-1.5 text-[11px] font-normal text-ink-muted">
          不出网
        </span>
      </h2>

      {state.isLoading && <p className="px-4 py-5 text-sm text-ink-faint">{zh.common.loading}</p>}
      {state.error instanceof ApiError && state.error.status === 404 && (
        <p className="px-4 py-5 text-[13px] text-ink-faint">{zh.workbench.ledger.unavailable}</p>
      )}
      {state.error && !(state.error instanceof ApiError && state.error.status === 404) && (
        <p className="px-4 py-5 text-[13px] text-danger">{zh.common.failed('')}</p>
      )}

      {state.data && kinds.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-b border-line-hair px-3 py-2">
          <button
            type="button"
            aria-pressed={filter === ''}
            onClick={() => setFilter('')}
            className={`chip ${filter === '' ? 'border-accent-line bg-accent-soft text-accent-deep' : 'border-line bg-panel-2 text-ink-muted'}`}
          >
            {zh.growth.ledger.all} {state.data.total}
          </button>
          {kinds.map(([k, n]) => (
            <button
              key={k}
              type="button"
              aria-pressed={filter === k}
              onClick={() => setFilter(filter === k ? '' : k)}
              className={`mono chip ${filter === k ? 'border-accent-line bg-accent-soft text-accent-deep' : 'border-line bg-panel-2 text-ink-muted'}`}
            >
              {k} {n}
            </button>
          ))}
        </div>
      )}

      {state.data && items.length === 0 && (
        <p className="px-4 py-5 text-center text-[13px] text-ink-faint">
          {zh.growth.ledger.empty}
        </p>
      )}

      {items.length > 0 && (
        <ul className="max-h-[420px] overflow-y-auto">
          {items.map((e) => (
            <li
              key={e.id}
              className="flex items-baseline gap-2 border-b border-line-hair px-4 py-1.5 last:border-b-0"
            >
              <span className="mono min-w-0 grow truncate text-[11.5px] text-ink-body">
                {e.name}
              </span>
              <span className="mono shrink-0 text-[11px] text-ink-faint">
                {new Date(e.ts).toLocaleString('zh-CN', { hour12: false })}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto border-t border-line-hair px-4 py-2 text-[11px] text-ink-faint">
        {zh.workbench.ledger.hint}
      </div>
    </section>
  )
}