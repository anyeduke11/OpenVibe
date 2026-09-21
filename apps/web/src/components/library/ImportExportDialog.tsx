import { useRef, useState } from 'react'
import { usePromptMutations } from '../../hooks/usePrompts'
import type { ImportReport } from '../../hooks/usePrompts'
import { zh } from '../../i18n/zh'
import { ApiError } from '../../api/client'
import { Dialog, DialogPanel } from '../ui/Dialog'
import { toast } from '../ui/Toaster'
import { btnGhost, btnPrimary } from '../ui/styles'

/** 导入（JSON/md/规则文件，走文本通道，服务端解析）+ 导出（JSON/Markdown 附件下载）
 *  m1 FR-6/FR-7；规则文件解析在 packages/core/importers */
export function ImportExportDialog(props: { open: boolean; onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [names, setNames] = useState<string[]>([])
  const [report, setReport] = useState<ImportReport | null>(null)
  const { importPrompts } = usePromptMutations()

  const onPick = async (files: FileList | null) => {
    if (files === null || files.length === 0) return
    const list = [...files]
    setNames(list.map((f) => f.name))
    setReport(null)
    const payload = await Promise.all(
      list.map(async (f) => ({ filename: f.name, content: await f.text() })),
    )
    importPrompts.mutate(
      { files: payload },
      {
        onSuccess: (r) => {
          setReport(r)
          toast(zh.importDialog.report(r.created.length, r.skipped.length))
        },
        onError: (e) =>
          toast(zh.importDialog.failed(e instanceof ApiError ? e.message : String(e)), 'error'),
      },
    )
  }

  return (
    <Dialog open={props.open} onOpenChange={(o) => (o ? undefined : props.onClose())}>
      <DialogPanel
        title={zh.importDialog.title}
        footer={
          <button className={btnGhost} onClick={props.onClose}>
            {zh.editor.close}
          </button>
        }
      >
        <div className="space-y-4 text-sm">
          <p className="text-xs leading-relaxed text-zinc-500">{zh.importDialog.hint}</p>
          <div className="flex items-center gap-3">
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".json,.md,.mdc,.cursorrules,text/markdown,application/json"
              className="hidden"
              onChange={(e) => void onPick(e.target.files)}
            />
            <button className={btnPrimary} onClick={() => inputRef.current?.click()}>
              {zh.importDialog.pick}
            </button>
            {importPrompts.isPending && (
              <span className="text-xs text-zinc-500">{zh.importDialog.importing}</span>
            )}
          </div>
          {names.length > 0 && (
            <ul className="mono space-y-0.5 text-xs text-zinc-600">
              {names.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
          {report !== null && (
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs">
              <p>{zh.importDialog.report(report.created.length, report.skipped.length)}</p>
              {report.skipped.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-zinc-500">
                  <li className="font-medium text-zinc-600">{zh.importDialog.skippedList}</li>
                  {report.skipped.map((s, i) => (
                    <li key={`${s.title}-${String(i)}`}>
                      {s.title} — {s.reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="border-t border-zinc-100 pt-3">
            <p className="mb-2 text-xs font-medium text-zinc-500">
              {zh.library.exportJson} / {zh.library.exportMd}
            </p>
            <div className="flex gap-2">
              <a className={btnGhost} href="/api/prompts/export?format=json" download>
                {zh.library.exportJson}
              </a>
              <a className={btnGhost} href="/api/prompts/export?format=md" download>
                {zh.library.exportMd}
              </a>
            </div>
          </div>
        </div>
      </DialogPanel>
    </Dialog>
  )
}
