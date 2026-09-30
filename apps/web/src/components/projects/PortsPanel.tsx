import type { ProjectPortsOut, PortStatus } from '@openvibe/shared'
import { zh } from '../../i18n/zh'

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
        className={`h-1.5 w-1.5 rounded-[2px] ${listening ? 'bg-brand' : 'bg-ink-ghost'}`}
      />
      <span className={listening ? 'text-brand' : 'text-ink-faint'}>
        {listening ? zh.projects.ports.listening : zh.projects.ports.idle}
      </span>
    </span>
  )
}

export function PortsPanel(props: { data: ProjectPortsOut | undefined }) {
  const data = props.data
  return (
    <section className="rounded-lg border border-line bg-panel p-4">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold text-ink-muted">{zh.projects.ports.title}</h3>
        <p className="text-[11px] text-ink-faint">{zh.projects.ports.hint}</p>
      </div>

      {data === undefined ? (
        <p className="py-3 text-sm text-ink-faint">{zh.common.loading}</p>
      ) : data.services.length === 0 ? (
        <p className="py-3 text-sm text-ink-faint">
          {data.projectPath === '' ? zh.projects.ports.noPath : zh.projects.ports.empty}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="text-left text-xs text-ink-subtle">
              <tr className="border-b border-line-strong">
                <th className="px-2 py-2">{zh.projects.ports.colPort}</th>
                <th className="px-2 py-2">{zh.projects.ports.colService}</th>
                <th className="px-2 py-2">{zh.projects.ports.colSource}</th>
                <th className="px-2 py-2">{zh.projects.ports.colState}</th>
                <th className="px-2 py-2">{zh.projects.ports.colProcess}</th>
                <th className="px-2 py-2">{zh.projects.ports.colOpen}</th>
              </tr>
            </thead>
            <tbody>
              {data.services.map((s) => (
                <tr key={`${String(s.port)}-${s.service}`} className="border-b border-line-hair">
                  <td className="mono px-2 py-2 text-ink-strong">{String(s.port)}</td>
                  <td className="px-2 py-2 text-ink-body">{s.service}</td>
                  <td className="px-2 py-2 text-xs text-ink-subtle">
                    {zh.projects.ports.sourceLabel[s.source]}{' '}
                    <span className="mono text-[11px] text-ink-faint">{s.sourceFile}</span>
                  </td>
                  <td className="px-2 py-2">
                    <StateDot state={s.state} />
                  </td>
                  <td className="mono px-2 py-2 text-xs text-ink-subtle">
                    {s.state === 'listening'
                      ? `${s.process ?? ''}·${String(s.pid ?? '')}`
                      : zh.common.none}
                  </td>
                  <td className="px-2 py-2 text-xs">
                    {s.url !== undefined && s.state === 'listening' ? (
                      <a
                        className="text-brand underline-offset-2 hover:underline"
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
        <p className="mt-2 text-[11px] text-warn-700">{data.listenersWarning}</p>
      )}
      {data !== undefined && data.scannedFiles.length > 0 && (
        <p className="mt-2 text-[11px] text-ink-faint">
          {zh.projects.ports.scanned(data.scannedFiles.join('、'))}
        </p>
      )}
    </section>
  )
}
