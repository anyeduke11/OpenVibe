import { useState } from 'react'
import type { SkillScanReport } from '@openvibe/shared'
import { SkillEditorDrawer } from '../components/skills/SkillEditorDrawer'
import { SkillList } from '../components/skills/SkillList'
import { SkillScanReportView } from '../components/skills/SkillScanReportView'
import { Dialog, DialogPanel } from '../components/ui/Dialog'
import { toast } from '../components/ui/Toaster'
import { btnGhost, btnPrimary, inputCls } from '../components/ui/styles'
import { useDebounced } from '../hooks/useDebounced'
import { useSkillMutations, useSkillList, type SkillRow } from '../hooks/useSkills'
import { zh } from '../i18n/zh'

export function SkillsPage() {
  const [search, setSearch] = useState('')
  const q = useDebounced(search)
  const [editor, setEditor] = useState<{ skill: SkillRow | null } | null>(null)
  const [deleting, setDeleting] = useState<SkillRow | null>(null)
  const [report, setReport] = useState<SkillScanReport | null>(null)
  const list = useSkillList(q)
  const { remove, scan } = useSkillMutations()

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b border-zinc-100 px-5 py-3">
        <h1 className="mr-auto text-base font-semibold">{zh.skills.title}</h1>
        <input
          className={`${inputCls} w-72`}
          placeholder={zh.skills.searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          className={btnGhost}
          disabled={scan.isPending}
          onClick={() =>
            scan.mutate(undefined, {
              onSuccess: (r) => {
                setReport(r)
                toast(zh.skills.scanReport.done)
              },
              onError: (e: Error) => toast(e.message, 'error'),
            })
          }
        >
          {scan.isPending ? zh.skills.scanning : zh.skills.scan}
        </button>
        <button className={btnPrimary} onClick={() => setEditor({ skill: null })}>
          {zh.skills.create.title}
        </button>
      </header>

      <SkillList
        items={list.data?.items ?? []}
        loading={list.isLoading}
        onEdit={(skill) => setEditor({ skill })}
        onDelete={setDeleting}
        onCreate={() => setEditor({ skill: null })}
      />

      <footer className="border-t border-zinc-100 px-5 py-2 text-xs text-zinc-500">
        {zh.skills.total(list.data?.total ?? 0)}
        {list.isFetching && <span className="ml-2 text-zinc-400">刷新中…</span>}
      </footer>

      {editor !== null && (
        <SkillEditorDrawer
          key={editor.skill?.id ?? 'new'}
          skill={editor.skill}
          open
          onClose={() => setEditor(null)}
          onSaved={() => setEditor(null)}
        />
      )}

      <Dialog open={report !== null} onOpenChange={(o) => (o ? undefined : setReport(null))}>
        <DialogPanel
          title={zh.skills.scanReport.title}
          footer={
            <button className={btnGhost} onClick={() => setReport(null)}>
              {zh.editor.close}
            </button>
          }
        >
          {report !== null && <SkillScanReportView report={report} />}
        </DialogPanel>
      </Dialog>

      <Dialog open={deleting !== null} onOpenChange={(o) => (o ? undefined : setDeleting(null))}>
        <DialogPanel
          title={zh.skills.deleteDialog.title}
          footer={
            <>
              <button className={btnGhost} onClick={() => setDeleting(null)}>
                {zh.editor.cancel}
              </button>
              <button
                className={`${btnPrimary} border-red-600 bg-red-600 hover:bg-red-700`}
                disabled={remove.isPending}
                onClick={() => {
                  if (deleting === null) return
                  remove.mutate(deleting.id, {
                    onSuccess: () => {
                      toast(zh.skills.deleteDialog.done)
                      setDeleting(null)
                    },
                    onError: (e: Error) => toast(e.message, 'error'),
                  })
                }}
              >
                {zh.skills.deleteDialog.confirm}
              </button>
            </>
          }
        >
          {deleting !== null && (
            <div className="space-y-2 text-sm">
              <p>{zh.skills.deleteDialog.body(deleting.name)}</p>
              <p className="text-xs text-zinc-500">{zh.skills.deleteDialog.note}</p>
            </div>
          )}
        </DialogPanel>
      </Dialog>
    </div>
  )
}
