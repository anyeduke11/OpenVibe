import type { ProjectPortsOut, PortStatus } from '@openvibe/shared'
import { zh } from '../../i18n/zh'
import {
  cardBodyCls,
  cardCls,
  cardHeadCls,
  ledgerHeadCls,
  ledgerNumCls,
  rowCls,
} from '../ui/styles'

/**
 * 端口与服务台账卡（m5 FR-8）：账本表形制（DESIGN.md ledger 美学——行 hairline、
 * 端口/数字等宽），状态语义：监听中=松绿方点、未监听=灰墨方点。
 * 端口是易变态：数据由 useProjectPorts 15s 轻轮询。
 */

function StateDot(props: { state: PortStatus['state'] }) {
  const listening = props.state === 'listening'
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-medium"
      aria-label={listening ? zh.projects.ports.listening : zh.projects.ports.idle}
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 rounded-[2px] ${listening ? 'bg-ok' : 'bg-ink-faint'}`}
      />
      <span className={listening ? 'text-ok' : 'text-ink-faint'}>
        {listening ? zh.projects.ports.listening : zh.projects.ports.idle}
      </span>
    </span>
  )
}

export function PortsPanel(props: { data: ProjectPortsOut | undefined }) {
  const data = props.data
  return (
    <section className={cardCls}>
      <header className={cardHeadCls}>
        <h3 className="text-xs font-semibold text-ink-muted">{zh.projects.ports.title}</h3>
        <p className="ml-auto truncate text-[11px] text-ink-faint">{zh.projects.ports.hint}</p>
      </header>
      <div className={cardBodyCls}>
        {data === undefined ? (
          <p className="py-3 text-sm text-ink-faint">{zh.common.loading}</p>
        ) : data.services.length === 0 ? (
          <p className="py-3 text-sm text-ink-faint">
            {data.projectPath === '' ? zh.projects.ports.noPath : zh.projects.ports.empty}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full table-fixed border-collapse text-sm">
              <thead className={`text-left ${ledgerHeadCls}`}>
                <tr className="border-b border-line">
                  <th className={`px-2 py-1.5 ${ledgerNumCls}`}>{zh.projects.ports.colPort}</th>
                  <th className="px-2 py-1.5">{zh.projects.ports.colService}</th>
                  <th className="px-2 py-1.5">{zh.projects.ports.colSource}</th>
                  <th className="px-2 py-1.5">{zh.projects.ports.colState}</th>
                  <th className="px-2 py-1.5">{zh.projects.ports.colProcess}</th>
                  <th className="px-2 py-1.5">{zh.projects.ports.colOpen}</th>
                </tr>
              </thead>
              <tbody>
                {data.services.map((s) => (
                  <tr key={`${String(s.port)}-${s.service}`} className={rowCls}>
                    <td className={`mono whitespace-nowrap px-2 py-1.5 text-ink ${ledgerNumCls}`}>
                      {String(s.port)}
                    </td>
                    <td className="truncate px-2 py-1.5 text-ink-body">{s.service}</td>
                    <td className="truncate px-2 py-1.5 text-xs text-ink-muted">
                      {zh.projects.ports.sourceLabel[s.source]}{' '}
                      <span className="mono text-[11px] text-ink-faint">{s.sourceFile}</span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5">
                      <StateDot state={s.state} />
                    </td>
                    <td className="mono truncate px-2 py-1.5 text-xs text-ink-muted">
                      {s.state === 'listening'
                        ? `${s.process ?? ''}·${String(s.pid ?? '')}`
                        : zh.common.none}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-xs">
                      {s.url !== undefined && s.state === 'listening' ? (
                        <a
                          className="text-accent underline-offset-2 hover:underline"
                          href={s.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {zh.projects.ports.open}
                        </a>
                      ) : (
                        <span className="text-ink-faint">{zh.common.none}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data !== undefined && data.listenersWarning !== undefined && (
          <p className="mt-2 text-[11px] text-warn">{data.listenersWarning}</p>
        )}
        {data !== undefined && data.scannedFiles.length > 0 && (
          <p className="mt-2 text-[11px] text-ink-faint">
            {zh.projects.ports.scanned(data.scannedFiles.join('、'))}
          </p>
        )}
      </div>
    </section>
  )
}
