import { useMemo, useState } from 'react'
import type { FlowTemplateOut, Stage } from '@openvibe/shared'
import { extractVariables, fillVariables, remainingVariables } from '@openvibe/shared'
import { zh } from '../../i18n/zh'
import { Dialog, DialogPanel } from '../ui/Dialog'
import { toast } from '../ui/Toaster'
import { btnGhost, btnPrimary, inputCls, labelCls, noteCls, segCls, segItemCls } from '../ui/styles'
import { useFlowMutations } from '../../hooks/useFlows'

/** 文案随组件走（不走中央 zh.ts）：本组件整体在懒加载 chunk，文案不占入口体积 */
const zhFillRemain = (n: number, names: string) => `未填 ${n} 个（保留占位符）：{{${names}}}`
const zhRun = {
  title: '问答运行',
  progress: (cur: number, total: number) => `第 ${cur}/${total} 段`,
  prev: '上一段',
  next: '下一段',
  last: '已是最后一段',
  noPrompt: '该阶段没有提示词模板，按检查清单人工执行即可。',
  answerPlaceholder: '填写该参数的值…',
  inherited: '已从前面继承/可修改',
  generated: '本段正式正文（实时生成）',
  copyStage: '复制本段正文',
  copied: (name: string) => `「${name}」正文已复制`,
  checklistOf: (n: number) => `本阶段检查清单（${n} 项）`,
  saveAsCustom: '另存为自定义（可编辑副本）',
  savedAsCustom: '已创建自定义副本，可在自定义区编辑',
}

/**
 * 问答运行（DEV-0074）：把带 Stage.prompt 的流程模板走成一段一段的问答——
 * 每段提取 {{变量}} 生成输入框，填完实时生成该段正式正文；**同名变量跨段继承**
 * （第 1 段填的 repo_url 在后续段自动带出，即「问答之间有联系」）；
 * 逐段可复制。内置模板不可编辑，可「另存为自定义」拿一份可编辑副本。
 */
export function FlowRunDialog(props: {
  template: FlowTemplateOut
  open: boolean
  onClose: () => void
}) {
  const { template } = props
  const stages = template.stages
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const { create } = useFlowMutations()

  const stage: Stage | undefined = stages[step]
  const stagePrompt = stage?.prompt ?? ''
  const vars = useMemo(() => extractVariables(stagePrompt), [stagePrompt])
  const generated = useMemo(() => fillVariables(stagePrompt, answers), [stagePrompt, answers])
  const remaining = useMemo(() => remainingVariables(generated), [generated])

  const setAnswer = (name: string, value: string) =>
    setAnswers((prev) => ({ ...prev, [name]: value }))

  const copyCurrent = async () => {
    try {
      await navigator.clipboard.writeText(generated)
      toast(zhRun.copied(stage?.name ?? ''))
    } catch {
      toast(zh.copyModal.copyFailed, 'error')
    }
  }

  const saveAsCustom = () => {
    create.mutate(
      {
        name: `${template.name}（自定义）`,
        kind: 'custom',
        stages: stages.map((s) => ({
          name: s.name,
          checklist: s.checklist,
          artifacts: s.artifacts,
    prompt: s.prompt ?? '',
        })),
      },
      {
        onSuccess: () => toast(zhRun.savedAsCustom),
        onError: (e: Error) => toast(e.message, 'error'),
      },
    )
  }

  return (
    <Dialog open={props.open} onOpenChange={(o) => (o ? undefined : props.onClose())}>
      <DialogPanel
        variant="sheet"
        title={`${template.name} · ${zhRun.title}`}
        footer={
          <>
            {template.builtin && (
              <button
                className={`${btnGhost} mr-auto`}
                disabled={create.isPending}
                onClick={saveAsCustom}
              >
                {zhRun.saveAsCustom}
              </button>
            )}
            <button
              className={btnGhost}
              disabled={step === 0}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
              {zhRun.prev}
            </button>
            <button
              className={btnPrimary}
              disabled={step >= stages.length - 1}
              onClick={() => setStep((s) => Math.min(stages.length - 1, s + 1))}
            >
              {step >= stages.length - 1 ? zhRun.last : zhRun.next}
            </button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          {/* 阶段导航走 segmented（DESIGN.md tabs）：它是「当前走到第几段」的控件，不是状态 chip */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={segCls}>
              {stages.map((s, i) => (
                <button
                  key={s.name}
                  type="button"
                  aria-pressed={i === step}
                  className={segItemCls}
                  onClick={() => setStep(i)}
                >
                  {`${String(i + 1)}. ${s.name}`}
                </button>
              ))}
            </span>
            <span className="ml-auto text-[11px] tabular-nums text-ink-faint">
              {zhRun.progress(step + 1, stages.length)}
            </span>
          </div>

          {stage !== undefined && (
            <>
              {stagePrompt.trim() === '' ? (
                <p className={`${noteCls('info')} text-ink-body`}>
                  {zhRun.noPrompt}
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {vars.map((v) => (
                      <div key={v}>
                        <label className={labelCls}>
                          <span className="mono">{`{{${v}}}`}</span>
                          {answers[v] !== undefined && answers[v] !== '' && (
                            <span className="ml-1 text-[10px] text-ink-faint">
                              {zhRun.inherited}
                            </span>
                          )}
                        </label>
                        <input
                          className={inputCls}
                          placeholder={zhRun.answerPlaceholder}
                          value={answers[v] ?? ''}
                          onChange={(e) => setAnswer(v, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                  <div>
                    <p className={labelCls}>
                      {zhRun.generated}
                      {remaining.length > 0 && (
                        <span className="ml-2 text-warn">
                          {zhFillRemain(remaining.length, remaining.join(', '))}
                        </span>
                      )}
                    </p>
                    <textarea
                      readOnly
                      className={`${inputCls} mono h-48 resize-none whitespace-pre-wrap`}
                      value={generated}
                    />
                  </div>
                  <div className="flex justify-end">
                    <button className={btnPrimary} onClick={() => void copyCurrent()}>
                      {zhRun.copyStage}
                    </button>
                  </div>
                </>
              )}
              {stage.checklist.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-[11px] text-ink-muted">
                    {zhRun.checklistOf(stage.checklist.length)}
                  </summary>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-ink-muted">
                    {stage.checklist.map((c) => (
                      <li key={c.id}>{c.text}</li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
        </div>
      </DialogPanel>
    </Dialog>
  )
}
