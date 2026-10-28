import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/client'
import { useLedger } from '../hooks/useLedger'
import { useProjectList, type ProjectView } from '../hooks/useProjects'
import {
  useFlywheelStats,
  useOnboardingToggle,
  useSettings,
  useTelemetrySettings,
  useTelemetryToggle,
} from '../hooks/useSettings'
import { zh } from '../i18n/zh'
import { sys } from '../i18n/lane-system'
import { FlywheelBody } from '../components/onboarding/FlywheelCard'
import { OnboardingBar } from '../components/onboarding/OnboardingBar'
import { TelemetryAskCard } from '../components/onboarding/TelemetryAskCard'
import {
  btnGhost,
  btnPrimary,
  cardBodyCls,
  cardCls,
  cardFootCls,
  cardHeadCls,
  chipTone,
  emptyHintCls,
  proseCls,
  rowCls,
  skelCls,
} from '../components/ui/styles'
import { QueryError, QueryOffline, QuerySkeleton } from '../components/ui/QueryStates'
import { Icon } from '../components/ui/icons'
import { LedgerCardHead } from '../components/ui/LedgerCardHead'
import { toast } from '../components/ui/Toaster'

/**
 * 工作台（侧栏「概览」组，路由 `/`）。
 *
 * 本页承接三件首启/常驻内容（它们已于本轮从壳层搬来，见 AppShell 纪律 2）：
 * OnboardingBar（无项目且未完成时出镜，可跳步）、FlywheelBody（常驻统计条）、
 * TelemetryAskCard（见过首次注入且 askState 仍是 unset 时问一次）。三件都在这一页，
 * 老用户不必在其他页面被横幅打扰，首启用户落地就看见。
 */
export function WorkbenchPage() {
  const qc = useQueryClient()
  const settings = useSettings()
  const projects = useProjectList('all')
  const stats = useFlywheelStats()
  const telemetry = useTelemetrySettings()
  const ledger = useLedger()
  const markDone = useOnboardingToggle()
  const toggleTelemetry = useTelemetryToggle()
  const [step, setStep] = useState(1)
  // 手动重开向导：FR-2.1 的双条件是「自动出镜」的条件，不是「只有那时能打开」
  const [wizardOpen, setWizardOpen] = useState(false)

  const firstRun =
    settings.data !== undefined &&
    projects.data !== undefined &&
    !settings.data.onboardingDone &&
    projects.data.total === 0

  const finish = () =>
    markDone.mutate(true, {
      onSuccess: () => {
        setStep(1)
        setWizardOpen(false)
        void qc.invalidateQueries({ queryKey: ['stats'] })
      },
    })

  const choose = (enabled: boolean) =>
    toggleTelemetry.mutate(enabled, {
      onSuccess: () =>
        toast(
          zh.telemetryAsk.chose(enabled ? zh.settings.telemetry.on : zh.settings.telemetry.off),
        ),
    })

  const recent = (projects.data?.items ?? []).slice(0, 4)

  return (
    <div className="flex flex-col gap-4 px-6 py-6 max-md:px-4">
      {/* view-head：h1 + 一句话说明 + 右侧主动作（三页同构） */}
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0">
          <h1 className="text-[30px] font-semibold leading-[1.25] tracking-tight text-ink max-sm:text-[25px]">
            {zh.workbench.title}
          </h1>
          <p className={`${proseCls} mt-1 text-[13.5px] text-ink-muted`}>{zh.workbench.subtitle}</p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button
            type="button"
            className={btnGhost}
            aria-pressed={firstRun || wizardOpen}
            onClick={() => setWizardOpen((v) => !v)}
          >
            <Icon name="flow" size={14} />
            {sys.workbench.action.wizard}
          </button>
          <Link to="/packs" className={btnPrimary}>
            <Icon name="plus" size={14} />
            {sys.workbench.action.newPack}
          </Link>
        </div>
      </header>

      {(firstRun || wizardOpen) && (
        <OnboardingBar step={step} onStepChange={setStep} onSkip={finish} onDone={finish} />
      )}
      {telemetry.data !== undefined && (stats.data?.injections ?? 0) > 0 && (
        <TelemetryAskCard askState={telemetry.data.askState} onChoose={choose} />
      )}

      <FlywheelBody stats={stats} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <RecentProjects
          loading={projects.isLoading}
          error={projects.error}
          onRetry={() => void projects.refetch()}
          items={recent}
          total={projects.data?.total ?? 0}
        />
        <div className="flex min-w-0 flex-col gap-4">
          <TodayCard />
          <LedgerCard state={ledger} />
        </div>
      </div>
    </div>
  )
}

