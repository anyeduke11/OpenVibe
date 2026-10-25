import { useMemo, useState } from 'react'
import type { DevLogOut } from '@openvibe/shared'
import { zh } from '../../i18n/zh'
import { sys } from '../../i18n/lane-system'
import { useExtractConsents, useExtractGate } from '../../hooks/useExtract'
import { useExtractRun } from '../../hooks/useExtractRun'
import { Dialog, DialogPanel } from '../ui/Dialog'
import { btnGhost, btnPrimary, rowCls, tagCls } from '../ui/styles'

/**
 * M10/D · 日志区「提取候选」入口（spec `v023-d-ai-extract.md` FR-1）。
 * 三条件渲染（DL-08）：总闸开 + provider 可用（由结果态反馈）+ 至少选一条。
 * 确认屏展示**确切的待发内容**（所选日志的标题与正文预览，红线 3），脱敏在服务端做。
 */
export function ExtractLauncher(props: { projectId: string; entries: DevLogOut[] }) {
  const gate = useExtractGate()
  const consents = useExtractConsents()
  const run = useExtractRun(props.projectId)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [phase, setPhase] = useState<'idle' | 'confirm'>('idle')

  const enabled = (gate.data?.enabled ?? false) && props.entries.length > 0
  const remembered = useMemo(
    () => (consents.data?.consents ?? []).some((c) => c.project_id === props.projectId && c.remember_all),
    [consents.data, props.projectId],
  )

  if (!enabled) return null

  const toggle = (id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const doExtract = (remember: boolean): void => {
    // 成功不自动关弹窗：结果态（候选/丢弃计数）就在弹窗里，读完后手动关。
    run.mutate({ logIds: [...selected], confirm: true, remember })
  }

  const chosen = props.entries.filter((e) => selected.has(e.id))

  return (
    <>
      <div className="mt-1.5 flex items-center gap-2">
        <span className={`${tagCls}`}>{`已选 ${String(selected.size)} 条`}</span>
        <button
          type="button"
          className={btnPrimary}
          disabled={selected.size === 0}
          onClick={() => setPhase('confirm')}
        >
          {zh.projects.extract?.launch ?? '提取候选'}
        </button>
        {selected.size > 0 && (
          <button type="button" className={btnGhost} onClick={() => setSelected(new Set())}>
            '清空'
          </button>
        )}
      </div>
      <ol className="space-y-1">
        {props.entries.map((entry) => (
          <li key={entry.id} className={`${rowCls} flex items-center gap-2 rounded-sm`}>
            <input
              type="checkbox"
              checked={selected.has(entry.id)}
              onChange={() => toggle(entry.id)}
              aria-label={entry.displayNo}
            />
            <span className="truncate text-sm text-ink-body">
              {entry.title === '' ? (entry.body.split('\n')[0]?.slice(0, 40) ?? '') : entry.title}
            </span>
            <span className="ml-auto shrink-0 text-[11px] text-ink-faint tabular-nums">
              {entry.displayNo}
            </span>
          </li>
        ))}
      </ol>

      <Dialog open={phase === 'confirm'} onOpenChange={(o) => !o && setPhase('idle')}>
        <DialogPanel
          title={zh.projects.extract?.confirmTitle ?? '确认出网提取'}
          footer={
            <>
              <button type="button" className={btnGhost} onClick={() => setPhase('idle')}>
                '取消'
              </button>
              <button
                type="button"
                className={btnPrimary}
                disabled={run.isPending}
                onClick={() => doExtract(!remembered)}
              >
                {remembered
                  ? (zh.projects.extract?.go ?? '提取')
                  : (zh.projects.extract?.goRemember ?? '提取并记住本项目')}
              </button>
            </>
          }
        >
          <p className="text-[13px] text-ink-body">{sys.settings.aiExtract.gateHint}</p>
          <ul className="mt-2 max-h-[40vh] space-y-2 overflow-auto">
            {chosen.map((e) => (
              <li key={e.id} className="rounded-sm border border-line-hair bg-panel-2 p-2">
                <p className="text-xs font-medium text-ink-body">
                  {e.displayNo} · {e.title === '' ? '(无标题)' : e.title}
                </p>
                <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-all text-[11px] text-ink-muted">
                  {e.body.slice(0, 400)}
                  {e.body.length > 400 ? '…' : ''}
                </pre>
              </li>
            ))}
          </ul>
          {run.data !== undefined && (
            <div className="mt-2 text-[12px] text-ink-body">
              {run.data.status === 'ok'
                ? `候选 ${String(run.data.candidateCount)} 条：${String(run.data.passedCount)} 条进入待确认队列，${String(run.data.droppedCount)} 条因锚定校验被丢弃`
                : (run.data.warnings.join('；') || run.data.status)}
            </div>
          )}
        </DialogPanel>
      </Dialog>
    </>
  )
}
