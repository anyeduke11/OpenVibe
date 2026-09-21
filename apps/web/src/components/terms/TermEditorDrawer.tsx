import { useMemo, useState } from 'react'
import {
  CONTROLLED_TAG_VOCAB,
  TERM_STATUS,
  bidirectionalRelatedIds,
  type TermCreateInput,
  type TermOut,
} from '@openvibe/shared'
import { useTermMutations } from '../../hooks/useTerms'
import { zh } from '../../i18n/zh'
import { Dialog, DialogPanel } from '../ui/Dialog'
import { toast } from '../ui/Toaster'
import { btnGhost, btnPrimary, chipCls, inputCls, labelCls } from '../ui/styles'

interface FormState {
  zh: string
  en: string
  aliases: string
  definition: string
  example: string
  tags: string[]
  relatedTermIds: string[]
  status: TermOut['status']
}

const csv = (value: string): string[] =>
  value
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v !== '')

function initial(term: TermOut | null): FormState {
  return {
    zh: term?.zh ?? '',
    en: term?.en ?? '',
    aliases: term?.aliases.join(', ') ?? '',
    definition: term?.definition ?? '',
    example: term?.example ?? '',
    tags: term?.tags ?? [],
    relatedTermIds: term?.relatedTermIds ?? [],
    status: term?.status ?? 'active',
  }
}

const areaCls = `${inputCls} min-h-24 font-mono text-[13px] leading-relaxed`

