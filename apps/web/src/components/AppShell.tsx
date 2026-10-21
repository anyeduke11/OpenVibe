import { Suspense } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useNavCounts } from '../hooks/useNavCounts'
import { useTheme } from '../hooks/useTheme'
import { appName, common, nav } from '../i18n/core'
import { CommandPaletteHost, OPEN_PALETTE_EVENT } from './CommandPaletteHost'
import { Icon, type IconName } from './ui/icons'
import { btnGhost } from './ui/styles'

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

/** 四组八项（DESIGN.md Layout）。count 走单端点 `/api/nav-counts`，不是七个请求。 */
const NAV: { group: string; items: { to: string; label: string; icon: IconName; count?: (c: Counts) => number }[] }[] = [
  {
    group: nav.group.overview,
    items: [{ to: '/', label: nav.workbench, icon: 'home' }],
  },
  {
    group: nav.group.assets,
    items: [
      { to: '/library', label: nav.library, icon: 'doc', count: (c) => c.prompts },
      { to: '/terms', label: nav.terms, icon: 'book', count: (c) => c.terms },
      // M9 开发能力（§3.5：紧随「术语」之后 —— 两者互链最密）
      { to: '/dev', label: nav.devAbility, icon: 'compass' },
      { to: '/playbooks', label: nav.playbooks, icon: 'sparkle', count: (c) => c.playbooks },
      { to: '/skills', label: nav.skills, icon: 'box', count: (c) => c.skills },
      { to: '/flows', label: nav.flows, icon: 'flow', count: (c) => c.flows },
    ],
  },
  {
    group: nav.group.engineering,
    items: [
      { to: '/projects', label: nav.projects, icon: 'folder', count: (c) => c.projects },
      { to: '/packs', label: nav.packs, icon: 'pack', count: (c) => c.packs },
    ],
  },
  {
    group: nav.group.system,
    items: [
      { to: '/growth', label: nav.growth, icon: 'chart' },
      { to: '/settings', label: nav.settings, icon: 'cog' },
    ],
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
    <div className="flex items-center gap-0.5 rounded-sm border border-line bg-panel-2 p-0.5" role="group" aria-label={common.theme.aria}>
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
            className={`inline-flex items-center gap-1 rounded-[4px] px-2 py-[3px] text-xs transition-colors ${
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

function Sidebar() {
  const { data } = useNavCounts()
  const counts = (data ?? { prompts: 0, terms: 0, playbooks: 0, skills: 0, flows: 0, projects: 0, packs: 0 }) as Counts
  return (
    <aside className="flex w-[216px] shrink-0 flex-col border-r border-line bg-canvas max-lg:h-auto max-lg:w-full max-lg:flex-row max-lg:overflow-x-auto max-lg:border-b max-lg:border-r-0">
      <nav className="flex flex-1 flex-col gap-3.5 overflow-y-auto p-2.5 max-lg:flex-row max-lg:gap-1 max-lg:overflow-visible max-lg:p-2" aria-label="主导航">
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
                        <span aria-hidden className="absolute -left-2.5 top-1.5 bottom-1.5 w-[2px] rounded-r bg-accent max-lg:hidden" />
                      )}
                      <Icon name={it.icon} size={15} className={isActive ? 'text-accent-deep' : 'text-ink-faint'} />
                      <span className="flex-1">{it.label}</span>
                      {it.count && (
                        <span className={`text-[11.5px] tabular-nums ${isActive ? 'text-accent-deep' : 'text-ink-faint'}`}>
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
    <div role="status" aria-busy className="flex items-center gap-2 px-7 py-5 text-sm text-ink-faint">
      <span className="h-1.5 w-16 animate-pulse rounded-full bg-panel-2" />
      {common.loading}
    </div>
  )
}

export function AppShell() {
  return (
    <div className="flex h-full flex-col">
      {/* 顶栏 58px：品牌 tile + 版本 + 主题切换（全站唯一入口） */}
      <header className="flex h-[58px] shrink-0 items-center gap-3 border-b border-line bg-panel px-4">
        <Brand />
        <span className="mono ml-1.5 rounded-sm border border-line-hair bg-panel-2 px-2 py-px text-[11.5px] leading-[1.7] text-ink-muted">
          v0.2.0
        </span>
        <div className="flex-1" />
        <span className="mono hidden items-center gap-1 text-xs text-ink-muted sm:flex">
          <Icon name="pulse" size={13} />
          {nav.footerHost}
        </span>
        <ThemeSwitch />
        {/* ⌘K 的可见入口。键盘监听在 CommandPaletteHost（全站唯一挂载点），这里只发一个
            自定义事件唤起它——面板本体懒加载，顶栏不因此把面板拖进入口 chunk。 */}
        <button
          type="button"
          className={`${btnGhost} hidden shrink-0 px-2 py-1 text-xs text-ink-muted sm:inline-flex`}
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
        <Sidebar />
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