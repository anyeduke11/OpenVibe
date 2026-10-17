import { useState } from 'react'
import { agentZh, AGENT_SUMMARY_MAX } from '../../i18n/lane-agent'
import { useAgentIngests, useReviewIngest, type AgentIngestItem } from '../../hooks/useAgentIngests'
import { AgentEmptyStateBox } from './EmptyState'
import { noteCls } from '../ui/styles'

/**
 * 待确认回流列表（`m8-agent-panel.md` FR-5.1.2 ＋ FR-5.6）。
 *
 * ## 摘要截断：规则写死在这一处
 *
 * spec FR-5.1.2：「取 `payload_json` 的**首个字符串字段**，超 80 字符截断并加省略号，
 * **不解析富文本、不渲染 HTML**」。
 * ⚠️ 「首个字符串字段」是**深度优先取第一个**，不是只扫顶层 ——
 * payload 由调用方自报（§6.2 不可信输入），它可能是 `{meta:{title:'…'}}`。
 * 只扫顶层会让嵌套 payload 摘要恒空，而那正是最容易被塞东西的形状。
 *
 * ## 为什么摘要只走纯文本
 *
 * FR-5.1.2.1 红线：不得 `dangerouslySetInnerHTML`、不得 markdown 直渲。
 * 全文只用 `{value}` 插值 —— React 默认转义，这是**免费**的那道防线，不依赖自觉。
 */

/** FR-5.1.2 摘要规则：深度优先取首个字符串字段，超 80 字符截断加省略号 */
export function summarizePayload(payload: unknown, max: number = AGENT_SUMMARY_MAX): string {
  const s = firstString(payload)
  if (s === null) return ''
  // ⚠️ 按**码点**切，不按 UTF-16 码元 —— 按码元切会在 emoji / 生僻字上切出半个字符，
  // 渲染出「半个豆腐块」。`Array.from` 按码点拆。
  const chars = Array.from(s)
  return chars.length <= max ? s : `${chars.slice(0, max).join('')}…`
}

/** 深度优先找第一个字符串值；不是字符串就继续往下走；都没有返回 null */
function firstString(v: unknown): string | null {
  if (typeof v === 'string') return v
  if (Array.isArray(v)) {
    for (const x of v) {
      const hit = firstString(x)
      if (hit !== null) return hit
    }
    return null
  }
  if (v !== null && typeof v === 'object') {
    for (const x of Object.values(v as Record<string, unknown>)) {
      const hit = firstString(x)
      if (hit !== null) return hit
    }
  }
  return null
}

/** 载荷指纹（FR-6.3：只显示短 hash，**不请求也不显示完整载荷**） */
export function shortHash(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0').slice(0, 8)
}

export function PendingIngestList(props: {
  projectId: string | null
  onGoToInstall: () => void
}) {
  const q = useAgentIngests(props.projectId)
  const review = useReviewIngest(props.projectId)
  const [onlyConflict, setOnlyConflict] = useState(false)

  if (q.isLoading) return <p className="py-3 text-sm text-ink-faint">{agentZh.context.loading}</p>

  const items = q.data?.items ?? []
  const shown = onlyConflict ? items.filter((i) => i.status === 'conflict') : items

  return (
    <div className="space-y-2">
      {items.length > 0 && !q.isError ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-sm border border-line px-1.5 py-0.5 text-xs"
            onClick={() => setOnlyConflict((v) => !v)}
          >
            {onlyConflict ? agentZh.ingest.showAll : agentZh.ingest.statusConflict}
          </button>
        </div>
      ) : null}
      {/** FR-5.4：三态各有各的语义与 CTA，不许合并（FR-5.4.1.1） */}
      {q.isError ? (
        <AgentEmptyStateBox
          value={{ state: 'error', onRetry: () => void q.refetch() }}
        />
      ) : items.length === 0 ? (
        // 「从未有过回流」⇒ empty 态，CTA 滚到安装指引（FR-5.4.1）
        <AgentEmptyStateBox value={{ state: 'empty', onGoToInstall: props.onGoToInstall }} />
      ) : shown.length === 0 ? (
        // 「有数据但被筛没了」⇒ no-result 态，CTA 清除筛选
        <AgentEmptyStateBox value={{ state: 'no-result', onClearFilter: () => setOnlyConflict(false) }} />
      ) : (
        <ul className="divide-y divide-line-hair">
          {shown.map((item) => (
            <IngestRow key={item.id} item={item} onReview={review.mutate} busy={review.isPending} />
          ))}
        </ul>
      )}
    </div>
  )
}

