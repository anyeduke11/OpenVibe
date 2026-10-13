import { zh } from '../../i18n/zh'
import { usePlaybooksMd } from '../../hooks/usePlaybooks'
import { toast } from '../ui/Toaster'
import { btnGhost } from '../ui/styles'

/** PLAYBOOKS.md 只读预览（m4 FR-6）：服务端确定性渲染，前端不再加工字节 */
export function PlaybooksMdPreview(props: { playbookIds: string[] }) {
  const { playbookIds } = props
  const query = usePlaybooksMd(playbookIds)
  const content = query.data?.content ?? ''

  const download = () => {
    const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'PLAYBOOKS.md'
    a.click()
    URL.revokeObjectURL(url)
    toast(zh.playbooks.preview.downloaded)
  }

  if (playbookIds.length === 0) {
    return <p className="text-sm text-ink-faint">{zh.playbooks.preview.empty}</p>
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="tabular-nums text-xs text-ink-muted">
          {zh.playbooks.selection.label(playbookIds.length)}
        </span>
        <span className="ml-auto" />
        <button
          className={btnGhost}
          disabled={content === ''}
          onClick={() =>
            void navigator.clipboard
              .writeText(content)
              .then(() => toast(zh.playbooks.preview.copied))
              .catch(() => toast(zh.copyModal.copyFailed, 'error'))
          }
        >
          {zh.playbooks.preview.copy}
        </button>
        <button className={btnGhost} disabled={content === ''} onClick={download}>
          {zh.playbooks.preview.download}
        </button>
      </div>
      {query.isError && <p className="text-sm text-danger">{query.error.message}</p>}
      {query.isLoading && <p className="text-sm text-ink-faint">{zh.common.loading}</p>}
      {content !== '' && (
        <pre className="mono min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded-md border border-line bg-panel-sunk p-3 text-[12px] leading-relaxed text-ink-body">
          {content}
        </pre>
      )}
      <p className="text-[11px] text-ink-faint">{zh.playbooks.preview.note}</p>
    </div>
  )
}
