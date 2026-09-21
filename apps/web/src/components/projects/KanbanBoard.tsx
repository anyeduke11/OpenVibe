import { useState, type ReactNode } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { TASK_STATUS, type TaskOut, type TaskStatus } from '@openvibe/shared'
import { zh } from '../../i18n/zh'
import { btnGhost, chipCls, inputCls } from '../ui/styles'

function isTaskStatus(value: string): value is TaskStatus {
  return (TASK_STATUS as readonly string[]).includes(value)
}

/** order 传极大值 = 「移到该列末尾」，服务端 move() 会夹到列尾（m5 FR-4.1） */
const TO_COLUMN_END = Number.MAX_SAFE_INTEGER

interface CardProps {
  task: TaskOut
  stages: string[]
  index: number
  columnLength: number
  column: TaskStatus
  onMove: (id: string, status: TaskStatus, order: number) => void
  onRename: (id: string, title: string) => void
  onSetStage: (id: string, stageName: string | null) => void
  onDelete: (id: string) => void
}

function ArrowButton(props: { glyph: string; label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      title={props.label}
      aria-label={props.label}
      disabled={props.disabled}
      className="rounded px-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-30"
      onClick={props.onClick}
    >
      {props.glyph}
    </button>
  )
}

function TaskCard(props: CardProps) {
  const { task, index, column, columnLength } = props
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { status: column },
  })
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(task.title)

  const commit = () => {
    setEditing(false)
    const title = draft.trim()
    if (title !== '' && title !== task.title) props.onRename(task.id, title)
    else setDraft(task.title)
  }

  const columnIndex = TASK_STATUS.indexOf(column)
  const neighbourColumn = (delta: number): TaskStatus | undefined => TASK_STATUS[columnIndex + delta]

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`rounded-md border bg-white p-2 text-sm ${
        isDragging ? 'border-brand shadow-md' : 'border-zinc-200'
      }`}
    >
      <div className="flex items-start gap-1.5">
        <button
          type="button"
          aria-label={zh.projects.kanban.dragHint}
          className="cursor-grab select-none px-0.5 text-zinc-300 hover:text-zinc-600"
          {...attributes}
          {...listeners}
        >
          ⠿
        </button>
        {editing ? (
          <input
            className={`${inputCls} flex-1 py-0.5 text-sm`}
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') {
                setDraft(task.title)
                setEditing(false)
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="flex-1 text-left text-zinc-800 hover:underline"
            onClick={() => {
              setDraft(task.title)
              setEditing(true)
            }}
          >
            {task.title}
          </button>
        )}
        <button
          type="button"
          aria-label={zh.flows.actions.del}
          className="px-0.5 text-zinc-300 hover:text-red-600"
          onClick={() => props.onDelete(task.id)}
        >
          ✕
        </button>
      </div>

      <div className="mt-1.5 flex items-center gap-1 pl-5">
        <select
          className="min-w-0 flex-1 truncate rounded border border-zinc-200 bg-zinc-50 px-1 py-0.5 text-[11px] text-zinc-600"
          value={task.stageName ?? ''}
          aria-label={zh.projects.kanban.stageTag}
          onChange={(e) => props.onSetStage(task.id, e.target.value === '' ? null : e.target.value)}
        >
          <option value="">{zh.projects.kanban.noStage}</option>
          {task.stageName !== null && !props.stages.includes(task.stageName) && (
            <option value={task.stageName}>{`${task.stageName} ${zh.projects.checklist.removedStage}`}</option>
          )}
          {props.stages.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <span className={`${chipCls} border-zinc-100 bg-zinc-50 text-zinc-400`}>{String(index + 1)}</span>
      </div>

      <div className="mt-1 flex items-center gap-0.5 pl-5">
        <ArrowButton
          glyph="↑"
          label={zh.projects.kanban.moveLabel.up}
          disabled={index === 0}
          onClick={() => props.onMove(task.id, column, index - 1)}
        />
        <ArrowButton
          glyph="↓"
          label={zh.projects.kanban.moveLabel.down}
          disabled={index === columnLength - 1}
          onClick={() => props.onMove(task.id, column, index + 1)}
        />
        <ArrowButton
          glyph="←"
          label={zh.projects.kanban.moveLabel.prevColumn}
          disabled={columnIndex === 0}
          onClick={() => {
            const target = neighbourColumn(-1)
            if (target !== undefined) props.onMove(task.id, target, TO_COLUMN_END)
          }}
        />
        <ArrowButton
          glyph="→"
          label={zh.projects.kanban.moveLabel.nextColumn}
          disabled={columnIndex === TASK_STATUS.length - 1}
          onClick={() => {
            const target = neighbourColumn(1)
            if (target !== undefined) props.onMove(task.id, target, TO_COLUMN_END)
          }}
        />
      </div>
    </li>
  )
}

