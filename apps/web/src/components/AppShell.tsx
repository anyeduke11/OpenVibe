import { Suspense, useCallback, useEffect, useState, type ComponentType } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useNavCounts, type NavCounts } from '../hooks/useNavCounts'
import { useTheme } from '../hooks/useTheme'
import { zh } from '../i18n/zh'

/**
 * 应用外壳（DESIGN.md「暖纸 · 可读性工作台 V2」Layout）。
 *
 * V1 的书脊竖排侧栏（76px、单字导航、衬线竖排字标）已随 2026-10-01 换肤裁定退场，
 * 本文件是它的替换面：顶栏 58px + 侧栏 216px 四组八项。
 *
 * 侧栏「工作台」这一项指新增的 `/` 全局首页（lazy chunk），与项目内的
 * `ProjectDashboard`（「项目工作台」，`/projects/:id` 内的健康摘要 + 注入状态只读桥接）
 * 不是同一个东西——DESIGN.md Layout 专门点名了这处同名异物，两者不得合并。
 */

/** 四组八项；`count` 指向 NavCounts 的键，null 表示该项没有 API total 口径 */
const NAV_GROUPS: ReadonlyArray<{
  key: string
  label: string
  items: ReadonlyArray<{ to: string; label: string; count: keyof NavCounts | null }>
}> = [
  {
    key: 'overview',
    label: zh.nav.group.overview,
    items: [
      { to: '/', label: zh.nav.workbench, count: null },
      // DESIGN.md 的侧栏八项里没有这一项（那版写在成长阶段机落地之前）。
      // 暂挂在「概览」组：F0–F3 是关于用户成熟度的概览，语义上与工作台同级。
      // 这是一处对 DESIGN.md Layout 的偏离，需要 owner 确认是入册还是并回工作台。
      { to: '/growth', label: zh.nav.growth, count: null },
    ],
  },
  {
    key: 'assets',
    label: zh.nav.group.assets,
    items: [
      { to: '/library', label: zh.nav.library, count: 'prompts' },
      { to: '/terms', label: zh.nav.terms, count: 'terms' },
      { to: '/playbooks', label: zh.nav.playbooks, count: 'playbooks' },
      { to: '/skills', label: zh.nav.skills, count: 'skills' },
      { to: '/flows', label: zh.nav.flows, count: 'flows' },
    ],
  },
  {
    key: 'engineering',
    label: zh.nav.group.engineering,
    items: [
      { to: '/projects', label: zh.nav.projects, count: 'projects' },
      { to: '/packs', label: zh.nav.packs, count: 'packs' },
    ],
  },
  {
    key: 'system',
    label: zh.nav.group.system,
    items: [{ to: '/settings', label: zh.nav.settings, count: null }],
  },
]

/** 品牌位：accent tile + on-accent 字（V2 无衬线字标、无印章，渐变仅此一处豁免） */
function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <div
        aria-hidden
        className="grid size-[30px] shrink-0 place-items-center rounded-lg bg-gradient-to-br from-accent to-accent-deep text-[15px] font-bold text-on-accent shadow-1"
      >
        灵
      </div>
      <div className="leading-tight">
        <div className="text-[15px] font-semibold text-ink">{zh.appName}</div>
        <div className="text-[11.5px] text-ink-muted">vibe coding 标准化工作台</div>
      </div>
    </div>
  )
}

/**
 * 主题切换：全站唯一入口（DESIGN.md Layout：右上角 暖纸↔暖夜）。
 * 展示名是「暖纸/暖夜」，落库的属性值仍是 `dark`（改值会让已存 dark 的用户无声回亮）。
 */
function ThemeSegmented() {
  const { theme, setTheme } = useThemeSet()
  return (
    <div role="group" aria-label={zh.common.theme.aria} className={segCls}>
      <button
        type="button"
        aria-pressed={theme === 'light'}
        onClick={() => setTheme('light')}
        className={segBtnCls(theme === 'light')}
      >
        暖纸
      </button>
      <button
        type="button"
        aria-pressed={theme === 'dark'}
        onClick={() => setTheme('dark')}
        className={segBtnCls(theme === 'dark')}
      >
        暖夜
      </button>
    </div>
  )
}

const segCls =
  'inline-flex items-center gap-0.5 rounded-sm border border-line bg-panel-2 p-0.5'
const segBtnCls = (on: boolean) =>
  `rounded-sm px-2 py-1 text-xs transition-colors ${
    on ? 'bg-panel text-ink shadow-1' : 'text-ink-muted hover:text-ink'
  }`

// useTheme 只暴露 toggle；分段控件需要按值设置，这一层做一次极薄适配
function useThemeSet(): { theme: 'light' | 'dark'; setTheme: (t: 'light' | 'dark') => void } {
  const { theme, toggle } = useTheme()
  return { theme, setTheme: (t) => (t === theme ? undefined : toggle()) }
}

