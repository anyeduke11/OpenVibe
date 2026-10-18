import type { ReactNode } from 'react'
import type { InjectionStatusOut } from '@openvibe/shared'
import { PROJECT_STATUS } from '@openvibe/shared'
import type { ProjectView } from '../../hooks/useProjects'
import { laneEngineering } from '../../i18n/lane-engineering'
import { zh } from '../../i18n/zh'
import { toast } from '../ui/Toaster'
import { Icon } from '../ui/icons'
import { cardCls, chipTone, inputCls, ledgerNumCls, noteCls, noteTitleCls } from '../ui/styles'

/** 健康摘要格：键 12px ink-faint / 值 15px ink（DESIGN.md stat 的档位，紧凑版不占一整卡） */
function Cell(props: { label: string; children: ReactNode; note?: string }) {
  return (
    <div className="min-w-0 px-3 py-2">
      <p className="text-[11.5px] text-ink-faint">{props.label}</p>
      <p className="truncate text-sm text-ink">{props.children}</p>
      {props.note !== undefined && (
        <p className={`${ledgerNumCls} truncate text-[11px] text-ink-faint`}>{props.note}</p>
      )}
    </div>
  )
}

function Row(props: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 py-0.5 text-xs">
      <span className="w-20 shrink-0 text-ink-muted">{props.label}</span>
      <span className="min-w-0 flex-1 break-all text-ink-body">{props.children}</span>
    </div>
  )
}

/**
 * 项目工作台概览（m5 §3 健康摘要 + FR-6 注入状态只读桥接）。
 *
 * 三格摘要（所处阶段 / 未完检查项 / 最近日志）横向排开，是为了和阶段清单、任务看板、日志同屏对读——
 * 四块各占一整屏时，「项目健康吗」这个问句反而要滚一屏才答得出来。
 * 注入由 CLI 写盘，本页只读 lock：不一致时给出 sync 命令供复制。
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
  const done = health.total - health.unchecked

  const copy = (text: string) => {
    void navigator.clipboard
      ?.writeText(text)
      .then(() => toast(zh.projects.injection.copied))
      .catch(() => toast(zh.projects.injection.copyFailed, 'error'))
  }

  return (
    <section className={cardCls}>
      <div className="grid grid-cols-2 divide-x divide-line-hair border-b border-line-hair sm:grid-cols-4">
        <Cell label={laneEngineering.projects.health.stage} note={props.templateName ?? undefined}>
          {health.stage ?? zh.common.none}
        </Cell>
        <Cell
          label={laneEngineering.projects.health.unchecked}
          note={zh.projects.detail.progress(
            health.total === 0 ? 0 : Math.round((done / health.total) * 100),
            done,
            health.total,
          )}
        >
          <span className={ledgerNumCls}>{String(health.unchecked)}</span>
        </Cell>
        <Cell label={laneEngineering.projects.health.lastLog}>
          {health.lastLogAt ?? laneEngineering.projects.health.never}
        </Cell>
        <Cell label={zh.projects.labels.path} note={project.localPath ?? zh.projects.noPath}>
          <span className="flex items-center gap-1.5">
            {zh.projects.status[project.status]}
            {project.status === 'archived' && (
              <span className={chipTone('default')}>{zh.projects.status.archived}</span>
            )}
          </span>
        </Cell>
      </div>

      <div className="grid gap-3 px-3 py-2.5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold text-ink-muted">
              {zh.projects.injection.title}
            </h3>
            <span className="truncate text-[11px] text-ink-faint">{zh.projects.injection.hint}</span>
            <label className="sr-only" htmlFor="project-status">
              {zh.projects.filterStatus}
            </label>
            {/* `w-auto!` 不是笔误，理由同 TermsPage 等 7 处：inputCls 自带 `w-full`，
            Tailwind v4 生成的 CSS 里 `.w-full` 排在 `.w-auto` **之后**且同权重 ⇒ `w-full` 恒胜，
            下拉框会撑满整条 flex 行、把左边的标题与提示挤没。`!` 提升权重，
            **不改共享 inputCls**（另有多个调用点依赖它的 `w-full`）。 */}
            <select
              id="project-status"
              className={`${inputCls} ml-auto h-7 w-auto! appearance-none py-0 text-xs`}
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

          {project.localPath === null ? (
            <p className="mt-1.5 text-xs text-ink-muted">{zh.projects.injection.noPath}</p>
          ) : injection === undefined ? (
            <p className="mt-1.5 text-xs text-ink-faint">{zh.projects.injection.checkFailed}</p>
          ) : (
            <div className="mt-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={
                    injection.upToDate === true
                      ? chipTone('ok')
                      : injection.upToDate === false
                        ? chipTone('warn')
                        : chipTone('default')
                  }
                >
                  <Icon
                    name={injection.upToDate === true ? 'check' : 'warn'}
                    size={11}
                  />
                  {injection.upToDate === true
                    ? zh.projects.injection.consistent
                    : injection.upToDate === false
                      ? zh.projects.injection.inconsistent(
                          injection.pack?.version ?? '?',
                          injection.registered?.version ?? '?',
                        )
                      : zh.projects.injection.notRegistered}
                </span>
                {injection.pack !== undefined && (
                  <span className="text-[11px] text-ink-muted">
                    {zh.projects.injected(injection.pack.name, injection.pack.version)}
                  </span>
                )}
                <span className="mono text-[11px] text-ink-faint">
                  {injection.pack?.fingerprint.slice(0, 12) ?? ''}
                </span>
              </div>
              <Row label={zh.projects.injection.lockPresent}>
                {injection.lockPresent
                  ? zh.projects.injection.present
                  : zh.projects.injection.absent}
              </Row>
              {injection.error !== undefined && (
                <Row label={zh.projects.injection.error}>
                  <span className="text-danger">{injection.error}</span>
                </Row>
              )}
              {injection.suggestedCommand !== undefined && (
                <Row label={zh.projects.injection.suggested}>
                  <button
                    type="button"
                    className="mono rounded-sm border border-line bg-panel-2 px-1.5 py-0.5 text-[11px] hover:border-accent"
                    onClick={() => copy(injection.suggestedCommand ?? '')}
                  >
                    {injection.suggestedCommand} {zh.projects.injection.copy}
                  </button>
                </Row>
              )}
            </div>
          )}
        </div>

        <div className="md:border-l md:border-line-hair md:pl-3">
          <h3 className="text-xs font-semibold text-ink-muted">{zh.projects.labels.flow}</h3>
          <Row label={zh.projects.labels.stage}>{health.stage ?? zh.common.none}</Row>
          <Row label={zh.projects.injection.injectedAt}>{injection?.injectedAt ?? zh.common.none}</Row>
          <Row label={zh.projects.injection.registered}>
            {injection?.registered?.version ??
              project.standardPackVersion ??
              zh.projects.injection.notRegistered}
          </Row>
          <p className="mt-1 text-[11px] text-ink-faint">
            {zh.projects.wizard.packWriteNote}
          </p>
        </div>
      </div>

      {/* 注入状态读失败要给得出下一步，而不是只留一行灰字 */}
      {injection !== undefined && injection.error !== undefined && (
        <div className={`${noteCls('danger')} mx-3 mb-3`}>
          <span className={`${noteTitleCls} text-danger`}>{zh.projects.injection.error}</span>
          <p className="text-ink-body">{injection.error}</p>
        </div>
      )}
    </section>
  )
}
