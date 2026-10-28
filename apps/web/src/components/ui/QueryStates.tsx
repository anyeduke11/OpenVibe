import { sys } from '../../i18n/lane-system'
import { Icon } from './icons'
import { btnGhost, emptyHintCls, proseCls, skelCls } from './styles'

/**
 * 摘要型区块的**前三态**：加载骨架 / 端点未上线 / 出错重试。
 *
 * 为什么集中成一个模块：设置页的两节台账、工作台与成长页的账本卡此前各写一份，
 * 骨架行数（3）与错误文案口径（`sys.state.error` + 重试按钮）完全一致，
 * 只有外层留白不同——留白由 `wrap` 传入，三态才不会各自漂移。
 *
 * 判据与列表四态（`library/AssetStates`）同源，但**形态不同**：这里是卡片内的窄条，
 * 不是整张表的骨架屏，所以不能直接复用 AssetStates。
 */

/**
 * 加载态：3 行等高骨架。
 *
 * @param wrap 外层容器的类名（设置页用 `mt-2`，卡片内用 `cardBodyCls` 继承内边距）
 * @param rows 骨架行数，默认 3
 */
export function QuerySkeleton(props: { wrap: string; rows?: number }) {
  return (
    <div className={`${props.wrap} space-y-1.5`} aria-busy>
      {Array.from({ length: props.rows ?? 3 }, (_, i) => (
        <div key={i} className={`${skelCls} h-4`} />
      ))}
    </div>
  )
}

/** 端点未上线：不是出错，所以只给一行灰字，不给重试按钮 */
export function QueryOffline(props: { wrap: string }) {
  return (
    <div className={props.wrap}>
      <p className={`${proseCls} text-[13px] text-ink-muted`}>{sys.state.notOnline}</p>
    </div>
  )
}

/** 出错态：一句原因 + 一支重试按钮（没有重试的错误态等于把用户推回浏览器刷新键） */
export function QueryError(props: { wrap: string; error: unknown; onRetry: () => void }) {
  const message = props.error instanceof Error ? props.error.message : ''
  return (
    <div className={props.wrap}>
      <div className={emptyHintCls}>
        <p className="text-danger">{sys.state.error(message)}</p>
        <button type="button" className={btnGhost} onClick={props.onRetry}>
          <Icon name="refresh" size={13} />
          {sys.state.retry}
        </button>
      </div>
    </div>
  )
}
