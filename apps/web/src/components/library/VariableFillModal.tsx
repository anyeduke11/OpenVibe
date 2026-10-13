import { useMemo, useState } from 'react'
import type { PromptOut } from '@openvibe/shared'
import { fillVariables, interviewPrompt } from '@openvibe/shared'
import { zh } from '../../i18n/zh'
import { Dialog, DialogPanel } from '../ui/Dialog'
import { toast } from '../ui/Toaster'
import { btnGhost, btnPrimary, inputCls, labelCls } from '../ui/styles'

/** 两段式文案随组件走（DEV-0084） */
const zhSeg = {
  seg1: '第 1 段 · 问参提示词（先发给 AI 取参数值）',
  seg1Copy: '复制第 1 段',
  seg1Copied: '第 1 段已复制，发给 AI 后把回答填到下面',
}

/** 变量填充弹窗（m1 FR-2.2）：变量必填、实时替换预览、一键剪贴板、无残留占位符。
 *  DEV-0084 两段式化：顶部附自动生成的「问参提示词」（发给 AI 取参数值），
 *  取回后填入下方输入框；替换逻辑走共享 fillVariables（与编辑抽屉同一实现） */
export function VariableFillModal(props: {
  prompt: PromptOut
  open: boolean
  onClose: () => void
}) {
  const { prompt } = props
  const [values, setValues] = useState<Record<string, string>>({})
  const filled = prompt.variables.every((v) => (values[v] ?? '').trim() !== '')
  const interview = useMemo(() => interviewPrompt(prompt.variables), [prompt.variables])
  const preview = useMemo(() => fillVariables(prompt.content, values), [prompt.content, values])

  const copy = async (text: string, done: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast(done)
    } catch {
      toast(zh.copyModal.copyFailed, 'error')
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={(o) => (o ? undefined : props.onClose())}>
      <DialogPanel
        title={zh.copyModal.title(prompt.title)}
        footer={
          <>
            <button className={btnGhost} onClick={props.onClose}>
              {zh.editor.cancel}
            </button>
            <button className={btnPrimary} disabled={!filled} onClick={() => void copy(preview, zh.copyModal.copied)}>
              {zh.copyModal.copyBtn}
            </button>
          </>
        }
      >
        {prompt.variables.length === 0 ? (
          <p className="text-sm text-ink-muted">
            {prompt.content.slice(0, 400)}
            {prompt.content.length > 400 ? '…' : ''}
          </p>
        ) : (
          <div className="space-y-4">
            <div className="rounded-md border border-line bg-panel-2 p-3">
              <p className="text-xs font-medium text-ink-body">{zhSeg.seg1}</p>
              <textarea
                readOnly
                className={`${inputCls} mono mt-1 h-24 resize-none whitespace-pre-wrap`}
                value={interview}
              />
              <div className="mt-1 flex justify-end">
                <button className={btnGhost} onClick={() => void copy(interview, zhSeg.seg1Copied)}>
                  {zhSeg.seg1Copy}
                </button>
              </div>
            </div>
            <div className="space-y-4">
              <div className="grid gap-3">
                <p className="text-xs font-medium text-ink-muted">{zh.copyModal.fillVars}</p>
                {prompt.variables.map((v) => (
                  <div key={v}>
                    <label className={labelCls}>
                      <span className="mono">{`{{${v}}}`}</span>
                      <span className="ml-1 text-danger">{zh.copyModal.required}</span>
                    </label>
                    <input
                      className={inputCls}
                      value={values[v] ?? ''}
                      onChange={(e) => setValues((prev) => ({ ...prev, [v]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
              <div>
                <p className={labelCls}>{zh.copyModal.preview}</p>
                <textarea
                  readOnly
                  className={`${inputCls} mono h-56 resize-none whitespace-pre-wrap`}
                  value={preview}
                />
              </div>
            </div>
          </div>
        )}
      </DialogPanel>
    </Dialog>
  )
}
