import { useState } from 'react'
import type { PackOut } from '@openvibe/shared'
import { useProjectList } from '../../hooks/useProjects'
import {
  decisionLabels,
  injectStatusRows,
  laneEngineering,
} from '../../i18n/lane-engineering'
import { zh } from '../../i18n/zh'
import { toast } from '../ui/Toaster'
import { Icon, type IconName } from '../ui/icons'
import {
  btnGhost,
  cardCls,
  cardHeadCls,
  chipPressed,
  chipTone,
  emptyHintCls,
  inputCls,
  ledgerHeadCls,
  noteCls,
  noteTitleCls,
  segCls,
  segItemCls,
  skelCls,
} from '../ui/styles'

/** 五状态 → chip 形制 + 图标（状态永远「图标 + 文字 + 颜色」三通道，DESIGN.md Components） */
const STATUS_TONE = {
  NEW: 'info',
  IN_SYNC: 'ok',
  UPDATE: 'accent',
  DRIFT: 'warn',
  CONFLICT: 'danger',
} as const satisfies Record<string, 'default' | 'accent' | 'ok' | 'warn' | 'danger' | 'info'>

const STATUS_ICON = {
  NEW: 'plus',
  IN_SYNC: 'check',
  UPDATE: 'refresh',
  DRIFT: 'warn',
  CONFLICT: 'alert',
} as const satisfies Record<string, IconName>

/** 项目路径可能带空格与中文，命令里用单引号包住；这是唯一出口文案里唯一可变的一段 */
const syncCommand = (path: string, pack: string): string =>
  laneEngineering.dryRun.command(path, pack)

/**
 * 注入前干跑（m6-standard-pack FR-7）。
 *
 * 两条纪律钉在这里：
 * 1. **不落盘**：面板只输出「会怎样」——不写文件、不做备份、不抢 `.openvibe/pack.lock.json`，
 *    唯一出口是一条 CLI 命令。
 * 2. **段数由数据给**：处置段直接 map `injectStatusRows` 里的 `options`（镜像
 *    `packages/core/src/inject/planner.ts` 的 `RULES`），CONFLICT 自然是两档、DRIFT 是三档。
 *    写死三档 = planner 改了而界面不改，界面就成了会撒谎的那一块。
 */