function Column(props: { status: TaskStatus; count: number; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `col-${props.status}`,
    data: { status: props.status },
  })
  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-40 flex-col rounded-lg border p-2 ${
        isOver ? 'border-brand bg-brand-soft/40' : 'border-zinc-200 bg-zinc-50'
      }`}
    >
      <header className="mb-2 flex items-center gap-2 px-1">
        <h3 className="text-xs font-medium text-zinc-600">{zh.projects.kanban.columns[props.status]}</h3>
        <span className="text-[11px] text-zinc-400">{String(props.count)}</span>
      </header>
      {props.children}
    </div>
  )
}

/** 新任务输入条：加入待办列尾（m5 FR-4.2） */
export function TaskComposer(props: {
  stages: string[]
  onCreate: (title: string, stageName?: string) => void
}) {
  const [title, setTitle] = useState('')
  const [stage, setStage] = useState('')
  const submit = () => {
    const t = title.trim()
    if (t === '') return
    props.onCreate(t, stage === '' ? undefined : stage)
    setTitle('')
  }
  return (
    <div className="mt-2 flex items-center gap-1.5">
      <input
        className={`${inputCls} flex-1`}
        placeholder={zh.projects.kanban.taskPlaceholder}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
        }}
      />
      <select
        className={`${inputCls} w-auto appearance-none`}
        value={stage}
        aria-label={zh.projects.kanban.stageTag}
        onChange={(e) => setStage(e.target.value)}
      >
        <option value="">{zh.projects.kanban.noStage}</option>
        {props.stages.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <button className={btnGhost} onClick={submit}>
        {zh.projects.kanban.newTask}
      </button>
    </div>
  )
}

/** 三列看板（m5 FR-4）：拖拽换列/排序 + 同语义方向按钮兜底（键盘与指针都能驱动同一 PATCH） */
export function KanbanBoard(props: {
  tasks: TaskOut[]
  stages: string[]
  onMove: (id: string, status: TaskStatus, order: number) => void
  onRename: (id: string, title: string) => void
  onSetStage: (id: string, stageName: string | null) => void
  onDelete: (id: string) => void
}) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const byColumn = (status: TaskStatus): TaskOut[] =>
    props.tasks.filter((t) => t.status === status).sort((a, b) => a.order - b.order)

  const onDragStart = (event: DragStartEvent) => setActiveId(String(event.active.id))

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)
    if (over === null) return
    const id = String(active.id)
    const overId = String(over.id)
    const dataStatus = over.data.current?.status
    const fromDroppable = overId.startsWith('col-') ? overId.slice('col-'.length) : ''
    const statusCandidate =
      typeof dataStatus === 'string' && isTaskStatus(dataStatus)
        ? dataStatus
        : isTaskStatus(fromDroppable)
          ? fromDroppable
          : props.tasks.find((t) => t.id === overId)?.status
    if (statusCandidate === undefined) return

    const others = byColumn(statusCandidate).filter((t) => t.id !== id)
    const at = others.findIndex((t) => t.id === overId)
    props.onMove(id, statusCandidate, at < 0 ? others.length : at)
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4">
      <header className="mb-2 flex items-center gap-2">
        <h2 className="text-sm font-semibold">{zh.projects.kanban.title}</h2>
        <span className="text-[11px] text-zinc-400">{zh.projects.kanban.dragHint}</span>
        {activeId !== null && (
          <span className="ml-auto text-[11px] text-brand">{zh.projects.kanban.dragging}</span>
        )}
      </header>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="grid gap-2 md:grid-cols-3">
          {TASK_STATUS.map((status) => {
            const list = byColumn(status)
            return (
              <Column key={status} status={status} count={list.length}>
                <SortableContext
                  items={list.map((t) => t.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <ul className="flex-1 space-y-1.5">
                    {list.map((task, i) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        index={i}
                        columnLength={list.length}
                        column={status}
                        stages={props.stages}
                        onMove={props.onMove}
                        onRename={props.onRename}
                        onSetStage={props.onSetStage}
                        onDelete={props.onDelete}
                      />
                    ))}
                    {list.length === 0 && (
                      <li className="px-1 py-3 text-center text-[11px] text-zinc-400">
                        {zh.projects.kanban.emptyColumn}
                      </li>
                    )}
                  </ul>
                </SortableContext>
              </Column>
            )
          })}
        </div>
      </DndContext>
    </section>
  )
}
