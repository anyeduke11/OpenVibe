import { lazy, Suspense, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useNavCounts } from '../hooks/useNavCounts'
import { useTheme } from '../hooks/useTheme'
import { useExpertMode } from '../hooks/useExpertMode'
import { appName, common, nav } from '../i18n/core'
import { CommandPaletteHost, OPEN_PALETTE_EVENT } from './CommandPaletteHost'
import { Icon, type IconName } from './ui/icons'
import { btnGhost } from './ui/styles'

/**
 * 覆盖地图**懒加载**：它带一份能力位表（≈10KB）与 Radix Dialog，
 * 进入口 chunk 会把 `bundle:check` 的 300kB 闸顶破（壳层纪律 1 的同一条理由）。
 */
const CoverageMapDialog = lazy(() =>
  import('./CoverageMapDialog').then((m) => ({ default: m.CoverageMapDialog })),
)

/**
 * 壳层 = 顶栏 + 侧栏 + 出口（DESIGN.md Layout）。
 *
 * 三条纪律：
 * 1. **壳层只 import `i18n/core`**——域文案跟着懒加载页走，别把 30KB 拖进入口（见 core.ts 注）。
 * 2. **首启向导 / 飞轮卡 / 遥测询问不在壳层**：它们是工作台的内容，不是每页都该顶着的横幅。
 *    首启用户落在 `/`，看得到；老用户不想被打扰，也不必在别的页面上看见（dev-plan §5.1 的旧
 *    「常驻顶栏」在此改判，改动只影响出现位置，不影响 FR-2.1 的双条件与 FR-4.2 的问询时机）。
 * 3. **主题切换全站唯一入口在顶栏**（DESIGN.md Layout），侧栏不再放第二个。
 */

/**
 * 侧栏六组十六项（成长视角 · 原型 NAV）。
 *
 * 分组口径 = 成长阶段（F0 跟随 → F3 定标），见 `i18n/core.ts` 的 `nav.group` 注。
 * count 走单端点 `/api/nav-counts`，不是七个请求；设计稿页（加载协议 / 团队协作）
 * 不占角标 —— 它们的「设计稿」标记在页头，不伪装成数量。
 */
const NAV: {
  group: string
  items: { to: string; label: string; icon: IconName; count?: (c: Counts) => number }[]
}[] = [
  {
    group: nav.group.panorama,
    items: [{ to: '/', label: nav.home, icon: 'home' }],
  },
  {
    group: nav.group.follow,
    items: [
      { to: '/guide', label: nav.guide, icon: 'compass' },
      { to: '/projects', label: nav.projects, icon: 'folder', count: (c) => c.projects },
    ],
  },
  {
    group: nav.group.practice,
    items: [
      { to: '/terms', label: nav.terms, icon: 'book', count: (c) => c.terms },
      { to: '/playbooks', label: nav.playbooks, icon: 'sparkle', count: (c) => c.playbooks },
      { to: '/learn', label: nav.learn, icon: 'list' },
      { to: '/agent', label: nav.agent, icon: 'flow' },
    ],
  },
  {
    group: nav.group.author,
    items: [
      { to: '/library', label: nav.library, icon: 'doc', count: (c) => c.prompts },
      { to: '/skills', label: nav.skills, icon: 'box', count: (c) => c.skills },
      { to: '/flows', label: nav.flows, icon: 'flow', count: (c) => c.flows },
      { to: '/packs', label: nav.packs, icon: 'pack', count: (c) => c.packs },
    ],
  },
  {
    group: nav.group.standard,
    items: [
      { to: '/inject', label: nav.inject, icon: 'pulse' },
      { to: '/loading', label: nav.loading, icon: 'clock' },
      { to: '/team', label: nav.team, icon: 'git' },
      { to: '/growth', label: nav.growth, icon: 'chart' },
    ],
  },
  {
    group: nav.group.system,
    items: [{ to: '/settings', label: nav.settings, icon: 'cog' }],
  },
]

