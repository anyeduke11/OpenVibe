import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { FlowTemplateOut, ProjectCreateInput } from '@openvibe/shared'
import { useFlowTemplates } from '../../hooks/useFlows'
import { useProjectMutations } from '../../hooks/useProjects'
import { zh } from '../../i18n/zh'
import { Dialog, DialogPanel } from '../ui/Dialog'
import { toast } from '../ui/Toaster'
import { btnGhost, btnPrimary, chipCls, inputCls, labelCls } from '../ui/styles'

const STEPS = [zh.projects.wizard.step1, zh.projects.wizard.step2, zh.projects.wizard.step3]

/** 创建向导三步（m5 FR-1.2）：基本信息 → 选流程模板 →（可选）关联标准包 */
export function ProjectWizard(props: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [localPath, setLocalPath] = useState('')
  const [flowTemplateId, setFlowTemplateId] = useState('')
  const flows = useFlowTemplates()
  const { create } = useProjectMutations()
  const navigate = useNavigate()

  const items = flows.data?.items ?? []

  const next = () => {
    if (step === 0) {
      if (name.trim() === '') {
        toast(zh.projects.wizard.nameRequired, 'error')
        return
      }
      const path = localPath.trim()
      if (path !== '' && !path.startsWith('/')) {
        toast(zh.projects.wizard.absoluteRequired, 'error')
        return
      }
    }
    if (step === 1 && flowTemplateId === '') {
      toast(zh.projects.wizard.flowRequired, 'error')
      return
    }
    setStep((s) => Math.min(STEPS.length - 1, s + 1))
  }

  const submit = () => {
    const input: ProjectCreateInput = {
      name: name.trim(),
      flowTemplateId,
      ...(localPath.trim() === '' ? {} : { localPath: localPath.trim() }),
    }
    create.mutate(input, {
      onSuccess: (project) => {
        toast(zh.projects.wizard.created)
        if (project.localPathWarning !== null) {
          toast(project.localPathWarning, 'error')
        }
        props.onClose()
        navigate(`/projects/${project.id}`)
      },
      onError: (e: Error) => toast(e.message, 'error'),
    })
  }

  const radio = (t: FlowTemplateOut) => (
    <label
      key={t.id}
      className={`flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm ${
        flowTemplateId === t.id ? 'border-brand bg-brand-soft' : 'border-zinc-200 bg-white'
      }`}
    >
      <input
        type="radio"
        name="flowTemplate"
        className="mt-1"
        checked={flowTemplateId === t.id}
        onChange={() => setFlowTemplateId(t.id)}
      />
      <span className="min-w-0">
        <span className="font-medium">{t.name}</span>
        <span className={`${chipCls} ml-2 border-zinc-200 bg-zinc-50 text-zinc-500`}>
          {t.builtin ? zh.flows.builtin : zh.flows.custom}
        </span>
        <span className="block truncate text-[11px] text-zinc-500">
          {t.stages.map((s) => s.name).join(' → ')}
        </span>
      </span>
    </label>
  )

  return (
    <Dialog open={props.open} onOpenChange={(o) => (o ? undefined : props.onClose())}>
      <DialogPanel
        title={`${zh.projects.newProject} · ${STEPS[step] ?? ''}`}
        width="w-[min(680px,100vw)]"
        footer={
          <>
            <span className="mr-auto text-[11px] text-zinc-400">
              {String(step + 1)} / {String(STEPS.length)}
            </span>
            <button
              className={btnGhost}
              disabled={step === 0}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
              {zh.projects.wizard.prev}
            </button>
            {step < 2 ? (
              <button className={btnPrimary} onClick={next}>
                {zh.projects.wizard.next}
              </button>
            ) : (
              <button className={btnPrimary} disabled={create.isPending} onClick={submit}>
                {create.isPending ? zh.editor.saving : zh.projects.wizard.create}
              </button>
            )}
          </>
        }
      >
        {step === 0 && (
          <div className="space-y-3 text-sm">
            <div>
              <label className={labelCls}>{zh.projects.wizard.name}</label>
              <input
                className={inputCls}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="OpenVibe"
              />
            </div>
            <div>
              <label className={labelCls}>{zh.projects.wizard.localPath}</label>
              <input
                className={`${inputCls} mono`}
                value={localPath}
                onChange={(e) => setLocalPath(e.target.value)}
                placeholder="/Users/you/work/my-project"
              />
              <p className="mt-1 text-[11px] text-zinc-400">{zh.projects.wizard.localPathHint}</p>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-2 text-sm">
            {items.length === 0 && <p className="text-zinc-500">{zh.projects.wizard.flowNone}</p>}
            {items.map(radio)}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-2 text-sm">
            <p className="text-zinc-600">{zh.projects.wizard.packSkip}</p>
            <p className="text-[11px] text-zinc-400">{zh.projects.wizard.packHint}</p>
            <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
              {`${name} · ${items.find((t) => t.id === flowTemplateId)?.name ?? ''} · ${
                localPath === '' ? zh.projects.noPath : localPath
              }`}
            </p>
          </div>
        )}
      </DialogPanel>
    </Dialog>
  )
}
