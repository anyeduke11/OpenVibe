import { lazy, Suspense } from 'react'
import { markdown } from '@codemirror/lang-markdown'

const CodeMirrorLazy = lazy(() => import('@uiw/react-codemirror'))

/** 编辑器（dev-plan §5.4：CodeMirror 仅抽屉内懒加载，列表页不进包） */
export function CodeEditor(props: {
  value: string
  onChange?: (next: string) => void
  height?: string
  readOnly?: boolean
}) {
  return (
    <Suspense
      fallback={<div className="h-full min-h-40 rounded-md border border-zinc-200 bg-zinc-50" />}
    >
      <CodeMirrorLazy
        value={props.value}
        height={props.height ?? '100%'}
        readOnly={props.readOnly ?? false}
        basicSetup={{ lineNumbers: false, foldGutter: false, autocompletion: false }}
        extensions={[markdown()]}
        onChange={props.onChange ?? (() => undefined)}
      />
    </Suspense>
  )
}
