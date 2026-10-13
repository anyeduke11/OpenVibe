import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { SkillUpdateCheckItem } from '@openvibe/shared'
import { Dialog, DialogPanel } from '../ui/Dialog'
import { toast } from '../ui/Toaster'
import { btnGhost, btnPrimary, chipCls } from '../ui/styles'
import { useSkillRemote, useSkillRetrack, useSkillUpdateCheck } from '../../hooks/useSkills'
import { zh } from '../../i18n/zh'

const STATUS_CHIP: Record<SkillUpdateCheckItem['status'], string> = {
  upToDate: 'border-ok-line bg-ok-soft text-ok',
  remoteChanged: 'border-accent-line bg-accent-soft text-accent',
  notTracked: 'border-warn-line bg-warn-soft text-warn',
  checkFailed: 'border-danger-line bg-danger-soft text-danger',
}

const STATUS_ICON: Record<SkillUpdateCheckItem['status'], React.ReactNode> = {
  upToDate: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  remoteChanged: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path d="M2 8a6 6 0 0110.5-4M14 8a6 6 0 01-10.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 2v4M8 10v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  notTracked: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path d="M8 1.5L1 14h14L8 1.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 6v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="11.5" r="0.75" fill="currentColor" />
    </svg>
  ),
  checkFailed: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
}

/**
 * 检查更新（DEV-0068）：树指纹对比（GitHub 整仓一次 trees 调用、SkillHub 逐条 files）。
 * remoteChanged 条目一键重导——remoteRef 自带 repo@branch:path / slug，导入端点按同一溯源
 * 落账，重导后树指纹刷新为远端当前值。notTracked 条目（DEV-0067 存量）走「一键建档」
 * （DEV-0069）：按版本线溯源串重导，写追踪两列后自动重跑对比。
 */
export function SkillUpdateDialog(props: { open: boolean; onClose: () => void }) {
  const check = useSkillUpdateCheck()
  const { importSkill } = useSkillRemote()
  const retrack = useSkillRetrack()
  const [importing, setImporting] = useState<string | null>(null)
  const qc = useQueryClient()

  useEffect(() => {
    if (props.open) check.mutate({})
    // 仅在打开时跑一次（依赖刻意的窄化）
  }, [props.open])

  const report = check.data
  const changed = report?.items.filter((i) => i.status === 'remoteChanged') ?? []
  const untracked = report?.items.filter((i) => i.status === 'notTracked') ?? []

  const reimport = (item: SkillUpdateCheckItem) => {
    if (item.remoteRef === null) return
    setImporting(item.skillId)
    const body =
      item.source === 'github'
        ? (() => {
            // github:owner/repo@branch[:path]
            const rest = item.remoteRef.slice('github:'.length)
            const [repoBranch, path] = rest.split(':') as [string, string | undefined]
            const [repo, branch] = repoBranch.split('@') as [string, string]
            return {
              source: 'github' as const,
              repo,
              ref: branch,
              path: path === undefined ? undefined : path,
            }
          })()
        : { source: 'skillhub' as const, slug: item.remoteRef.slice('skillhub:'.length) }
    importSkill.mutate(body, {
      onSuccess: () => {
        toast(`${item.name}: ${zh.skills.updates.imported}`)
        void qc.invalidateQueries({ queryKey: ['skills'] })
        void check.mutateAsync({}) // 重导后树指纹已刷新，重跑对比归零
      },
      onError: (e: Error) => toast(e.message, 'error'),
      onSettled: () => setImporting(null),
    })
  }

  const retrackAll = () => {
    retrack.mutate(
      { ids: untracked.map((i) => i.skillId) },
      {
        onSuccess: (r) => {
          toast(zh.skills.updates.retracked(r.summary.retracked, r.summary.failed))
          void check.mutateAsync({})
        },
        onError: (e: Error) => toast(e.message, 'error'),
      },
    )
  }

  const renderRow = (item: SkillUpdateCheckItem) => (
    <div key={item.skillId} className="flex items-center gap-2 rounded p-1.5 text-xs hover:bg-panel-2">
      <span className={`${chipCls} shrink-0 ${STATUS_CHIP[item.status]}`}>
        {STATUS_ICON[item.status]}
        {zh.skills.updates.status[item.status]}
      </span>
      <span className="min-w-0 flex-1 truncate font-medium text-ink-body">{item.name}</span>
      {item.note !== undefined && (
        <span className="hidden max-w-56 truncate text-[11px] text-ink-faint md:block">{item.note}</span>
      )}
      {item.status === 'remoteChanged' && (
        <button
          className={btnGhost}
          disabled={importing !== null}
          onClick={() => reimport(item)}
        >
          {importing === item.skillId ? zh.skills.updates.importing : zh.skills.updates.importNow}
        </button>
      )}
    </div>
  )

  return (
    <Dialog open={props.open} onOpenChange={(o) => (o ? undefined : props.onClose())}>
      <DialogPanel
        title={zh.skills.updates.title}
        footer={
          <>
            <button className={btnGhost} onClick={props.onClose}>
              {zh.editor.close}
            </button>
            {untracked.length > 0 && (
              <button
                className={btnGhost}
                disabled={retrack.isPending || check.isPending}
                onClick={retrackAll}
              >
                {retrack.isPending
                  ? zh.skills.updates.retracking
                  : zh.skills.updates.retrackNow(untracked.length)}
              </button>
            )}
            <button className={btnPrimary} disabled={check.isPending} onClick={() => check.mutate({})}>
              {check.isPending ? zh.skills.updates.checking : zh.skills.updates.rerun}
            </button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <p className="text-xs text-ink-muted">{zh.skills.updates.hint}</p>
          {check.isError && <p className="text-xs text-warn">{(check.error as Error).message}</p>}
          {check.isPending && <p className="text-xs text-ink-muted">{zh.skills.updates.checking}</p>}
          {report !== undefined && (
            <>
              <p className="rounded-md border border-line bg-panel-2 p-2 text-xs">
                {changed.length === 0
                  ? zh.skills.updates.allUpToDate
                  : zh.skills.updates.changedCount(changed.length)}
              </p>
              <div className="max-h-80 space-y-1 overflow-auto">{report.items.map(renderRow)}</div>
            </>
          )}
        </div>
      </DialogPanel>
    </Dialog>
  )
}
