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
import { AgentPanel } from '../components/agent/AgentPanel'
import { TermRecommendationPanel } from '../components/terms/TermRecommendationPanel'
import { toast } from '../components/ui/Toaster'
import { Icon } from '../components/ui/icons'
import {
  btnGhost,
  cardCls,
  h1Cls,
  h1SubCls,
  noteCls,
  noteTitleCls,
  segCls,
  segItemCls,
  skelCls,
} from '../components/ui/styles'
import { useFlowTemplates } from '../hooks/useFlows'
import { useDevLog } from '../hooks/useDevLog'
import {
  useCheckStates,
  useInjectionStatus,
  useProject,
  useProjectMutations,
} from '../hooks/useProjects'
import { useProjectPorts } from '../hooks/useProjectPorts'
import { useTermRecommendations } from '../hooks/useTermRecommendations'
import { PortsPanel } from '../components/projects/PortsPanel'
import { useTasks, useTaskMutations } from '../hooks/useTasks'
import { laneEngineering } from '../i18n/lane-engineering'
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
  const ports = useProjectPorts(id)
  const recommend = useTermRecommendations(id)
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
        onSuccess: () =>
          toast(status === 'archived' ? zh.projects.archiveDone : zh.projects.statusDone),
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
    return (
      <div className="space-y-3 px-5 py-4" aria-hidden>
        <div className={`${skelCls} h-9 w-64`} />
        <div className={`${skelCls} h-24 w-full`} />
        <div className={`${skelCls} h-40 w-full`} />
      </div>
    )
  }
  if (view === undefined) {
    return (
      <div className="space-y-2 px-5 py-4">
        <div className={noteCls('danger')}>
          <span className={`${noteTitleCls} text-danger`}>
            {zh.common.failed(project.error instanceof Error ? project.error.message : 'unknown')}
          </span>
          <p className="text-ink-body">{laneEngineering.state.retryHint}</p>
          <div className="mt-2 flex items-center gap-2">
            <button className={btnGhost} onClick={() => void project.refetch()}>
              {laneEngineering.state.retry}
            </button>
            <Link className="text-sm text-accent hover:underline" to="/projects">
              {zh.projects.detail.back}
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const taskItems: TaskOut[] = tasks.data?.items ?? []

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-line-hair px-5 pt-4 pb-3">
        <Link className={`${btnGhost} h-7 px-2 py-0 text-xs`} to="/projects">
          <Icon name="back" size={13} />
          {zh.projects.detail.back}
        </Link>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <h1 className={h1Cls}>{view.name}</h1>
          {view.status !== 'archived' && (
            <button className={`${btnGhost} ml-auto text-xs`} onClick={() => setStatus('archived')}>
              {zh.projects.status.archived}
            </button>
          )}
        </div>
        <p className={h1SubCls}>
          {templateName === null
            ? laneEngineering.view.project
            : `${zh.projects.detail.snapshotFrom(templateName)} · ${laneEngineering.view.project}`}
        </p>
      </header>

      {/* 四块并排：左列「阶段 + 清单 + 端口」，右列「看板 + 日志」——单栏会把每块推成一屏 */}
      <div className="grid min-h-0 flex-1 grid-cols-1 items-start gap-3 overflow-auto px-5 py-3 xl:grid-cols-2 xl:overflow-hidden">
        <div className="min-h-0 space-y-3 xl:overflow-auto">
          <ProjectDashboard
            project={view}
            templateName={templateName}
            injection={injection.data}
            onStatusChange={setStatus}
          />

          <section className={cardCls}>
            <StageBar
              stages={stages}
              current={currentStage}
              doneCount={doneCount}
              onSwitch={switchTo}
            />
          </section>

          <ChecklistPanel
            stage={activeStage}
            stageProgress={percent}
            isChecked={(itemId) => currentStage !== null && isChecked(currentStage, itemId)}
            onToggle={toggle}
            busyItemId={busyItemId}
            orphans={orphans}
            projectProgressLine={zh.projects.checklist.projectProgress(
              pctOf(view.health.total - view.health.unchecked, view.health.total),
              view.health.unchecked,
              view.health.total,
            )}
          />

          <TermRecommendationPanel
            data={recommend.data}
            loading={recommend.isPending}
            error={recommend.error}
          />

          <PortsPanel data={ports.data} />
        </div>

        <div className="min-h-0 space-y-3 xl:overflow-auto">
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

          <div>
            <div className={`${segCls} mb-2 w-fit`}>
              {DEVLOG_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setLogType(type)}
                  aria-pressed={logType === type}
                  className={segItemCls}
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
              error={devLog.isError ? (devLog.error as Error).message : null}
              onRetry={() => void devLog.refetch()}
              onNew={() => setLogEditorOpen(true)}
            />
          </div>

          {/* M8-E 助手桥接面板（m8-agent-panel.md FR-5.1.1：详情页内**一**个区，
              不新开页面、不进侧边栏 —— 使用场景是「干活时顺手看」，跳页会打断协作上下文）。
              挂在左列末尾：三子块自上而下按「上下文 → 回流 → 接入指引」排（FR-5.1.1.1）。 */}
          <AgentPanel projectId={view.id} />
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
