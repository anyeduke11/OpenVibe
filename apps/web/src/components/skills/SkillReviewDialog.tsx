import { useEffect } from 'react'
import type { SkillReviewItem } from '@openvibe/shared'
import { Dialog, DialogPanel } from '../ui/Dialog'
import { chipCls } from '../ui/styles'
import { btnGhost, btnPrimary } from '../ui/styles'
import { useSkillReview } from '../../hooks/useSkills'
import { zh } from '../../i18n/zh'

const LEVEL_CHIP: Record<SkillReviewItem['level'], string> = {
  ok: 'border-line bg-fill-soft text-ink-muted',
  info: 'border-line bg-transparent text-ink-subtle',
  warn: 'border-warn-300 bg-warn-50 text-warn-800',
  fail: 'border-danger-600 bg-danger-50 text-danger-700',
}

/** 内置审查（DEV-0067）：规范面 + 质量面 + 泄漏面；打开即全量审查，明细按条目折叠 */
export function SkillReviewDialog(props: { open: boolean; onClose: () => void }) {
  const review = useSkillReview()

  useEffect(() => {
    if (props.open) review.mutate({})
    // 仅在打开时跑一次（依赖刻意的窄化）
  }, [props.open])

  const report = review.data
  const problematic = report?.items.filter((i) => i.level !== 'ok') ?? []

  return (
    <Dialog open={props.open} onOpenChange={(o) => (o ? undefined : props.onClose())}>
      <DialogPanel
        title={zh.skills.reviewDialog.title}
        footer={
          <>
            <button className={btnGhost} onClick={props.onClose}>
              {zh.editor.close}
            </button>
            <button
              className={btnPrimary}
              disabled={review.isPending}
              onClick={() => review.mutate({})}
            >
              {review.isPending ? zh.skills.reviewDialog.running : zh.skills.reviewDialog.rerun}
            </button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          {review.isPending && <p className="text-xs text-ink-subtle">{zh.skills.reviewDialog.running}</p>}
          {review.isError && <p className="text-xs text-warn-800">{(review.error as Error).message}</p>}
          {report !== undefined && (
            <>
              <p className="rounded-md border border-line bg-fill-soft p-2 text-xs">
                {zh.skills.reviewDialog.summary(
                  report.summary.ok,
                  report.summary.info,
                  report.summary.warn,
                  report.summary.fail,
                )}
              </p>
              {problematic.length === 0 ? (
                <p className="py-6 text-center text-sm text-ink-subtle">{zh.skills.reviewDialog.allClear}</p>
              ) : (
                <div className="max-h-80 space-y-2 overflow-auto">
                  {problematic.map((item) => (
                    <details key={item.skillId} className="rounded-md border border-line p-2">
                      <summary className="flex cursor-pointer items-center gap-2 text-xs">
                        <span className={`${chipCls} ${LEVEL_CHIP[item.level]}`}>
                          {zh.skills.reviewDialog.levels[item.level]}
                        </span>
                        <span className="truncate font-medium text-ink">{item.name}</span>
                        <span className="text-ink-faint">
                          {String(item.issues.length)} {zh.skills.reviewDialog.issues}
                        </span>
                      </summary>
                      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[11px] text-ink-muted">
                        {item.issues.map((issue) => (
                          <li key={issue.code}>
                            <span className="mono text-ink-faint">[{issue.severity}] {issue.code}</span>{' '}
                            {issue.message}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </DialogPanel>
    </Dialog>
  )
}
