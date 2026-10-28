import { sys } from '../../i18n/lane-system'
import { zh } from '../../i18n/zh'
import { cardHeadCls, chipTone } from './styles'
import { Icon } from './icons'

/**
 * 本机自证层账本卡的卡头 —— 工作台与增长页两处共用。
 *
 * 「不出网」不再由各页写死字面量：走 `sys.settings.localLedger.offlineChip`，
 * 与设置页「本机账本」同一处文案（改一处，三处同步）。
 */
export function LedgerCardHead() {
  return (
    <div className={cardHeadCls}>
      <Icon name="lock" size={15} className="text-ink-faint" />
      <h2 className="text-sm font-semibold text-ink">{zh.workbench.ledger.title}</h2>
      <span className={chipTone('default')}>
        <Icon name="lock" size={12} />
        {sys.settings.localLedger.offlineChip}
      </span>
    </div>
  )
}
