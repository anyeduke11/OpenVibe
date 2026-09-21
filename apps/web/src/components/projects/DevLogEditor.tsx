import { useState } from 'react'
import type { DevLogType } from '@openvibe/shared'
import { useDevLogMutations } from '../../hooks/useDevLog'
import { zh } from '../../i18n/zh'
import { Dialog, DialogPanel } from '../ui/Dialog'
import { toast } from '../ui/Toaster'
import { CodeEditor } from '../library/CodeEditor'
import { btnGhost, btnPrimary, inputCls, labelCls } from '../ui/styles'

function stamp(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${String(d.getFullYear())}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 正文占位模板（m5 FR-5.2）：与全局 AGENTS 记录规范同构；关联文件/测试证据走结构化字段 */
function templateFor(type: DevLogType): string {
  if (type === 'CHECK') {
    return [
      `- **时间**: ${stamp()}`,
      '- **类型**: 质量检查',
      '- **检查范围**: ',
      '- **发现问题**: ',
      '- **结论**: ',
      '',
    ].join('\n')
  }
  return [
    `- **时间**: ${stamp()}`,
    '- **类型**: 功能开发',
    '- **问题描述**: ',
    '- **实现思路**: ',
    '- **核心变更**:',
    '  - ',
    '- **潜在风险**: ',
    '',
  ].join('\n')
}

/** 新建日志（m5 FR-5.1）：编号由服务端分配，正文预填模板 */
export function DevLogEditor(props: {
  projectId: string
  type: DevLogType
  open: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const { type } = props
  const [title, setTitle] = useState('')
  const [body, setBody] = useState(() => templateFor(type))
  const [files, setFiles] = useState('')
  const [command, setCommand] = useState('')
  const [result, setResult] = useState('')
  const { create } = useDevLogMutations(props.projectId)

  const save = () => {
    if ((command === '') !== (result === '')) {
      toast(zh.projects.devlog.evidenceRequired, 'error')
      return
    }
    const relatedFiles = files
      .split('\n')
      .map((f) => f.trim())
      .filter((f) => f !== '')
    create.mutate(
      {
        type,
        title: title.trim(),
        body,
        relatedFiles,
        ...(command === '' ? {} : { evidence: { command, resultSummary: result } }),
      },
      {
        onSuccess: (log) => {
          toast(zh.projects.devlog.created(log.displayNo))
          props.onSaved()
        },
        onError: (e: Error) => toast(e.message, 'error'),
      },
    )
  }

  return (
    <Dialog open={props.open} onOpenChange={(o) => (o ? undefined : props.onClose())}>
      <DialogPanel
        variant="sheet"
        title={zh.projects.devlog.newEntry(type)}
        footer={
          <>
            <span className="mr-auto text-[11px] text-zinc-400">{zh.projects.devlog.prefillHint}</span>
            <button className={btnGhost} onClick={props.onClose}>
              {zh.editor.cancel}
            </button>
            <button className={btnPrimary} disabled={create.isPending} onClick={save}>
              {create.isPending ? zh.editor.saving : zh.editor.save}
            </button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <div>
            <label className={labelCls}>{zh.projects.devlog.fields.title}</label>
            <input
              className={inputCls}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="T5c Web 四页落地"
            />
          </div>
          <div>
            <label className={labelCls}>{zh.projects.devlog.fields.body}</label>
            <div className="h-72 overflow-hidden rounded-md border border-zinc-200">
              <CodeEditor value={body} onChange={setBody} />
            </div>
          </div>
          <div>
            <label className={labelCls}>{zh.projects.devlog.fields.relatedFiles}</label>
            <textarea
              className={`${inputCls} mono min-h-16 text-[13px]`}
              value={files}
              onChange={(e) => setFiles(e.target.value)}
              placeholder={'apps/web/src/pages/ProjectsPage.tsx\napps/server/src/routes/projects.ts'}
            />
          </div>
          <div>
            <label className={labelCls}>{zh.projects.devlog.fields.evidence}</label>
            <div className="grid grid-cols-2 gap-2">
              <input
                className={`${inputCls} mono`}
                value={command}
                placeholder={zh.projects.devlog.fields.command}
                onChange={(e) => setCommand(e.target.value)}
              />
              <input
                className={inputCls}
                value={result}
                placeholder={zh.projects.devlog.fields.result}
                onChange={(e) => setResult(e.target.value)}
              />
            </div>
            <p className="mt-1 text-[11px] text-zinc-400">{zh.projects.devlog.evidenceHint}</p>
          </div>
        </div>
      </DialogPanel>
    </Dialog>
  )
}
