import { useParams } from 'react-router-dom'
import { PackWizard } from '../components/packs/PackWizard'
import { usePack } from '../hooks/usePacks'
import { zh } from '../i18n/zh'

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
    return <p className="px-5 py-4 text-sm text-zinc-400">{zh.common.loading}</p>
  if (pack.isError)
    return (
      <p className="px-5 py-4 text-sm text-red-700">
        {zh.common.failed((pack.error as Error).message)}
      </p>
    )
  return <PackWizard key={id} initial={pack.data ?? null} />
}
