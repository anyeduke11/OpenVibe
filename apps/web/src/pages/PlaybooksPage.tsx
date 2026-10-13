import { useEffect, useMemo, useState } from 'react'
import { CONTROLLED_TAG_VOCAB, type PlaybookOut } from '@openvibe/shared'
import { zh } from '../i18n/zh'
import { TagFilterBar } from '../components/library/TagFilterBar'
import { PlaybookEditorDrawer } from '../components/playbooks/PlaybookEditorDrawer'
import { PlaybooksMdPreview } from '../components/playbooks/PlaybooksMdPreview'
import { PlaybooksTable, type PlaybookRowView } from '../components/playbooks/PlaybooksTable'
import { Dialog, DialogPanel } from '../components/ui/Dialog'
import { toast } from '../components/ui/Toaster'
import { btnDanger, btnGhost, btnPrimary, inputCls } from '../components/ui/styles'
import { useDebounced } from '../hooks/useDebounced'
import { usePlaybookList, usePlaybookMutations, usePlaybookSearch } from '../hooks/usePlaybooks'

export function PlaybooksPage() {
  const [search, setSearch] = useState('')
  const q = useDebounced(search)
  const [status, setStatus] = useState<string | undefined>()
  const [tag, setTag] = useState<string | undefined>()
  const [selected, setSelected] = useState<string[]>([])
  const [editor, setEditor] = useState<{ playbook: PlaybookOut | null } | null>(null)
  const [deleting, setDeleting] = useState<PlaybookOut | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)

  const list = usePlaybookList()
  const trimmed = q.trim()
  const search_ = usePlaybookSearch(trimmed)
  const { remove } = usePlaybookMutations()
  const searching = trimmed !== ''

  const allItems = useMemo(() => list.data?.items ?? [], [list.data])

  const rows: PlaybookRowView[] = useMemo(() => {
    const base: PlaybookRowView[] = searching
      ? (search_.data?.items ?? []).map((hit) => ({ playbook: hit.playbook, matches: hit.matches }))
      : allItems.map((playbook) => ({ playbook, matches: [] }))
    return base.filter(
      ({ playbook }) =>
        (status === undefined || playbook.status === status) &&
        (tag === undefined || playbook.tags.includes(tag)),
    )
  }, [searching, search_.data, allItems, status, tag])

  const tags = useMemo(() => {
    const used = new Set(allItems.flatMap((p) => p.tags))
    const known = CONTROLLED_TAG_VOCAB.filter((t) => used.has(t))
    const extra = [...used].filter((t) => !(CONTROLLED_TAG_VOCAB as readonly string[]).includes(t)).sort()
    return [...known, ...extra]
  }, [allItems])

  // 过滤或搜索变化后，已选但当前不可见的条目必须退出选集（否则渲染端报 STALE_SELECTION）
  useEffect(() => {
    const visible = new Set(rows.map((r) => r.playbook.id))
    setSelected((prev) => prev.filter((id) => visible.has(id)))
  }, [rows])

  const seedCount = useMemo(
    () => allItems.filter((p) => p.source === 'openvibe-seed').length,
    [allItems],
  )
  const verifiedCount = useMemo(() => allItems.filter((p) => p.verified).length, [allItems])

  const onToggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  // 只渲染已入库的条目：draft 不进产物（m4 FR-6.2）
  const renderable = useMemo(() => {
    const byId = new Map(allItems.map((p) => [p.id, p]))
    return selected.map((id) => byId.get(id)).filter((p): p is PlaybookOut => p !== undefined)
  }, [selected, allItems])
  const renderableIds = useMemo(() => renderable.map((p) => p.id), [renderable])
  const blockedByDraft = renderable.length !== renderableIds.length

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-line-hair px-5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="mr-auto text-base font-semibold">{zh.playbooks.title}</h1>
          <input
            className={`${inputCls} w-80`}
            placeholder={zh.playbooks.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className={`${inputCls} w-auto appearance-none`}
            value={status ?? ''}
            onChange={(e) => setStatus(e.target.value === '' ? undefined : e.target.value)}
          >
            <option value="">{`${zh.library.filters.all} · ${zh.library.filters.status}`}</option>
            {(['draft', 'published'] as const).map((s) => (
              <option key={s} value={s}>
                {zh.playbooks.status[s]}
              </option>
            ))}
          </select>
          <button className={btnPrimary} onClick={() => setEditor({ playbook: null })}>
            {zh.playbooks.newPlaybook}
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <TagFilterBar tags={tags} selected={tag} onToggle={setTag} />
          {searching && trimmed.length < 3 && (
            <span className="text-[11px] text-warn">{zh.playbooks.shortQueryHint}</span>
          )}
          {(list.isFetching || search_.isFetching) && (
            <span className="text-[11px] text-ink-faint">{zh.common.loading}</span>
          )}
        </div>
      </header>

      <PlaybooksTable
        rows={rows}
        selected={selected}
        loading={searching ? search_.isLoading : list.isLoading}
        error={searching ? (search_.error?.message ?? null) : (list.error?.message ?? null)}
        searching={searching}
        onToggle={onToggle}
        onSelectAll={setSelected}
        onEdit={(playbook) => setEditor({ playbook })}
        onRetry={() => (searching ? void search_.refetch() : void list.refetch())}
      />

      <footer className="flex items-center gap-3 border-t border-line-hair px-5 py-2 text-xs text-ink-muted">
        <span>{zh.playbooks.total(rows.length)}</span>
        <span>{zh.playbooks.seedCount(seedCount)}</span>
        <span>{zh.playbooks.verifiedCount(verifiedCount)}</span>
        <span className="ml-auto" />
        <button
          className={btnPrimary}
          disabled={selected.length === 0}
          onClick={() => setPreviewOpen(true)}
        >
          {zh.playbooks.selection.render}
        </button>
      </footer>

      {editor !== null && (
        <PlaybookEditorDrawer
          key={editor.playbook?.id ?? 'new'}
          playbook={editor.playbook}
          open
          onClose={() => setEditor(null)}
          onSaved={() => setEditor(null)}
        />
      )}

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogPanel
          title={zh.playbooks.preview.title}
          width="w-[min(920px,100vw)]"
          footer={
            <button className={btnGhost} onClick={() => setPreviewOpen(false)}>
              {zh.editor.close}
            </button>
          }
        >
          <div className="h-[60vh]">
            <PlaybooksMdPreview playbookIds={renderableIds} />
          </div>
          {blockedByDraft && <p className="mt-2 text-[11px] text-warn">{zh.playbooks.preview.draftSkipped}</p>}
        </DialogPanel>
      </Dialog>

      <Dialog open={deleting !== null} onOpenChange={(o) => (o ? undefined : setDeleting(null))}>
        <DialogPanel
          title={zh.playbooks.deleteDialog.title}
          footer={
            <>
              <button className={btnGhost} onClick={() => setDeleting(null)}>
                {zh.editor.cancel}
              </button>
              <button
                className={btnDanger}
                disabled={remove.isPending}
                onClick={() => {
                  if (deleting === null) return
                  remove.mutate(deleting.id, {
                    onSuccess: (packs) => {
                      toast(zh.playbooks.deleteDialog.done)
                      if (packs !== null && packs !== '') {
                        toast(zh.playbooks.deleteDialog.referencedToast(packs), 'error')
                      }
                      setDeleting(null)
                    },
                    onError: (e) => toast(e.message, 'error'),
                  })
                }}
              >
                {zh.playbooks.deleteDialog.confirm}
              </button>
            </>
          }
        >
          {deleting !== null && (
            <div className="space-y-2 text-sm">
              <p>{zh.playbooks.deleteDialog.body(deleting.scenario)}</p>
              {deleting.source === 'openvibe-seed' && (
                <p className="text-xs text-ink-muted">{zh.playbooks.deleteDialog.seedNote}</p>
              )}
              <div className="flex justify-end pt-1">
                <button className={btnGhost} onClick={() => setEditor({ playbook: deleting })}>
                  {zh.playbooks.deleteDialog.editFirst}
                </button>
              </div>
            </div>
          )}
        </DialogPanel>
      </Dialog>
    </div>
  )
}
