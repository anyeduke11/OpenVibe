import { NavLink, Outlet } from 'react-router-dom'
import { zh } from '../i18n/zh'

// 侧栏固定七项（dev-plan §5.1）；T3 实装 /library，T4 实装 /terms，其余路由占位
const NAV = [
  { to: '/library', label: zh.nav.library },
  { to: '/terms', label: zh.nav.terms },
  { to: '/skills', label: zh.nav.skills },
  { to: '/flows', label: zh.nav.flows },
  { to: '/projects', label: zh.nav.projects },
  { to: '/packs', label: zh.nav.packs },
  { to: '/settings', label: zh.nav.settings },
]

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
      <main className="min-w-0 flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}
