import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import type { DiscussOut } from '@openvibe/shared'
import { apiJson } from '../../api/client'
import { useExtractGate } from '../../hooks/useExtract'
import { agentZh } from '../../i18n/lane-agent'

/**
 * AN2 · 问块（v0.2.3 批次 E，spec `v023-e-ai-assistant.md` FR-3）：
 * AgentPanel 的第四子块（置于接入指引之前）。与 CLI discuss 同一服务端端点；
 * 回答逐段渲染 + 来源下标徽标；**纯文本渲染红线**沿用（禁 dangerouslySetInnerHTML）；
 * 会话不持久化（页面刷新即走——「不做后台常驻/对话历史」的根设定）。
 * 总闸关着 ⇒ 不渲染（DL-08，与提取入口同口径）。
 */
export function DiscussBlock(props: { projectId: string }) {
  const gate = useExtractGate()
  const [question, setQuestion] = useState('')
  const [remember, setRemember] = useState(false)
  const [result, setResult] = useState<DiscussOut | null>(null)

  const ask = useMutation({
    mutationFn: (input: { q: string; confirm: boolean }) =>
      apiJson<DiscussOut>(`/api/projects/${props.projectId}/discuss`, {
        method: 'POST',
        body: {
          question: input.q,
          confirm: input.confirm,
          remember: input.confirm && remember,
        },
      }),
    onSuccess: (out) => setResult(out),
  })

  if ((gate.data?.enabled ?? false) !== true) return null

  const submit = (): void => {
    const q = question.trim()
    if (q === '') return
    // 首次（未同意）自动带 confirm：面板是显式点击动作，等价于勾选确认
    ask.mutate({ q, confirm: true })
    setQuestion('')
  }

  return (
    <section className="mt-2">
      <h3 className="text-xs font-semibold text-ink-muted">{agentZh.discuss.title}</h3>
      <div className="mt-1.5 flex items-start gap-2">
        <textarea
          className="min-h-[2.4rem] flex-1 resize-y rounded-sm border border-line-hair bg-panel-2 px-2 py-1.5 text-[13px] text-ink-body outline-none focus:border-line"
          rows={2}
          value={question}
          placeholder={agentZh.discuss.placeholder}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
          }}
        />
        <button
          type="button"
          className="h-8 shrink-0 px-3 text-xs text-xs text-panel inv"
          style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}
          disabled={ask.isPending || question.trim() === ''}
          onClick={submit}
        >
          {ask.isPending ? agentZh.discuss.thinking : agentZh.discuss.ask}
        </button>
      </div>
      <label className="mt-1 flex items-center gap-1.5 text-[11.5px] text-ink-muted">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        {agentZh.discuss.remember}
      </label>

      {result !== null && (
        <div className="mt-2 rounded-sm border border-line-hair bg-panel-2 p-2">
          {result.status !== 'ok' ? (
            <p className="text-[12.5px] text-ink-body">
              {result.warnings.join('；') || result.status}
            </p>
          ) : (
            <>
              {result.segments.map((seg, i) => (
                <p key={i} className="mb-1 text-[13px] text-ink-body">
                  {seg.text}
                  {seg.source_ref !== null && (
                    <span
                      className="ml-1 rounded-sm px-1 align-baseline font-mono text-[10px]"
                      style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent-text)' }}
                    >
                      {`${String(seg.source_ref)}:${result.sources[seg.source_ref] ?? '?'}`}
                    </span>
                  )}
                </p>
              ))}
              {result.truncated && <p className="mt-1 text-[11px] text-ink-faint">{agentZh.discuss.truncated}</p>}
              {result.warnings.length > 0 && (
                <p className="mt-1 text-[11px] text-ink-muted">{result.warnings.join('；')}</p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}
