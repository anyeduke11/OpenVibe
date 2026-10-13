import { useMemo, useState } from 'react'
import {
  LIMITS,
  PLAYBOOK_STATUS,
  utf8ByteLength,
  type DevLogEvidence,
  type PlaybookOut,
} from '@openvibe/shared'
import { zh } from '../../i18n/zh'
import { usePlaybookMutations } from '../../hooks/usePlaybooks'
import { usePromptList } from '../../hooks/usePrompts'
import { useSkillList } from '../../hooks/useSkills'
import { useTermList } from '../../hooks/useTerms'
import { Dialog, DialogPanel } from '../ui/Dialog'
import { toast } from '../ui/Toaster'
import { btnGhost, btnPrimary, chipCls, inputCls, labelCls } from '../ui/styles'

/** 四段字节余量条：超限即红，提交按钮同步禁用（前端先拦一道，服务端仍是唯一权威） */
function ByteMeter(props: { text: string; max: number }) {
  const { text, max } = props
  const used = utf8ByteLength(text)
  const over = used > max
  return (
    <span className={`tabular-nums text-[11px] ${over ? 'text-danger' : 'text-ink-faint'}`}>
      {used} / {max} B
    </span>
  )
}

function Field(props: {
  label: string
  hint?: string
  max?: number
  value: string
  onChange: (v: string) => void
  textarea?: boolean
  rows?: number
}) {
  const { label, hint, max, value, onChange, textarea, rows } = props
  return (
    <div>
      <div className="mb-1 flex items-baseline gap-2">
        <label className={labelCls}>{label}</label>
        {hint && <span className="text-[11px] text-ink-faint">{hint}</span>}
        <span className="ml-auto" />
        {max !== undefined && <ByteMeter text={value} max={max} />}
      </div>
      {textarea ? (
        <textarea
          className={inputCls}
          rows={rows ?? 4}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  )
}

type RelatedKind = 'relatedPromptIds' | 'relatedTermIds' | 'relatedSkillIds'

/** 关联资产选择器：三个域各一栏，勾选即写回 id 数组；后端对自指/不存在一律拒（m4 §6.2） */
function RelatedPicker(props: {
  kind: RelatedKind
  picked: string[]
  onChange: (ids: string[]) => void
  excludeIds: Set<string>
}) {
  const { kind, picked, onChange, excludeIds } = props
  const [q, setQ] = useState('')

  const prompts = usePromptList({ page: 1, size: 50, q: q.trim() || undefined })
  const terms = useTermList()
  const skills = useSkillList(q.trim())

  const options = useMemo(() => {
    if (kind === 'relatedPromptIds')
      return (prompts.data?.items ?? []).map((p) => ({ id: p.id, label: p.title }))
    if (kind === 'relatedTermIds')
      return (terms.data?.items ?? []).map((t) => ({ id: t.id, label: t.zh || t.en || t.id }))
    return (skills.data?.items ?? []).map((s) => ({ id: s.id, label: s.name }))
  }, [kind, prompts.data, terms.data, skills.data])

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return options
      .filter((o) => !excludeIds.has(o.id))
      .filter((o) => (needle === '' ? true : o.label.toLowerCase().includes(needle)))
      .slice(0, 40)
  }, [options, q, excludeIds])

  const toggle = (id: string) =>
    onChange(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id])

  return (
    <div className="rounded-md border border-line-hair p-2">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-xs font-medium text-ink-muted">
          {zh.playbooks.editor.related[kind]}
        </span>
        <input
          className={`${inputCls} h-7 w-40 py-0.5 text-xs`}
          placeholder={zh.playbooks.editor.relatedFilter}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="flex max-h-24 flex-wrap gap-1 overflow-auto">
        {visible.length === 0 && (
          <span className="text-[11px] text-ink-faint">{zh.playbooks.editor.relatedNone}</span>
        )}
        {visible.map((o) => {
          const on = picked.includes(o.id)
          return (
            <button
              key={o.id}
              className={`${chipCls} ${
                on ? 'border-accent bg-accent-soft text-accent-deep' : 'border-line text-ink-muted'
              }`}
              onClick={() => toggle(o.id)}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function PlaybookEditorDrawer(props: {
  playbook: PlaybookOut | null
  /** 复盘回流预填：source='reflow' 且状态锁草稿（m4 FR-5.1，人工确认是唯一入库路径） */
  prefill?: Partial<Pick<PlaybookOut, 'scenario' | 'problem' | 'practice' | 'antiPractice'>>
  prefillSource?: PlaybookOut['source']
  open: boolean
  onClose: () => void
  onSaved: (playbook: PlaybookOut) => void
}) {
  const { playbook, open, onClose, onSaved, prefillSource = 'manual' } = props
  const isNew = playbook === null

  const [scenario, setScenario] = useState(
    playbook?.scenario ?? props.prefill?.scenario ?? '',
  )
  const [problem, setProblem] = useState(playbook?.problem ?? props.prefill?.problem ?? '')
  const [practice, setPractice] = useState(playbook?.practice ?? props.prefill?.practice ?? '')
  const [antiPractice, setAntiPractice] = useState(
    playbook?.antiPractice ?? props.prefill?.antiPractice ?? '',
  )
  const [verified, setVerified] = useState(playbook?.verified ?? false)
  const [evidence, setEvidence] = useState<DevLogEvidence[]>(playbook?.evidence ?? [])
  const [relatedPromptIds, setRelatedPromptIds] = useState<string[]>(playbook?.relatedPromptIds ?? [])
  const [relatedTermIds, setRelatedTermIds] = useState<string[]>(playbook?.relatedTermIds ?? [])
  const [relatedSkillIds, setRelatedSkillIds] = useState<string[]>(playbook?.relatedSkillIds ?? [])
  const [tags, setTags] = useState((playbook?.tags ?? []).join('、'))
  const [status, setStatus] = useState<PlaybookOut['status']>(playbook?.status ?? 'draft')

  const { create, update } = usePlaybookMutations()
  const selfId = playbook?.id ?? ''

  const overLimit =
    utf8ByteLength(scenario) > LIMITS.playbookScenarioMaxBytes ||
    utf8ByteLength(problem) > LIMITS.playbookProblemMaxBytes ||
    utf8ByteLength(practice) > LIMITS.playbookPracticeMaxBytes ||
    utf8ByteLength(antiPractice) > LIMITS.playbookAntiPracticeMaxBytes
  const missingRequired = scenario.trim() === '' || problem.trim() === '' || practice.trim() === ''
  // FR-4.1/§6.1 的前端同向拦截：置真必须随带证据，否则「亲测有效」是谎报
  const verifiedWithoutEvidence = verified && evidence.length === 0
  const blocked = overLimit || missingRequired || verifiedWithoutEvidence

  const setEvidenceAt = (i: number, patch: Partial<DevLogEvidence>) =>
    setEvidence((prev) => prev.map((e, idx) => (idx === i ? { ...e, ...patch } : e)))

  const submit = () => {
    const tagList = tags
      .split(/[、,，\s]+/)
      .map((t) => t.trim())
      .filter((t) => t !== '')
    const base = {
      scenario,
      problem,
      practice,
      antiPractice,
      verified,
      evidence,
      relatedPromptIds,
      relatedTermIds,
      relatedSkillIds,
      tags: tagList,
      status,
    }
    if (isNew) {
      // CreateInput 的三个必填段是 `z.input` 侧的可选位（.default 在解析后才落），
      // 但此刻已被 blocked 校验挡过为空，直接断言成必填比传 `?? ''` 更诚实。
      create.mutate(
        { ...base, source: prefillSource, scenario, problem, practice },
        {
          onSuccess: (created) => {
            toast(zh.playbooks.editor.saved)
            onSaved(created)
          },
          onError: (e) => toast(e.message, 'error'),
        },
      )
      return
    }
    update.mutate(
      { id: selfId, patch: base },
      {
        onSuccess: (updated) => {
          toast(zh.playbooks.editor.saved)
          onSaved(updated)
        },
        onError: (e) => toast(e.message, 'error'),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogPanel
        variant="sheet"
        title={isNew ? zh.playbooks.editor.createTitle : zh.playbooks.editor.editTitle}
        footer={
          <>
            <button className={btnGhost} onClick={onClose}>
              {zh.editor.cancel}
            </button>
            <button
              className={btnPrimary}
              disabled={blocked || create.isPending || update.isPending}
              onClick={submit}
            >
              {create.isPending || update.isPending
                ? zh.editor.saving
                : isNew
                  ? zh.editor.create
                  : zh.editor.save}
            </button>
          </>
        }
      >
      <div className="space-y-4">
        <Field
          label={zh.playbooks.editor.scenario}
          max={LIMITS.playbookScenarioMaxBytes}
          value={scenario}
          onChange={setScenario}
        />
        <Field
          label={zh.playbooks.editor.problem}
          max={LIMITS.playbookProblemMaxBytes}
          textarea
          value={problem}
          onChange={setProblem}
        />
        <Field
          label={zh.playbooks.editor.practice}
          max={LIMITS.playbookPracticeMaxBytes}
          textarea
          rows={6}
          value={practice}
          onChange={setPractice}
        />
        <Field
          label={zh.playbooks.editor.antiPractice}
          hint={zh.playbooks.editor.antiPracticeHint}
          max={LIMITS.playbookAntiPracticeMaxBytes}
          textarea
          rows={3}
          value={antiPractice}
          onChange={setAntiPractice}
        />

        {/* 实战标记与使用证据（m4 FR-4）：置真是显式动作，且必须随带证据 */}
        <div className="rounded-md border border-line-hair p-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={verified}
              onChange={(e) => setVerified(e.target.checked)}
            />
            {zh.playbooks.editor.verified}
          </label>
          <p className="mt-1 text-[11px] text-ink-faint">{zh.playbooks.editor.verifiedHint}</p>

          {verified && (
            <div className="mt-2 space-y-2">
              {evidence.map((e, i) => (
                <div key={i} className="space-y-1 rounded border border-line-hair p-2">
                  <input
                    className={inputCls}
                    placeholder={zh.playbooks.editor.evidenceCommand}
                    value={e.command}
                    onChange={(ev) => setEvidenceAt(i, { command: ev.target.value })}
                  />
                  <input
                    className={inputCls}
                    placeholder={zh.playbooks.editor.evidenceSummary}
                    value={e.resultSummary}
                    onChange={(ev) => setEvidenceAt(i, { resultSummary: ev.target.value })}
                  />
                  <button
                    className="text-[11px] text-ink-faint underline hover:text-ink-body"
                    onClick={() => setEvidence((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    {zh.playbooks.editor.evidenceRemove}
                  </button>
                </div>
              ))}
              <button
                className={btnGhost}
                onClick={() => setEvidence((prev) => [...prev, { command: '', resultSummary: '' }])}
              >
                {zh.playbooks.editor.evidenceAdd}
              </button>
              {verifiedWithoutEvidence && (
                <p className="text-[11px] text-danger">{zh.playbooks.editor.verifiedNeedsEvidence}</p>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <span className={labelCls}>{zh.playbooks.editor.relatedLabel}</span>
          <RelatedPicker
            kind="relatedPromptIds"
            picked={relatedPromptIds}
            onChange={setRelatedPromptIds}
            excludeIds={new Set([selfId])}
          />
          <RelatedPicker
            kind="relatedTermIds"
            picked={relatedTermIds}
            onChange={setRelatedTermIds}
            excludeIds={new Set([selfId])}
          />
          <RelatedPicker
            kind="relatedSkillIds"
            picked={relatedSkillIds}
            onChange={setRelatedSkillIds}
            excludeIds={new Set([selfId])}
          />
        </div>

        <Field
          label={zh.editor.tags}
          value={tags}
          onChange={setTags}
        />

        <div>
          <label className={labelCls}>{zh.editor.status}</label>
          <select
            className={`${inputCls} w-auto appearance-none`}
            value={status}
            onChange={(e) => setStatus(e.target.value as PlaybookOut['status'])}
          >
            {PLAYBOOK_STATUS.map((s) => (
              <option key={s} value={s}>
                {zh.playbooks.status[s]}
              </option>
            ))}
          </select>
        </div>

        {!isNew && playbook?.source === 'openvibe-seed' && (
          <p className="text-xs text-ink-muted">{zh.playbooks.editor.seedEdited}</p>
        )}
      </div>
      </DialogPanel>
    </Dialog>
  )
}
