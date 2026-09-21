import type { TermsOrderBy } from '@openvibe/shared'
import { zh } from '../../i18n/zh'
import { useTermsMd } from '../../hooks/useTerms'
import { toast } from '../ui/Toaster'
import { btnGhost } from '../ui/styles'

/** TERMS.md 只读预览（m3 FR-4.1）：服务端确定性渲染，前端不再加工字节 */
export function TermsMdPreview(props: { termIds: string[]; orderBy: TermsOrderBy }) {
  const { termIds, orderBy } = props
  const query = useTermsMd(termIds, orderBy)
  const content = query.data?.content ?? ''

  const download = () => {
    const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'TERMS.md'
    a.click()
    URL.revokeObjectURL(url)
    toast(zh.terms.preview.downloaded)
  }

  if (termIds.length === 0) return <p className="text-sm text-zinc-400">{zh.terms.preview.empty}</p>

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-500">{zh.terms.selection.label(termIds.length)}</span>
        <span className="ml-auto" />
        <button
          className={btnGhost}
          disabled={content === ''}
          onClick={() =>
            void navigator.clipboard
              .writeText(content)
              .then(() => toast(zh.terms.preview.copied))
              .catch(() => toast(zh.copyModal.copyFailed, 'error'))
          }
        >
          {zh.terms.preview.copy}
        </button>
        <button className={btnGhost} disabled={content === ''} onClick={download}>
          {zh.terms.preview.download}
        </button>
      </div>
      {query.isError && <p className="text-sm text-red-600">{query.error.message}</p>}
      {query.isLoading && <p className="text-sm text-zinc-400">加载中…</p>}
      {content !== '' && (
        <pre className="mono min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded-md border border-zinc-200 bg-zinc-50 p-3 text-[12px] leading-relaxed text-zinc-800">
          {content}
        </pre>
      )}
      <p className="text-[11px] text-zinc-400">{zh.terms.preview.note}</p>
    </div>
  )
}