function IngestRow(props: {
  item: AgentIngestItem
  busy: boolean
  onReview: (input: { ingestId: string; to: 'published' | 'rejected'; reason?: string }) => void
}) {
  const it = props.item
  const isConflict = it.status === 'conflict'
  // ⚠️ FR-5.1.1.2：`conflict` 权重必须高于 `pending`。常态与异常不分权重 = 异常被淹没。
  return (
    <li
      className={`flex flex-wrap items-baseline gap-x-2 gap-y-1 px-1 py-2 ${
        isConflict ? `${noteCls('warn')} border-l-2 border-warn-line` : ''
      }`}
    >
      <span className="text-xs text-ink-faint">{it.createdAt.slice(0, 16).replace('T', ' ')}</span>
      <span className="font-mono text-xs text-ink">{it.kind}</span>
      <span className="text-xs text-ink-muted">{it.sourcePlatform}</span>
      {/* 纯文本渲染，红线（FR-5.1.2.1） */}
      <span className="min-w-0 flex-1 truncate text-xs text-ink-muted">
        {summarizePayload(it.payload)}
      </span>
      <span className={`text-xs ${isConflict ? 'font-bold text-warn' : 'text-ink-muted'}`}>
        {isConflict ? agentZh.ingest.statusConflict : agentZh.ingest.statusPending}
      </span>
      {isConflict ? <ConflictActions item={it} busy={props.busy} onReview={props.onReview} /> : null}
    </li>
  )
}

/**
 * 冲突裁决入口（FR-5.6）。
 *
 * **只给入口不给策略**（FR-5.6.1）：两个动作，**没有任何自动合并**。
 * ⚠️ FR-5.6.3：**不提供**「用新的覆盖旧的」—— 那正是幂等被破坏的地方。
 * 这里的两个动作分别是「保留先到者」（否掉本条）与「接受本条并改幂等键重试」
 * （把当前条判为 rejected，让 agent 用新键重报），先到者**一个字节都不改**。
 */
function ConflictActions(props: {
  item: AgentIngestItem
  busy: boolean
  onReview: (input: { ingestId: string; to: 'published' | 'rejected'; reason?: string }) => void
}) {
  const { item } = props
  const [open, setOpen] = useState(false)
  const cls = 'rounded-sm border border-line-strong px-1.5 py-0.5 text-xs'
  return (
    <span className="flex items-center gap-1.5">
      <button type="button" className={cls} onClick={() => setOpen((v) => !v)}>
        {agentZh.ingest.conflictDetail}
      </button>
      {open ? (
        <span className="flex items-center gap-1.5">
          <span className="text-xs text-ink-faint" title={agentZh.ingest.hashShortHint}>
            {agentZh.ingest.hashLabel}: {shortHash(JSON.stringify(item.payload))}
          </span>
          <button
            type="button"
            className={cls}
            disabled={props.busy}
            onClick={() => props.onReview({ ingestId: item.id, to: 'rejected', reason: 'keep-first' })}
          >
            {agentZh.ingest.keepFirst}
          </button>
          <button
            type="button"
            className={cls}
            disabled={props.busy}
            onClick={() =>
              props.onReview({ ingestId: item.id, to: 'rejected', reason: 'accept-and-retry-with-new-key' })
            }
          >
            {agentZh.ingest.acceptThis}
          </button>
        </span>
      ) : null}
    </span>
  )
}
