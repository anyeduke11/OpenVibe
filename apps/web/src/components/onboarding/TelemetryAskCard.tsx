import type { TelemetryAskState } from '@openvibe/shared'
import { TELEMETRY_EVENTS } from '@openvibe/shared'
import { zh } from '../../i18n/zh'
import { btnGhost, btnPrimary } from '../ui/styles'

/**
 * 一次性 opt-in 询问（onboarding FR-4.2 / D13）。三个事实决定它出不出镜：
 * askState 仍是 unset（declined 永不再问、accepted 已同步设置页开关）、且已见过首次注入——
 * 判定留在调用方，卡片本身只负责文案与按钮，选择一律 POST /api/settings/telemetry 落本地。
 */
export function TelemetryAskCard(props: {
  askState: TelemetryAskState
  onChoose: (enabled: boolean) => void
}) {
  if (props.askState !== 'unset') return null
  return (
    <section
      aria-label={zh.telemetryAsk.title}
      className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-zinc-200 bg-white px-6 py-2"
    >
      <span className="text-sm font-medium text-zinc-800">{zh.telemetryAsk.title}</span>
      <span className="text-xs text-zinc-500">{zh.telemetryAsk.body}</span>
      <span className="text-[11px] text-zinc-400">{zh.telemetryAsk.whitelist(TELEMETRY_EVENTS.join(' / '))}</span>
      <span className="ml-auto flex items-center gap-2">
        <button type="button" className={btnPrimary} onClick={() => props.onChoose(true)}>
          {zh.telemetryAsk.accept}
        </button>
        <button type="button" className={btnGhost} onClick={() => props.onChoose(false)}>
          {zh.telemetryAsk.decline}
        </button>
      </span>
    </section>
  )
}
