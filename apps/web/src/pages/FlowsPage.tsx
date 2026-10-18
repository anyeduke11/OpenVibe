import { lazy, Suspense, useMemo, useState } from 'react'
import type { FlowTemplateOut } from '@openvibe/shared'
import { useFlowMutations, useFlowTemplates } from '../hooks/useFlows'
import { useProjectList } from '../hooks/useProjects'
import { zh } from '../i18n/zh'
import { FlowTemplateCard } from '../components/flows/FlowTemplateCard'
import { Dialog, DialogPanel } from '../components/ui/Dialog'
import { toast } from '../components/ui/Toaster'
import { btnDanger, btnGhost, btnPrimary, emptyHintCls, h1Cls, h1SubCls, noteCls, noteTitleCls, skelCls } from '../components/ui/styles'
import { laneEngineering } from '../i18n/lane-engineering'

/** 两个重 UI 都懒加载（DEV-0074）：问答运行对话框 + 模板编辑器（含 dnd-kit）只在点开时
 *  加载，流程页的卡片列表保持入口纤瘦（bundle 门槛） */
const FlowRunDialog = lazy(() =>
  import('../components/flows/FlowRunDialog').then((m) => ({ default: m.FlowRunDialog })),
)
const FlowTemplateEditor = lazy(() =>
  import('../components/flows/FlowTemplateEditor').then((m) => ({
    default: m.FlowTemplateEditor,
  })),
)

export function FlowsPage() {
  const [editor, setEditor] = useState<{ template: FlowTemplateOut | null } | null>(null)
  const [deleting, setDeleting] = useState<FlowTemplateOut | null>(null)
  const [running, setRunning] = useState<FlowTemplateOut | null>(null)
  const list = useFlowTemplates()
  const projects = useProjectList('active')
  const { remove, duplicate } = useFlowMutations()

  const usage = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of projects.data?.items ?? []) {
      if (p.flowTemplateId === null) continue
      map.set(p.flowTemplateId, (map.get(p.flowTemplateId) ?? 0) + 1)
    }
    return map
  }, [projects.data])

  const items = list.data?.items ?? []
  const builtins = items.filter((t) => t.builtin)
  const customs = items.filter((t) => !t.builtin)

  const onDuplicate = (t: FlowTemplateOut) =>
    duplicate.mutate(t.id, {
      onSuccess: (copy) => toast(zh.flows.duplicated(copy.name)),
      onError: (e: Error) => toast(e.message, 'error'),
    })

  const section = (title: string, cards: FlowTemplateOut[]) => (
    <section>
      <h2 className="mb-2 text-xs font-medium text-ink-muted">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((t) => (
          <FlowTemplateCard
            key={t.id}
            template={t}
            projectCount={usage.get(t.id) ?? 0}
            onRun={setRunning}
            onEdit={(x) => setEditor({ template: x })}
            onDuplicate={onDuplicate}
            onDelete={setDeleting}
          />
        ))}
      </div>
    </section>
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-line-hair px-5 pt-4 pb-3">
        <h1 className={h1Cls}>{zh.flows.title}</h1>
        <p className={h1SubCls}>{laneEngineering.view.flows}</p>
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-ink-faint tabular-nums">
            {list.data === undefined ? '' : laneEngineering.flowDelete.count(list.data.total)}
          </span>
          <button
            className={`${btnPrimary} ml-auto`}
            onClick={() => setEditor({ template: null })}
          >
            {zh.flows.newFlow}
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto px-5 py-3">
        {list.isLoading &&
          [0, 1, 2].map((i) => (
            <div key={i} className={`${skelCls} mb-3 h-32`} aria-hidden />
          ))}
        {list.isError && (
          <div className={noteCls('danger')}>
            <span className={`${noteTitleCls} text-danger`}>
              {zh.common.failed((list.error as Error).message)}
            </span>
            <p className="text-ink-body">{laneEngineering.state.retryHint}</p>
            <button type="button" className={`${btnGhost} mt-2`} onClick={() => void list.refetch()}>
              {laneEngineering.state.retry}
            </button>
          </div>
        )}
        {items.length === 0 && !list.isLoading && !list.isError && (
          <div className={emptyHintCls}>
            <p>{zh.flows.empty}</p>
            <button className={btnPrimary} onClick={() => setEditor({ template: null })}>
              {zh.flows.newFlow}
            </button>
          </div>
        )}
        <div className="space-y-4">
          {builtins.length > 0 && section(zh.flows.builtin, builtins)}
          {customs.length > 0 && section(zh.flows.custom, customs)}
        </div>
      </div>

      {editor !== null && (
        <Suspense fallback={null}>
          <FlowTemplateEditor
            key={editor.template?.id ?? 'new'}
            template={editor.template}
            open
            onClose={() => setEditor(null)}
            onSaved={() => setEditor(null)}
          />
        </Suspense>
      )}

      {running !== null && (
        <Suspense fallback={null}>
          <FlowRunDialog
            key={running.id}
            template={running}
            open
            onClose={() => setRunning(null)}
          />
        </Suspense>
      )}

      <Dialog open={deleting !== null} onOpenChange={(o) => (o ? undefined : setDeleting(null))}>
        <DialogPanel
          title={zh.flows.deleteDialog.title}
          footer={
            <>
              <button className={btnGhost} onClick={() => setDeleting(null)}>
                {zh.editor.cancel}
              </button>
              <button
                className={btnDanger}
                disabled={remove.isPending}
                onClick={() => {
                  if (deleting === null) return
                  remove.mutate(deleting.id, {
                    onSuccess: () => {
                      toast(zh.flows.deleteDialog.done)
                      setDeleting(null)
                    },
                    onError: (e: Error) => toast(e.message, 'error'),
                  })
                }}
              >
                {zh.flows.deleteDialog.confirm}
              </button>
            </>
          }
        >
          {deleting !== null && (
            <div className="space-y-2 text-sm">
              <p>{zh.flows.deleteDialog.body(deleting.name)}</p>
              <p className="text-xs text-ink-muted">{zh.flows.deleteDialog.note}</p>
              <div className="rounded-md border border-line bg-panel-2 px-3 py-2 text-xs">
                <span className={`${noteTitleCls} text-ink-body`}>
                  {laneEngineering.flowDelete.impactTitle}
                </span>
                <ul className="space-y-0.5 text-ink-muted">
                  <li>· {laneEngineering.flowDelete.impactKept}</li>
                  <li>· {laneEngineering.flowDelete.impactGone}</li>
                </ul>
              </div>
            </div>
          )}
        </DialogPanel>
      </Dialog>
    </div>
  )
}
