import { useMemo, useState } from 'react'
import type { PromptOut } from '@openvibe/shared'
import { zh } from '../../i18n/zh'
import { Dialog, DialogPanel } from '../ui/Dialog'
import { toast } from '../ui/Toaster'
import { btnGhost, btnPrimary, inputCls, labelCls } from '../ui/styles'

/** 变量填充弹窗（m1 FR-2.2）：变量必填、实时替换预览、一键剪贴板、无残留占位符 */
export function VariableFillModal(props: {
  prompt: PromptOut
  open: boolean
  onClose: () => void
}) {
  const { prompt } = props
  const [values, setValues] = useState<Record<string, string>>({})
  const filled = prompt.variables.every((v) => (values[v] ?? '').trim() !== '')
  const preview = useMemo(
    () =>
      prompt.content.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_-]*)\s*\}\}/g, (whole, name: string) =>
        (values[name] ?? '').trim() === '' ? whole : (values[name] as string),
      ),
    [prompt.content, values],
  )

  const doCopy = async () => {
    try {
      await navigator.clipboard.writeText(preview)
      toast(zh.copyModal.copied)
      props.onClose()
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
            <button className={btnPrimary} disabled={!filled} onClick={() => void doCopy()}>
              {zh.copyModal.copyBtn}
            </button>
          </>
        }
      >
        {prompt.variables.length === 0 ? (
          <p className="text-sm text-zinc-600">
            {prompt.content.slice(0, 400)}
            {prompt.content.length > 400 ? '…' : ''}
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3">
              <p className="text-xs font-medium text-zinc-500">{zh.copyModal.fillVars}</p>
              {prompt.variables.map((v) => (
                <div key={v}>
                  <label className={labelCls}>
                    <span className="mono">{`{{${v}}}`}</span>
                    <span className="ml-1 text-red-600">{zh.copyModal.required}</span>
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
        )}
      </DialogPanel>
    </Dialog>
  )
}
