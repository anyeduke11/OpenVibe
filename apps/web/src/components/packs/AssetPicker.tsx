import { useState } from 'react'
import { usePlaybookList } from '../../hooks/usePlaybooks'
import { usePromptAggregates } from '../../hooks/usePrompts'
import { useSkillList } from '../../hooks/useSkills'
import { useTermList } from '../../hooks/useTerms'
import { zh } from '../../i18n/zh'
import { chipTone, inputCls, noteCls } from '../ui/styles'

/** 选集四栏的 id 集合；同一形状复用给 STALE_SELECTION 明细（字段名与 resolve.ts 的 StaleDetails 一致） */
export interface AssetIds {
  promptIds: string[]
  termIds: string[]
  skillIds: string[]
  playbookIds: string[]
}

interface AssetPickerProps {
  value: AssetIds
  stale: AssetIds
  onChange: (patch: Partial<AssetIds>) => void
}

/** 由 updatedAt 倒序（m6a FR-1.3「默认按最近更新排序」） */
function byUpdated<T extends { updatedAt: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
}

interface ColumnProps<T> {
  title: string
  rows: T[]
  label: (row: T) => string
  note: (row: T) => string
  badge: (row: T) => string
  ids: string[]
  staleIds: string[]
  onToggle: (id: string) => void
  onSelectAll: (ids: string[]) => void
  onClear: () => void
}

function Column<T extends { id: string }>(props: ColumnProps<T>) {
  const [q, setQ] = useState('')
  const trimmed = q.trim().toLowerCase()
  const shown =
    trimmed === ''
      ? props.rows
      : props.rows.filter((r) => props.label(r).toLowerCase().includes(trimmed))
  const pending = shown.map((r) => r.id).filter((id) => !props.ids.includes(id))
  const total = props.rows.length

  return (
    <section className="flex h-[62vh] min-h-0 flex-col rounded-lg border border-line bg-panel">
      <header className="flex items-center gap-2 border-b border-line-hair px-3 py-2">
        <h3 className="mr-auto text-xs font-medium text-ink-muted">{`${props.title}（${String(total)}）`}</h3>
        <span className="text-[11px] text-ink-faint">{zh.packs.wizard.picked(props.ids.length)}</span>
      </header>
      <div className="flex items-center gap-2 px-3 py-2">
        <input
          className={`${inputCls} text-xs`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={zh.packs.wizard.searchAsset}
        />
        <button
          className="shrink-0 text-[11px] text-accent hover:underline disabled:opacity-40"
          disabled={pending.length === 0}
          onClick={() => props.onSelectAll(pending)}
        >
          {zh.packs.wizard.selectAll}
        </button>
        <button
          className="shrink-0 text-[11px] text-ink-muted hover:underline disabled:opacity-40"
          disabled={props.ids.length === 0}
          onClick={props.onClear}
        >
          {zh.packs.wizard.clearSel}
        </button>
      </div>
      <ul className="min-h-0 flex-1 overflow-auto border-t border-line-hair px-1 pb-2">
        {shown.length === 0 && (
          <li className="px-3 py-2 text-xs text-ink-faint">{zh.packs.wizard.noneAvailable}</li>
        )}
        {shown.map((row) => {
          const isStale = props.staleIds.includes(row.id)
          return (
            <li key={row.id}>
              <label
                className={`flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-sm hover:bg-panel-2 ${
                  isStale ? 'bg-danger-soft text-danger' : ''
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={props.ids.includes(row.id)}
                  onChange={() => props.onToggle(row.id)}
                />
                <span className="min-w-0">
                  <span className="block truncate" title={props.label(row)}>
                    {props.label(row)}
                    <span className={`${chipTone('default')} ml-1.5`}>
                      {props.badge(row)}
                    </span>
                  </span>
                  <span className="block truncate text-[11px] text-ink-faint">{props.note(row)}</span>
                </span>
              </label>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** 步骤 3 四栏多选（m6a FR-1.3）：提示词取 active，术语、技巧与 skill 全列；STALE_SELECTION 明细标红 */
export function AssetPicker(props: AssetPickerProps) {
  const prompts = usePromptAggregates({ status: 'active' })
  const terms = useTermList()
  const skills = useSkillList('')
  const playbooks = usePlaybookList()
  const { value, stale, onChange } = props
  const staleAll = [
    ...stale.promptIds,
    ...stale.termIds,
    ...stale.skillIds,
    ...stale.playbookIds,
  ]

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <p className="text-xs text-ink-muted">{zh.packs.wizard.assetsHint}</p>
      {staleAll.length > 0 && (
        <p className={`${noteCls('danger')} text-ink-body`}>
          {zh.packs.preview.stale(staleAll.join(', '))}
        </p>
      )}
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-4">
        <Column
          title={zh.packs.wizard.promptsCol}
          rows={byUpdated(prompts.data?.items ?? [])}
          label={(r) => r.title}
          note={(r) => r.description}
          badge={(r) => (r.useAs === 'rule' ? zh.library.useAs.rule : zh.library.useAs.reference)}
          ids={value.promptIds}
          staleIds={stale.promptIds}
          onToggle={(id) => onChange({ promptIds: toggle(value.promptIds, id) })}
          onSelectAll={(ids) => onChange({ promptIds: [...value.promptIds, ...ids] })}
          onClear={() => onChange({ promptIds: [] })}
        />
        <Column
          title={zh.packs.wizard.termsCol}
          rows={byUpdated(terms.data?.items ?? [])}
          label={(r) => [r.zh, r.en].filter((x) => x !== undefined && x !== '').join(' / ')}
          note={(r) => r.definition}
          badge={(r) => (r.status === 'draft' ? zh.terms.status.draft : zh.terms.status.active)}
          ids={value.termIds}
          staleIds={stale.termIds}
          onToggle={(id) => onChange({ termIds: toggle(value.termIds, id) })}
          onSelectAll={(ids) => onChange({ termIds: [...value.termIds, ...ids] })}
          onClear={() => onChange({ termIds: [] })}
        />
        <Column
          title={zh.packs.wizard.skillsCol}
          rows={byUpdated(skills.data?.items ?? [])}
          label={(r) => r.name}
          note={(r) => r.description}
          badge={(r) => zh.skills.sources[r.source]}
          ids={value.skillIds}
          staleIds={stale.skillIds}
          onToggle={(id) => onChange({ skillIds: toggle(value.skillIds, id) })}
          onSelectAll={(ids) => onChange({ skillIds: [...value.skillIds, ...ids] })}
          onClear={() => onChange({ skillIds: [] })}
        />
        {/* M4 技巧栏：只列已发布的（草稿不产字节，m4 FR-6.2）；草稿仍在技巧库页里编辑 */}
        <Column
          title={zh.packs.wizard.playbooksCol}
          rows={byUpdated((playbooks.data?.items ?? []).filter((p) => p.status === 'published'))}
          label={(r) => r.scenario}
          note={(r) => r.problem}
          badge={(r) => (r.verified ? zh.playbooks.verifiedMark : zh.playbooks.status[r.status])}
          ids={value.playbookIds}
          staleIds={stale.playbookIds}
          onToggle={(id) => onChange({ playbookIds: toggle(value.playbookIds, id) })}
          onSelectAll={(ids) => onChange({ playbookIds: [...value.playbookIds, ...ids] })}
          onClear={() => onChange({ playbookIds: [] })}
        />
      </div>
    </div>
  )
}
