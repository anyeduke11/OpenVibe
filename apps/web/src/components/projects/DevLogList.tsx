import { useState } from 'react'
import type { DevLogOut, DevLogType } from '@openvibe/shared'
import { zh } from '../../i18n/zh'
import { MarkdownPreview } from '../library/MarkdownPreview'
import { Icon } from '../ui/icons'
import {
  btnGhost,
  btnPrimary,
  cardBodyCls,
  cardCls,
  cardHeadCls,
  chipTone,
  emptyHintCls,
  ledgerNumCls,
  noteCls,
  noteTitleCls,
  rowCls,
  skelCls,
  tagCls,
} from '../ui/styles'
import { laneEngineering } from '../../i18n/lane-engineering'
import { ReflowActions } from './ReflowActions'
import { ExtractLauncher } from './ExtractLauncher'

/** 日志列表（m5 FR-5.3）：时间倒序、类型过滤、单条展开渲染 Markdown + 回流入口 */
export function DevLogList(props: {
  projectId: string
  projectName: string
  type: DevLogType
  entries: DevLogOut[]
  loading: boolean
  error: string | null
  onRetry: () => void
  onNew: () => void
}) {
  const [open, setOpen] = useState<string | null>(null)
  const fileName = props.type === 'DEV' ? 'DEV_LOG.md' : 'CHECK_LOG.md'

  return (
    <section className={`${cardCls} mt-2`}>
      <header className={cardHeadCls}>
        <h2 className="text-xs font-semibold text-ink-muted">{zh.projects.devlog.title}</h2>
        <span className={`${tagCls} tabular-nums`}>{String(props.entries.length)}</span>
        <a
          className={`${btnGhost} ml-auto h-7 px-2 py-0 text-xs`}
          href={`/api/projects/${props.projectId}/devlog/export?type=${props.type}`}
          download={fileName}
          title={zh.projects.devlog.exportHint}
        >
          {zh.projects.devlog.export(fileName)}
        </a>
        <button className={`${btnPrimary} h-7 px-2 py-0 text-xs`} onClick={props.onNew}>
          {zh.projects.devlog.newEntry(props.type)}
        </button>
      </header>

      <div className={cardBodyCls}>
        {props.loading &&
          [0, 1].map((i) => <div key={i} className={`${skelCls} mb-2 h-8 w-full`} aria-hidden />)}
        {props.error !== null && (
          <div className={noteCls('danger')}>
            <span className={`${noteTitleCls} text-danger`}>{zh.common.failed(props.error)}</span>
            <p className="text-ink-body">{laneEngineering.state.retryHint}</p>
            <button type="button" className={`${btnGhost} mt-1.5`} onClick={props.onRetry}>
              {laneEngineering.state.retry}
            </button>
          </div>
        )}
        {!props.loading && props.error === null && props.entries.length === 0 && (
          <div className={emptyHintCls}>
            <p>{zh.projects.devlog.empty}</p>
            <button className={btnPrimary} onClick={props.onNew}>
              {zh.projects.devlog.newEntry(props.type)}
            </button>
          </div>
        )}

        <ol className="space-y-1.5">
          {props.entries.map((entry) => {
            const expanded = open === entry.id
            return (
              <li key={entry.id} className={`${rowCls} rounded-sm`}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 py-1.5 text-left"
                  onClick={() => setOpen(expanded ? null : entry.id)}
                >
                  <span className={`${chipTone('accent')} font-medium tabular-nums`}>
                    {entry.displayNo}
                  </span>
                  <span className="truncate text-sm text-ink-body">
                    {entry.title === ''
                      ? (entry.body.split('\n')[0]?.slice(0, 40) ?? '')
                      : entry.title}
                  </span>
                  <span className={`${ledgerNumCls} ml-auto shrink-0 text-[11px] text-ink-faint`}>
                    {entry.createdAt}
                  </span>
                  <Icon
                    name={expanded ? 'fwd' : 'fwd'}
                    size={12}
                    className="shrink-0 text-ink-faint rotate-90"
                  />
                </button>

                {entry.relatedFiles.length > 0 && (
                  <p className="mt-1 text-[11px] text-ink-muted">
                    {zh.projects.devlog.fields.relatedFiles}: {entry.relatedFiles.join('、')}
                  </p>
                )}
                <p className="mt-0.5 text-[11px] text-ink-muted">
                  {entry.evidence === null
                    ? zh.projects.devlog.noEvidence
                    : `${zh.projects.devlog.fields.command}: ${'`'}${entry.evidence.command}${'`'} · ${
                        zh.projects.devlog.fields.result
                      }: ${entry.evidence.resultSummary}`}
                </p>

                {expanded && (
                  <>
                    <div className="html-md mt-2 max-h-[40vh] overflow-auto rounded-md border border-line-hair bg-panel-2 p-2">
                      <MarkdownPreview source={entry.body} />
                    </div>
                    <p className="mt-1 text-[11px] text-ink-faint">{zh.projects.devlog.readOnly}</p>
                    <ReflowActions entry={entry} projectName={props.projectName} />
                  </>
                )}
              </li>
            )
          })}
        </ol>

        {/* M10/D：提取候选入口（总闸关着时自身不渲染——DL-08） */}
        <ExtractLauncher projectId={props.projectId} entries={props.entries} />
      </div>
    </section>
  )
}
