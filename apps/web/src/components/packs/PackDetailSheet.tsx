import { useNavigate } from 'react-router-dom'
import type { PackOut } from '@openvibe/shared'
import { usePackExports } from '../../hooks/usePacks'
import { laneEngineering } from '../../i18n/lane-engineering'
import { zh } from '../../i18n/zh'
import { btnGhost, btnPrimary, cardCls, cardHeadCls, emptyHintCls } from '../ui/styles'
import { Dialog, DialogPanel } from '../ui/Dialog'
import { ExportHistoryPanel } from './ExportHistoryPanel'

/**
 * 导出历史抽屉（m6a FR-3.3 / §7.8）。
 *
 * 只装「全量台账」这一件事：详情面板同屏只留最近一次导出（省一屏高度），
 * 不可变实例的完整列表与回放下载在这里，两者不重复也不互相替代。
 */
export function PackDetailSheet(props: { pack: PackOut | null; onClose: () => void }) {
  const { pack } = props
  const navigate = useNavigate()
  // 抽屉开着就取数，关着不取（enabled 依赖 id，卸载式懒取由 Dialog 控制）
  const exports = usePackExports(pack?.id ?? null)
  if (pack === null) return null

  return (
    <Dialog open onOpenChange={(o) => (o ? undefined : props.onClose())}>
      <DialogPanel
        variant="sheet"
        title={`${laneEngineering.packs.allExports} · ${pack.name}`}
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
        <section className={cardCls}>
          <header className={cardHeadCls}>
            <h2 className="text-xs font-semibold text-ink-muted">{zh.packs.detail.exports}</h2>
            <span className="ml-auto tabular-nums text-[11px] text-ink-faint">
              {String(exports.data?.total ?? 0)}
            </span>
          </header>
        </section>

        {exports.isLoading && (
          <p className="mt-2 text-xs text-ink-faint">{laneEngineering.state.loading}</p>
        )}
        {exports.isError && (
          <div className="mt-2 rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-xs">
            <p className="text-danger">{zh.common.failed((exports.error as Error).message)}</p>
            <button
              type="button"
              className="mt-1.5 text-accent hover:underline"
              onClick={() => void exports.refetch()}
            >
              {laneEngineering.state.retry}
            </button>
          </div>
        )}
        {!exports.isLoading && !exports.isError && (exports.data?.items.length ?? 0) === 0 && (
          <div className={`${emptyHintCls} mt-2`}>
            <p>{zh.packs.exports.empty}</p>
          </div>
        )}
        {!exports.isLoading && !exports.isError && (exports.data?.items.length ?? 0) > 0 && (
          <ExportHistoryPanel packId={pack.id} />
        )}
      </DialogPanel>
    </Dialog>
  )
}
