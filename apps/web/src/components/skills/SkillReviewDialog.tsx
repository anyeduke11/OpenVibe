import { useEffect } from 'react'
import type { SkillReviewItem } from '@openvibe/shared'
import { Dialog, DialogPanel } from '../ui/Dialog'
import { Icon, type IconName } from '../ui/icons'
import { btnGhost, btnPrimary, chipTone, emptyHintCls, noteCls } from '../ui/styles'
import { useSkillReview } from '../../hooks/useSkills'
import { zh } from '../../i18n/zh'

// 四级结论各自落在四支形制色上：审查面本来就有图标 + 文字，颜色只是第三重信号
const LEVEL_CHIP: Record<SkillReviewItem['level'], string> = {
  ok: chipTone('ok'),
  info: chipTone('info'),
  warn: chipTone('warn'),
  fail: chipTone('danger'),
}

// 图标只从 icons.tsx 取（不引图标库，入口 JS 余量只有 ~37kB）
const LEVEL_ICON: Record<SkillReviewItem['level'], IconName> = {
  ok: 'check',
  info: 'info',
  warn: 'warn',
  fail: 'alert',
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
          {review.isPending && (
            <p className="text-xs text-ink-muted">{zh.skills.reviewDialog.running}</p>
          )}
          {review.isError && <p className="text-xs text-warn">{(review.error as Error).message}</p>}
          {report !== undefined && (
            <>
              <p className={`${noteCls('info')} text-ink-body`}>
                {zh.skills.reviewDialog.summary(
                  report.summary.ok,
                  report.summary.info,
                  report.summary.warn,
                  report.summary.fail,
                )}
              </p>
              {problematic.length === 0 ? (
                <div className={emptyHintCls}>
                  <p>{zh.skills.reviewDialog.allClear}</p>
                  <button
                    className={btnGhost}
                    disabled={review.isPending}
                    onClick={() => review.mutate({})}
                  >
                    {zh.skills.reviewDialog.rerun}
                  </button>
                </div>
              ) : (
                <div className="max-h-80 space-y-2 overflow-auto">
                  {problematic.map((item) => (
                    <details key={item.skillId} className="rounded-md border border-line p-2">
                      <summary className="flex cursor-pointer items-center gap-2 text-xs">
                        <span className={`${LEVEL_CHIP[item.level]} gap-1`}>
                          <Icon name={LEVEL_ICON[item.level]} size={11} />
                          {zh.skills.reviewDialog.levels[item.level]}
                        </span>
                        <span className="truncate font-medium text-ink-body">{item.name}</span>
                        <span className="text-ink-faint">
                          {String(item.issues.length)} {zh.skills.reviewDialog.issues}
                        </span>
                      </summary>
                      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[11px] text-ink-muted">
                        {item.issues.map((issue) => (
                          <li key={issue.code}>
                            <span className="mono text-ink-faint">
                              [{issue.severity}] {issue.code}
                            </span>{' '}
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