/** 词条编辑抽屉（m3 FR-1）：中英文名/别名/定义/示例/受控标签/相关词 + 双向展示预览 */
export function TermEditorDrawer(props: {
  term: TermOut | null
  allTerms: TermOut[]
  open: boolean
  onClose: () => void
  onSaved: (term: TermOut) => void
}) {
  const { term, allTerms } = props
  const [form, setForm] = useState<FormState>(() => initial(term))
  const [tagDraft, setTagDraft] = useState('')
  const [relatedFilter, setRelatedFilter] = useState('')
  const { create, update } = useTermMutations()
  const pending = create.isPending || update.isPending

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const labelOf = (id: string): string => {
    const t = allTerms.find((x) => x.id === id)
    return t === undefined ? `${id}（已删除）` : `${t.zh || t.en}｜${t.en || t.zh}`
  }

  const candidates = useMemo(() => {
    const needle = relatedFilter.trim().toLowerCase()
    return allTerms
      .filter((t) => t.id !== term?.id)
      .filter((t) =>
        needle === ''
          ? true
          : `${t.zh ?? ''} ${t.en ?? ''} ${t.aliases.join(' ')}`.toLowerCase().includes(needle),
      )
      .slice(0, 60)
  }, [allTerms, relatedFilter, term?.id])

  // m3 FR-1.2：反向引用一并展示（存储仍是单向）
  const shownRelated = useMemo(
    () => (term === null ? [] : bidirectionalRelatedIds(allTerms, term.id)),
    [allTerms, term],
  )

  const toggleTag = (tag: string) =>
    set(
      'tags',
      form.tags.includes(tag) ? form.tags.filter((t) => t !== tag) : [...form.tags, tag],
    )

  const save = () => {
    if (form.zh.trim() === '' && form.en.trim() === '') {
      toast(zh.terms.editor.nameRequired, 'error')
      return
    }
    if (form.definition.trim() === '') {
      toast(zh.terms.editor.definitionRequired, 'error')
      return
    }
    if (term !== null && form.relatedTermIds.includes(term.id)) {
      toast(zh.terms.editor.selfRelated, 'error')
      return
    }
    const payload = {
      zh: form.zh.trim(),
      en: form.en.trim(),
      aliases: csv(form.aliases),
      definition: form.definition,
      example: form.example,
      tags: form.tags,
      relatedTermIds: form.relatedTermIds,
      status: form.status,
    } satisfies TermCreateInput
    const onOk = (created: TermOut) => {
      toast(zh.terms.editor.saved)
      props.onSaved(created)
    }
    const onErr = (e: Error) => toast(e.message, 'error')
    if (term === null) {
      create.mutate(payload, { onSuccess: onOk, onError: onErr })
    } else {
      update.mutate({ id: term.id, patch: payload }, { onSuccess: onOk, onError: onErr })
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={(o) => (o ? undefined : props.onClose())}>
      <DialogPanel
        variant="sheet"
        title={term === null ? zh.terms.editor.createTitle : zh.terms.editor.editTitle}
        footer={
          <>
            {term !== null && (
              <span className="mr-auto text-xs text-zinc-500">
                {zh.terms.editor.sourceLabel}：
                {term.source === 'openvibe-seed' ? zh.terms.source.seed : term.source}
                {term.source === 'openvibe-seed' && ` · ${zh.terms.editor.seedEdited}`}
              </span>
            )}
            <button className={btnGhost} onClick={props.onClose}>
              {zh.editor.cancel}
            </button>
            <button className={btnPrimary} disabled={pending} onClick={save}>
              {pending ? zh.terms.editor.saving : term === null ? zh.terms.editor.create : zh.terms.editor.save}
            </button>
          </>
        }
      >
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{zh.terms.editor.zh}</label>
              <input
                className={inputCls}
                value={form.zh}
                onChange={(e) => set('zh', e.target.value)}
                placeholder="规则漂移"
              />
            </div>
            <div>
              <label className={labelCls}>{zh.terms.editor.en}</label>
              <input
                className={inputCls}
                value={form.en}
                onChange={(e) => set('en', e.target.value)}
                placeholder="rule drift"
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>{zh.terms.editor.aliases}</label>
            <input
              className={inputCls}
              value={form.aliases}
              onChange={(e) => set('aliases', e.target.value)}
              placeholder="drift, 规则失效"
            />
          </div>

          <div>
            <label className={labelCls}>{zh.terms.editor.definition}</label>
            <textarea
              className={areaCls}
              value={form.definition}
              onChange={(e) => set('definition', e.target.value)}
            />
          </div>

          <div>
            <label className={labelCls}>{zh.terms.editor.example}</label>
            <textarea
              className={`${areaCls} min-h-16`}
              value={form.example}
              onChange={(e) => set('example', e.target.value)}
            />
          </div>

          <div>
            <label className={labelCls}>{zh.terms.editor.tags}</label>
            <div className="flex flex-wrap gap-1.5">
              {CONTROLLED_TAG_VOCAB.map((tag) => {
                const on = form.tags.includes(tag)
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`rounded-full border px-2.5 py-0.5 text-xs ${
                      on
                        ? 'border-brand bg-brand-soft text-brand'
                        : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300'
                    }`}
                  >
                    {tag}
                  </button>
                )
              })}
            </div>
            {form.tags.filter((t) => !(CONTROLLED_TAG_VOCAB as readonly string[]).includes(t)).length >
              0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {form.tags
                  .filter((t) => !(CONTROLLED_TAG_VOCAB as readonly string[]).includes(t))
                  .map((t) => (
                    <span key={t} className={`${chipCls} border-zinc-200 bg-zinc-50 text-zinc-600`}>
                      #{t}
                      <button className="ml-1 text-zinc-400 hover:text-zinc-700" onClick={() => toggleTag(t)}>
                        ✕
                      </button>
                    </span>
                  ))}
              </div>
            )}
            <div className="mt-1.5 flex items-center gap-2">
              <input
                className={`${inputCls} w-44`}
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                placeholder={zh.terms.editor.customTag}
              />
              <button
                className={btnGhost}
                onClick={() => {
                  const t = tagDraft.trim()
                  if (t === '') return
                  if (!form.tags.includes(t)) set('tags', [...form.tags, t])
                  setTagDraft('')
                }}
              >
                {zh.terms.editor.addTag}
              </button>
            </div>
          </div>

          <div>
            <label className={labelCls}>{zh.terms.editor.related}</label>
            <input
              className={`${inputCls} mb-1.5`}
              value={relatedFilter}
              onChange={(e) => setRelatedFilter(e.target.value)}
              placeholder={zh.terms.editor.relatedFilter}
            />
            <div className="max-h-44 overflow-auto rounded-md border border-zinc-200">
              {candidates.length === 0 && (
                <p className="px-3 py-2 text-xs text-zinc-400">{zh.terms.editor.relatedNone}</p>
              )}
              {candidates.map((t) => (
                <label
                  key={t.id}
                  className="flex items-center gap-2 border-b border-zinc-100 px-3 py-1.5 text-xs last:border-0 hover:bg-zinc-50"
                >
                  <input
                    type="checkbox"
                    checked={form.relatedTermIds.includes(t.id)}
                    onChange={() =>
                      set(
                        'relatedTermIds',
                        form.relatedTermIds.includes(t.id)
                          ? form.relatedTermIds.filter((id) => id !== t.id)
                          : [...form.relatedTermIds, t.id],
                      )
                    }
                  />
                  <span className="text-zinc-800">{t.zh || t.en}</span>
                  <span className="text-zinc-400">{t.en || t.zh}</span>
                </label>
              ))}
            </div>
            {form.relatedTermIds.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {form.relatedTermIds.map((id) => (
                  <span key={id} className={`${chipCls} border-zinc-200 bg-white text-zinc-600`}>
                    {labelOf(id)}
                    <button
                      className="ml-1 text-zinc-400 hover:text-zinc-700"
                      onClick={() => set('relatedTermIds', form.relatedTermIds.filter((x) => x !== id))}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
            {shownRelated.length > 0 && (
              <p className="mt-1.5 text-[11px] text-zinc-500">
                {zh.terms.editor.bidirectional}：{shownRelated.map(labelOf).join('、')}
              </p>
            )}
          </div>

          <div>
            <label className={labelCls}>{zh.terms.editor.status}</label>
            <select
              className={`${inputCls} w-40 appearance-none`}
              value={form.status}
              onChange={(e) => set('status', e.target.value as TermOut['status'])}
            >
              {TERM_STATUS.map((s) => (
                <option key={s} value={s}>
                  {zh.terms.status[s]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </DialogPanel>
    </Dialog>
  )
}
