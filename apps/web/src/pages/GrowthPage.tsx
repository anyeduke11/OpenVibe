import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../api/client'
import { useFlywheelStats } from '../hooks/useSettings'
import { useLedger, type LedgerEvent } from '../hooks/useLedger'
import { zh } from '../i18n/zh'
import { sys } from '../i18n/lane-system'
import { FlywheelCard } from '../components/onboarding/FlywheelCard'
import {
  REDLINES,
  STAGES,
  STAGE_MODULES,
  defaultGrowthState,
  isExpert,
  readGrowthState,
  stageDetail,
  writeGrowthState,
  type GrowthState,
  type Stage,
  type StageModule,
} from '../growth/stage'
import {
  CHIP_TONES,
  btnGhost,
  cardBodyCls,
  cardCls,
  cardFootCls,
  cardHeadCls,
  chipCls,
  chipPressed,
  chipTone,
  emptyHintCls,
  ledgerHeadCls,
  noteCls,
  noteTitleCls,
  proseCls,
  rowCls,
  skelCls,
} from '../components/ui/styles'
import { Icon } from '../components/ui/icons'

const MODULE_LABEL: Record<StageModule, string> = {
  prompts: zh.nav.library,
  terms: zh.nav.terms,
  skills: zh.nav.skills,
  flows: zh.nav.flows,
  packs: zh.nav.packs,
}

/** 可按压的筛选 chip：选中走 chipPressed，未选中走 default 形制。两支形制各自带
 *  border/bg/text 三个色类，叠加只会让 Tailwind 任意挑一个生效（顺序不由源码决定），
 *  所以在形制层择一，三元不散进 JSX。 */
const filterChip = (on: boolean): string =>
  `${chipCls} ${on ? chipPressed : `${CHIP_TONES.default} hover:bg-panel`}`

/**
 * 成长与统计。
 *
 * 三块内容分属不同的成熟度，界面上必须说清：阶段向量与一键越级**现在可用**；
 * 阶段自动判定依赖 D29 事件台账的读端点（RF1-5，尚未开工），因此这里只呈现
 * 可核对的事实，不拿假信号算一个假的「你已毕业」（毕业信号恒标「待采集」，见
 * `growth/stage.ts` 的 GRADUATE_PENDING）。
 */
