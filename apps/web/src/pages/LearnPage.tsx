import { useState } from 'react'
import { zh } from '../i18n/zh'
import { DevAbilityPage } from './DevAbilityPage'
import { ResourcePage } from './ResourcePage'
import { StationMap } from '../components/dev/StationMap'

/**
 * 学习与开发（侧栏「实践 · F1」组，路由 `/learn`）。
 *
 * 原型 learn 视图把「站位图 / 两门对照 / 源码解读 / 学习资源」并成一页。这里用页签承载：
 *
 * - **站位图**：语言掌握度汇总（`StationMap`，全库汇总）—— 原型 learn 的默认页签
 * - **开发能力**：M9 的知识点站列 + 两门语言对照 + 源码解读抽屉（`DevAbilityPage`）
 * - **学习资源**：可筛选的资源清单（`ResourcePage`）
 *
 * ⚠️ 旧入口 `/dev` 与 `/resources` 已收敛到本页（见 `App.tsx` 的 redirect）。
 */
type Tab = 'map' | 'dev' | 'resources'

export function LearnPage() {
  const [tab, setTab] = useState<Tab>('map')
  const tabs: { value: Tab; label: string }[] = [
    { value: 'map', label: zh.learn.mapTab },
    { value: 'dev', label: zh.nav.devAbility },
    { value: 'resources', label: zh.nav.resources },
  ]
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-6 pt-5 max-md:px-4">
        <h1 className="text-[25px] font-semibold leading-tight tracking-tight text-ink">
          {zh.nav.learn}
        </h1>
        <div
          role="group"
          aria-label={zh.learn.tabAria}
          className="ml-auto inline-flex flex-wrap gap-0.5 rounded-sm border border-line bg-panel-2 p-0.5"
        >
          {tabs.map((t) => {
            const on = t.value === tab
            return (
              <button
                key={t.value}
                type="button"
                aria-pressed={on}
                onClick={() => setTab(t.value)}
                className={`inline-flex items-center gap-1 rounded-[4px] px-2.5 py-1 text-xs transition-colors ${
                  on ? 'bg-panel font-medium text-ink shadow-1' : 'text-ink-muted hover:text-ink'
                }`}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      </div>
      {tab === 'map' ? <StationMap /> : tab === 'dev' ? <DevAbilityPage /> : <ResourcePage />}
    </div>
  )
}
