import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { SkillDuplicatesReport } from '@openvibe/shared'
import { Dialog, DialogPanel } from '../ui/Dialog'
import { toast } from '../ui/Toaster'
import { apiJson } from '../../api/client'
import { btnGhost, btnPrimary } from '../ui/styles'
import { useSkillDuplicates } from '../../hooks/useSkills'
import { zh } from '../../i18n/zh'

/** 重复整理（DEV-0067）：同内容重复（勾选删）/ 失效目录 / 名称异常三段报告；删除逐条走 DELETE */
export function SkillCleanupDialog(props: { open: boolean; onClose: () => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const dup = useSkillDuplicates()
  const qc = useQueryClient()

  useEffect(() => {
    if (props.open) {
      setSelected(new Set())
      dup.mutate()
    }
    // 仅在打开时拉一次报告（依赖刻意的窄化）
  }, [props.open])

  const report: SkillDuplicatesReport | undefined = dup.data
  const hasAnything =
    report !== undefined &&
    (report.sameContent.length > 0 || report.stale.length > 0 || report.nameAnomalies.length > 0)

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const deleteSelected = async () => {
    setDeleting(true)
    try {
      for (const id of selected) {
        await apiJson<void>(`/api/skills/${id}`, { method: 'DELETE' })
      }
      toast(zh.skills.cleanupDialog.done)
      setSelected(new Set())
      dup.mutate()
      void qc.invalidateQueries({ queryKey: ['skills'] })
    } catch (e) {
      toast(`${zh.skills.cleanupDialog.fail}：${(e as Error).message}`, 'error')
    } finally {
      setDeleting(false)
    }
  }

  const section = (title: string, hint: string, rows: React.ReactNode) => (
    <div className="space-y-1">
      <p className="text-xs font-medium text-ink">{title}</p>
      <p className="text-[11px] text-ink-subtle">{hint}</p>
      <div className="max-h-48 space-y-1 overflow-auto rounded-md border border-line p-2">{rows}</div>
    </div>
  )

  return (
    <Dialog open={props.open} onOpenChange={(o) => (o ? undefined : props.onClose())}>
      <DialogPanel
        title={zh.skills.cleanupDialog.title}
        footer={
          <>
            <button className={btnGhost} onClick={props.onClose}>
              {zh.editor.close}
            </button>
            <button
              className={`${btnPrimary} border-danger-600 bg-danger-600 hover:bg-danger-700`}
              disabled={selected.size === 0 || deleting}
              onClick={() => void deleteSelected()}
            >
              {deleting ? zh.skills.cleanupDialog.deleting : zh.skills.cleanupDialog.deleteSelected(selected.size)}
            </button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs text-ink-subtle">
              {dup.isPending ? zh.skills.cleanupDialog.running : ''}
            </p>
            <button className={btnGhost} disabled={dup.isPending} onClick={() => dup.mutate()}>
              {zh.skills.cleanupDialog.refresh}
            </button>
          </div>

          {dup.isError && <p className="text-xs text-warn-800">{(dup.error as Error).message}</p>}

          {report !== undefined && !hasAnything && (
            <p className="py-6 text-center text-sm text-ink-subtle">{zh.skills.cleanupDialog.none}</p>
          )}

          {report !== undefined &&
            report.sameContent.length > 0 &&
            section(
              zh.skills.cleanupDialog.sameContent(report.sameContent.length),
              zh.skills.cleanupDialog.sameContentHint,
              report.sameContent.map((group) => (
                <div key={group.dirHash} className="space-y-0.5 rounded p-1 hover:bg-fill-soft">
                  {group.skills.map((s) => (
                    <label key={s.id} className="flex cursor-pointer items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={selected.has(s.id)}
                        onChange={() => toggle(s.id)}
                      />
                      <span className="font-medium text-ink">{s.name}</span>
                      <span className="text-ink-faint">
                        {zh.skills.sources[s.source as keyof typeof zh.skills.sources] ?? s.source}
                        {s.skillDir !== null && ` · ${s.skillDir}`}
                      </span>
                    </label>
                  ))}
                </div>
              )),
            )}

          {report !== undefined &&
            report.stale.length > 0 &&
            section(
              zh.skills.cleanupDialog.stale(report.stale.length),
              zh.skills.cleanupDialog.staleHint,
              report.stale.map((s) => (
                <label key={s.id} className="flex cursor-pointer items-center gap-2 text-xs">
                  <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                  <span className="font-medium text-ink">{s.name}</span>
                  <span className="mono truncate text-ink-faint">{s.skillDir}</span>
                </label>
              )),
            )}

          {report !== undefined &&
            report.nameAnomalies.length > 0 &&
            section(
              zh.skills.cleanupDialog.nameAnomalies(report.nameAnomalies.length),
              zh.skills.cleanupDialog.anomalyHint,
              report.nameAnomalies.map((s) => (
                <label key={s.id} className="flex cursor-pointer items-center gap-2 text-xs">
                  <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                  <span className="mono">{s.name}</span>
                  <span className="text-ink-faint">（{s.issue}）</span>
                </label>
              )),
            )}
        </div>
      </DialogPanel>
    </Dialog>
  )
}
