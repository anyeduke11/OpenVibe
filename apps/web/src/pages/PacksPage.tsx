import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { PackOut } from '@openvibe/shared'
import { usePackList, usePackMutations } from '../hooks/usePacks'
import { useFlowTemplates } from '../hooks/useFlows'
import { zh } from '../i18n/zh'
import { PackDetailSheet } from '../components/packs/PackDetailSheet'
import { Dialog, DialogPanel } from '../components/ui/Dialog'
import { toast } from '../components/ui/Toaster'
import { btnGhost, btnPrimary, chipCls } from '../components/ui/styles'

/** /packs：列表 + 详情抽屉（导出历史 / 注入历史），组装与导出在向导里（m6a FR-1–FR-5） */
export function PacksPage() {
  const navigate = useNavigate()
  const list = usePackList()
  const flows = useFlowTemplates()
  const { remove } = usePackMutations()
  const [detail, setDetail] = useState<PackOut | null>(null)
  const [deleting, setDeleting] = useState<PackOut | null>(null)

  const items = list.data?.items ?? []

  const flowName = (pack: PackOut): string => {
    const t = flows.data?.items.find((x) => x.id === pack.selection.flowTemplateId)
    return t === undefined ? zh.packs.noFlow : zh.packs.flowOf(t.name)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-zinc-100 px-5 py-3">
        <h1 className="mr-auto text-base font-semibold">{zh.packs.title}</h1>
        <button className={btnPrimary} onClick={() => navigate('/packs/new')}>
          {zh.packs.newPack}
        </button>
      </header>

      <div className="flex-1 overflow-auto px-5 py-4">
        {list.isLoading && <p className="text-sm text-zinc-400">{zh.common.loading}</p>}
        {list.isError && (
          <p className="text-sm text-red-700">{zh.common.failed((list.error as Error).message)}</p>
        )}
        {items.length === 0 && !list.isLoading && (
          <p className="text-sm text-zinc-500">{zh.packs.empty}</p>
        )}
        {items.length > 0 && (
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-white text-left text-xs text-zinc-500">
              <tr>
                <th className="w-56 px-2 py-2">{zh.packs.columns.name}</th>
                <th className="px-2 py-2">{zh.packs.columns.targets}</th>
                <th className="px-2 py-2">{zh.packs.columns.assets}</th>
                <th className="w-40 px-2 py-2">{zh.packs.columns.updated}</th>
                <th className="w-44 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((pack) => (
                <tr
                  key={pack.id}
                  className="cursor-pointer border-b border-zinc-100 align-top hover:bg-zinc-50"
                  onClick={() => setDetail(pack)}
                >
                  <td className="px-2 py-2">
                    <span className="mono text-zinc-800">{pack.name}</span>
                    <span className="block truncate text-[11px] text-zinc-400">
                      {pack.description}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    <span className="flex flex-wrap gap-1">
                      {pack.targets.map((t) => (
                        <span
                          key={t}
                          className={`${chipCls} border-zinc-200 bg-zinc-50 text-zinc-600`}
                        >
                          {zh.packs.targetLabels[t] ?? t}
                        </span>
                      ))}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-xs text-zinc-600">
                    {zh.packs.assetSummary(
                      pack.selection.promptIds.length,
                      pack.selection.termIds.length,
                      pack.selection.skillIds.length,
                    )}
                    <span className="block text-[11px] text-zinc-400">{flowName(pack)}</span>
                  </td>
                  <td className="px-2 py-2 text-xs text-zinc-500">{pack.updatedAt}</td>
                  <td className="px-2 py-2">
                    <span className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <button className={btnGhost} onClick={() => navigate(`/packs/${pack.id}/edit`)}>
                        {zh.packs.actions.edit}
                      </button>
                      <button className={btnGhost} onClick={() => setDeleting(pack)}>
                        {zh.packs.actions.del}
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <footer className="border-t border-zinc-100 px-5 py-2 text-xs text-zinc-500">
        {list.data !== undefined ? zh.packs.total(list.data.total) : ''}
      </footer>

      <PackDetailSheet pack={detail} onClose={() => setDetail(null)} />

      <Dialog open={deleting !== null} onOpenChange={(o) => (o ? undefined : setDeleting(null))}>
        <DialogPanel
          title={zh.packs.deleteDialog.title}
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
                      toast(zh.packs.deleteDialog.done)
                      setDeleting(null)
                    },
                    onError: (e: Error) => toast(e.message, 'error'),
                  })
                }}
              >
                {zh.packs.deleteDialog.confirm}
              </button>
            </>
          }
        >
          {deleting !== null && (
            <div className="space-y-2 text-sm">
              <p>{zh.packs.deleteDialog.body(deleting.name)}</p>
              <p className="text-xs text-zinc-500">{zh.packs.deleteDialog.note}</p>
            </div>
          )}
        </DialogPanel>
      </Dialog>
    </div>
  )
}
