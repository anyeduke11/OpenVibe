import { Link } from 'react-router-dom'
import type { ProjectView } from '../../hooks/useProjects'
import { zh } from '../../i18n/zh'
import {
  btnGhost,
  btnPrimary,
  chipTone,
  emptyHintCls,
  ledgerHeadCls,
} from '../ui/styles'

/** 项目列表（m5 FR-1.1）：名称/状态/当前阶段 + 健康摘要三要素（未完项、最近日志、注入） */
export function ProjectList(props: {
  items: ProjectView[]
  loading: boolean
  onCreate: () => void
  onDelete: (project: ProjectView) => void
  injectionOf: (project: ProjectView) => string
}) {
  if (props.loading) {
    return <p className="px-5 py-10 text-sm text-ink-faint">{zh.common.loading}</p>
  }
  if (props.items.length === 0) {
    // 空态的主因是「还没立项」，所以 CTA 是新建而不是「去别的页看看」
    return (
      <div className={`${emptyHintCls} m-5`}>
        <p>{zh.projects.empty}</p>
        <button className={btnPrimary} onClick={props.onCreate}>
          {zh.projects.newProject}
        </button>
      </div>
    )
  }
  return (
    <div className="min-h-0 flex-1 overflow-auto px-5">
      <table className="w-full border-collapse text-sm">
        <thead className={`sticky top-0 bg-panel text-left ${ledgerHeadCls}`}>
          <tr>
            <th className="border-b border-line-hair py-2 pr-3 font-medium">{zh.projects.wizard.name}</th>
            <th className="border-b border-line-hair py-2 pr-3 font-medium">
              {zh.projects.filterStatus}
            </th>
            <th className="border-b border-line-hair py-2 pr-3 font-medium">{zh.projects.labels.stage}</th>
            <th className="border-b border-line-hair py-2 pr-3 font-medium">
              {zh.projects.labels.unchecked}
            </th>
            <th className="border-b border-line-hair py-2 pr-3 font-medium">
              {zh.projects.labels.lastLog}
            </th>
            <th className="border-b border-line-hair py-2 pr-3 font-medium">
              {zh.projects.labels.injection}
            </th>
            <th className="border-b border-line-hair py-2 pr-3 text-right font-medium">
              {zh.projects.labels.updatedAt}
            </th>
            <th className="border-b border-line-hair py-2" />
          </tr>
        </thead>
        <tbody>
          {props.items.map((p) => {
            const done = p.health.total - p.health.unchecked
            return (
              <tr key={p.id} className="hover:bg-panel-2">
                <td className="max-w-64 border-b border-line-hair py-2 pr-3">
                  <Link to={`/projects/${p.id}`} className="truncate font-medium text-ink-body hover:text-accent">
                    {p.name}
                  </Link>
                  <div className="truncate text-[11px] text-ink-faint">{p.localPath ?? zh.projects.noPath}</div>
                </td>
                <td className="border-b border-line-hair py-2 pr-3">
                  <span
                    className={chipTone(p.status === 'active' ? 'accent' : 'default')}
                  >
                    {zh.projects.status[p.status]}
                  </span>
                </td>
                <td className="border-b border-line-hair py-2 pr-3 text-ink-body">
                  {p.health.stage ?? zh.common.none}
                </td>
                <td className="border-b border-line-hair py-2 pr-3 text-xs text-ink-muted">
                  {p.health.total === 0
                    ? zh.common.none
                    : zh.projects.detail.progress(
                        Math.round((done / p.health.total) * 100),
                        done,
                        p.health.total,
                      )}
                </td>
                <td className="border-b border-line-hair py-2 pr-3 text-[11px] text-ink-muted">
                  {p.health.lastLogAt ?? zh.projects.never}
                  <div className="text-ink-faint mono">{`${String(p.health.logCount)} logs`}</div>
                </td>
                <td className="border-b border-line-hair py-2 pr-3 text-[11px] text-ink-muted">
                  {props.injectionOf(p)}
                </td>
                <td className="border-b border-line-hair py-2 pr-3 text-[11px] text-ink-faint">
                  {p.updatedAt}
                </td>
                <td className="border-b border-line-hair py-2 text-right">
                  <Link className={btnGhost} to={`/projects/${p.id}`}>
                    {zh.projects.open}
                  </Link>
                  <button
                    className={`${btnGhost} ml-1 text-danger hover:border-danger-line hover:bg-danger-soft`}
                    onClick={() => props.onDelete(p)}
                  >
                    {zh.flows.actions.del}
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
