import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { ProjectView } from '../../hooks/useProjects'
import { laneEngineering } from '../../i18n/lane-engineering'
import { zh } from '../../i18n/zh'
import { Icon, type IconName } from '../ui/icons'
import {
  btnDanger,
  btnGhost,
  btnPrimary,
  chipTone,
  emptyHintCls,
  ledgerHeadCls,
  ledgerNumCls,
  noteCls,
  noteTitleCls,
  rowCls,
  skelCls,
} from '../ui/styles'

/** 状态 chip 的图标位：进行中=脉动、已暂停=时钟、已归档=锁。三通道缺一不可。 */
const STATUS_ICON: Record<string, IconName> = {
  active: 'pulse',
  paused: 'clock',
  archived: 'lock',
}

/** 骨架屏行：加载态不给「暂无数据」当替代（DESIGN.md skeleton：panel-2 底，只做渐隐） */
function Skeleton() {
  return (
    <div className="space-y-2 px-5 py-3" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <span className={`${skelCls} h-3.5 w-56`} />
          <span className={`${skelCls} h-3.5 w-20`} />
          <span className={`${skelCls} h-3.5 w-28`} />
          <span className={`${skelCls} ml-auto h-3.5 w-24`} />
        </div>
      ))}
    </div>
  )
}

/**
 * 项目列表（m5 FR-1.1）：名称/状态/当前阶段 + 健康摘要三要素（未完项、最近日志、注入）。
 * 台账密度：行高收到 py-2，数字列 tabular-nums 右对齐；`table-fixed` 让 w-* 提示列真正生效——
 * 否则浏览器把余量全给内容多的列，更新时间戳这类窄列会被折成两行。
 */
export function ProjectList(props: {
  items: ProjectView[]
  loading: boolean
  error: string | null
  onRetry: () => void
  statusFilter: string
  onCreate: () => void
  onDelete: (project: ProjectView) => void
  injectionOf: (project: ProjectView) => string
}) {
  // 行内二次确认：删除是破坏动作，但不该为一列 × 弹一次遮罩（Dialog 留给跨页动作）
  const [armed, setArmed] = useState<string | null>(null)

  if (props.loading) return <Skeleton />

  if (props.error !== null) {
    return (
      <div className="px-5 py-4">
        <div className={noteCls('danger')}>
          <span className={`${noteTitleCls} text-danger`}>{zh.common.failed(props.error)}</span>
          <p className="text-ink-body">{laneEngineering.state.retryHint}</p>
          <button type="button" className={`${btnGhost} mt-2`} onClick={props.onRetry}>
            {laneEngineering.state.retry}
          </button>
        </div>
      </div>
    )
  }

  if (props.items.length === 0) {
    // 筛出来的空由页头下那条「清除筛选」条负责（它带真正的清除动作），这里不重复出空态
    if (props.statusFilter !== 'all') return null
    // 空态的主因是「还没立项」，所以 CTA 是新建而不是「去别的页看看」
    return (
      <div className="px-5 py-4">
        <div className={emptyHintCls}>
          <p>{zh.projects.empty}</p>
          <button className={btnPrimary} onClick={props.onCreate}>
            {zh.projects.newProject}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="w-full table-fixed border-collapse text-sm">
        <thead className={`sticky top-0 z-10 bg-panel text-left ${ledgerHeadCls}`}>
          <tr>
            <th className="w-48 border-b border-line px-2 py-1.5 font-medium">
              {zh.projects.wizard.name}
            </th>
            <th className="w-20 border-b border-line px-2 py-1.5 font-medium">
              {zh.projects.filterStatus}
            </th>
            <th className="w-28 border-b border-line px-2 py-1.5 font-medium">
              {zh.projects.labels.stage}
            </th>
            <th className="w-28 border-b border-line px-2 py-1.5 font-medium">
              {zh.projects.labels.unchecked}
            </th>
            <th className="w-28 border-b border-line px-2 py-1.5 font-medium">
              {zh.projects.labels.lastLog}
            </th>
            <th className="border-b border-line px-2 py-1.5 font-medium">
              {zh.projects.labels.injection}
            </th>
            {/* 时间戳是 24 字符 ISO：mono 11px 下约 158px，窄了会压到动作列上去 */}
            <th className="w-44 border-b border-line px-2 py-1.5 text-right font-medium">
              {zh.projects.labels.updatedAt}
            </th>
            <th className="w-32 border-b border-line px-2 py-1.5" />
          </tr>
        </thead>
        <tbody>
          {props.items.map((p) => {
            const done = p.health.total - p.health.unchecked
            return (
              <tr key={p.id} className={rowCls}>
                <td className="max-w-56 px-2 py-2">
                  <Link
                    to={`/projects/${p.id}`}
                    className="block truncate font-medium text-ink-body hover:text-accent"
                  >
                    {p.name}
                  </Link>
                  {/* 路径是元信息：mono + faint，且不换行（中文路径逐字竖排是最难看的失败模式） */}
                  <span className="mono block truncate text-[11px] text-ink-faint">
                    {p.localPath ?? zh.projects.noPath}
                  </span>
                </td>
                <td className="px-2 py-2">
                  {/* chip = 状态，恒为「图标 + 文字 + 颜色」三通道（DESIGN.md Components） */}
                  <span
                    className={`${chipTone(p.status === 'active' ? 'accent' : 'default')} gap-1 whitespace-nowrap`}
                  >
                    <Icon name={STATUS_ICON[p.status] ?? 'info'} size={11} />
                    {zh.projects.status[p.status]}
                  </span>
                </td>
                <td className="truncate px-2 py-2 text-ink-body">
                  {p.health.stage ?? zh.common.none}
                </td>
                <td className={`px-2 py-2 text-xs text-ink-muted ${ledgerNumCls}`}>
                  {p.health.total === 0
                    ? zh.common.none
                    : zh.projects.detail.progress(
                        Math.round((done / p.health.total) * 100),
                        done,
                        p.health.total,
                      )}
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-[11px] text-ink-muted">
                  {p.health.lastLogAt ?? zh.projects.never}
                  <span className="mono block text-ink-faint">{`${String(p.health.logCount)} logs`}</span>
                </td>
                <td className="truncate px-2 py-2 text-[11px] text-ink-muted">
                  {props.injectionOf(p)}
                </td>
                <td
                  className={`whitespace-nowrap px-2 py-2 text-[11px] text-ink-faint ${ledgerNumCls}`}
                >
                  {p.updatedAt}
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-right">
                  <Link className={`${btnGhost} px-2 py-0.5 text-xs`} to={`/projects/${p.id}`}>
                    {laneEngineering.projects.openDetail}
                  </Link>
                  {armed === p.id ? (
                    <button
                      className={`${btnDanger} ml-1 px-2 py-0.5 text-xs`}
                      onClick={() => {
                        setArmed(null)
                        props.onDelete(p)
                      }}
                    >
                      {laneEngineering.projectDelete.confirmRow}
                    </button>
                  ) : (
                    <button
                      className={`${btnGhost} ml-1 px-2 py-0.5 text-xs text-danger hover:border-danger-line hover:bg-danger-soft`}
                      onClick={() => setArmed(p.id)}
                    >
                      {zh.flows.actions.del}
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
