import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { SkillDuplicatesReport } from '@openvibe/shared'
import { Dialog, DialogPanel } from '../ui/Dialog'
import { toast } from '../ui/Toaster'
import { apiJson } from '../../api/client'
import { btnDanger, btnGhost, chipTone, emptyHintCls } from '../ui/styles'
import { useSkillDuplicates, useSkillMerge, useSkillRepair } from '../../hooks/useSkills'
import { zh } from '../../i18n/zh'

/**
 * 重复整理（DEV-0067 报告 / DEV-0073 三能力）：
 * - 同内容重复：选保留项（radio，默认本地目录优先）→「整合本组」；也可勾选删除
 * - 失效目录：删除 / 「重扫修复」（目录回来按名字自动并账）
 * - 名称异常：显示建议名预览 →「修复所选」（quoted 去引号；convention 规范化并重写
 *   SKILL.md，中文走拼音）/ 删除。全部动作完成后自动刷新报告。
 */
export function SkillCleanupDialog(props: { open: boolean; onClose: () => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [keepers, setKeepers] = useState<Record<string, string>>({}) // dirHash → keeper id
  const [busy, setBusy] = useState(false)
  const dup = useSkillDuplicates()
  const merge = useSkillMerge()
  const repair = useSkillRepair()
  const qc = useQueryClient()

  const refresh = () => {
    setSelected(new Set())
    setKeepers({})
    dup.mutate()
    void qc.invalidateQueries({ queryKey: ['skills'] })
  }

  useEffect(() => {
    if (props.open) {
      setSelected(new Set())
      setKeepers({})
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
    setBusy(true)
    try {
      for (const id of selected) {
        await apiJson<void>(`/api/skills/${id}`, { method: 'DELETE' })
      }
      toast(zh.skills.cleanupDialog.done)
      refresh()
    } catch (e) {
      toast(`${zh.skills.cleanupDialog.fail}：${(e as Error).message}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  const mergeGroup = (dirHash: string, memberIds: string[]) => {
    const group = report?.sameContent.find((g) => g.dirHash === dirHash)
    if (group === undefined) return
    // 默认保留项：有本地目录的优先（可用性最高），否则第一个；radio 可覆盖
    const fallback = group.skills.find((s) => s.skillDir !== null)?.id ?? group.skills[0]?.id ?? ''
    const keepId = keepers[dirHash] ?? fallback
    const absorbIds = memberIds.filter((id) => id !== keepId)
    if (absorbIds.length === 0) {
      toast(zh.skills.cleanupDialog.mergeNothing, 'error')
      return
    }
    merge.mutate(
      { keepId, absorbIds },
      {
        onSuccess: (r) => {
          toast(zh.skills.cleanupDialog.mergeDone(r.keptName, r.versionsMoved, r.versionsDropped))
          refresh()
        },
        onError: (e: Error) => toast(e.message, 'error'),
      },
    )
  }

  const repairSelected = () => {
    const anomalyIds =
      report?.nameAnomalies
        .filter((a) => selected.has(a.id) && a.suggestedName !== null)
        .map((a) => a.id) ?? []
    if (anomalyIds.length === 0) {
      toast(zh.skills.cleanupDialog.repairNothing, 'error')
      return
    }
    repair.mutate(
      { ids: anomalyIds },
      {
        onSuccess: (r) => {
          toast(zh.skills.cleanupDialog.repairDone(r.summary))
          refresh()
        },
        onError: (e: Error) => toast(e.message, 'error'),
      },
    )
  }

  const rescan = async () => {
    setBusy(true)
    try {
      const r = await apiJson<{ discovered: number; created: number; updated: number }>(
        '/api/skills/scan',
        {
          method: 'POST',
          body: {},
        },
      )
      toast(zh.skills.cleanupDialog.rescanDone(r.created, r.updated))
      refresh()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const section = (
    title: string,
    hint: string,
    actions: React.ReactNode,
    rows: React.ReactNode,
  ) => (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-ink-body">{title}</p>
        <div className="flex gap-1">{actions}</div>
      </div>
      <p className="text-[11px] text-ink-muted">{hint}</p>
      <div className="max-h-48 space-y-1 overflow-auto rounded-md border border-line p-2">
        {rows}
      </div>
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
              className={btnDanger}
              disabled={selected.size === 0 || busy}
              onClick={() => void deleteSelected()}
            >
              {busy
                ? zh.skills.cleanupDialog.deleting
                : zh.skills.cleanupDialog.deleteSelected(selected.size)}
            </button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs text-ink-muted">
              {dup.isPending ? zh.skills.cleanupDialog.running : ''}
            </p>
            <button className={btnGhost} disabled={dup.isPending} onClick={() => dup.mutate()}>
              {zh.skills.cleanupDialog.refresh}
            </button>
          </div>

          {dup.isError && <p className="text-xs text-warn">{(dup.error as Error).message}</p>}

          {report !== undefined && !hasAnything && (
            // 「没有重复项」是一份会过期的结论，下一步只能是重扫，所以 CTA 给重扫而不是关闭
            <div className={emptyHintCls}>
              <p>{zh.skills.cleanupDialog.none}</p>
              <button className={btnGhost} disabled={dup.isPending} onClick={() => dup.mutate()}>
                {zh.skills.cleanupDialog.refresh}
              </button>
            </div>
          )}

          {report !== undefined &&
            report.sameContent.length > 0 &&
            section(
              zh.skills.cleanupDialog.sameContent(report.sameContent.length),
              zh.skills.cleanupDialog.sameContentHint,
              null,
              report.sameContent.map((group) => {
                const fallback =
                  group.skills.find((s) => s.skillDir !== null)?.id ?? group.skills[0]?.id ?? ''
                const keepId = keepers[group.dirHash] ?? fallback
                return (
                  <div key={group.dirHash} className="space-y-0.5 rounded p-1 hover:bg-panel-2">
                    {group.skills.map((s) => (
                      <div key={s.id} className="flex items-center gap-2 text-xs">
                        <input
                          type="radio"
                          name={`keep-${group.dirHash}`}
                          checked={keepId === s.id}
                          onChange={() =>
                            setKeepers((prev) => ({ ...prev, [group.dirHash]: s.id }))
                          }
                        />
                        <input
                          type="checkbox"
                          checked={selected.has(s.id)}
                          onChange={() => toggle(s.id)}
                        />
                        <span
                          className={`font-medium ${keepId === s.id ? 'text-accent' : 'text-ink-body'}`}
                        >
                          {s.name}
                        </span>
                        <span className="text-ink-faint">
                          {zh.skills.sources[s.source as keyof typeof zh.skills.sources] ??
                            s.source}
                          {s.skillDir !== null && ` · ${s.skillDir}`}
                        </span>
                      </div>
                    ))}
                    <div className="flex justify-end">
                      <button
                        className={btnGhost}
                        disabled={merge.isPending}
                        onClick={() =>
                          mergeGroup(
                            group.dirHash,
                            group.skills.map((s) => s.id),
                          )
                        }
                      >
                        {zh.skills.cleanupDialog.mergeGroup}
                      </button>
                    </div>
                  </div>
                )
              }),
            )}

          {report !== undefined &&
            report.stale.length > 0 &&
            section(
              zh.skills.cleanupDialog.stale(report.stale.length),
              zh.skills.cleanupDialog.staleHint,
              <button className={btnGhost} disabled={busy} onClick={() => void rescan()}>
                {zh.skills.cleanupDialog.rescanFix}
              </button>,
              report.stale.map((s) => (
                <label key={s.id} className="flex cursor-pointer items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={selected.has(s.id)}
                    onChange={() => toggle(s.id)}
                  />
                  <span className="font-medium text-ink-body">{s.name}</span>
                  <span className="mono truncate text-ink-faint">{s.skillDir}</span>
                </label>
              )),
            )}

          {report !== undefined &&
            report.nameAnomalies.length > 0 &&
            section(
              zh.skills.cleanupDialog.nameAnomalies(report.nameAnomalies.length),
              zh.skills.cleanupDialog.anomalyHint,
              <button className={btnGhost} disabled={repair.isPending} onClick={repairSelected}>
                {repair.isPending
                  ? zh.skills.cleanupDialog.repairing
                  : zh.skills.cleanupDialog.repairSelected}
              </button>,
              report.nameAnomalies.map((s) => (
                <label key={s.id} className="flex cursor-pointer items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={selected.has(s.id)}
                    onChange={() => toggle(s.id)}
                    disabled={s.suggestedName === null}
                  />
                  <span className="mono">{s.name}</span>
                  <span className="text-ink-faint">（{s.issue}）</span>
                  {s.suggestedName !== null ? (
                    <span className={`${chipTone('default')} hover:bg-panel`}>
                      → {s.suggestedName}
                    </span>
                  ) : (
                    <span className="text-warn">{zh.skills.cleanupDialog.noSuggestion}</span>
                  )}
                </label>
              )),
            )}
        </div>
      </DialogPanel>
    </Dialog>
  )
}
