import { useEffect, useState } from 'react'
import type { SkillCleanupPreview } from '@openvibe/shared'
import { Dialog, DialogPanel } from '../ui/Dialog'
import { toast, toastError } from '../ui/Toaster'
import { btnGhost, btnPrimary, emptyHintCls } from '../ui/styles'
import { useSkillCleanup, useSkillCleanupPreview } from '../../hooks/useSkillLibrary'
import { zh } from '../../i18n/zh'

/**
 * **清理失效条目**对话框（2026-10-30）。
 *
 * ## 判定（服务端算，前端只展示）
 *
 * 目录已消失 ∧ 无远程溯源 ∧ 无库内副本 ⇒ 内容彻底没了，台账留着它只是死记录。
 * 只删**台账行**，不动任何磁盘文件（原目录已经不存在了）。
 *
 * ## 为什么先预检再删
 *
 * 删除不可逆。预检把「会删哪些」摆出来，用户看到数量与名单再决定。
 * ⚠️ 可恢复的条目（有远程溯源或有库内副本）**不删** —— 它们只是目录没了，
 *   内容还在，重新下载或从库恢复即可。
 *
 * ## 预检必须「打开时现算」
 *
 * 预检结论的有效期由磁盘决定，不由时间决定 ⇒ 每次打开对话框都重新算一遍，
 * 不吃任何缓存（见 `useSkillCleanupPreview` 的注释）。清理完再算一遍，
 * 让对话框里的名单与磁盘保持同一时刻的真相。
 */
export function SkillCleanupBrokenDialog(props: { open: boolean; onClose: () => void }) {
  const preview = useSkillCleanupPreview()
  const run = useSkillCleanup()
  const [confirmed, setConfirmed] = useState(false)

  const report: SkillCleanupPreview | undefined = preview.data
  const doomed = report?.items.filter((i) => i.unrecoverable) ?? []
  const recoverable = report?.items.filter((i) => !i.unrecoverable) ?? []

  useEffect(() => {
    if (props.open) {
      setConfirmed(false)
      // 先 reset 再算：上一次的名单必须立刻下台，不能在重算期间继续挂在界面上
      preview.reset()
      preview.mutate()
    }
    // 仅在打开时算一次（依赖刻意的窄化）
  }, [props.open])

  const close = () => {
    setConfirmed(false)
    props.onClose()
  }

  return (
    <Dialog open={props.open} onOpenChange={(o) => (o ? undefined : close())}>
      <DialogPanel
        title={zh.skills.cleanupBroken.title}
        footer={
          <>
            <button className={btnGhost} onClick={close}>
              {zh.editor.close}
            </button>
            <button
              className={btnPrimary}
              disabled={doomed.length === 0 || run.isPending || !confirmed}
              onClick={() =>
                run.mutate(
                  {},
                  {
                    onSuccess: (r) => {
                      toast(zh.skills.cleanupBroken.done(r.removed))
                      setConfirmed(false)
                      // 清完再算一遍：对话框里的名单必须与此刻的磁盘一致
                      preview.mutate()
                    },
                    onError: (e) => toastError(e),
                  },
                )
              }
            >
              {run.isPending ? zh.skills.cleanupBroken.running : zh.skills.cleanupBroken.run}
            </button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <p className="text-xs text-ink-muted">{zh.skills.cleanupBroken.hint}</p>

          {preview.isPending && (
            <p className="text-xs text-ink-faint">{zh.skills.cleanupBroken.scanning}</p>
          )}

          {report !== undefined && report.items.length === 0 && (
            <div className={emptyHintCls}>
              <p>{zh.skills.cleanupBroken.none}</p>
            </div>
          )}

          {report !== undefined && report.items.length > 0 && (
            <>
              <p className="text-xs text-ink-body">
                {zh.skills.cleanupBroken.stale(report.summary.stale)} ·{' '}
                <span className="text-warn">
                  {zh.skills.cleanupBroken.unrecoverable(report.summary.unrecoverable)}
                </span>{' '}
                · {zh.skills.cleanupBroken.recoverable(report.summary.recoverable)}
              </p>

              {doomed.length > 0 && (
                <div className="max-h-40 space-y-1 overflow-auto rounded-md border border-line p-2">
                  {doomed.map((i) => (
                    <div key={i.id} className="flex items-center gap-2 text-xs">
                      <span className="font-medium text-ink-body">{i.name}</span>
                      <span className="mono truncate text-ink-faint">{i.skillDir}</span>
                    </div>
                  ))}
                </div>
              )}

              {recoverable.length > 0 && (
                <p className="text-[11px] text-ink-muted">
                  以下 {String(recoverable.length)} 条仍可恢复（可重新下载或有库内副本），本次不动：
                  {recoverable
                    .slice(0, 8)
                    .map((i) => i.name)
                    .join('、')}
                  {recoverable.length > 8 ? ' 等' : ''}
                </p>
              )}

              {/* 不可逆动作必须显式确认一次 —— 不能只靠点按钮就删 */}
              {!confirmed && doomed.length > 0 && (
                <label className="flex items-start gap-2 text-xs text-ink-body">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  <span>{zh.skills.cleanupBroken.confirm(doomed.length)}</span>
                </label>
              )}
            </>
          )}
        </div>
      </DialogPanel>
    </Dialog>
  )
}
