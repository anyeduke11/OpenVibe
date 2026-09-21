import { useNavigate } from 'react-router-dom'
import type { PackOut } from '@openvibe/shared'
import { usePackExports, usePackInjections } from '../../hooks/usePacks'
import { useFlowTemplates } from '../../hooks/useFlows'
import { zh } from '../../i18n/zh'
import { btnGhost, btnPrimary, chipCls } from '../ui/styles'
import { Dialog, DialogPanel } from '../ui/Dialog'
import { ExportHistoryPanel } from './ExportHistoryPanel'

/** 包详情抽屉：定义 + 导出历史（不可变实例）+ 注入历史（m6a FR-3.3 / FR-5.2） */
export function PackDetailSheet(props: { pack: PackOut | null; onClose: () => void }) {
  const { pack } = props
  const navigate = useNavigate()
  const flows = useFlowTemplates()
  const exports = usePackExports(pack?.id ?? null)
  const injections = usePackInjections(pack?.id ?? null)
  if (pack === null) return null

  const selection = pack.selection
  const flowName = flows.data?.items.find((t) => t.id === selection.flowTemplateId)?.name
  const count = exports.data?.total ?? 0

  return (
    <Dialog open onOpenChange={(o) => (o ? undefined : props.onClose())}>
      <DialogPanel
        variant="sheet"
        title={`${zh.packs.detail.title} · ${pack.name}`}
        footer={
          <>
            <button className={btnGhost} onClick={props.onClose}>
              {zh.editor.close}
            </button>
            <button
              className={btnPrimary}
              onClick={() => {
                props.onClose()
                navigate(`/packs/${pack.id}/edit`)
              }}
            >
              {zh.packs.detail.edit}
            </button>
          </>
        }
      >
        <div className="space-y-5 text-sm">
          <section>
            <h2 className="mb-2 text-xs font-medium text-zinc-500">{zh.packs.detail.definition}</h2>
            <p className="text-zinc-700">{pack.description === '' ? zh.common.none : pack.description}</p>
            <p className="mt-2 flex flex-wrap gap-1">
              {pack.targets.map((t) => (
                <span key={t} className={`${chipCls} border-zinc-200 bg-zinc-50 text-zinc-600`}>
                  {zh.packs.targetLabels[t] ?? t}
                </span>
              ))}
            </p>
            <p className="mt-2 text-xs text-zinc-500">
              {zh.packs.assetSummary(
                selection.promptIds.length,
                selection.termIds.length,
                selection.skillIds.length,
              )}
              {` · ${flowName === undefined ? zh.packs.noFlow : zh.packs.flowOf(flowName)}`}
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-xs font-medium text-zinc-500">
              {`${zh.packs.detail.exports}（${String(count)}）`}
            </h2>
            <ExportHistoryPanel packId={pack.id} />
          </section>

          <section>
            <h2 className="mb-2 text-xs font-medium text-zinc-500">{zh.packs.detail.injections}</h2>
            {(injections.data?.items.length ?? 0) === 0 ? (
              <p className="text-xs text-zinc-500">{zh.packs.detail.noInjections}</p>
            ) : (
              <ul className="space-y-1 text-xs text-zinc-600">
                {injections.data?.items.map((row) => (
                  <li key={row.id} className="flex gap-2">
                    <span className="mono text-zinc-800">{row.projectPath}</span>
                    <span className="ml-auto text-zinc-400">{row.injectedAt}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </DialogPanel>
    </Dialog>
  )
}
