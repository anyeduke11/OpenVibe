import { useMemo, useState } from 'react'
import { fillVariables, interviewPrompt, remainingVariables } from '@openvibe/shared'
import { toast } from '../ui/Toaster'
import { btnGhost, btnPrimary, inputCls, labelCls } from '../ui/styles'

/** 文案随组件走（组件在懒加载 chunk，文案不占入口体积） */
const zhFill = {
  seg1: '第 1 段 · 问参提示词（先发给 AI 取参数值）',
  seg1Copy: '复制第 1 段',
  seg1Copied: '第 1 段已复制，发给 AI 后把回答填到下面',
  seg2: '第 2 段 · 正式提示词（填好参数即得）',
  placeholder: '把 AI 回答的值粘进来…',
  preview: '正式正文（实时生成）',
  remaining: (n: number, names: string) => `未填 ${n} 个（保留占位符）：{{${names}}}`,
  copy: '复制第 2 段（完整提示词）',
  copied: '完整提示词已复制到剪贴板',
}

/**
 * 填参生成面板（DEV-0083 两段式化，DEV-0084）：参数化提示词按两段使用——
 * 第 1 段是自动生成的「问参提示词」（发给 AI 逐项取参数值）；第 2 段把取回的值
 * 填进输入框，实时生成正式正文并复制。未填的变量保留占位符原样。
 */
export default function VariableFillPanel(props: { content: string; vars: string[] }) {
  const { content, vars } = props
  const [values, setValues] = useState<Record<string, string>>({})
  const interview = useMemo(() => interviewPrompt(vars), [vars])
  const generated = useMemo(() => fillVariables(content, values), [content, values])
  const remaining = useMemo(() => remainingVariables(generated), [generated])

  const copy = async (text: string, done: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast(done)
    } catch {
      toast('复制失败（剪贴板不可用）', 'error')
    }
  }

  return (
    <div className="mt-2 space-y-3 rounded-md border border-line bg-panel-2 p-3">
      <div>
        <p className="text-xs font-medium text-ink-body">{zhFill.seg1}</p>
        <textarea
          readOnly
          className={`${inputCls} mono mt-1 h-24 resize-none whitespace-pre-wrap`}
          value={interview}
        />
        <div className="mt-1 flex justify-end">
          <button className={btnGhost} onClick={() => void copy(interview, zhFill.seg1Copied)}>
            {zhFill.seg1Copy}
          </button>
        </div>
      </div>
      <div>
        <p className="text-xs font-medium text-ink-body">{zhFill.seg2}</p>
        <div className="mt-1 grid grid-cols-2 gap-2">
          {vars.map((v) => (
            <div key={v}>
              <label className={labelCls}>
                <span className="mono">{`{{${v}}}`}</span>
              </label>
              <input
                className={inputCls}
                placeholder={zhFill.placeholder}
                value={values[v] ?? ''}
                onChange={(e) => setValues((prev) => ({ ...prev, [v]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <div className="mt-2">
          <p className={labelCls}>
            {zhFill.preview}
            {remaining.length > 0 && (
              <span className="ml-2 text-warn">
                {zhFill.remaining(remaining.length, remaining.join(', '))}
              </span>
            )}
          </p>
          <textarea
            readOnly
            className={`${inputCls} mono h-40 resize-none whitespace-pre-wrap`}
            value={generated}
          />
        </div>
        <div className="flex justify-end">
          <button className={btnPrimary} onClick={() => void copy(generated, zhFill.copied)}>
            {zhFill.copy}
          </button>
        </div>
      </div>
    </div>
  )
}
