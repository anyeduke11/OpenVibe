import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  DEVLOG_TYPES,
  type DevLogType,
  type Stage,
  type TaskOut,
  type TaskStatus,
} from '@openvibe/shared'
import { ChecklistPanel, type OrphanStageState } from '../components/projects/ChecklistPanel'
import { DevLogEditor } from '../components/projects/DevLogEditor'
import { DevLogList } from '../components/projects/DevLogList'
import { KanbanBoard, TaskComposer } from '../components/projects/KanbanBoard'
import { ProjectDashboard } from '../components/projects/ProjectDashboard'
import { StageBar } from '../components/projects/StageBar'
import { toast } from '../components/ui/Toaster'
import { btnGhost } from '../components/ui/styles'
import { useFlowTemplates } from '../hooks/useFlows'
import { useDevLog } from '../hooks/useDevLog'
import {
  useCheckStates,
  useInjectionStatus,
  useProject,
  useProjectMutations,
} from '../hooks/useProjects'
import { useTasks, useTaskMutations } from '../hooks/useTasks'
import { zh } from '../i18n/zh'

/** 勾选记录按「阶段名 + 项 id」定位：清单 id 只在阶段内唯一，跨阶段会重名 */
const stageNames = (stages: Stage[]): string[] => stages.map((s) => s.name)

const pctOf = (done: number, total: number): number =>
  total === 0 ? 0 : Math.round((done / total) * 100)

