import { lazy, Suspense } from 'react'

const MarkdownLazy = lazy(() => import('react-markdown'))

/** 正文双栏右栏预览（m1 FR-1.2） */
export function MarkdownPreview(props: { source: string }) {
  return (
    <Suspense fallback={<div className="h-full rounded-md border border-zinc-200 bg-zinc-50" />}>
      <div className="md-preview h-full overflow-auto px-1">
        <MarkdownLazy>{props.source}</MarkdownLazy>
      </div>
    </Suspense>
  )
}
