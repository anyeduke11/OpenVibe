import type { ReactNode } from 'react'
import { lane } from '../../i18n/lane-assets'
import { zh } from '../../i18n/zh'
import { Icon } from '../ui/icons'
import { btnGhost, btnPrimary, emptyHintCls, noteCls, noteTitleCls, skelCls } from '../ui/styles'

/**
 * 列表四态（DESIGN.md Components：每个组件必须同批交付空 / 加载 / 错误 / 超长内容四态）。
 *
 * 为什么集中成一个模块：改造前四页各自手写，形态互不相同——提示词库把「加载中…」写成
 * 一行灰字、技巧库有错误态但没有骨架、Skill 台账的 `loading` prop 收了却没渲染，
 * 空态还共用一句「暂无数据」。四种形态只有一处定义，四页才不会再次跑偏。
 *
 * 四态的判据是**互斥且穷尽**，所以调用点必须按顺序排：
 *   loading → error → noResults（有筛选但无命中）→ empty（真的没有）→ 正常列表
 */

/** 加载态：骨架屏，不是转圈 spinner（DESIGN.md skeleton：panel-2 底，只做渐隐） */
export function AssetSkeleton(props: { rows?: number; label?: string }) {
  return (
    <div className="px-5 py-3" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{props.label ?? zh.common.loading}</span>
      {Array.from({ length: props.rows ?? 6 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-line-hair py-2 last:border-0">
          {/* 主行宽窄交错，读起来像条目而不是等宽色块 */}
          <div className={`${skelCls} h-3.5 ${i % 3 === 0 ? 'w-2/5' : i % 3 === 1 ? 'w-1/3' : 'w-2/7'}`} />
          <div className={`${skelCls} h-3 ${i % 2 === 0 ? 'w-1/6' : 'w-1/8'}`} />
          <div className={`${skelCls} ml-auto h-3 w-16`} />
        </div>
      ))}
    </div>
  )
}

/** 空态：库真的空。必须给一个具体 CTA，不是「暂无数据」（DESIGN.md empty-hint） */
export function AssetEmpty(props: { message: string; action?: ReactNode }) {
  return (
    <div className={`${emptyHintCls} m-5`}>
      <p className="text-ink-muted">{props.message}</p>
      {props.action}
    </div>
  )
}

/** 无结果态：数据在，是当前筛选没命中。唯一正确的下一步是「清除筛选」 */
export function AssetNoResults(props: { what: string; onClear: () => void }) {
  return (
    <div className={`${emptyHintCls} m-5`}>
      <p className="text-ink-muted">{lane.state.noResults(props.what)}</p>
      <button className={btnGhost} onClick={props.onClear}>
        <Icon name="x" size={12} />
        {lane.state.clearFilters}
      </button>
    </div>
  )
}

/**
 * 错误态：note 四态之一——成段说明 + 一个可执行的下一步。
 * 没有重试按钮的错误态等于把用户推回浏览器刷新键，所以重试是必填项而不是可选项。
 */
export function AssetError(props: { message: string; onRetry: () => void; retrying?: boolean }) {
  return (
    <div className={`${noteCls('danger')} m-5 text-ink-body`}>
      <strong className={`${noteTitleCls} flex items-center gap-1.5 text-danger`}>
        <Icon name="alert" size={12} />
        {zh.common.failed(props.message)}
      </strong>
      <p className="proseCls mt-1 text-xs text-ink-muted">{lane.state.readFailed(props.message)}</p>
      <button className={`${btnPrimary} mt-2`} disabled={props.retrying} onClick={props.onRetry}>
        <Icon name="refresh" size={12} />
        {props.retrying ? zh.common.loading : lane.state.retry}
      </button>
    </div>
  )
}

/** 后台刷新提示：不是加载态，只是「在同步」 */
export function RefreshHint(props: { busy: boolean; children?: ReactNode }) {
  if (!props.busy) return null
  return (
    <span className="flex shrink-0 items-center gap-1 text-[11px] text-ink-faint">
      <Icon name="refresh" size={11} />
      {props.children ?? lane.state.refreshing}
    </span>
  )
}
