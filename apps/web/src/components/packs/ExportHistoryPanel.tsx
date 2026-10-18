import { usePackExports } from '../../hooks/usePacks'
import { zh } from '../../i18n/zh'
import { btnGhost, ledgerHeadCls, ledgerNumCls, rowCls } from '../ui/styles'

/**
 * 导出历史台账（m6a FR-3.3 / §7.8）：每行一个不可变实例，bundle 通道恒可回放下载。
 * 只出表——加载 / 空 / 错误由调用方给（抽屉已经拿了同一份查询，再取一次只会两处状态打架）。
 */
export function ExportHistoryPanel(props: { packId: string }) {
  const exports = usePackExports(props.packId)
  const items = exports.data?.items ?? []
  if (items.length === 0) return null

  return (
    <div className="overflow-x-auto">
      <table className="w-full table-fixed border-collapse text-sm">
        <thead className={`text-left ${ledgerHeadCls}`}>
          <tr>
            <th className="w-20 border-b border-line px-2 py-1.5">{zh.packs.exports.version}</th>
            <th className="w-32 border-b border-line px-2 py-1.5">
              {zh.packs.exports.channel}
            </th>
            <th className="border-b border-line px-2 py-1.5">{zh.packs.exports.fingerprint}</th>
            <th className="w-40 border-b border-line px-2 py-1.5 text-right">
              {zh.packs.exports.exportedAt}
            </th>
            <th className="w-24 border-b border-line px-2 py-1.5" />
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.id} className={rowCls}>
              <td className={`mono px-2 py-2 ${ledgerNumCls}`}>{`v${row.version}`}</td>
              <td className="whitespace-nowrap px-2 py-2 text-ink-muted">
                {zh.packs.exports.channels[row.channel]}
              </td>
              <td className="px-2 py-2">
                <span className="mono truncate text-[11px] text-ink-body" title={row.fingerprint}>
                  {row.fingerprint.slice(0, 12)}
                </span>
              </td>
              <td
                className={`whitespace-nowrap px-2 py-2 text-[11px] text-ink-muted ${ledgerNumCls}`}
              >
                {row.exportedAt}
              </td>
              <td className="px-2 py-2 text-right">
                <a
                  className={`${btnGhost} whitespace-nowrap no-underline`}
                  href={`/api/packs/${props.packId}/exports/${row.id}/bundle`}
                  download
                >
                  {zh.packs.exports.download}
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
