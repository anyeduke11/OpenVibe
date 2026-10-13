import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/client'
import { useLedger } from '../hooks/useLedger'
import { useProjectList } from '../hooks/useProjects'
import {
  useFlywheelStats,
  useOnboardingToggle,
  useSettings,
  useTelemetrySettings,
  useTelemetryToggle,
} from '../hooks/useSettings'
import { zh } from '../i18n/zh'
import { FlywheelCard } from '../components/onboarding/FlywheelCard'
import { OnboardingBar } from '../components/onboarding/OnboardingBar'
import { TelemetryAskCard } from '../components/onboarding/TelemetryAskCard'
import { btnGhost, btnPrimary, emptyHintCls, rowCls } from '../components/ui/styles'
import { toast } from '../components/ui/Toaster'

/**
 * 工作台（侧栏「概览」组，路由 `/`）。
 *
 * 三张常驻卡（首启向导 / 遥测询问 / 飞轮）原本挂在顶栏，V1 起就在每一页可见；
 * V2 把它们收到本页，因为 PRD §3.4 写的是「飞轮统计面板 = **工作台** 常驻卡片」——
 * 收回来既合规格，又让 AppShell 的入口包瘦下来（入口只剩顶栏 + 侧栏）。
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

  const firstRun =
    settings.data !== undefined &&
    projects.data !== undefined &&
    !settings.data.onboardingDone &&
    projects.data.total === 0

  const finish = () =>
    markDone.mutate(true, {
      onSuccess: () => {
        setStep(1)
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
      <header>
        <h1 className="text-[26px] font-semibold tracking-tight text-ink max-md:text-[22px]">
          {zh.workbench.title}
        </h1>
        <p className="mt-1 max-w-[68ch] text-[13.5px] text-ink-muted">{zh.workbench.subtitle}</p>
      </header>

      {/* 常驻三卡：向导按 FR-2.1 双条件出镜，询问卡按 FR-4.2 在见过首次注入后才问 */}
      {firstRun && (
        <OnboardingBar step={step} onStepChange={setStep} onSkip={finish} onDone={finish} />
      )}
      {telemetry.data !== undefined && (stats.data?.injections ?? 0) > 0 && (
        <TelemetryAskCard askState={telemetry.data.askState} onChoose={choose} />
      )}
      {stats.data !== undefined && <FlywheelCard {...stats.data} />}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          {/* 定位卡：V2 的表达位是「一屏说清这是什么 + 三个入口」 */}
          <section className="rounded-md border border-accent-line bg-accent-soft px-4 py-4">
            <h2 className="text-lg font-semibold text-accent-deep max-md:text-base">
              {zh.workbench.lead.title}
            </h2>
            <p className="mt-1.5 max-w-[68ch] text-sm text-ink-body">{zh.workbench.lead.body}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link to="/library" className={btnPrimary}>
                {zh.workbench.lead.browse}
              </Link>
              <Link to="/packs" className={btnGhost}>
                {zh.workbench.lead.pack}
              </Link>
              <Link to="/settings" className={btnGhost}>
                {zh.workbench.lead.settings}
              </Link>
            </div>
          </section>

          <section className="rounded-md border border-line bg-panel shadow-1">
            <h2 className="border-b border-line-hair px-4 py-2.5 text-sm font-semibold text-ink">
              {zh.workbench.today.title}
              <span className="ml-2 text-[11.5px] font-normal text-ink-faint">
                {zh.workbench.today.hint}
              </span>
            </h2>
            <ul className="flex flex-col">
              <QuickRow to="/library" label={zh.workbench.today.findPrompt} />
              <QuickRow to="/projects" label={zh.workbench.today.checkList} />
              <QuickRow to="/projects" label={zh.workbench.today.appendLog} />
            </ul>
          </section>

          <section className="rounded-md border border-line bg-panel shadow-1">
            <h2 className="flex items-center gap-2 border-b border-line-hair px-4 py-2.5 text-sm font-semibold text-ink">
              {zh.workbench.projects.title}
              <Link
                to="/projects"
                className="ml-auto text-xs font-normal text-ink-muted hover:text-ink"
              >
                {zh.workbench.projects.all} ›
              </Link>
            </h2>
            {projects.isLoading ? (
              <p className="px-4 py-6 text-sm text-ink-faint">{zh.common.loading}</p>
            ) : recent.length === 0 ? (
              <div className="px-4 py-6">
                <div className={emptyHintCls}>
                  <p>{zh.workbench.projects.empty}</p>
                  <Link to="/projects" className={btnGhost}>
                    {zh.workbench.projects.new}
                  </Link>
                </div>
              </div>
            ) : (
              <ul className="flex flex-col">
                {recent.map((p) => (
                  <li key={p.id}>
                    <Link
                      to={`/projects/${p.id}`}
                      className={`${rowCls} flex items-center gap-3 px-4 py-2.5 transition-colors last:border-b-0`}
                    >
                      <span className="min-w-0 grow">
                        <span className="block truncate text-sm font-medium text-ink">
                          {p.name}
                        </span>
                        <span className="mono block truncate text-[11.5px] text-ink-muted">
                          {p.localPath ?? zh.common.none}
                          {p.currentStage ? ` · ${zh.workbench.projects.stage(p.currentStage)}` : ''}
                          {p.health.total > 0
                            ? ` · ${p.health.total - p.health.unchecked}/${p.health.total}`
                            : ''}
                        </span>
                      </span>
                      {p.standardPackId && p.standardPackVersion ? (
                        <span className="mono shrink-0 rounded-sm border border-line-hair bg-panel-2 px-2 py-0.5 text-[11.5px] text-ink-muted">
                          {zh.workbench.projects.pack(p.standardPackVersion)}
                        </span>
                      ) : (
                        <span className="shrink-0 text-[11.5px] text-ink-faint">
                          {zh.workbench.projects.noPack}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <section className="rounded-md border border-line bg-panel shadow-1">
            <h2 className="border-b border-line-hair px-4 py-2.5 text-sm font-semibold text-ink">
              {zh.workbench.ledger.title}
              <span className="ml-2 rounded-sm border border-line-hair bg-panel-2 px-1.5 text-[11px] font-normal text-ink-muted">
                不出网
              </span>
            </h2>
            <LedgerBody
              state={ledger}
              emptyText={zh.workbench.ledger.empty}
              emptyHint={zh.workbench.ledger.emptyHint}
            />
            <div className="flex items-center gap-2 border-t border-line-hair px-4 py-2">
              <span className="text-[11px] text-ink-faint">{zh.workbench.ledger.hint}</span>
              <Link
                to="/growth"
                className="ml-auto text-xs text-ink-muted hover:text-ink"
              >
                {zh.workbench.ledger.open} ›
              </Link>
            </div>
          </section>

          <section className="rounded-md border border-line bg-panel shadow-1">
            <h2 className="border-b border-line-hair px-4 py-2.5 text-sm font-semibold text-ink">
              {zh.workbench.quick.title}
            </h2>
            <div className="grid grid-cols-2 gap-2 p-3">
              <QuickLink to="/terms" label={zh.workbench.quick.terms} />
              <QuickLink to="/skills" label={zh.workbench.quick.skills} />
              <QuickLink to="/flows" label={zh.workbench.quick.flows} />
              <QuickLink to="/packs" label={zh.workbench.quick.packs} />
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function QuickRow(props: { to: string; label: string }) {
  return (
    <li className="border-b border-line-hair last:border-b-0">
      <Link
        to={props.to}
        className={`${rowCls} block px-4 py-2.5 text-sm text-ink-body transition-colors hover:text-ink`}
      >
        {props.label}
        <span className="float-right text-ink-faint">›</span>
      </Link>
    </li>
  )
}

function QuickLink(props: { to: string; label: string }) {
  return (
    <Link
      to={props.to}
      className="rounded-md border border-line bg-panel-2 px-3 py-2 text-[13px] text-ink-body transition-colors hover:border-line-strong hover:bg-panel hover:text-ink"
    >
      {props.label}
    </Link>
  )
}

/**
 * 台账四态：加载 / 错误 / 空 / 有数据。端点未上线（404）与真出错分开说，
 * 不让「还没实现」看起来像「坏了」。
 */
function LedgerBody(props: {
  state: ReturnType<typeof useLedger>
  emptyText: string
  emptyHint: string
}) {
  const { state } = props
  if (state.isLoading) {
    return <p className="px-4 py-5 text-sm text-ink-faint">{zh.common.loading}</p>
  }
  if (state.error instanceof ApiError && state.error.status === 404) {
    return <p className="px-4 py-5 text-[13px] text-ink-faint">{zh.workbench.ledger.unavailable}</p>
  }
  if (state.error) {
    return (
      <p className="px-4 py-5 text-[13px] text-danger">
        {zh.common.failed(state.error instanceof Error ? state.error.message : '')}
      </p>
    )
  }
  const items = state.data?.items ?? []
  if (items.length === 0) {
    return (
      <div className="px-4 py-5 text-center">
        <p className="text-[13px] text-ink-faint">{props.emptyText}</p>
        <p className="mt-1 text-[11.5px] text-ink-faint">{props.emptyHint}</p>
      </div>
    )
  }
  return (
    <ul className="flex flex-col">
      {items.slice(0, 6).map((e) => (
        <li
          key={e.id}
          className={`${rowCls} flex items-center gap-2 px-4 py-2 last:border-b-0`}
        >
          <span className="mono min-w-0 grow truncate text-[12px] text-ink-body">{e.name}</span>
          <span className="mono shrink-0 text-[11px] text-ink-faint">
            {new Date(e.ts).toLocaleString('zh-CN', { hour12: false })}
          </span>
        </li>
      ))}
    </ul>
  )
}