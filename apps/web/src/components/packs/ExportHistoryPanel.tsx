import { usePackExports } from '../../hooks/usePacks'
import { zh } from '../../i18n/zh'
import { btnGhost } from '../ui/styles'

/** 导出历史（m6a FR-3.3 / §7.8）：每行一个不可变实例，bundle 通道恒可回放下载 */
export function ExportHistoryPanel(props: { packId: string }) {
  const { packId } = props
  const exports = usePackExports(packId)
  const items = exports.data?.items ?? []

  if (exports.isLoading) return <p className="text-sm text-zinc-400">{zh.common.loading}</p>
  if (items.length === 0) return <p className="text-sm text-zinc-500">{zh.packs.exports.empty}</p>

  return (
    <table className="w-full border-collapse text-sm">
      <thead className="sticky top-0 bg-white text-left text-xs text-zinc-500">
        <tr>
          <th className="px-2 py-2">{zh.packs.exports.version}</th>
          <th className="px-2 py-2">{zh.packs.exports.channel}</th>
          <th className="px-2 py-2">{zh.packs.exports.fingerprint}</th>
          <th className="px-2 py-2">{zh.packs.exports.exportedAt}</th>
          <th className="w-24 px-2 py-2" />
        </tr>
      </thead>
      <tbody>
        {items.map((row) => (
          <tr key={row.id} className="border-b border-zinc-100 align-top">
            <td className="mono px-2 py-2">{`v${row.version}`}</td>
            <td className="px-2 py-2 text-zinc-600">{zh.packs.exports.channels[row.channel]}</td>
            <td className="px-2 py-2">
              <span className="mono text-xs text-zinc-700" title={row.fingerprint}>
                {row.fingerprint.slice(0, 12)}
              </span>
            </td>
            <td className="px-2 py-2 text-xs text-zinc-500">{row.exportedAt}</td>
            <td className="px-2 py-2">
              <a
                className={`${btnGhost} no-underline`}
                href={`/api/packs/${packId}/exports/${row.id}/bundle`}
                download
              >
                {zh.packs.exports.download}
              </a>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