function SideNav() {
  const counts = useNavCounts()
  return (
    <aside
      aria-label={zh.common.nav.aria}
      className="flex w-[216px] shrink-0 flex-col overflow-y-auto border-r border-line bg-canvas py-3 max-md:w-full max-md:flex-row max-md:gap-2 max-md:overflow-x-auto max-md:border-b max-md:border-r-0 max-md:py-2"
    >
      <nav className="flex flex-col gap-3.5 max-md:flex-row max-md:gap-2" aria-label={zh.common.nav.aria}>
        {NAV_GROUPS.map((g) => (
          <div key={g.key} className="flex flex-col max-md:flex-row">
            <div className="px-2.5 pb-1 text-[11.5px] text-ink-faint max-md:hidden">{g.label}</div>
            <ul className="flex flex-col gap-0.5 max-md:flex-row max-md:gap-1">
              {g.items.map((it) => {
                const n = it.count ? counts.data?.[it.count] : undefined
                return (
                  <li key={it.to}>
                    <NavLink
                      to={it.to}
                      end={it.to === '/'}
                      className={({ isActive }) =>
                        `relative flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors max-md:whitespace-nowrap ${
                          isActive
                            ? 'bg-accent-soft font-semibold text-accent-deep'
                            : 'text-ink-body hover:bg-panel-2 hover:text-ink'
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && (
                            <span
                              aria-hidden
                              className="absolute -left-2.5 top-1.5 bottom-1.5 w-0.5 rounded-r bg-accent max-md:static max-md:hidden"
                            />
                          )}
                          <span className="grow truncate">{it.label}</span>
                          {n !== undefined && (
                            <span className="num text-[11.5px] text-ink-faint">{n}</span>
                          )}
                        </>
                      )}
                    </NavLink>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="mt-auto border-t border-line-hair px-2.5 pt-2.5 text-[11.5px] leading-relaxed text-ink-faint max-md:hidden">
        <div className="mono break-all">{zh.nav.footerPath}</div>
        <div className="mono">{zh.nav.footerHost}</div>
        <div>SQLite · 本地优先</div>
      </div>
    </aside>
  )
}

/** 页面 chunk 在路上时的占位（Suspense 只包 Outlet，顶栏与侧栏不跟着闪） */
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

/**
 * ⌘K / Ctrl K 唤起命令面板。面板本体**懒加载**：入口只留这一个监听器，
 * 面板（含 Dialog 与三个搜索请求）第一次唤起时才进网络。
 *
 * 监听纪律：输入态（INPUT/TEXTAREA/SELECT/contentEditable）内不劫持单键；
 * 带 meta/ctrl/alt 的组合键放行。CodeMirror 落在 contenteditable 内，
 * 因此编辑器里按 ⌘K 同样不被抢。
 */
function useCommandPalette() {
  const [Palette, setPalette] = useState<ComponentType<{ onClose: () => void }> | null>(null)

  const load = useCallback(
    (then: (P: ComponentType<{ onClose: () => void }>) => void) => {
      void import('./CommandPalette').then((m) => then(m.CommandPalette))
    },
    [],
  )

  const open = useCallback(() => {
    load((P) => setPalette(() => P))
  }, [load])
  const close = useCallback(() => setPalette(null), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'k' || !(e.metaKey || e.ctrlKey)) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable))
        return
      e.preventDefault()
      // 已载入过则直接开关，不重复 import
      if (Palette) close()
      else open()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [Palette, close, open])

  return { Palette, open, close }
}

export function AppShell() {
  const { Palette, open, close } = useCommandPalette()
  return (
    <div className="flex h-full flex-col">
      <header className="sticky top-0 z-40 flex h-[58px] shrink-0 items-center gap-3 border-b border-line bg-panel px-4">
        <Brand />
        <span className="mono ml-1 rounded-sm border border-line-hair bg-panel-2 px-2 py-0.5 text-[11.5px] text-ink-muted">
          v0.2.0
        </span>
        <div className="grow" />
        <div className="mono hidden text-xs text-ink-muted sm:block">{zh.nav.footerHost}</div>
        <button
          type="button"
          onClick={open}
          aria-label={zh.palette.title}
          title={zh.palette.hint}
          className="mono rounded-sm border border-line bg-panel px-2 py-1 text-[11.5px] text-ink-muted transition-colors hover:border-line-strong hover:text-ink-body"
        >
          ⌘K
        </button>
        <ThemeSegmented />
      </header>
      <div className="flex min-h-0 flex-1 max-md:flex-col">
        <SideNav />
        <main className="min-w-0 flex-1 overflow-y-auto">
          <Suspense fallback={<PageLoading />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      {Palette && <Palette onClose={close} />}
    </div>
  )
}