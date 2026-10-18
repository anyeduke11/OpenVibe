import type { TelemetryAskState } from '@openvibe/shared'
import { TELEMETRY_EVENTS } from '@openvibe/shared'
import { zh } from '../../i18n/zh'
import { sys } from '../../i18n/lane-system'
import { btnGhost, btnPrimary, noteCls, noteTitleCls, proseCls } from '../ui/styles'
import { Icon } from '../ui/icons'

/**
 * 一次性 opt-in 询问（onboarding FR-4.2 / D13）。三个事实决定它出不出镜：
 * askState 仍是 unset（declined 永不再问、accepted 已同步设置页开关）、且已见过首次注入——
 * 判定留在调用方，卡片本身只负责文案与按钮，选择一律 POST /api/settings/telemetry 落本地。
 *
 * 形制是 note 而不是 chip：这段话承载的是「为什么值得问」与「不带什么出去」，
 * 不是单点状态（DESIGN.md Components note/chip 分工）。
 */
export function TelemetryAskCard(props: {
  askState: TelemetryAskState
  onChoose: (enabled: boolean) => void
}) {
  if (props.askState !== 'unset') return null
  return (
    <section aria-label={zh.telemetryAsk.title} className={noteCls('info')}>
      <b className={`${noteTitleCls} flex items-center gap-1.5 text-info`}>
        <Icon name="pulse" size={13} />
        {zh.telemetryAsk.title}
      </b>
      <p className={`${proseCls} text-ink-body`}>{zh.telemetryAsk.body}</p>
      <p className="mt-1 text-xs text-ink-muted">{sys.settings.telemetry.offNote}</p>
      <p className="mt-0.5 text-[11.5px] text-ink-muted">
        {zh.telemetryAsk.whitelist(TELEMETRY_EVENTS.join(' / '))}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" className={btnPrimary} onClick={() => props.onChoose(true)}>
          <Icon name="check" size={13} />
          {zh.telemetryAsk.accept}
        </button>
        <button type="button" className={btnGhost} onClick={() => props.onChoose(false)}>
          <Icon name="x" size={13} />
          {zh.telemetryAsk.decline}
        </button>
        <span className="text-[11.5px] text-ink-muted">{sys.settings.telemetry.askHint(false)}</span>
      </div>
    </section>
  )
}
