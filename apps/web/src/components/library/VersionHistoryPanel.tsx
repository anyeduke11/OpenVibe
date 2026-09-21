import { useState } from 'react'
import { usePromptMutations, usePromptVersions } from '../../hooks/usePrompts'
import { zh } from '../../i18n/zh'
import { toast } from '../ui/Toaster'
import { btnDanger, btnGhost } from '../ui/styles'
import { DiffViewer } from './DiffViewer'

type Pick = number | 'current'

/** 版本历史（m1 FR-4）：两版 diff + 回滚=以旧版内容创建新版本，历史不可改写 */
export function VersionHistoryPanel(props: {
  promptId: string
  currentContent: string
  onRestored?: (content: string) => void
}) {
  const { data: versions, isLoading } = usePromptVersions(props.promptId)
  const { restore } = usePromptMutations()
  const [picked, setPicked] = useState<Pick[]>([])
  const [pendingRollback, setPendingRollback] = useState<number | null>(null)

  const contentOf = (p: Pick): string =>
    p === 'current'
      ? props.currentContent
      : (versions?.find((v) => v.versionNo === p)?.content ?? '')

  const toggle = (p: Pick) => {
    setPicked((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev.slice(-1), p]))
  }

  if (isLoading) return <p className="text-sm text-zinc-400">…</p>
  const list = [...(versions ?? [])].sort((a, b) => b.versionNo - a.versionNo)
  if (list.length === 0) return <p className="text-sm text-zinc-400">{zh.versions.empty}</p>

  const ordered = [...picked].sort((a, b) => {
    const rank = (p: Pick) => (p === 'current' ? Number.MAX_SAFE_INTEGER : p)
    return rank(a) - rank(b)
  })

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-500">{zh.versions.pickTwo}</p>
        {picked.length === 2 && (
          <button className={btnGhost} onClick={() => setPicked([])}>
            {zh.common.clearFilter}
          </button>
        )}
      </div>

      <div className="grid gap-2">
        <label className="flex cursor-pointer items-center gap-3 rounded-md border border-zinc-200 px-3 py-2 text-sm">
          <input
            type="checkbox"
            checked={picked.includes('current')}
            onChange={() => toggle('current')}
          />
          <span className="font-medium">{zh.versions.current}</span>
        </label>

        {list.map((v) => (
          <div
            key={v.id}
            className="flex flex-wrap items-center gap-3 rounded-md border border-zinc-200 px-3 py-2 text-sm"
          >
            <input
              type="checkbox"
              checked={picked.includes(v.versionNo)}
              onChange={() => toggle(v.versionNo)}
            />
            <span className="mono font-medium">v{String(v.versionNo)}</span>
            <span className="text-xs text-zinc-400">{v.createdAt}</span>
            {v.changelog !== '' && (
              <span className="text-xs text-zinc-500">
                {zh.versions.changelog}：{v.changelog}
              </span>
            )}
            <span className="ml-auto flex items-center gap-2">
              {pendingRollback === v.versionNo ? (
                <>
                  <span className="text-xs text-red-700">
                    {zh.versions.rollbackConfirm(v.versionNo)}
                  </span>
                  <button
                    className={btnDanger}
                    disabled={restore.isPending}
                    onClick={() =>
                      restore.mutate(
                        { id: props.promptId, versionNo: v.versionNo },
                        {
                          onSuccess: (r) => {
                            toast(zh.versions.rollbackDone(r.newVersionNo))
                            props.onRestored?.(r.prompt.content)
                            setPendingRollback(null)
                            setPicked([])
                          },
                          onError: (e) => toast(e.message, 'error'),
                        },
                      )
                    }
                  >
                    {zh.deleteDialog.confirm}
                  </button>
                  <button className={btnGhost} onClick={() => setPendingRollback(null)}>
                    {zh.editor.cancel}
                  </button>
                </>
              ) : (
                <button className={btnGhost} onClick={() => setPendingRollback(v.versionNo)}>
                  {zh.versions.rollback}
                </button>
              )}
            </span>
          </div>
        ))}
      </div>

      {ordered.length === 2 && (
        <DiffViewer
          oldText={contentOf(ordered[0] ?? 'current')}
          newText={contentOf(ordered[1] ?? 'current')}
        />
      )}
    </div>
  )
}
