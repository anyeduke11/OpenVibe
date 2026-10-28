import { useCallback, useState } from 'react'
import type { SkillScanReport } from '@openvibe/shared'
import { lane } from '../i18n/lane-assets'
import { zh } from '../i18n/zh'
import { AssetFilterBar, AssetPageHead, AssetSearchBox } from '../components/library/AssetPageHead'
import { RefreshHint } from '../components/library/AssetStates'
import { SkillCleanupDialog } from '../components/skills/SkillCleanupDialog'
import { SkillEditorDrawer } from '../components/skills/SkillEditorDrawer'
import { SkillList } from '../components/skills/SkillList'
import { SkillRemoteDialog } from '../components/skills/SkillRemoteDialog'
import { SkillReviewDialog } from '../components/skills/SkillReviewDialog'
import { SkillToolsDialog } from '../components/skills/SkillToolsDialog'
import { SkillUpdateDialog } from '../components/skills/SkillUpdateDialog'
import { SkillScanReportView } from '../components/skills/SkillScanReportView'
import { ConfirmDeleteDialog } from '../components/ui/ConfirmDeleteDialog'
import { Dialog, DialogPanel } from '../components/ui/Dialog'
import { toast } from '../components/ui/Toaster'
import { Icon } from '../components/ui/icons'
import { btnGhost, btnPrimary } from '../components/ui/styles'
import { useDebounced } from '../hooks/useDebounced'
import { useSkillMutations, useSkillList, type SkillRow } from '../hooks/useSkills'

export function SkillsPage() {
  const [search, setSearch] = useState('')
  const q = useDebounced(search)
  const [editor, setEditor] = useState<{ skill: SkillRow | null } | null>(null)
  const [deleting, setDeleting] = useState<SkillRow | null>(null)
  const [report, setReport] = useState<SkillScanReport | null>(null)
  const [remoteOpen, setRemoteOpen] = useState(false)
  const [cleanupOpen, setCleanupOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [updatesOpen, setUpdatesOpen] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)
  const list = useSkillList(q)
  const { remove, scan } = useSkillMutations()

  const runScan = (roots?: string[]) =>
    scan.mutate(roots, {
      onSuccess: (r) => {
        setReport(r)
        toast(zh.skills.scanReport.done)
      },
      onError: (e: Error) => toast(e.message, 'error'),
    })

  const clearFilters = useCallback(() => setSearch(''), [])

  // 工具箱里的按钮先关自己再开目标对话框，避免两个 Radix 焦点域叠在一起
  const handoff = (close: () => void, open: () => void) => () => {
    close()
    open()
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <AssetPageHead
        title={zh.skills.title}
        hint={lane.view.skills}
        actions={
          <>
            <AssetSearchBox
              value={search}
              onChange={setSearch}
              ariaLabel={zh.skills.searchPlaceholder}
              widthClass="w-56"
            />
            <button className={btnPrimary} onClick={() => setEditor({ skill: null })}>
              <Icon name="plus" size={12} />
              {zh.skills.create.title}
            </button>
          </>
        }
        filters={
          <AssetFilterBar
            trailing={
              <>
                <RefreshHint busy={list.isFetching && !list.isLoading} />
                <button
                  className={btnGhost}
                  onClick={() => setToolsOpen(true)}
                  title={lane.skills.toolsHint}
                >
                  <Icon name="layers" size={12} />
                  {lane.skills.tools}
                </button>
              </>
            }
          >
            {/* 默认扫描是最高频入口，留在筛选行左端一步可达 */}
            <button
              className={btnGhost}
              disabled={scan.isPending}
              title={zh.skills.scanDefaultHint}
              onClick={() => runScan(undefined)}
            >
              <Icon name="refresh" size={12} />
              {scan.isPending ? zh.skills.scanning : zh.skills.scan}
            </button>
            <span className="truncate text-[11px] text-ink-faint">{zh.skills.scanCustomHint}</span>
          </AssetFilterBar>
        }
      />

      <SkillList
        items={list.data?.items ?? []}
        loading={list.isLoading}
        error={list.error?.message ?? null}
        searching={q.trim() !== ''}
        onClearFilters={clearFilters}
        onRetry={() => void list.refetch()}
        onEdit={(skill) => setEditor({ skill })}
        onDelete={setDeleting}
        onCreate={() => setEditor({ skill: null })}
      />

      <footer className="flex shrink-0 items-center gap-3 border-t border-line-hair px-5 py-1.5 text-xs text-ink-muted">
        <span className="tabular-nums">{zh.skills.total(list.data?.total ?? 0)}</span>
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

      <SkillToolsDialog
        open={toolsOpen}
        onClose={() => setToolsOpen(false)}
        onScanRoots={(roots) => {
          setToolsOpen(false)
          runScan(roots)
        }}
        onOpenRemote={handoff(
          () => setToolsOpen(false),
          () => setRemoteOpen(true),
        )}
        onOpenUpdates={handoff(
          () => setToolsOpen(false),
          () => setUpdatesOpen(true),
        )}
        onOpenCleanup={handoff(
          () => setToolsOpen(false),
          () => setCleanupOpen(true),
        )}
        onOpenReview={handoff(
          () => setToolsOpen(false),
          () => setReviewOpen(true),
        )}
      />
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

      <ConfirmDeleteDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={zh.skills.deleteDialog.title}
        confirmLabel={zh.skills.deleteDialog.confirm}
        pending={remove.isPending}
        onConfirm={() => {
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
        {deleting !== null && (
          <div className="space-y-2 text-sm">
            {/* 影响范围：只删台账与版本历史，磁盘目录不受影响 */}
            <p className="proseCls">{zh.skills.deleteDialog.body(deleting.name)}</p>
            <p className="proseCls text-xs text-ink-muted">{zh.skills.deleteDialog.note}</p>
            {deleting.installedTargets.length > 0 && (
              <p className="proseCls text-xs text-ink-muted">
                <span className="mono">{deleting.installedTargets.join(' · ')}</span>
              </p>
            )}
          </div>
        )}
      </ConfirmDeleteDialog>
    </div>
  )
}