export function ProjectDetailPage() {
  const { id = '' } = useParams<{ id: string }>()
  const project = useProject(id)
  const checks = useCheckStates(id)
  const injection = useInjectionStatus(id)
  const tasks = useTasks(id)
  const flows = useFlowTemplates()
  const [logType, setLogType] = useState<DevLogType>('DEV')
  const [logEditorOpen, setLogEditorOpen] = useState(false)
  const [busyItemId, setBusyItemId] = useState<string | null>(null)
  const devLog = useDevLog(id, logType)
  const pm = useProjectMutations(id)
  const tm = useTaskMutations(id)

  const view = project.data
  const stages = useMemo(() => view?.stagesSnapshot ?? [], [view])
  const rows = useMemo(() => checks.data?.items ?? [], [checks.data])
  const checkedByStage = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const r of rows) {
      const set = map.get(r.stageName)
      if (set === undefined) map.set(r.stageName, new Set([r.itemId]))
      else set.add(r.itemId)
    }
    return map
  }, [rows])

  const isChecked = (stageName: string, itemId: string): boolean =>
    checkedByStage.get(stageName)?.has(itemId) === true

  const doneCount = (stageName: string): number => {
    const stage = stages.find((s) => s.name === stageName)
    if (stage === undefined) return 0
    return stage.checklist.filter((c) => isChecked(stageName, c.id)).length
  }

  /** 快照里已不存在、但仍留有勾选记录的阶段（design D10 历史列） */
  const orphans = useMemo<OrphanStageState[]>(() => {
    const known = new Set(stageNames(stages))
    const out = new Map<string, OrphanStageState>()
    for (const r of rows) {
      if (known.has(r.stageName)) continue
      const entry = out.get(r.stageName)
      if (entry === undefined) out.set(r.stageName, { stageName: r.stageName, items: [r] })
      else entry.items.push(r)
    }
    return [...out.values()]
  }, [rows, stages])

  const currentStage = view?.currentStage ?? stages[0]?.name ?? null
  const activeStage = stages.find((s) => s.name === currentStage)
  const templateName =
    view === undefined
      ? null
      : (flows.data?.items.find((f) => f.id === view.flowTemplateId)?.name ?? null)

  const percent = (done: number, total: number): string =>
    zh.projects.detail.progress(pctOf(done, total), done, total)

  const switchTo = (stageName: string): void => {
    if (view === undefined || stageName === view.currentStage) return
    const stage = stages.find((s) => s.name === stageName)
    const unchecked = (stage?.checklist.length ?? 0) - doneCount(stageName)
    pm.switchStage.mutate(
      { stageName },
      {
        onSuccess: () => {
          toast(zh.projects.detail.switched(stageName))
          // m5 FR-3.3：未勾满也可切换，只给提示
          if (unchecked > 0) toast(zh.projects.detail.switchWithUnchecked(unchecked))
        },
        onError: (e: Error) => toast(e.message, 'error'),
      },
    )
  }

  const toggle = (itemId: string, checked: boolean): void => {
    if (currentStage === null) return
    setBusyItemId(itemId)
    const done = () => setBusyItemId(null)
    pm.setCheck.mutate(
      { stageName: currentStage, itemId, checked },
      {
        onSuccess: done,
        onError: (e: Error) => {
          done()
          toast(`${zh.projects.checklist.toggleFailed}：${e.message}`, 'error')
        },
      },
    )
  }

  const setStatus = (status: string): void => {
    if (view === undefined || status === view.status) return
    pm.update.mutate(
      { id: view.id, patch: { status: status as typeof view.status } },
      {
        onSuccess: () => toast(status === 'archived' ? zh.projects.archiveDone : zh.projects.statusDone),
        onError: (e: Error) => toast(e.message, 'error'),
      },
    )
  }

  const createTask = (title: string, stageName?: string): void => {
    if (title.trim() === '') {
      toast(zh.projects.kanban.titleRequired, 'error')
      return
    }
    tm.create.mutate(
      { title: title.trim(), stageName },
      {
        onSuccess: () => toast(zh.projects.kanban.added),
        onError: (e: Error) => toast(e.message, 'error'),
      },
    )
  }

  const moveTask = (taskId: string, status: TaskStatus, order: number): void => {
    tm.move.mutate(
      { id: taskId, status, order },
      { onError: () => toast(zh.projects.kanban.moveFailed, 'error') },
    )
  }

  const renameTask = (taskId: string, title: string): void => {
    if (title.trim() === '') {
      toast(zh.projects.kanban.titleRequired, 'error')
      return
    }
    tm.update.mutate(
      { id: taskId, patch: { title: title.trim() } },
      { onError: (e: Error) => toast(e.message, 'error') },
    )
  }

  const tagTask = (taskId: string, stageName: string | null): void => {
    tm.update.mutate(
      { id: taskId, patch: { stageName } },
      { onError: (e: Error) => toast(e.message, 'error') },
    )
  }

  const deleteTask = (taskId: string): void => {
    tm.remove.mutate(taskId, {
      onSuccess: () => toast(zh.projects.kanban.deleted),
      onError: (e: Error) => toast(e.message, 'error'),
    })
  }

  if (project.isLoading) {
    return <p className="p-6 text-sm text-zinc-500">{zh.common.loading}</p>
  }
  if (view === undefined) {
    return (
      <div className="space-y-3 p-6">
        <p className="text-sm text-red-700">
          {zh.common.failed(project.error instanceof Error ? project.error.message : 'unknown')}
        </p>
        <Link className="text-sm text-brand hover:underline" to="/projects">
          {zh.projects.detail.back}
        </Link>
      </div>
    )
  }

  const taskItems: TaskOut[] = tasks.data?.items ?? []

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b border-zinc-100 px-5 py-3">
        <Link className={`${btnGhost} h-[1.85rem] px-2 py-0 text-xs`} to="/projects">
          ← {zh.projects.detail.back}
        </Link>
        <h1 className="text-base font-semibold">{view.name}</h1>
        {templateName !== null && (
          <span className="text-[11px] text-zinc-400">
            {zh.projects.detail.snapshotFrom(templateName)}
          </span>
        )}
        {view.status !== 'archived' && (
          <button
            className={`${btnGhost} ml-auto text-xs`}
            onClick={() => setStatus('archived')}
          >
            {zh.projects.status.archived}
          </button>
        )}
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto px-5 py-4">
        <ProjectDashboard
          project={view}
          templateName={templateName}
          injection={injection.data}
          onStatusChange={setStatus}
        />

        <section className="rounded-lg border border-zinc-200 bg-white p-4">
          <StageBar
            stages={stages}
            current={currentStage}
            doneCount={doneCount}
            onSwitch={switchTo}
          />
        </section>

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <ChecklistPanel
            stage={activeStage}
            stageProgress={percent}
            isChecked={(itemId) =>
              currentStage !== null && isChecked(currentStage, itemId)
            }
            onToggle={toggle}
            busyItemId={busyItemId}
            orphans={orphans}
            projectProgressLine={zh.projects.checklist.projectProgress(
              pctOf(view.health.total - view.health.unchecked, view.health.total),
              view.health.unchecked,
              view.health.total,
            )}
          />
          <div>
            <KanbanBoard
              tasks={taskItems}
              stages={stageNames(stages)}
              onMove={moveTask}
              onRename={renameTask}
              onSetStage={tagTask}
              onDelete={deleteTask}
            />
            <TaskComposer
              stages={stageNames(stages)}
              onCreate={(title, stageName) => createTask(title, stageName)}
            />
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-1">
            {DEVLOG_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setLogType(type)}
                className={`rounded-md px-3 py-1.5 text-sm ${
                  logType === type
                    ? 'bg-brand-soft font-medium text-brand'
                    : 'text-zinc-600 hover:bg-zinc-100'
                }`}
              >
                {zh.projects.devlog.tabs[type]}
              </button>
            ))}
          </div>
          <DevLogList
            projectId={view.id}
            projectName={view.name}
            type={logType}
            entries={devLog.data?.items ?? []}
            loading={devLog.isLoading}
            onNew={() => setLogEditorOpen(true)}
          />
        </div>
      </div>

      {logEditorOpen && (
        <DevLogEditor
          projectId={view.id}
          type={logType}
          open
          onClose={() => setLogEditorOpen(false)}
          onSaved={() => setLogEditorOpen(false)}
        />
      )}
    </div>
  )
}
