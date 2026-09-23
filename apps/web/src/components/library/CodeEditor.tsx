import { lazy, Suspense, type ComponentProps, type ReactElement } from 'react'

/**
 * 编辑器（dev-plan §5.4：CodeMirror 仅抽屉内懒加载，列表页不进包）。
 * lang-markdown 也得在同一个动态边界里取：它一旦被静态 import，@codemirror/view 与 @lezer/*
 * 就会被提到「多个抽屉共享」的 chunk 里，580 kB 挂在编辑器之外（T8f 实测）。
 */
type CodeMirrorProps = ComponentProps<typeof import('@uiw/react-codemirror').default>

const MarkdownEditor = lazy(async () => {
  const [cm, { markdown }] = await Promise.all([
    import('@uiw/react-codemirror'),
    import('@codemirror/lang-markdown'),
  ])
  const extensions = [markdown()]
  return {
    default: (props: CodeMirrorProps): ReactElement => (
      <cm.default {...props} extensions={extensions} />
    ),
  }
})

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
      <MarkdownEditor
        value={props.value}
        height={props.height ?? '100%'}
        readOnly={props.readOnly ?? false}
        basicSetup={{ lineNumbers: false, foldGutter: false, autocompletion: false }}
        onChange={props.onChange ?? (() => undefined)}
      />
    </Suspense>
  )
}