export function PackDryRunPanel(props: { pack: PackOut }) {
  const { pack } = props
  const projects = useProjectList('active')
  const [projectId, setProjectId] = useState('')
  const [picked, setPicked] = useState<'ui' | 'cli'>('ui')

  const items = projects.data?.items ?? []
  const project = items.find((p) => p.id === projectId)
  const projectPath = project?.localPath ?? null
  const command = projectPath === null ? null : syncCommand(projectPath, pack.name)

  const copy = (text: string) => {
    void navigator.clipboard
      ?.writeText(text)
      .then(() => toast(laneEngineering.dryRun.copied))
      .catch(() => toast(laneEngineering.dryRun.copyFailed, 'error'))
  }

  return (
    <section className={cardCls}>
      <header className={cardHeadCls}>
        <Icon name="target" className="text-ink-muted" />
        <h3 className="text-sm font-semibold text-ink">{laneEngineering.dryRun.title}</h3>
        <span className="ml-auto text-[11px] text-ink-faint">
          {laneEngineering.dryRun.pickProject}
        </span>
      </header>

      <div className="space-y-3 px-3.5 py-3">
        <p className={`${noteCls('info')} proseCls text-ink-body`}>
          <span className={`${noteTitleCls} text-info`}>{zh.packs.preview.sealed}</span>
          {laneEngineering.dryRun.hint}
        </p>

        {projects.isLoading && <div className={`${skelCls} h-8 w-full`} aria-hidden />}
        {projects.isError && (
          <div className={noteCls('danger')}>
            <span className={`${noteTitleCls} text-danger`}>
              {zh.common.failed((projects.error as Error).message)}
            </span>
            <button
              type="button"
              className={`${btnGhost} mt-1.5`}
              onClick={() => void projects.refetch()}
            >
              {laneEngineering.state.retry}
            </button>
          </div>
        )}
        {!projects.isLoading && !projects.isError && items.length === 0 && (
          <div className={emptyHintCls}>
            <p>{laneEngineering.dryRun.noProject}</p>
          </div>
        )}
        {items.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="dryrun-project">
              {laneEngineering.dryRun.pickProject}
            </label>
            <select
              id="dryrun-project"
              className={`${inputCls} w-auto max-w-[18rem]`}
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">{laneEngineering.dryRun.pickProject}</option>
              {items.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {command !== null && (
              <button type="button" className={`${btnGhost} mono`} onClick={() => copy(command)}>
                <Icon name="copy" size={13} />
                {laneEngineering.dryRun.copy}
              </button>
            )}
          </div>
        )}

        {/* 唯一出口：路径单引号包住的一条命令。Web 到此为止，写盘交给 CLI。 */}
        {command !== null && (
          <div className="rounded-md border border-line bg-panel-2 px-3 py-2">
            <p className={`${noteTitleCls} text-ink-body`}>
              {laneEngineering.dryRun.exitTitle}
            </p>
            <p className="mb-1.5 text-[11px] text-ink-muted">{laneEngineering.dryRun.exitHint}</p>
            <code className="mono block overflow-x-auto break-all text-[12px] text-ink">
              {command}
            </code>
          </div>
        )}

        <div>
          <p className="text-xs font-semibold text-ink">
            {laneEngineering.dryRun.tableTitle}
          </p>
          <p className="text-[11px] text-ink-muted">{laneEngineering.dryRun.tableHint}</p>
          <p className="mt-1 text-[11px] text-ink-faint">{laneEngineering.dryRun.tableScope}</p>

          <div className="mt-2 overflow-x-auto">
            <table className="w-full table-fixed border-collapse text-xs">
              <thead className={`text-left ${ledgerHeadCls}`}>
                <tr>
                  <th className="w-24 border-b border-line px-2 py-1 font-medium">
                    {laneEngineering.dryRun.statusCol}
                  </th>
                  <th className="w-44 border-b border-line px-2 py-1 font-medium">
                    {laneEngineering.dryRun.optionsCol}
                  </th>
                  <th className="border-b border-line px-2 py-1 font-medium">
                    {laneEngineering.dryRun.becauseCol}
                  </th>
                </tr>
              </thead>
              <tbody>
                {injectStatusRows.map((row) => (
                  <tr key={row.status} className="border-b border-line-hair align-top">
                    <td className="whitespace-nowrap px-2 py-1.5">
                      <span className={chipTone(STATUS_TONE[row.status as keyof typeof STATUS_TONE])}>
                        <Icon name={STATUS_ICON[row.status as keyof typeof STATUS_ICON]} size={11} />
                        {row.label}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">
                      {/* 段数由 options 决定：CONFLICT 渲染两档、DRIFT 渲染三档、无决策点的给一句说明 */}
                      {row.options.length === 0 ? (
                        <span className="text-[11px] text-ink-faint">
                          {laneEngineering.dryRun.noOptions}
                        </span>
                      ) : (
                        <span className={segCls}>
                          {row.options.map((d) => (
                            <span key={d} className={`${segItemCls} cursor-default`}>
                              {decisionLabels[d]}
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-ink-muted">{row.because}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 界面预选 ≠ CLI 默认：两处并列 + 标注尚未裁定，不替产品做决定 */}
        <div className={noteCls('warn')}>
          <span className={`${noteTitleCls} text-warn`}>
            {laneEngineering.dryRun.undecided.title}
          </span>
          <p className={`${noteTitleCls} text-ink-body`}>
            {laneEngineering.dryRun.undecided.body}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className={segCls}>
              {(['ui', 'cli'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={picked === k}
                  className={`${segItemCls} ${picked === k ? chipPressed : ''}`}
                  onClick={() => setPicked(k)}
                >
                  {k === 'ui'
                    ? `${laneEngineering.dryRun.undecided.uiPick}：保留本地`
                    : `${laneEngineering.dryRun.undecided.cliDefault}：overwrite`}
                </button>
              ))}
            </span>
            <span className="text-[11px] text-ink-muted">
              {laneEngineering.dryRun.undecided.verdict}
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
