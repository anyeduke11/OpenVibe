import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PROJECT_STATUS } from '@openvibe/shared'
import { ProjectList } from '../components/projects/ProjectList'
import { ProjectWizard } from '../components/projects/ProjectWizard'
import { Dialog, DialogPanel } from '../components/ui/Dialog'
import { toast } from '../components/ui/Toaster'
import { btnGhost, btnPrimary, inputCls } from '../components/ui/styles'
import { useProjectMutations, useProjectList, type ProjectView } from '../hooks/useProjects'
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
      <header className="flex flex-wrap items-center gap-2 border-b border-zinc-100 px-5 py-3">
        <h1 className="mr-auto text-base font-semibold">{zh.projects.title}</h1>
        <select
          className={`${inputCls} w-auto appearance-none`}
          value={status}
          aria-label={zh.projects.filterStatus}
          onChange={(e) => setStatus(e.target.value)}
        >
          {FILTERS.map((s) => (
            <option key={s} value={s}>
              {zh.projects.statusAll[s]}
            </option>
          ))}
        </select>
        <button className={btnPrimary} onClick={() => setWizardOpen(true)}>
          {zh.projects.newProject}
        </button>
      </header>

      <ProjectList
        items={items}
        loading={list.isLoading}
        onDelete={setDeleting}
        injectionOf={(p) =>
          p.health.injection.version === null
            ? zh.projects.notInjected
            : zh.projects.injected(p.health.injection.packId ?? '?', p.health.injection.version)
        }
      />

      <footer className="flex items-center gap-3 border-t border-zinc-100 px-5 py-2 text-xs text-zinc-500">
        <span>{zh.projects.total(items.length)}</span>
        {list.isFetching && <span className="text-zinc-400">刷新中…</span>}
        <Link className="ml-auto text-brand hover:underline" to="/flows">
          {zh.nav.flows}
        </Link>
      </footer>

      <ProjectWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />

      <Dialog open={deleting !== null} onOpenChange={(o) => (o ? undefined : setDeleting(null))}>
        <DialogPanel
          title={zh.projects.deleteDialog.title}
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
                      toast(zh.projects.deleteDialog.done)
                      setDeleting(null)
                    },
                    onError: (e: Error) => toast(e.message, 'error'),
                  })
                }}
              >
                {zh.projects.deleteDialog.confirm}
              </button>
            </>
          }
        >
          {deleting !== null && (
            <div className="space-y-2 text-sm">
              <p>{zh.projects.deleteDialog.body(deleting.name)}</p>
              <p className="text-xs text-red-700">
                {zh.projects.deleteDialog.counts(deleting.health.logCount, deleting.health.taskCount)}
              </p>
            </div>
          )}
        </DialogPanel>
      </Dialog>
    </div>
  )
}