/** 最近项目卡四态：加载骨架 / 错误可重试 / 空态引导 / 列表；底部附健康摘要口径说明 */
function RecentProjects(props: {
  loading: boolean
  error: unknown
  onRetry: () => void
  items: ProjectView[]
  total: number
}) {
  return (
    <section className={`${cardCls} min-w-0`}>
      <div className={cardHeadCls}>
        <Icon name="folder" size={15} className="text-ink-faint" />
        <h2 className="text-sm font-semibold text-ink">{zh.workbench.projects.title}</h2>
        <Link
          to="/projects"
          className="ml-auto flex items-center gap-1 text-xs text-ink-muted hover:text-ink"
        >
          {zh.workbench.projects.all} ›
        </Link>
      </div>

      {props.loading ? (
        <div className={`${cardBodyCls} space-y-2`} aria-busy>
          {[0, 1, 2].map((i) => (
            <div key={i} className={`${skelCls} h-9`} />
          ))}
        </div>
      ) : props.error !== null && props.error !== undefined ? (
        <div className={cardBodyCls}>
          <div className={emptyHintCls}>
            <p className="text-danger">{sys.state.error(errText(props.error))}</p>
            <button type="button" className={btnGhost} onClick={props.onRetry}>
              <Icon name="refresh" size={13} />
              {sys.state.retry}
            </button>
          </div>
        </div>
      ) : props.items.length === 0 ? (
        <div className={cardBodyCls}>
          <div className={emptyHintCls}>
            <p>{sys.workbench.projects.emptyTitle}</p>
            <p>{sys.workbench.projects.emptyHint}</p>
            <Link to="/projects" className={btnGhost}>
              <Icon name="plus" size={13} />
              {sys.workbench.projects.emptyCta}
            </Link>
          </div>
        </div>
      ) : (
        <ul className="flex flex-col">
          {props.items.map((p) => (
            <li key={p.id}>
              <Link
                to={`/projects/${p.id}`}
                className={`${rowCls} flex items-center gap-3 px-3.5 py-2 transition-colors last:border-b-0`}
              >
                <span className="min-w-0 grow">
                  <span className="block truncate text-sm font-medium text-ink">{p.name}</span>
                  <span className="mono block truncate text-[11.5px] text-ink-muted">
                    {p.localPath ?? sys.workbench.projects.noPath}
                    {p.currentStage ? ` · ${zh.workbench.projects.stage(p.currentStage)}` : ''}
                    {p.health.total > 0
                      ? ` · ${sys.workbench.projects.checkNote(
                          p.health.total - p.health.unchecked,
                          p.health.total,
                        )}`
                      : ''}
                  </span>
                </span>
                {p.standardPackId && p.standardPackVersion ? (
                  <span className={`${chipTone('ok')} shrink-0`}>
                    <Icon name="check" size={12} />
                    {zh.workbench.projects.pack(p.standardPackVersion)}
                  </span>
                ) : (
                  <span className="shrink-0 text-[11.5px] text-ink-muted">
                    {zh.workbench.projects.noPack}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {props.items.length > 0 && (
        <div className={cardFootCls}>
          <span className="text-[11.5px] text-ink-muted">
            健康摘要 = 所处阶段 + 未完检查项 + 最近日志
          </span>
        </div>
      )}
    </section>
  )
}

function TodayCard() {
  const rows: { to: string; label: string; icon: 'search' | 'check' | 'doc' }[] = [
    { to: '/library', label: zh.workbench.today.findPrompt, icon: 'search' },
    { to: '/projects', label: zh.workbench.today.checkList, icon: 'check' },
    { to: '/projects', label: zh.workbench.today.appendLog, icon: 'doc' },
  ]
  return (
    <section className={cardCls}>
      <div className={cardHeadCls}>
        <Icon name="list" size={15} className="text-ink-faint" />
        <h2 className="text-sm font-semibold text-ink">{zh.workbench.today.title}</h2>
      </div>
      <div className={`${cardBodyCls} flex flex-col gap-1.5`}>
        {rows.map((r) => (
          <Link key={r.label} to={r.to} className={`${btnGhost} justify-start`}>
            <Icon name={r.icon} size={13} />
            {r.label}
          </Link>
        ))}
        <p className="mt-0.5 text-[11.5px] text-ink-muted">{sys.workbench.today.note}</p>
      </div>
    </section>
  )
}

/**
 * 本机自证层（MT 层）在工作台的落点：只读、只留本机、不出网。
 * 四态齐全，且把「端点未上线」与「真出错」分开说。
 */
function LedgerCard(props: { state: ReturnType<typeof useLedger> }) {
  const { state } = props
  const missing = state.error instanceof ApiError && state.error.status === 404
  const items = state.data?.items ?? []

  return (
    <section className={cardCls}>
      <LedgerCardHead />

      {state.isLoading ? (
        <QuerySkeleton wrap={cardBodyCls} />
      ) : missing ? (
        <QueryOffline wrap={cardBodyCls} />
      ) : state.error ? (
        <QueryError wrap={cardBodyCls} error={state.error} onRetry={() => void state.refetch()} />
      ) : items.length === 0 ? (
        <div className={cardBodyCls}>
          <div className={emptyHintCls}>
            <p>{zh.workbench.ledger.empty}</p>
            <p>{zh.workbench.ledger.emptyHint}</p>
            <Link to="/packs" className={btnGhost}>
              <Icon name="pack" size={13} />
              {sys.workbench.action.newPack}
            </Link>
          </div>
        </div>
      ) : (
        <ul className="flex flex-col">
          {items.slice(0, 5).map((e) => (
            <li key={e.id} className={`${rowCls} flex items-center gap-2 px-3.5 py-1.5`}>
              <span className="mono min-w-0 grow truncate text-[12px] text-ink-body">{e.name}</span>
              <span className="num shrink-0 text-[11px] text-ink-muted">
                {new Date(e.ts).toLocaleString('zh-CN', { hour12: false })}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className={cardFootCls}>
        <span className="text-[11px] text-ink-muted">{sys.workbench.ledger.orthogonal}</span>
        <Link to="/growth" className="ml-auto shrink-0 text-xs text-ink-muted hover:text-ink">
          {zh.workbench.ledger.open} ›
        </Link>
      </div>
    </section>
  )
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : ''
}
