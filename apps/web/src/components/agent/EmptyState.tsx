import { agentZh } from '../../i18n/lane-agent'
import { laneEngineering } from '../../i18n/lane-engineering'
import { emptyHintCls } from '../ui/styles'

/**
 * M8-E 三态空态（`m8-agent-panel.md` FR-5.4）。
 *
 * ## 为什么是**新建**组件而不是复用
 *
 * spec §3-1 实测 `EmptyState` **0 命中**；而既有形制的真实样子是 `PortsPanel` 里那句
 * `<p className="py-3 text-sm text-ink-faint">{…empty}</p>` —— **纯文案、不可点**。
 * spec FR-5.4.2 把它记为「本仓已有先例且被判为缺陷」的依据。所以这里必须新建，
 * 且**三态缺一不可**。
 *
 * ## 为什么放 `components/agent/` 而不是 `components/ui/`
 *
 * spec FR-5.4.4：`ui/` 是 V2 **形制件**目录（`theme.md` 治理的对象），本组件是**业务件**。
 * ⚠️ 精确边界：`theme.md` 只在 `:142` 提到 `styles.ts`，**它不治理整个 `ui/` 目录** ——
 * 本条的理由是「形制件 vs 业务件」的归属，不是「theme.md 管着 ui/」。
 * （样式**单出**仍在 `ui/styles.ts`，本组件只 import，不新增类名。）
 *
 * ## 三态为什么不许合并
 *
 * spec FR-5.4.1.1：`empty` 与 `no-result` 合并 = 用户分不清「它还没接」与「我筛没了」，
 * 这是**引导缺失**不是措辞问题；`error` 合并 = 网络抖动直接 0 信息，用户以为真的没数据。
 * ⇒ 类型上把三态做成互斥的判别联合，**少写一态或写错回调名，编译就红**。
 */

/** 三态判别联合：每个态自带它该有的那一个回调，没有多余的插槽 */
export type AgentEmptyState =
  | { state: 'empty'; onGoToInstall: () => void }
  | { state: 'no-result'; onClearFilter: () => void }
  | { state: 'error'; onRetry: () => void }

export function AgentEmptyStateBox(props: { value: AgentEmptyState }) {
  const v = props.value
  return (
    <div className={emptyHintCls}>
      <span className="text-ink">{titleOf(v)}</span>
      <span>{hintOf(v)}</span>
      {ctaOf(v)}
    </div>
  )
}

function titleOf(v: AgentEmptyState): string {
  switch (v.state) {
    case 'empty':
      return agentZh.emptyState.emptyTitle
    case 'no-result':
      return agentZh.emptyState.noResultTitle
    case 'error':
      return agentZh.emptyState.errorTitle
  }
}

function hintOf(v: AgentEmptyState): string {
  switch (v.state) {
    case 'empty':
      return agentZh.emptyState.emptyHint
    case 'no-result':
      return agentZh.emptyState.noResultHint
    case 'error':
      // ⚠️ FR-5.4.3：**复用**工程域既有文案，不新造。理由是它已经写对了
      //（「通常是后台进程刚重启——重试即可」是本仓的真实故障画像）。
      return laneEngineering.state.retryHint
  }
}

/** FR-5.4.2：`empty` 的 CTA 必须是动作不是文案 —— 三态**全部**给可点的按钮。 */
function ctaOf(v: AgentEmptyState) {
  const cls = 'rounded-sm border border-line-strong px-2 py-1 text-xs text-ink'
  if (v.state === 'empty') {
    return (
      <button type="button" className={cls} onClick={v.onGoToInstall}>
        {agentZh.emptyState.emptyCta}
      </button>
    )
  }
  if (v.state === 'no-result') {
    return (
      <button type="button" className={cls} onClick={v.onClearFilter}>
        {agentZh.emptyState.noResultCta}
      </button>
    )
  }
  return (
    <button type="button" className={cls} onClick={v.onRetry}>
      {/* 同样复用：`laneEngineering.state.retry` 已写对 */}
      {laneEngineering.state.retry}
    </button>
  )
}