export function GrowthPage() {
  const [growth, setGrowth] = useState(readGrowthState)
  const [focus, setFocus] = useState<Stage>(() => maxStage(readGrowthState().stages))
  const stats = useFlywheelStats()
  const ledger = useLedger(200)

  const setStage = useCallback((m: StageModule, s: Stage) => {
    setFocus(s)
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
    const next = defaultGrowthState()
    writeGrowthState(next)
    setGrowth(next)
    setFocus(0)
  }, [])

  const detail = stageDetail(focus)

  return (
    <div className="flex flex-col gap-4 px-6 py-6 max-md:px-4">
      {/* view-head：h1 + 一句话说明 + 右侧主动作 */}
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0">
          <h1 className="text-[30px] font-semibold leading-[1.25] tracking-tight text-ink max-sm:text-[25px]">
            {zh.growth.title}
          </h1>
          <p className={`${proseCls} mt-1 text-[13.5px] text-ink-muted`}>{zh.growth.subtitle}</p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Link to="/settings" className={btnGhost}>
            <Icon name="cog" size={14} />
            {zh.settings.title}
          </Link>
          <button type="button" className={btnGhost} onClick={reset}>
            <Icon name="refresh" size={14} />
            {sys.growth.action.reset}
          </button>
        </div>
      </header>

      {/* 红线 3：阶段可见可解释——这句话永远在，展开即得 */}
      <div className={noteCls('info')}>
        <b className={`${noteTitleCls} flex items-center gap-1.5 text-info`}>
          <Icon name="info" size={13} />
          {zh.growth.whyLabel}
        </b>
        <p className={`${proseCls} text-ink-body`}>{detail.why}</p>
      </div>

      <FlywheelBody stats={stats} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <section className={`${cardCls} min-w-0`}>
            <div className={cardHeadCls}>
              <Icon name="chart" size={15} className="text-ink-faint" />
              <h2 className="text-sm font-semibold text-ink">{zh.growth.vector.title}</h2>
              <span className="text-[11.5px] text-ink-muted">{zh.growth.vector.hint}</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className={`${ledgerHeadCls} border-b border-line px-3.5 py-2 text-left font-normal`}>
                      {zh.growth.vector.module}
                    </th>
                    {STAGES.map((s) => (
                      <th
                        key={s.code}
                        className={`${ledgerHeadCls} border-b border-line px-2 py-2 text-center font-normal`}
                      >
                        F{s.code} {s.name}
                      </th>
                    ))}
                    <th
                      className={`${ledgerHeadCls} border-b border-line px-3.5 py-2 text-right font-normal`}
                    >
                      {zh.growth.vector.expert}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {STAGE_MODULES.map((m) => (
                    <tr key={m}>
                      <td className="border-b border-line-hair px-3.5 py-1.5 text-ink-body">
                        {MODULE_LABEL[m]}
                      </td>
                      {STAGES.map((s) => (
                        <td key={s.code} className="border-b border-line-hair px-2 py-1.5 text-center">
                          <button
                            type="button"
                            aria-pressed={growth.stages[m] === s.code}
                            aria-label={`${MODULE_LABEL[m]} · F${String(s.code)} ${s.name}`}
                            onClick={() => setStage(m, s.code)}
                            className={`num rounded-sm px-2 py-0.5 text-xs transition-colors ${
                              growth.stages[m] === s.code
                                ? 'bg-accent-soft font-semibold text-accent-deep'
                                : 'text-ink-muted hover:bg-panel-2 hover:text-ink'
                            }`}
                          >
                            {String(s.code)}
                          </button>
                        </td>
                      ))}
                      <td className="border-b border-line-hair px-3.5 py-1.5 text-right">
                        <button
                          type="button"
                          aria-pressed={isExpert(growth, m)}
                          onClick={() => toggleExpert(m)}
                          className={filterChip(isExpert(growth, m))}
                        >
                          <Icon name={isExpert(growth, m) ? 'check' : 'x'} size={12} />
                          {isExpert(growth, m)
                            ? zh.growth.vector.expertOn
                            : zh.growth.vector.expertOff}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 展开即得：当前聚焦阶段的心智 / 权威 / 毕业信号（红线 3） */}
            <div className={cardBodyCls}>
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[11.5px] text-ink-muted">
                  {sys.growth.vector.focusLabel}
                </span>
                {STAGES.map((s) => (
                  <button
                    key={s.code}
                    type="button"
                    aria-pressed={focus === s.code}
                    onClick={() => setFocus(s.code)}
                    className={filterChip(focus === s.code)}
                  >
                    F{s.code}
                  </button>
                ))}
              </div>
              <dl className="grid gap-1.5 text-[13px] sm:grid-cols-2">
                <DetailItem label={sys.growth.vector.mindLabel} value={detail.mind} />
                <DetailItem label={sys.growth.vector.authorityLabel} value={detail.authority} />
                <DetailItem
                  label={sys.growth.vector.graduateLabel}
                  value={`${detail.graduate} · ${sys.growth.vector.pending}`}
                />
                <DetailItem label="英文名" value={detail.en} />
              </dl>
              <p className={`${proseCls} mt-2 text-[11.5px] text-ink-muted`}>
                {sys.growth.vector.pendingHint}
              </p>
            </div>
          </section>

          <section className={cardCls}>
            <div className={cardHeadCls}>
              <Icon name="lock" size={15} className="text-ink-faint" />
              <h2 className="text-sm font-semibold text-ink">{zh.growth.redlines.title}</h2>
              <span className="text-[11.5px] text-ink-muted">{zh.growth.redlines.hint}</span>
            </div>
            <ol className={`${cardBodyCls} flex flex-col gap-1.5`}>
              {REDLINES.map((r, i) => (
                <li key={i} className="flex gap-2.5 text-[13px] text-ink-body">
                  <span className="num shrink-0 text-ink-muted">{`${String(i + 1)}.`}</span>
                  <span>{r}</span>
                </li>
              ))}
            </ol>
            <div className={cardFootCls}>
              <span className={`${proseCls} text-[11.5px] text-ink-muted`}>
                {sys.growth.redlines.note}
              </span>
            </div>
          </section>
        </div>

        <LedgerPanel state={ledger} />
      </div>
    </div>
  )
}

function DetailItem(props: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-28 shrink-0 text-[11.5px] text-ink-muted">{props.label}</dt>
      <dd className="min-w-0 flex-1 text-ink-body">{props.value}</dd>
    </div>
  )
}

/** 统计条四态：加载骨架 / 错误可重试 / 数据 */
function FlywheelBody(props: { stats: ReturnType<typeof useFlywheelStats> }) {
  const { stats } = props
  if (stats.isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-busy>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`${skelCls} h-[86px] rounded-md`} />
        ))}
      </div>
    )
  }
  if (stats.error) {
    return (
      <div className={noteCls('danger')}>
        <b className={`${noteTitleCls} flex items-center gap-1.5 text-danger`}>
          <Icon name="alert" size={13} />
          统计条没取到
        </b>
        <p className={proseCls}>
          {sys.state.error(stats.error instanceof Error ? stats.error.message : '')}
        </p>
        <button type="button" className={`${btnGhost} mt-2`} onClick={() => void stats.refetch()}>
          <Icon name="refresh" size={13} />
          {sys.state.retry}
        </button>
      </div>
    )
  }
  if (stats.data === undefined) return null
  return <FlywheelCard {...stats.data} />
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

  const missing = state.error instanceof ApiError && state.error.status === 404

  return (
    <section className={`${cardCls} flex min-w-0 flex-col`}>
      <div className={cardHeadCls}>
        <Icon name="lock" size={15} className="text-ink-faint" />
        <h2 className="text-sm font-semibold text-ink">{zh.workbench.ledger.title}</h2>
        <span className={chipTone('default')}>
          <Icon name="lock" size={12} />
          不出网
        </span>
      </div>

      {state.data !== undefined && kinds.length > 0 && items.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-b border-line-hair px-3 py-2">
          <button
            type="button"
            aria-pressed={filter === ''}
            onClick={() => setFilter('')}
            className={filterChip(filter === '')}
          >
            {zh.growth.ledger.all} <span className="num">{String(state.data.total)}</span>
          </button>
          {kinds.map(([k, n]) => (
            <button
              key={k}
              type="button"
              aria-pressed={filter === k}
              onClick={() => setFilter(filter === k ? '' : k)}
              className={`${filterChip(filter === k)} mono`}
            >
              {k} <span className="num">{String(n)}</span>
            </button>
          ))}
        </div>
      )}

      {state.isLoading ? (
        <div className={`${cardBodyCls} space-y-1.5`} aria-busy>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`${skelCls} h-4`} />
          ))}
        </div>
      ) : missing ? (
        <div className={cardBodyCls}>
          <p className={`${proseCls} text-[13px] text-ink-muted`}>{sys.state.notOnline}</p>
        </div>
      ) : state.error ? (
        <div className={cardBodyCls}>
          <div className={emptyHintCls}>
            <p className="text-danger">
              {sys.state.error(state.error instanceof Error ? state.error.message : '')}
            </p>
            <button type="button" className={btnGhost} onClick={() => void state.refetch()}>
              <Icon name="refresh" size={13} />
              {sys.state.retry}
            </button>
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className={cardBodyCls}>
          <div className={emptyHintCls}>
            {filter === '' ? (
              <>
                <p>{zh.workbench.ledger.empty}</p>
                <p>{zh.workbench.ledger.emptyHint}</p>
              </>
            ) : (
              <>
                <p>{sys.growth.ledger.noResult}</p>
                <button
                  type="button"
                  className={btnGhost}
                  onClick={() => setFilter('')}
                >
                  <Icon name="x" size={13} />
                  {sys.growth.ledger.clearFilter}
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        <ul className="max-h-[420px] overflow-y-auto">
          {items.map((e) => (
            <li
              key={e.id}
              className={`${rowCls} flex items-baseline gap-2 px-3.5 py-1.5 last:border-b-0`}
            >
              <span className="mono min-w-0 grow truncate text-[11.5px] text-ink-body">
                {e.name}
              </span>
              <span className="num shrink-0 text-[11px] text-ink-muted">
                {new Date(e.ts).toLocaleString('zh-CN', { hour12: false })}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className={`${cardFootCls} mt-auto`}>
        <span className="text-[11px] text-ink-muted">{zh.workbench.ledger.hint}</span>
        <Link to="/settings" className="ml-auto shrink-0 text-xs text-ink-muted hover:text-ink">
          {sys.settings.ledger.manage} ›
        </Link>
      </div>
    </section>
  )
}

function maxStage(stages: GrowthState['stages']): Stage {
  return STAGE_MODULES.reduce<Stage>((acc, m) => (stages[m] > acc ? stages[m] : acc), 0)
}
