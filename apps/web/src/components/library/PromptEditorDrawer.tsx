import { useState } from 'react'
import * as Tabs from '@radix-ui/react-tabs'
import {
  PLATFORM_MARKS,
  PROMPT_STATUS,
  USE_AS,
  extractVariables,
  type PlatformMark,
  type PromptCreateInput,
  type PromptOut,
  type UseAs,
} from '@openvibe/shared'
import { usePromptMutations } from '../../hooks/usePrompts'
import { zh } from '../../i18n/zh'
import { Dialog, DialogPanel } from '../ui/Dialog'
import { toast } from '../ui/Toaster'
import { btnGhost, btnPrimary, inputCls, labelCls } from '../ui/styles'
import { ReflowOriginLine } from '../projects/ReflowActions'
import { CodeEditor } from './CodeEditor'
import { MarkdownPreview } from './MarkdownPreview'
import { VersionHistoryPanel } from './VersionHistoryPanel'

/** 回流预填（m5 FR-7.1）：content 取日志选中段落，状态落 draft */
export interface PromptPrefill {
  title?: string
  content?: string
  tags?: string
  status?: PromptOut['status']
}

interface FormState {
  title: string
  description: string
  content: string
  tags: string
  folderPath: string
  platformMarks: PlatformMark[]
  useAs: UseAs
  status: PromptOut['status']
}

function initial(prompt: PromptOut | null, prefill?: PromptPrefill): FormState {
  return {
    title: prompt?.title ?? '',
    description: prompt?.description ?? '',
    content: prompt?.content ?? '',
    tags: prompt?.tags.join(', ') ?? '',
    folderPath: prompt?.folderPath ?? '/',
    platformMarks: prompt?.platformMarks ?? [],
    useAs: prompt?.useAs ?? 'reference',
    status: prompt?.status ?? 'draft',
    ...prefill,
  }
}

const selectCls = `${inputCls} appearance-none`

