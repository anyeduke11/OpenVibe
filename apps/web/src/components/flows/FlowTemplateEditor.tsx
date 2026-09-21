import { useState } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  FLOW_KINDS,
  type FlowTemplateCreateInput,
  type FlowTemplateOut,
  type Stage,
} from '@openvibe/shared'
import { useFlowMutations } from '../../hooks/useFlows'
import { zh } from '../../i18n/zh'
import { Dialog, DialogPanel } from '../ui/Dialog'
import { toast } from '../ui/Toaster'
import { btnDanger, btnGhost, btnPrimary, inputCls, labelCls } from '../ui/styles'

const csv = (value: string): string[] =>
  value
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v !== '')

/** 编辑期草稿：uid 只用于 React key 与拖拽 id，不落库（持久 id 是 stage.name / checklist.id） */
interface StageDraft {
  uid: string
  name: string
  checklist: { id: string; text: string }[]
  artifacts: string[]
}

let uidSeq = 0
const uid = (prefix: string): string => {
  uidSeq += 1
  return `${prefix}-${String(uidSeq)}`
}

function toDraft(stage: Stage): StageDraft {
  return { uid: uid('st'), name: stage.name, checklist: stage.checklist, artifacts: stage.artifacts }
}

function blankStage(count: number): StageDraft {
  return { uid: uid('st'), name: `阶段 ${String(count + 1)}`, checklist: [], artifacts: [] }
}

/** 检查项 id 决定项目侧勾选记录的归属，必须稳定且唯一（m5 FR-3.2） */
function nextChecklistId(items: { id: string }[]): string {
  let n = items.length + 1
  while (items.some((i) => i.id === `c${String(n)}`)) n += 1
  return `c${String(n)}`
}

function MoveButton(props: {
  glyph: string
  label: string
  disabled: boolean
  onClick: () => void
}) {
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

function StageRow(props: {
  stage: StageDraft
  index: number
  last: boolean
  onMove: (delta: number) => void
  onChange: (next: StageDraft) => void
  onRemove: () => void
}) {
  const { stage } = props
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: stage.uid,
  })
  const [itemDraft, setItemDraft] = useState('')

  const set = <K extends keyof StageDraft>(key: K, value: StageDraft[K]) =>
    props.onChange({ ...stage, [key]: value })

  const moveItem = (from: number, to: number) =>
    set('checklist', arrayMove(stage.checklist, from, to))

  const addItem = () => {
    const text = itemDraft.trim()
    if (text === '') return
    set('checklist', [...stage.checklist, { id: nextChecklistId(stage.checklist), text }])
    setItemDraft('')
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`rounded-md border bg-white p-3 ${isDragging ? 'border-brand shadow-md' : 'border-zinc-200'}`}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={zh.flows.editor.moveHint}
          className="cursor-grab select-none px-1 text-zinc-400 hover:text-zinc-700"
          {...attributes}
          {...listeners}
        >
          ⠿
        </button>
        <span className="w-6 text-center text-xs text-zinc-400">{String(props.index + 1)}</span>
        <MoveButton
          glyph="↑"
          label={zh.flows.editor.moveUp}
          disabled={props.index === 0}
          onClick={() => props.onMove(-1)}
        />
        <MoveButton
          glyph="↓"
          label={zh.flows.editor.moveDown}
          disabled={props.last}
          onClick={() => props.onMove(1)}
        />
        <input
          className={inputCls}
          value={stage.name}
          aria-label={zh.flows.editor.stageName}
          onChange={(e) => set('name', e.target.value)}
        />
        <button type="button" className={btnDanger} onClick={props.onRemove}>
          {zh.flows.editor.removeStage}
        </button>
      </div>

      <div className="mt-2 pl-8">
        <label className={labelCls}>{zh.flows.editor.checklist}</label>
        <ul className="space-y-1">
          {stage.checklist.map((item, i) => (
            <li key={item.id} className="flex items-center gap-2">
              <input
                className={inputCls}
                value={item.text}
                aria-label={item.id}
                onChange={(e) =>
                  set(
                    'checklist',
                    stage.checklist.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)),
                  )
                }
              />
              <MoveButton
                glyph="↑"
                label={zh.flows.editor.moveItemUp}
                disabled={i === 0}
                onClick={() => moveItem(i, i - 1)}
              />
              <MoveButton
                glyph="↓"
                label={zh.flows.editor.moveItemDown}
                disabled={i === stage.checklist.length - 1}
                onClick={() => moveItem(i, i + 1)}
              />
              <button
                type="button"
                className="text-xs text-zinc-400 hover:text-red-600"
                onClick={() =>
                  set(
                    'checklist',
                    stage.checklist.filter((_, j) => j !== i),
                  )
                }
              >
                {zh.flows.editor.removeItem}
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-1.5 flex items-center gap-2">
          <input
            className={`${inputCls} w-64`}
            value={itemDraft}
            placeholder={zh.flows.editor.itemPlaceholder}
            onChange={(e) => setItemDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addItem()
              }
            }}
          />
          <button type="button" className={btnGhost} onClick={addItem}>
            {zh.flows.editor.addItem}
          </button>
        </div>
        <div className="mt-2">
          <label className={labelCls}>{zh.flows.editor.artifacts}</label>
          <input
            className={inputCls}
            defaultValue={stage.artifacts.join(', ')}
            placeholder={zh.flows.editor.artifactsPlaceholder}
            onChange={(e) => set('artifacts', csv(e.target.value))}
          />
        </div>
      </div>
    </div>
  )
}

