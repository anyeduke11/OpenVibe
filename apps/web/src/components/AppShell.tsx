import { useState, Suspense } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useProjectList } from '../hooks/useProjects'
import { useTheme } from '../hooks/useTheme'
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

// 书脊侧栏七项（dev-plan §5.1；视觉形态见 DESIGN.md「书脊侧栏」）：
// 单字汉字为图标，竖排标签随侧栏，激活态松绿洗底 + 朱砂书签点
const NAV = [
  { to: '/library', label: zh.nav.library, hz: '库' },
  { to: '/terms', label: zh.nav.terms, hz: '词' },
  { to: '/skills', label: zh.nav.skills, hz: '技' },
  { to: '/flows', label: zh.nav.flows, hz: '流' },
  { to: '/projects', label: zh.nav.projects, hz: '项' },
  { to: '/packs', label: zh.nav.packs, hz: '包' },
  { to: '/settings', label: zh.nav.settings, hz: '设' },
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

/** 分包后页面 chunk 在路上时的占位（Suspense 只包住 Outlet，书脊与顶栏不跟着闪） */
function PageLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="flex h-full items-center justify-center py-16 text-sm text-ink-faint"
    >
      {zh.common.loading}
    </div>
  )
}

/** 书脊主题切换：昼/夜单字按钮（亮「温纸白」/ 暗「夜账本」，DESIGN.md Colors） */
function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const dark = theme === 'dark'
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={zh.common.theme.aria}
      title={dark ? zh.common.theme.light : zh.common.theme.dark}
      className="flex h-8 w-8 items-center justify-center rounded-md border border-line bg-panel text-sm text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
    >
      {dark ? '昼' : '夜'}
    </button>
  )
}

export function AppShell() {
  return (
    <div className="flex h-full max-md:flex-col">
      {/* 书脊（DESIGN.md Layout）：竖排衬线字标 + 单字导航；<md 退化为横向顶栏 */}
      <aside className="flex w-[76px] shrink-0 flex-col items-center gap-4 border-r border-line bg-canvas py-4 max-md:w-full max-md:flex-row max-md:gap-3 max-md:overflow-x-auto max-md:border-b max-md:border-r-0 max-md:py-2 max-md:pl-3">
        <div className="flex flex-col items-center gap-1.5 max-md:flex-row max-md:gap-2">
          <div
            className="wordmark v-rl border-b border-line-strong pb-2 text-2xl tracking-[0.3em] text-ink-strong max-md:border-b-0 max-md:border-r max-md:pb-0 max-md:pr-2 max-md:tracking-[0.12em] max-md:[writing-mode:horizontal-tb]"
            aria-label={zh.appName}
          >
            灵典
          </div>
          <div className="text-[9px] tracking-widest text-ink-faint max-md:hidden">OPENVIBE</div>
        </div>
        <nav className="flex flex-1 flex-col items-center gap-0.5 max-md:flex-row" aria-label="主导航">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `relative flex w-14 flex-col items-center rounded-md py-1.5 transition-colors hover:bg-fill-soft max-md:w-auto max-md:flex-row max-md:gap-1.5 max-md:px-2.5 ${
                  isActive ? 'bg-brand-soft text-brand' : 'text-ink-muted hover:text-ink'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span
                      aria-hidden
                      className="absolute left-1 top-1/2 h-1 w-1 -translate-y-1/2 rounded-[1px] bg-seal max-md:static max-md:-translate-y-0"
                    />
                  )}
                  <span className="text-[17px] font-semibold leading-tight">{item.hz}</span>
                  <span className="text-[10px] leading-tight max-md:text-[11px]">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="flex flex-col items-center gap-2 max-md:flex-row">
          <ThemeToggle />
          <div className="v-rl text-[9px] leading-relaxed tracking-wider text-ink-faint max-md:[writing-mode:horizontal-tb]">
            数据存 ~/.openvibe/ · 仅监听 127.0.0.1
          </div>
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