/** 编辑抽屉（m1 FR-1）：CodeMirror 双栏 + 元数据表单 + 版本历史入口 */
export function PromptEditorDrawer(props: {
  prompt: PromptOut | null
  open: boolean
  onClose: () => void
  onSaved: (prompt: PromptOut) => void
  prefill?: PromptPrefill
}) {
  const { prompt } = props
  const [form, setForm] = useState<FormState>(() => initial(prompt, props.prefill))
  const [showPreview, setShowPreview] = useState(true)
  const { create, update } = usePromptMutations()
  const pending = create.isPending || update.isPending
  const vars = extractVariables(form.content)

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const payloadTags = form.tags
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t !== '')

  const save = () => {
    if (form.title.trim() === '' || form.content.trim() === '') {
      toast('标题与正文必填', 'error')
      return
    }
    if (!form.folderPath.startsWith('/')) {
      toast('folderPath 必须以 / 开头', 'error')
      return
    }
    const shared: Omit<PromptCreateInput, 'title'> = {
      description: form.description,
      content: form.content,
      tags: payloadTags,
      folderPath: form.folderPath,
      platformMarks: form.platformMarks,
      useAs: form.useAs,
      status: form.status,
    }
    const afterSave = (r: { prompt: PromptOut; warnings: string[] }) => {
      if (r.warnings.length > 0) toast(r.warnings.join('；'), 'error')
      toast(zh.editor.saved)
      props.onSaved(r.prompt)
    }
    const onSaveError = (e: Error) => toast(e.message, 'error')

    if (prompt === null) {
      create.mutate(
        { title: form.title.trim(), ...shared },
        { onSuccess: (r) => afterSave({ prompt: r, warnings: r.warnings }), onError: onSaveError },
      )
    } else {
      update.mutate(
        { id: prompt.id, patch: { title: form.title.trim(), ...shared } },
        { onSuccess: (r) => afterSave(r), onError: onSaveError },
      )
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={(o) => (o ? undefined : props.onClose())}>
      <DialogPanel
        title={prompt === null ? zh.editor.createTitle : zh.editor.editTitle}
        variant="sheet"
        footer={
          <>
            <span className="mr-auto flex items-center gap-2 text-[11px] text-zinc-400">
              {prompt !== null && <ReflowOriginLine assetId={prompt.id} />}
              {prompt === null ? '' : `updated ${prompt.updatedAt}`}
            </span>
            <button className={btnGhost} onClick={props.onClose}>
              {zh.editor.cancel}
            </button>
            <button className={btnPrimary} disabled={pending} onClick={save}>
              {pending ? zh.editor.saving : prompt === null ? zh.editor.create : zh.editor.save}
            </button>
          </>
        }
      >
        <Tabs.Root defaultValue="edit">
          <Tabs.List className="mb-3 flex gap-1 border-b border-zinc-100">
            <Tabs.Trigger
              className="px-3 py-2 text-sm data-[state=active]:border-b-2 data-[state=active]:border-brand data-[state=active]:font-medium"
              value="edit"
            >
              {prompt === null ? zh.editor.createTitle : zh.library.edit}
            </Tabs.Trigger>
            {prompt !== null && (
              <Tabs.Trigger
                className="px-3 py-2 text-sm data-[state=active]:border-b-2 data-[state=active]:border-brand data-[state=active]:font-medium"
                value="versions"
              >
                {zh.editor.versions}
              </Tabs.Trigger>
            )}
          </Tabs.List>

          <Tabs.Content value="edit" className="space-y-3 outline-none">
            <div>
              <label className={labelCls}>{zh.editor.title}</label>
              <input
                className={inputCls}
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>{zh.editor.description}</label>
              <input
                className={inputCls}
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
              />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className={`${labelCls} mb-0`}>{zh.editor.content}</label>
                <label className="flex items-center gap-1 text-[11px] text-zinc-500">
                  <input
                    type="checkbox"
                    checked={showPreview}
                    onChange={(e) => setShowPreview(e.target.checked)}
                  />
                  {zh.editor.preview}
                </label>
              </div>
              <div
                className={`grid gap-2 rounded-md border border-zinc-200 p-2 ${showPreview ? 'grid-cols-2' : 'grid-cols-1'}`}
              >
                <div className="h-72 overflow-hidden rounded border border-zinc-100">
                  <CodeEditor value={form.content} onChange={(v) => set('content', v)} />
                </div>
                {showPreview && (
                  <div className="html-md h-72 overflow-auto rounded border border-zinc-100 p-2">
                    <MarkdownPreview source={form.content} />
                  </div>
                )}
              </div>
              {vars.length > 0 && (
                <p className="mt-1.5 text-[11px] text-zinc-500">
                  {zh.editor.variablesDetected}：
                  <span className="mono ml-1 rounded bg-amber-50 px-1.5 py-0.5 text-amber-800">
                    {`{{${vars.join(', ')}}}`}
                  </span>
                  {form.useAs === 'rule' && (
                    <span className="ml-2 text-amber-700">{zh.editor.ruleVariableWarning}</span>
                  )}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{zh.editor.tags}</label>
                <input
                  className={inputCls}
                  value={form.tags}
                  onChange={(e) => set('tags', e.target.value)}
                  placeholder="重构, 测试"
                />
              </div>
              <div>
                <label className={labelCls}>{zh.editor.folderPath}</label>
                <input
                  className={`${inputCls} mono`}
                  value={form.folderPath}
                  onChange={(e) => set('folderPath', e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls}>{zh.editor.useAs}</label>
                <select
                  className={selectCls}
                  value={form.useAs}
                  onChange={(e) => set('useAs', e.target.value as UseAs)}
                >
                  {USE_AS.map((u) => (
                    <option key={u} value={u}>
                      {zh.library.useAs[u]}（{u}）
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>{zh.editor.status}</label>
                <select
                  className={selectCls}
                  value={form.status}
                  onChange={(e) => set('status', e.target.value as PromptOut['status'])}
                >
                  {PROMPT_STATUS.map((s) => (
                    <option key={s} value={s}>
                      {zh.library.status[s]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className={labelCls}>{zh.editor.platformMarks}</label>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {PLATFORM_MARKS.map((m) => (
                  <label key={m} className="flex items-center gap-1.5 text-xs text-zinc-600">
                    <input
                      type="checkbox"
                      checked={form.platformMarks.includes(m)}
                      onChange={(e) =>
                        set(
                          'platformMarks',
                          e.target.checked
                            ? [...form.platformMarks, m]
                            : form.platformMarks.filter((x) => x !== m),
                        )
                      }
                    />
                    <span className="mono">{m}</span>
                  </label>
                ))}
              </div>
            </div>
          </Tabs.Content>

          <Tabs.Content value="versions" className="outline-none">
            {prompt !== null && (
              <VersionHistoryPanel
                promptId={prompt.id}
                currentContent={form.content}
                onRestored={(content) => set('content', content)}
              />
            )}
          </Tabs.Content>
        </Tabs.Root>
      </DialogPanel>
    </Dialog>
  )
}
