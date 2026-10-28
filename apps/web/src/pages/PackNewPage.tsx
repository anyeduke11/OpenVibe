import { useParams } from 'react-router-dom'
import { PackWizard } from '../components/packs/PackWizard'
import { usePack } from '../hooks/usePacks'
import { laneEngineering } from '../i18n/lane-engineering'
import { zh } from '../i18n/zh'
import { btnGhost, noteCls, noteTitleCls, skelCls } from '../components/ui/styles'

/**
 * `/packs/new` 与 `/packs/${id}/edit` 同一向导（m6a FR-1.6：定义保存后可再编辑再导出）。
 * key 锁定 id：PackWizard 用 initial 播种本地态，切换包时必须重挂载。
 */
export function PackNewPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const pack = usePack(id ?? null)

  if (id === undefined) return <PackWizard key="new" initial={null} />

  if (pack.isLoading)
    return (
      <div className="space-y-3 px-5 py-4" aria-hidden>
        <div className={`${skelCls} h-8 w-72`} />
        <div className={`${skelCls} h-4 w-full max-w-xl`} />
        <div className={`${skelCls} h-4 w-3/4 max-w-md`} />
      </div>
    )

  if (pack.isError)
    return (
      <div className="px-5 py-4">
        <div className={noteCls('danger')}>
          <span className={`${noteTitleCls} text-danger`}>
            {zh.common.failed((pack.error as Error).message)}
          </span>
          <p className="text-ink-body">{laneEngineering.state.retryHint}</p>
          <button type="button" className={`${btnGhost} mt-2`} onClick={() => void pack.refetch()}>
            {laneEngineering.state.retry}
          </button>
        </div>
      </div>
    )

  return <PackWizard key={id} initial={pack.data ?? null} />
}