/** 模板编辑器（m5 FR-2.3）：阶段拖拽排序 + 清单项增删改 + artifacts */
export function FlowTemplateEditor(props: {
  template: FlowTemplateOut | null
  open: boolean
  onClose: () => void
  onSaved: (template: FlowTemplateOut) => void
}) {
  const { template } = props
  const [name, setName] = useState(template?.name ?? '')
  const [kind, setKind] = useState<FlowTemplateCreateInput['kind']>(template?.kind ?? 'custom')
  const [stages, setStages] = useState<StageDraft[]>(() =>
    template === null ? [blankStage(0)] : template.stages.map(toDraft),
  )
  const { create, update } = useFlowMutations()
  const pending = create.isPending || update.isPending

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over === null || active.id === over.id) return
    const from = stages.findIndex((s) => s.uid === active.id)
    const to = stages.findIndex((s) => s.uid === over.id)
    if (from < 0 || to < 0) return
    setStages((prev) => arrayMove(prev, from, to))
  }

  const save = () => {
    if (name.trim() === '') {
      toast(zh.flows.editor.nameRequired, 'error')
      return
    }
    if (stages.length === 0 || stages.some((s) => s.name.trim() === '')) {
      toast(zh.flows.editor.stageRequired, 'error')
      return
    }
    if (stages.some((s) => s.checklist.some((c) => c.text.trim() === ''))) {
      toast(zh.flows.editor.itemRequired, 'error')
      return
    }
    const payloadStages: Stage[] = stages.map((s) => ({
      name: s.name.trim(),
      checklist: s.checklist.map((c) => ({ id: c.id, text: c.text.trim() })),
      artifacts: s.artifacts,
    }))
    const payload: FlowTemplateCreateInput = { name: name.trim(), kind, stages: payloadStages }
    const onError = (e: Error) => toast(e.message, 'error')
    if (template === null) {
      create.mutate(payload, {
        onSuccess: (t) => {
          toast(zh.flows.editor.created)
          props.onSaved(t)
        },
        onError,
      })
    } else {
      update.mutate(
        { id: template.id, patch: { name: payload.name, stages: payloadStages } },
        {
          onSuccess: (t) => {
            toast(zh.flows.editor.saved)
            props.onSaved(t)
          },
          onError,
        },
      )
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={(o) => (o ? undefined : props.onClose())}>
      <DialogPanel
        variant="sheet"
        title={template === null ? zh.flows.editor.createTitle : zh.flows.editor.editTitle}
        footer={
          <>
            <span className="mr-auto text-[11px] text-zinc-400">{zh.flows.editor.moveHint}</span>
            <button className={btnGhost} onClick={props.onClose}>
              {zh.editor.cancel}
            </button>
            <button className={btnPrimary} disabled={pending} onClick={save}>
              {pending
                ? zh.flows.editor.saving
                : template === null
                  ? zh.flows.editor.create
                  : zh.flows.editor.save}
            </button>
          </>
        }
      >
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{zh.flows.editor.name}</label>
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>{zh.flows.editor.kind}</label>
              <select
                className={`${inputCls} appearance-none`}
                value={kind}
                disabled={template !== null}
                onChange={(e) => setKind(e.target.value as FlowTemplateCreateInput['kind'])}
              >
                {FLOW_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {zh.flows.kinds[k]}（{k}）
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className={`${labelCls} mb-0`}>{zh.flows.editor.stages}</label>
              <button
                className={btnGhost}
                onClick={() => setStages((prev) => [...prev, blankStage(prev.length)])}
              >
                {zh.flows.editor.addStage}
              </button>
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext
                items={stages.map((s) => s.uid)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {stages.map((stage, i) => (
                    <StageRow
                      key={stage.uid}
                      index={i}
                      last={i === stages.length - 1}
                      onMove={(delta) => setStages((prev) => arrayMove(prev, i, i + delta))}
                      stage={stage}
                      onChange={(next) =>
                        setStages((prev) => prev.map((s) => (s.uid === stage.uid ? next : s)))
                      }
                      onRemove={() =>
                        setStages((prev) => prev.filter((s) => s.uid !== stage.uid))
                      }
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        </div>
      </DialogPanel>
    </Dialog>
  )
}
