import { useState } from 'react'
import type { DevLogOut, PromptOut, TermOut } from '@openvibe/shared'
import { useDevLogMutations, useReflowOrigin } from '../../hooks/useDevLog'
import { useTermList } from '../../hooks/useTerms'
import { zh } from '../../i18n/zh'
import { PromptEditorDrawer } from '../library/PromptEditorDrawer'
import { TermEditorDrawer } from '../terms/TermEditorDrawer'
import { toast } from '../ui/Toaster'
import { btnGhost, chipCls } from '../ui/styles'

function selectedText(): string {
  return (window.getSelection()?.toString() ?? '').trim()
}

/** 回流快捷入口（m5 FR-7）：日志正文（或选中段落）→ 术语候选 / 提示词草稿，成功后回写 linkedAssetIds */
export function ReflowActions(props: { entry: DevLogOut; projectName: string }) {
  const { entry, projectName } = props
  const [mode, setMode] = useState<'term' | 'prompt' | null>(null)
  const [draft, setDraft] = useState('')
  const terms = useTermList()
  const { linkAsset } = useDevLogMutations(entry.projectId)

  const openWith = (next: 'term' | 'prompt') => {
    setDraft(selectedText() || entry.body)
    setMode(next)
  }

  const afterCreate = (assetId: string) => {
    linkAsset.mutate(
      { logId: entry.id, assetId },
      {
        onSuccess: () => toast(zh.projects.reflow.linked),
        onError: () => toast(zh.projects.reflow.linkFailed, 'error'),
      },
    )
    setMode(null)
  }

  const onTermSaved = (term: TermOut) => afterCreate(term.id)
  const onPromptSaved = (prompt: PromptOut) => afterCreate(prompt.id)

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <button className={btnGhost} onClick={() => openWith('term')}>
        {zh.projects.reflow.term}
      </button>
      <button className={btnGhost} onClick={() => openWith('prompt')}>
        {zh.projects.reflow.prompt}
      </button>
      <span className="text-[11px] text-zinc-400">{zh.projects.reflow.pickHint}</span>
      {entry.linkedAssetIds.length > 0 && (
        <span className={`${chipCls} ml-auto border-zinc-200 bg-zinc-50 text-zinc-600`}>
          {zh.projects.devlog.linkedAssets(entry.linkedAssetIds.length)}
        </span>
      )}

      {mode === 'term' && (
        <TermEditorDrawer
          term={null}
          allTerms={terms.data?.items ?? []}
          open
          onClose={() => setMode(null)}
          onSaved={onTermSaved}
          prefill={{
            definition: draft,
            status: 'draft',
            source: `project:${projectName}`,
          }}
        />
      )}
      {mode === 'prompt' && (
        <PromptEditorDrawer
          prompt={null}
          open
          onClose={() => setMode(null)}
          onSaved={onPromptSaved}
          prefill={{
            title: entry.title === '' ? `${projectName} ${entry.displayNo}` : entry.title,
            content: draft,
            status: 'draft',
          }}
        />
      )}
    </div>
  )
}

/** 资产侧反链（m5 FR-7.2）：编辑抽屉底部显示「来源：项目 X 的 DEV-0007」 */
export function ReflowOriginLine(props: { assetId: string }) {
  const origin = useReflowOrigin(props.assetId)
  const o = origin.data?.origin
  if (o === null || o === undefined) return null
  return (
    <span className="text-[11px] text-brand">{zh.projects.reflow.sourceLabel(o.projectName, o.displayNo)}</span>
  )
}
