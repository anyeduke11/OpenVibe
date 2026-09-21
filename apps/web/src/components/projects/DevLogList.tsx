import { useState } from 'react'
import type { DevLogOut, DevLogType } from '@openvibe/shared'
import { zh } from '../../i18n/zh'
import { MarkdownPreview } from '../library/MarkdownPreview'
import { btnGhost, btnPrimary, chipCls } from '../ui/styles'
import { ReflowActions } from './ReflowActions'

/** 日志列表（m5 FR-5.3）：时间倒序、类型过滤、单条展开渲染 Markdown + 回流入口 */
export function DevLogList(props: {
  projectId: string
  projectName: string
  type: DevLogType
  entries: DevLogOut[]
  loading: boolean
  onNew: () => void
}) {
  const [open, setOpen] = useState<string | null>(null)
  const fileName = props.type === 'DEV' ? 'DEV_LOG.md' : 'CHECK_LOG.md'

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4">
      <header className="mb-2 flex items-center gap-2">
        <h2 className="text-sm font-semibold">{zh.projects.devlog.title}</h2>
        <span className={`${chipCls} border-zinc-200 bg-zinc-50 text-zinc-600`}>
          {String(props.entries.length)}
        </span>
        <a
          className={`${btnGhost} ml-auto`}
          href={`/api/projects/${props.projectId}/devlog/export?type=${props.type}`}
          download={fileName}
          title={zh.projects.devlog.exportHint}
        >
          {zh.projects.devlog.export(fileName)}
        </a>
        <button className={btnPrimary} onClick={props.onNew}>
          {zh.projects.devlog.newEntry(props.type)}
        </button>
      </header>

      {props.loading && <p className="text-sm text-zinc-400">{zh.common.loading}</p>}
      {!props.loading && props.entries.length === 0 && (
        <p className="text-sm text-zinc-500">{zh.projects.devlog.empty}</p>
      )}

      <ol className="space-y-2">
        {props.entries.map((entry) => {
          const expanded = open === entry.id
          return (
            <li key={entry.id} className="rounded-md border border-zinc-200 px-3 py-2">
              <button
                type="button"
                className="flex w-full items-center gap-2 text-left"
                onClick={() => setOpen(expanded ? null : entry.id)}
              >
                <span className={`${chipCls} border-brand bg-brand-soft font-medium text-brand`}>
                  {entry.displayNo}
                </span>
                <span className="truncate text-sm text-zinc-800">
                  {entry.title === '' ? entry.body.split('\n')[0]?.slice(0, 40) ?? '' : entry.title}
                </span>
                <span className="ml-auto shrink-0 text-[11px] text-zinc-400">{entry.createdAt}</span>
                <span className="shrink-0 text-[11px] text-zinc-400">{expanded ? '▴' : '▾'}</span>
              </button>

              {entry.relatedFiles.length > 0 && (
                <p className="mt-1 text-[11px] text-zinc-500">
                  {zh.projects.devlog.fields.relatedFiles}: {entry.relatedFiles.join('、')}
                </p>
              )}
              <p className="mt-0.5 text-[11px] text-zinc-500">
                {entry.evidence === null
                  ? zh.projects.devlog.noEvidence
                  : `${zh.projects.devlog.fields.command}: ${'`'}${entry.evidence.command}${'`'} · ${
                      zh.projects.devlog.fields.result
                    }: ${entry.evidence.resultSummary}`}
              </p>

              {expanded && (
                <>
                  <div className="html-md mt-2 max-h-[40vh] overflow-auto rounded-md border border-zinc-100 bg-zinc-50 p-2">
                    <MarkdownPreview source={entry.body} />
                  </div>
                  <p className="mt-1 text-[11px] text-zinc-400">{zh.projects.devlog.readOnly}</p>
                  <ReflowActions entry={entry} projectName={props.projectName} />
                </>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
