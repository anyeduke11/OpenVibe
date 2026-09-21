import type { ReactNode } from 'react'
import type { InjectionStatusOut } from '@openvibe/shared'
import { PROJECT_STATUS } from '@openvibe/shared'
import type { ProjectView } from '../../hooks/useProjects'
import { zh } from '../../i18n/zh'
import { toast } from '../ui/Toaster'
import { chipCls, inputCls } from '../ui/styles'

function Row(props: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 text-xs">
      <span className="w-20 shrink-0 text-zinc-500">{props.label}</span>
      <span className="min-w-0 break-all text-zinc-800">{props.children}</span>
    </div>
  )
}

/**
 * 工作台概览（m5 §3 健康摘要 + FR-6 注入状态只读桥接）。
 * 注入由 CLI 写盘，本页只读 lock——不一致时给出 sync 命令供复制。
 */
export function ProjectDashboard(props: {
  project: ProjectView
  templateName: string | null
  injection: InjectionStatusOut | undefined
  onStatusChange: (status: string) => void
}) {
  const { project } = props
  const health = project.health
  const injection = props.injection
  const percent = health.total === 0 ? 0 : Math.round(((health.total - health.unchecked) / health.total) * 100)

  const copy = (text: string) => {
    navigator.clipboard
      ?.writeText(text)
      .then(() => toast(zh.projects.injection.copied))
      .catch(() => toast(zh.projects.injection.copyFailed, 'error'))
  }

  return (
    <section className="grid gap-4 rounded-lg border border-zinc-200 bg-white p-4 md:grid-cols-2">
      <div className="space-y-1.5">
        <Row label={zh.projects.labels.flow}>
          {props.templateName ?? zh.projects.detail.snapshotUnknown}
        </Row>
        <Row label={zh.projects.labels.stage}>
          <span className="font-medium">{health.stage ?? zh.common.none}</span>
        </Row>
        <Row label={zh.projects.labels.path}>
          {project.localPath ?? zh.projects.noPath}
          {project.status === 'archived' && (
            <span className={`${chipCls} ml-2 border-zinc-200 bg-zinc-50 text-zinc-500`}>
              {zh.projects.status.archived}
            </span>
          )}
        </Row>
        <Row label={zh.projects.labels.unchecked}>
          {zh.projects.detail.progress(percent, health.total - health.unchecked, health.total)}
        </Row>
        <Row label={zh.projects.labels.lastLog}>
          {health.lastLogAt ?? zh.projects.never}
          <span className="ml-2 text-[11px] text-zinc-400">
            {`${String(health.logCount)} logs · ${String(health.taskCount)} tasks`}
          </span>
        </Row>
        <div className="pt-1">
          <label className="sr-only">{zh.projects.labels.stage}</label>
          <select
            className={`${inputCls} w-40 appearance-none`}
            value={project.status}
            onChange={(e) => props.onStatusChange(e.target.value)}
          >
            {PROJECT_STATUS.map((s) => (
              <option key={s} value={s}>
                {zh.projects.status[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5 border-zinc-100 md:border-l md:pl-4">
        <h3 className="text-xs font-semibold text-zinc-600">{zh.projects.injection.title}</h3>
        <p className="text-[11px] text-zinc-400">{zh.projects.injection.hint}</p>
        {project.localPath === null ? (
          <p className="text-xs text-zinc-500">{zh.projects.injection.noPath}</p>
        ) : injection === undefined ? (
          <p className="text-xs text-zinc-400">{zh.projects.injection.checkFailed}</p>
        ) : (
          <>
            <Row label={zh.projects.injection.lockPresent}>
              {injection.lockPresent ? zh.projects.injection.present : zh.projects.injection.absent}
            </Row>
            {injection.error !== undefined && (
              <Row label={zh.projects.injection.error}>
                <span className="text-red-700">{injection.error}</span>
              </Row>
            )}
            {injection.pack !== undefined && (
              <>
                <Row label={zh.projects.injection.pack}>
                  {zh.projects.injected(injection.pack.name, injection.pack.version)}
                </Row>
                <Row label={zh.projects.injection.fingerprint}>
                  <span className="mono">{injection.pack.fingerprint.slice(0, 16)}</span>
                </Row>
                <Row label={zh.projects.injection.injectedAt}>{injection.injectedAt}</Row>
              </>
            )}
            <Row label={zh.projects.injection.registered}>
              {injection.registered?.version ??
                project.standardPackVersion ??
                zh.projects.injection.notRegistered}
            </Row>
            {injection.upToDate !== undefined && (
              <Row label={zh.projects.labels.injection}>
                {injection.upToDate ? (
                  <span className="text-emerald-700">{zh.projects.injection.consistent}</span>
                ) : (
                  <span className="text-amber-700">
                    {zh.projects.injection.inconsistent(
                      injection.pack?.version ?? '?',
                      injection.registered?.version ?? '?',
                    )}
                  </span>
                )}
              </Row>
            )}
            {injection.suggestedCommand !== undefined && (
              <Row label={zh.projects.injection.suggested}>
                <button
                  type="button"
                  className="mono rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[11px] hover:border-brand"
                  onClick={() => copy(injection.suggestedCommand ?? '')}
                >
                  {injection.suggestedCommand} {zh.projects.injection.copy}
                </button>
              </Row>
            )}
          </>
        )}
      </div>
    </section>
  )
}
