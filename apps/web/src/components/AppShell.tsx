import { useState, Suspense } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useProjectList } from '../hooks/useProjects'
import {
  useFlywheelStats,
  useOnboardingToggle,
  useSettings,
  useTelemetrySettings,
  useTelemetryToggle,
} from '../hooks/useSettings'
import { zh } from '../i18n/zh'
import { FlywheelCard } from './onboarding/FlywheelCard'
import { OnboardingBar } from './onboarding/OnboardingBar'
import { TelemetryAskCard } from './onboarding/TelemetryAskCard'
import { toast } from './ui/Toaster'

// 侧栏固定七项（dev-plan §5.1）
const NAV = [
  { to: '/library', label: zh.nav.library },
  { to: '/terms', label: zh.nav.terms },
  { to: '/skills', label: zh.nav.skills },
  { to: '/flows', label: zh.nav.flows },
  { to: '/projects', label: zh.nav.projects },
  { to: '/packs', label: zh.nav.packs },
  { to: '/settings', label: zh.nav.settings },
]

/**
 * 顶栏三件套（dev-plan §5.1「OnboardingBar + FlywheelCard 常驻顶栏」）：
 * 向导条按 FR-2.1 双条件出现（无项目 && 未完成），飞轮卡常驻，
 * 询问卡只在「已见过首次注入且 askState=unset」时出现（FR-4.2 / D13）。
 */
function TopBand() {
  const qc = useQueryClient()
  const settings = useSettings()
  const projects = useProjectList('all')
  const stats = useFlywheelStats()
  const telemetry = useTelemetrySettings()
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

  return (
    <>
      {firstRun && (
        <OnboardingBar step={step} onStepChange={setStep} onSkip={finish} onDone={finish} />
      )}
      {stats.data !== undefined && <FlywheelCard {...stats.data} />}
      {/* 首次注入之后才询问（FR-4.2）；injections 变化要等 stats 重取，故挂载条件在此而非卡内 */}
      {telemetry.data !== undefined && (stats.data?.injections ?? 0) > 0 && (
        <TelemetryAskCard askState={telemetry.data.askState} onChoose={choose} />
      )}
    </>
  )
}

/** 分包后页面 chunk 在路上时的占位（Suspense 只包住 Outlet，侧栏与顶栏不跟着闪） */
function PageLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="flex h-full items-center justify-center py-16 text-sm text-zinc-400"
    >
      {zh.common.loading}
    </div>
  )
}

export function AppShell() {
  return (
    <div className="flex h-full">
      <aside className="flex w-56 shrink-0 flex-col border-r border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 px-5 py-4">
          <div className="text-sm font-semibold text-brand">{zh.appName}</div>
          <div className="mt-0.5 text-[11px] text-zinc-400">vibe coding 的标准化工作台</div>
        </div>
        <nav className="flex-1 p-2">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `mb-0.5 block rounded-md px-3 py-2 text-sm ${
                  isActive
                    ? 'bg-brand-soft font-medium text-brand'
                    : 'text-zinc-600 hover:bg-zinc-50'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-zinc-100 px-5 py-3 text-[11px] leading-relaxed text-zinc-400">
          数据存 <span className="mono">~/.openvibe/</span>
          <br />
          本工具仅监听 127.0.0.1
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBand />
        <div className="min-h-0 flex-1 overflow-hidden">
          <Suspense fallback={<PageLoading />}>
            <Outlet />
          </Suspense>
        </div>
      </main>
    </div>
  )
}
