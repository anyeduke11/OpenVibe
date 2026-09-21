import { useMemo, useState } from 'react'
import type { FlowTemplateOut } from '@openvibe/shared'
import { useFlowMutations, useFlowTemplates } from '../hooks/useFlows'
import { useProjectList } from '../hooks/useProjects'
import { zh } from '../i18n/zh'
import { FlowTemplateCard } from '../components/flows/FlowTemplateCard'
import { FlowTemplateEditor } from '../components/flows/FlowTemplateEditor'
import { Dialog, DialogPanel } from '../components/ui/Dialog'
import { toast } from '../components/ui/Toaster'
import { btnGhost, btnPrimary } from '../components/ui/styles'

export function FlowsPage() {
  const [editor, setEditor] = useState<{ template: FlowTemplateOut | null } | null>(null)
  const [deleting, setDeleting] = useState<FlowTemplateOut | null>(null)
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
      <h2 className="mb-2 text-xs font-medium text-zinc-500">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((t) => (
          <FlowTemplateCard
            key={t.id}
            template={t}
            projectCount={usage.get(t.id) ?? 0}
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
      <header className="flex items-center gap-3 border-b border-zinc-100 px-5 py-3">
        <h1 className="mr-auto text-base font-semibold">{zh.flows.title}</h1>
        <button className={btnPrimary} onClick={() => setEditor({ template: null })}>
          {zh.flows.newFlow}
        </button>
      </header>

      <div className="flex-1 overflow-auto px-5 py-4">
        {list.isLoading && <p className="text-sm text-zinc-400">{zh.common.loading}</p>}
        {list.isError && (
          <p className="text-sm text-red-700">{zh.common.failed((list.error as Error).message)}</p>
        )}
        {items.length === 0 && !list.isLoading && (
          <p className="text-sm text-zinc-500">{zh.flows.empty}</p>
        )}
        <div className="space-y-5">
          {builtins.length > 0 && section(zh.flows.builtin, builtins)}
          {customs.length > 0 && section(zh.flows.custom, customs)}
        </div>
      </div>

      {editor !== null && (
        <FlowTemplateEditor
          key={editor.template?.id ?? 'new'}
          template={editor.template}
          open
          onClose={() => setEditor(null)}
          onSaved={() => setEditor(null)}
        />
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
                className={`${btnPrimary} border-red-600 bg-red-600 hover:bg-red-700`}
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
              <p className="text-xs text-zinc-500">{zh.flows.deleteDialog.note}</p>
            </div>
          )}
        </DialogPanel>
      </Dialog>
    </div>
  )
}
