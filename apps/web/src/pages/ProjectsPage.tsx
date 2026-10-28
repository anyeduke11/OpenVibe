import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PROJECT_STATUS } from '@openvibe/shared'
import { ProjectList } from '../components/projects/ProjectList'
import { ProjectWizard } from '../components/projects/ProjectWizard'
import { ConfirmDeleteDialog } from '../components/ui/ConfirmDeleteDialog'
import { toast } from '../components/ui/Toaster'
import {
  btnPrimary,
  chipPressed,
  h1Cls,
  h1SubCls,
  noteTitleCls,
  segCls,
  segItemCls,
} from '../components/ui/styles'
import { useProjectMutations, useProjectList, type ProjectView } from '../hooks/useProjects'
import { laneEngineering } from '../i18n/lane-engineering'
import { zh } from '../i18n/zh'

const FILTERS: readonly ('all' | (typeof PROJECT_STATUS)[number])[] = ['all', ...PROJECT_STATUS]

export function ProjectsPage() {
  const [status, setStatus] = useState('active')
  const [wizardOpen, setWizardOpen] = useState(false)
  const [deleting, setDeleting] = useState<ProjectView | null>(null)
  const list = useProjectList(status)
  const { remove } = useProjectMutations()

  const items = list.data?.items ?? []

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* view-head：h1 + 一句话说明一行；下面一行是筛选分段器与主动作（原型口径） */}
      <header className="border-b border-line-hair px-5 pt-4 pb-3">
        <h1 className={h1Cls}>{zh.projects.title}</h1>
        <p className={h1SubCls}>{laneEngineering.view.projects}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className={segCls} role="group" aria-label={laneEngineering.projects.filterLabel}>
            {FILTERS.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={status === s}
                className={`${segItemCls} ${status === s ? chipPressed : ''}`}
                onClick={() => setStatus(s)}
              >
                {zh.projects.statusAll[s]}
              </button>
            ))}
          </div>
          <button className={`${btnPrimary} ml-auto`} onClick={() => setWizardOpen(true)}>
            {zh.projects.newProject}
          </button>
        </div>
      </header>

      {/* 「无结果」是筛出来的、不是没有数据：单独给清除筛选，而不是复用空态 */}
      {list.data !== undefined && items.length === 0 && (
        <div className="flex items-center gap-2 border-b border-line-hair bg-panel-2 px-5 py-1.5 text-xs text-ink-muted">
          <span>{laneEngineering.state.noResult}</span>
          <button
            type="button"
            className="text-accent hover:underline"
            onClick={() => setStatus('all')}
          >
            {laneEngineering.state.clearFilter}
          </button>
        </div>
      )}

      <ProjectList
        items={items}
        loading={list.isLoading}
        error={list.isError ? (list.error as Error).message : null}
        onRetry={() => void list.refetch()}
        statusFilter={status}
        onCreate={() => setWizardOpen(true)}
        onDelete={setDeleting}
        injectionOf={(p) =>
          p.health.injection.version === null
            ? zh.projects.notInjected
            : zh.projects.injected(p.health.injection.packId ?? '?', p.health.injection.version)
        }
      />

      <footer className="flex items-center gap-3 border-t border-line-hair px-5 py-1.5 text-xs text-ink-muted">
        <span className="tabular-nums">{zh.projects.total(items.length)}</span>
        {list.isFetching && !list.isLoading && (
          <span className="text-ink-faint">{laneEngineering.state.loading}</span>
        )}
        <Link className="ml-auto text-accent hover:underline" to="/flows">
          {zh.nav.flows}
        </Link>
      </footer>

      <ProjectWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />

      <ConfirmDeleteDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={zh.projects.deleteDialog.title}
        confirmLabel={zh.projects.deleteDialog.confirm}
        pending={remove.isPending}
        onConfirm={() => {
          if (deleting === null) return
          remove.mutate(deleting.id, {
            onSuccess: () => {
              toast(zh.projects.deleteDialog.done)
              setDeleting(null)
            },
            onError: (e: Error) => toast(e.message, 'error'),
          })
        }}
      >
        {deleting !== null && (
          <div className="space-y-2 text-sm">
            <p>{zh.projects.deleteDialog.body(deleting.name)}</p>
            <p className="text-xs text-danger">
              {zh.projects.deleteDialog.counts(deleting.health.logCount, deleting.health.taskCount)}
            </p>
            {/* 影响范围：会变 / 不受影响各说一遍，破坏动作不能只给一个「确定吗」 */}
            <div className="rounded-md border border-line bg-panel-2 px-3 py-2 text-xs">
              <span className={`${noteTitleCls} text-ink-body`}>
                {laneEngineering.projectDelete.impactTitle}
              </span>
              <ul className="space-y-0.5 text-ink-muted">
                <li>· {laneEngineering.projectDelete.impactOk}</li>
                <li>· {laneEngineering.projectDelete.impactExported}</li>
              </ul>
            </div>
          </div>
        )}
      </ConfirmDeleteDialog>
    </div>
  )
}