type Counts = {
  prompts: number
  terms: number
  playbooks: number
  skills: number
  flows: number
  projects: number
  packs: number
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      {/* 品牌 tile：accent → accent-deep 同色相双色，是全站唯一允许的渐变（DESIGN.md Don'ts） */}
      <div
        aria-hidden
        className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent-deep text-[15px] font-bold text-on-accent shadow-1"
      >
        灵
      </div>
      <div className="leading-tight">
        <div className="text-[15px] font-semibold tracking-tight text-ink">{appName}</div>
        <div className="text-[11.5px] text-ink-muted">vibe coding 标准化工作台</div>
      </div>
    </div>
  )
}

function ThemeSwitch() {
  const { theme, toggle } = useTheme()
  const dark = theme === 'dark'
  return (
    <div
      className="flex items-center gap-0.5 rounded-sm border border-line bg-panel-2 p-0.5"
      role="group"
      aria-label={common.theme.aria}
    >
      {[
        { key: 'paper', label: common.theme.paper, icon: 'sun' as IconName },
        { key: 'dark', label: common.theme.night, icon: 'moon' as IconName },
      ].map((opt) => {
        const on = (opt.key === 'dark') === dark
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => {
              if ((opt.key === 'dark') !== dark) toggle()
            }}
            aria-pressed={on}
            // min-h-11 = 44px：触屏最小可点区（2026-11-08 窄屏核验实测 38px，不足）
            className={`inline-flex min-h-11 items-center gap-1 rounded-[4px] px-2 text-xs transition-colors ${
              on ? 'bg-panel text-ink shadow-1' : 'text-ink-muted hover:text-ink'
            }`}
          >
            <Icon name={opt.icon} size={13} />
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

function Sidebar(props: {
  moreOpen: boolean
  /** 直接设值（不传 updater 形态）：两个调用点都是「关掉展开」 */
  setMoreOpen: (v: boolean) => void
  setMapOpen: (v: boolean) => void
  expert: boolean
  toggleExpert: () => void
}) {
  const { moreOpen, setMoreOpen, setMapOpen, expert, toggleExpert } = props
  const { data } = useNavCounts()
  const counts = (data ?? {
    prompts: 0,
    terms: 0,
    playbooks: 0,
    skills: 0,
    flows: 0,
    projects: 0,
    packs: 0,
  }) as Counts
  return (
    <aside className="flex w-[216px] shrink-0 flex-col border-r border-line bg-canvas max-lg:h-auto max-lg:w-full max-lg:flex-col max-lg:border-b max-lg:border-r-0">
      <nav
        className="flex flex-1 flex-col gap-3.5 overflow-y-auto p-2.5 max-lg:flex-row max-lg:gap-1 max-lg:overflow-visible max-lg:p-2"
        aria-label="主导航"
      >
        {NAV.map((g) => (
          <div key={g.group} className="max-lg:contents">
            <div className="px-2.5 pb-1 text-[11.5px] text-ink-faint max-lg:hidden">{g.group}</div>
            <div className="flex flex-col gap-0.5 max-lg:flex-row max-lg:gap-1">
              {g.items.map((it) => (
                <NavLink
                  key={it.to}
                  to={it.to}
                  end={it.to === '/'}
                  className={({ isActive }) =>
                    `group relative flex items-center gap-2 rounded-md px-2.5 py-[7px] text-sm transition-colors max-lg:whitespace-nowrap max-lg:py-1.5 ${
                      isActive
                        ? 'bg-accent-soft font-semibold text-accent-deep'
                        : 'text-ink-body hover:bg-panel-2 hover:text-ink'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {/* 激活指示条：2px 赭石，贴左沿（DESIGN.md Layout） */}
                      {isActive && (
                        <span
                          aria-hidden
                          className="absolute -left-2.5 top-1.5 bottom-1.5 w-[2px] rounded-r bg-accent max-lg:hidden"
                        />
                      )}
                      <Icon
                        name={it.icon}
                        size={15}
                        className={isActive ? 'text-accent-deep' : 'text-ink-faint'}
                      />
                      <span className="flex-1">{it.label}</span>
                      {it.count && (
                        <span
                          className={`text-[11.5px] tabular-nums ${isActive ? 'text-accent-deep' : 'text-ink-faint'}`}
                        >
                          {String(it.count(counts))}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* 窄屏「更多」：顶栏在 <640px 藏起了三个 ghost 按钮，能力不能跟着消失。
          ⚠️ 只在这三档以下出现（`max-sm:flex`）——桌面与宽屏下它是冗余入口。 */}
      <div className="mt-auto flex-col gap-1 border-t border-line-hair px-2 py-2 max-sm:flex sm:hidden">
        <button
          type="button"
          onClick={() => setMoreOpen(!moreOpen)}
          aria-expanded={moreOpen}
          aria-controls="sidebar-more"
          aria-label={nav.more.aria}
          className="flex min-h-11 items-center gap-2 rounded-md px-2.5 text-[12.5px] text-ink-muted hover:bg-panel-2 hover:text-ink"
        >
          <Icon name="list" size={14} />
          <span className="flex-1 text-left">{nav.more.label}</span>
          <span aria-hidden className="text-[10px]">
            {moreOpen ? '▴' : '▾'}
          </span>
        </button>
        {moreOpen && (
          <div id="sidebar-more" className="flex flex-col gap-0.5">
            <button
              type="button"
              onClick={() => {
                setMoreOpen(false)
                setMapOpen(true)
              }}
              className="flex min-h-11 items-center gap-2 rounded-md px-2.5 text-left text-[12.5px] text-ink-muted hover:bg-panel-2 hover:text-ink"
            >
              <Icon name="map" size={14} />
              {common.coverageMap.label}
            </button>
            <button
              type="button"
              onClick={() => {
                setMoreOpen(false)
                toggleExpert()
              }}
              aria-pressed={expert}
              aria-label={common.expertMode.aria}
              className={`flex min-h-11 items-center gap-2 rounded-md px-2.5 text-left text-[12.5px] ${
                expert
                  ? 'bg-accent-soft font-medium text-accent-deep'
                  : 'text-ink-muted hover:bg-panel-2 hover:text-ink'
              }`}
            >
              <Icon name="clock" size={14} />
              {common.expertMode.label}
            </button>
            <button
              type="button"
              onClick={() => {
                setMoreOpen(false)
                window.dispatchEvent(new CustomEvent(OPEN_PALETTE_EVENT))
              }}
              aria-label={common.commandPalette.aria}
              className="flex min-h-11 items-center gap-2 rounded-md px-2.5 text-left text-[12.5px] text-ink-muted hover:bg-panel-2 hover:text-ink"
            >
              <Icon name="search" size={14} />
              {common.commandPalette.label}
            </button>
          </div>
        )}
      </div>

      {/* 页脚：本机优先的落点（~/.openvibe · 127.0.0.1），不是版权信息 */}
      <div className="border-t border-line-hair px-4 py-2.5 text-[11.5px] leading-relaxed text-ink-faint max-lg:hidden">
        <div className="mono break-all">{nav.footerPath}</div>
        <div className="mono">{nav.footerHost}</div>
        <div>{nav.footerStore}</div>
      </div>
    </aside>
  )
}

/** 分包后页面 chunk 在路上的占位（Suspense 只包 Outlet，顶栏与侧栏不跟着闪） */
function PageLoading() {
  return (
    <div
      role="status"
      aria-busy
      className="flex items-center gap-2 px-7 py-5 text-sm text-ink-faint"
    >
      <span className="h-1.5 w-16 animate-pulse rounded-full bg-panel-2" />
      {common.loading}
    </div>
  )
}

/**
 * 顶栏右侧的两个「产品视角」开关（原型顶栏同位置）。
 *
 * ## 为什么是 ghost 小按钮而不是菜单项
 *
 * 它们**不改变路由**，只改变「看见多少」：覆盖地图是**只读视图**、专家视图是**显示偏好**。
 * 混进导航会让人以为它们是可到达的页面。
 *
 * ## 状态为什么在 AppShell 顶层
 *
 * 窄屏下这三个入口搬进侧栏的「更多」展开项（顶栏在 <640px 藏起它们）。
 * `mapOpen` 与 `expert` 因此是**两个组件共用的**：提到 AppShell，由 props 下发。
 */
function TopbarTools(props: {
  mapOpen: boolean
  setMapOpen: (v: boolean) => void
  expert: boolean
  toggleExpert: () => void
}) {
  const { mapOpen, setMapOpen, expert, toggleExpert } = props
  return (
    <>
      <button
        type="button"
        className={`${btnGhost} max-sm:hidden shrink-0 px-2 py-1 text-xs text-ink-muted`}
        onClick={() => setMapOpen(true)}
        aria-label={common.coverageMap.aria}
        title="全功能与需求覆盖地图（数据源 data/coverage.ts）"
      >
        <Icon name="map" size={13} />
        <span className="hidden md:inline">{common.coverageMap.label}</span>
      </button>
      <button
        type="button"
        className={`${btnGhost} max-sm:hidden shrink-0 px-2 py-1 text-xs ${
          expert ? 'text-accent-deep' : 'text-ink-muted'
        }`}
        onClick={toggleExpert}
        aria-pressed={expert}
        aria-label={common.expertMode.aria}
        title="一键越级：显示全部高级块（渐进披露红线 4）"
      >
        <Icon name="clock" size={13} />
        <span className="hidden md:inline">{common.expertMode.label}</span>
      </button>
      <Suspense fallback={null}>
        <CoverageMapDialog open={mapOpen} onClose={() => setMapOpen(false)} />
      </Suspense>
    </>
  )
}

export function AppShell() {
  // 顶栏与侧栏「更多」共用的两处状态（窄屏下入口搬进侧栏，见 TopbarTools 注）
  const [mapOpen, setMapOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const { expert, toggle: toggleExpert } = useExpertMode()

  return (
    <div className="flex h-full flex-col">
      {/* 顶栏 58px：品牌 tile + 版本 + 主题切换（全站唯一入口） */}
      <header className="flex h-[58px] shrink-0 items-center gap-3 border-b border-line bg-panel px-4">
        <Brand />
        <span className="mono ml-1.5 rounded-sm border border-line-hair bg-panel-2 px-2 py-px text-[11.5px] leading-[1.7] text-ink-muted">
          v0.2.0
        </span>
        <div className="flex-1" />
        <span className="mono max-sm:hidden items-center gap-1 text-xs text-ink-muted sm:flex">
          <Icon name="pulse" size={13} />
          {nav.footerHost}
        </span>
        <TopbarTools
          mapOpen={mapOpen}
          setMapOpen={setMapOpen}
          expert={expert}
          toggleExpert={toggleExpert}
        />
        <ThemeSwitch />
        {/* ⌘K 的可见入口。键盘监听在 CommandPaletteHost（全站唯一挂载点），这里只发一个
            自定义事件唤起它——面板本体懒加载，顶栏不因此把面板拖进入口 chunk。 */}
        <button
          type="button"
          className={`${btnGhost} max-sm:hidden shrink-0 px-2 py-1 text-xs text-ink-muted`}
          onClick={() => window.dispatchEvent(new CustomEvent(OPEN_PALETTE_EVENT))}
          aria-label={common.commandPalette.aria}
        >
          <Icon name="search" size={13} />
          <span className="hidden md:inline">{common.commandPalette.label}</span>
          <kbd className="mono ml-1 rounded-sm border border-line bg-panel-sunk px-1 text-[10px] text-ink-faint">
            ⌘K
          </kbd>
        </button>
      </header>
      <div className="flex min-h-0 flex-1 max-lg:flex-col">
        <Sidebar
          moreOpen={moreOpen}
          setMoreOpen={setMoreOpen}
          setMapOpen={setMapOpen}
          expert={expert}
          toggleExpert={toggleExpert}
        />
        <main className="min-w-0 flex-1 overflow-y-auto">
          <Suspense fallback={<PageLoading />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <CommandPaletteHost />
    </div>
  )
}
