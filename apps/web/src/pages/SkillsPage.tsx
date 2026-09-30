import { useState } from 'react'
import type { SkillScanReport } from '@openvibe/shared'
import { SkillCleanupDialog } from '../components/skills/SkillCleanupDialog'
import { SkillEditorDrawer } from '../components/skills/SkillEditorDrawer'
import { SkillList } from '../components/skills/SkillList'
import { SkillRemoteDialog } from '../components/skills/SkillRemoteDialog'
import { SkillReviewDialog } from '../components/skills/SkillReviewDialog'
import { SkillUpdateDialog } from '../components/skills/SkillUpdateDialog'
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
  const [rootsInput, setRootsInput] = useState('')
  const [remoteOpen, setRemoteOpen] = useState(false)
  const [cleanupOpen, setCleanupOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [updatesOpen, setUpdatesOpen] = useState(false)
  const list = useSkillList(q)
  const { remove, scan } = useSkillMutations()

  /** 自定义根：空格 / 中西文逗号分隔；空输入即回落默认扫描 */
  const parseRoots = (raw: string): string[] =>
    raw
      .split(/[\s,，、]+/)
      .map((s) => s.trim())
      .filter((s) => s !== '')
  const customRoots = parseRoots(rootsInput)

  const runScan = (roots?: string[]) =>
    scan.mutate(roots, {
      onSuccess: (r) => {
        setReport(r)
        toast(zh.skills.scanReport.done)
      },
      onError: (e: Error) => toast(e.message, 'error'),
    })

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b border-line-hair px-5 py-3">
        <h1 className="mr-auto text-base font-semibold">{zh.skills.title}</h1>
        <input
          className={`${inputCls} w-64`}
          placeholder={zh.skills.searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <input
          className={`${inputCls} w-80 font-mono text-xs`}
          placeholder={zh.skills.customScanPlaceholder}
          value={rootsInput}
          onChange={(e) => setRootsInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && customRoots.length > 0) runScan(customRoots)
          }}
        />
        <button
          className={btnGhost}
          disabled={scan.isPending || customRoots.length === 0}
          title={zh.skills.scanCustomHint}
          onClick={() => runScan(customRoots)}
        >
          {scan.isPending ? zh.skills.scanning : zh.skills.scanCustom}
        </button>
        <button
          className={btnGhost}
          disabled={scan.isPending}
          title={zh.skills.scanDefaultHint}
          onClick={() => runScan(undefined)}
        >
          {scan.isPending ? zh.skills.scanning : zh.skills.scan}
        </button>
        <button className={btnGhost} onClick={() => setRemoteOpen(true)}>
          {zh.skills.remoteImport}
        </button>
        <button className={btnGhost} onClick={() => setUpdatesOpen(true)}>
          {zh.skills.checkUpdates}
        </button>
        <button className={btnGhost} onClick={() => setCleanupOpen(true)}>
          {zh.skills.cleanup}
        </button>
        <button className={btnGhost} onClick={() => setReviewOpen(true)}>
          {zh.skills.review}
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

      <footer className="border-t border-line-hair px-5 py-2 text-xs text-ink-subtle">
        {zh.skills.total(list.data?.total ?? 0)}
        {list.isFetching && <span className="ml-2 text-ink-faint">刷新中…</span>}
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

      <SkillRemoteDialog open={remoteOpen} onClose={() => setRemoteOpen(false)} />
      <SkillCleanupDialog open={cleanupOpen} onClose={() => setCleanupOpen(false)} />
      <SkillReviewDialog open={reviewOpen} onClose={() => setReviewOpen(false)} />
      <SkillUpdateDialog open={updatesOpen} onClose={() => setUpdatesOpen(false)} />

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
                className={`${btnPrimary} border-danger-600 bg-danger-600 hover:bg-danger-700`}
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
              <p className="text-xs text-ink-subtle">{zh.skills.deleteDialog.note}</p>
            </div>
          )}
        </DialogPanel>
      </Dialog>
    </div>
  )
}
