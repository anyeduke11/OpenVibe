import { Link } from 'react-router-dom'
import type { ProjectView } from '../../hooks/useProjects'
import { zh } from '../../i18n/zh'
import { btnGhost, chipCls } from '../ui/styles'

/** 项目列表（m5 FR-1.1）：名称/状态/当前阶段 + 健康摘要三要素（未完项、最近日志、注入） */
export function ProjectList(props: {
  items: ProjectView[]
  loading: boolean
  onDelete: (project: ProjectView) => void
  injectionOf: (project: ProjectView) => string
}) {
  if (props.loading) {
    return <p className="px-5 py-10 text-sm text-zinc-400">{zh.common.loading}</p>
  }
  if (props.items.length === 0) {
    return <p className="px-5 py-10 text-sm text-zinc-500">{zh.projects.empty}</p>
  }
  return (
    <div className="min-h-0 flex-1 overflow-auto px-5">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 bg-white text-left text-xs text-zinc-500">
          <tr>
            <th className="border-b border-zinc-100 py-2 pr-3 font-medium">{zh.projects.wizard.name}</th>
            <th className="border-b border-zinc-100 py-2 pr-3 font-medium">
              {zh.projects.filterStatus}
            </th>
            <th className="border-b border-zinc-100 py-2 pr-3 font-medium">{zh.projects.labels.stage}</th>
            <th className="border-b border-zinc-100 py-2 pr-3 font-medium">
              {zh.projects.labels.unchecked}
            </th>
            <th className="border-b border-zinc-100 py-2 pr-3 font-medium">
              {zh.projects.labels.lastLog}
            </th>
            <th className="border-b border-zinc-100 py-2 pr-3 font-medium">
              {zh.projects.labels.injection}
            </th>
            <th className="border-b border-zinc-100 py-2 pr-3 font-medium">
              {zh.projects.labels.updatedAt}
            </th>
            <th className="border-b border-zinc-100 py-2" />
          </tr>
        </thead>
        <tbody>
          {props.items.map((p) => {
            const done = p.health.total - p.health.unchecked
            return (
              <tr key={p.id} className="hover:bg-zinc-50">
                <td className="max-w-64 border-b border-zinc-100 py-2 pr-3">
                  <Link to={`/projects/${p.id}`} className="truncate font-medium text-zinc-800 hover:text-brand">
                    {p.name}
                  </Link>
                  <div className="truncate text-[11px] text-zinc-400">{p.localPath ?? zh.projects.noPath}</div>
                </td>
                <td className="border-b border-zinc-100 py-2 pr-3">
                  <span
                    className={`${chipCls} ${
                      p.status === 'active'
                        ? 'border-brand bg-brand-soft text-brand'
                        : 'border-zinc-200 bg-zinc-50 text-zinc-600'
                    }`}
                  >
                    {zh.projects.status[p.status]}
                  </span>
                </td>
                <td className="border-b border-zinc-100 py-2 pr-3 text-zinc-700">
                  {p.health.stage ?? zh.common.none}
                </td>
                <td className="border-b border-zinc-100 py-2 pr-3 text-xs text-zinc-600">
                  {p.health.total === 0
                    ? zh.common.none
                    : zh.projects.detail.progress(
                        Math.round((done / p.health.total) * 100),
                        done,
                        p.health.total,
                      )}
                </td>
                <td className="border-b border-zinc-100 py-2 pr-3 text-[11px] text-zinc-500">
                  {p.health.lastLogAt ?? zh.projects.never}
                  <div className="text-zinc-400">{`${String(p.health.logCount)} logs`}</div>
                </td>
                <td className="border-b border-zinc-100 py-2 pr-3 text-[11px] text-zinc-500">
                  {props.injectionOf(p)}
                </td>
                <td className="border-b border-zinc-100 py-2 pr-3 text-[11px] text-zinc-400">
                  {p.updatedAt}
                </td>
                <td className="border-b border-zinc-100 py-2 text-right">
                  <Link className={btnGhost} to={`/projects/${p.id}`}>
                    {zh.projects.open}
                  </Link>
                  <button
                    className={`${btnGhost} ml-1 text-red-600 hover:border-red-200 hover:bg-red-50`}
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
