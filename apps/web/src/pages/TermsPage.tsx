import { useEffect, useMemo, useState } from 'react'
import {
  CONTROLLED_TAG_VOCAB,
  TERM_STATUS,
  TERMS_ORDER_BY,
  type TermOut,
  type TermsOrderBy,
} from '@openvibe/shared'
import { zh } from '../i18n/zh'
import { TagFilterBar } from '../components/library/TagFilterBar'
import { TermEditorDrawer } from '../components/terms/TermEditorDrawer'
import { TermsMdPreview } from '../components/terms/TermsMdPreview'
import { TermsTable, type TermRowView } from '../components/terms/TermsTable'
import { Dialog, DialogPanel } from '../components/ui/Dialog'
import { toast } from '../components/ui/Toaster'
import { btnGhost, btnPrimary, inputCls } from '../components/ui/styles'
import { useDebounced } from '../hooks/useDebounced'
import { useTermList, useTermMutations, useTermSearch } from '../hooks/useTerms'

export function TermsPage() {
  const [search, setSearch] = useState('')
  const q = useDebounced(search)
  const [status, setStatus] = useState<string | undefined>()
  const [tag, setTag] = useState<string | undefined>()
  const [selected, setSelected] = useState<string[]>([])
  const [orderBy, setOrderBy] = useState<TermsOrderBy>('en-alpha')
  const [editor, setEditor] = useState<{ term: TermOut | null } | null>(null)
  const [deleting, setDeleting] = useState<TermOut | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)

  const list = useTermList()
  const trimmed = q.trim()
  const search_ = useTermSearch(trimmed)
  const { remove } = useTermMutations()
  const searching = trimmed !== ''

  const allItems = useMemo(() => list.data?.items ?? [], [list.data])

  const rows: TermRowView[] = useMemo(() => {
    const base: TermRowView[] = searching
      ? (search_.data?.items ?? []).map((hit) => ({ term: hit.term, matches: hit.matches }))
      : allItems.map((term) => ({ term, matches: [] }))
    return base.filter(
      ({ term }) =>
        (status === undefined || term.status === status) &&
        (tag === undefined || term.tags.includes(tag)),
    )
  }, [searching, search_.data, allItems, status, tag])

  const tags = useMemo(() => {
    const used = new Set(allItems.flatMap((t) => t.tags))
    const known = CONTROLLED_TAG_VOCAB.filter((t) => used.has(t))
    const extra = [...used].filter((t) => !(CONTROLLED_TAG_VOCAB as readonly string[]).includes(t)).sort()
    return [...known, ...extra]
  }, [allItems])

  useEffect(() => {
    const visible = new Set(rows.map((r) => r.term.id))
    setSelected((prev) => prev.filter((id) => visible.has(id)))
  }, [rows])

  const seedCount = useMemo(
    () => allItems.filter((t) => t.source === 'openvibe-seed').length,
    [allItems],
  )

  const onToggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-zinc-100 px-5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="mr-auto text-base font-semibold">{zh.terms.title}</h1>
          <input
            className={`${inputCls} w-80`}
            placeholder={zh.terms.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className={`${inputCls} w-auto appearance-none`}
            value={status ?? ''}
            onChange={(e) => setStatus(e.target.value === '' ? undefined : e.target.value)}
          >
            <option value="">{`${zh.library.filters.all} · ${zh.library.filters.status}`}</option>
            {TERM_STATUS.map((s) => (
              <option key={s} value={s}>
                {zh.terms.status[s]}
              </option>
            ))}
          </select>
          <button className={btnPrimary} onClick={() => setEditor({ term: null })}>
            {zh.terms.newTerm}
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <TagFilterBar tags={tags} selected={tag} onToggle={setTag} />
          {searching && trimmed.length < 3 && (
            <span className="text-[11px] text-amber-700">{zh.terms.shortQueryHint}</span>
          )}
          {(list.isFetching || search_.isFetching) && (
            <span className="text-[11px] text-zinc-400">刷新中…</span>
          )}
        </div>
      </header>

      <TermsTable
        rows={rows}
        selected={selected}
        loading={searching ? search_.isLoading : list.isLoading}
        searching={searching}
        onToggle={onToggle}
        onSelectAll={setSelected}
        onEdit={(term) => setEditor({ term })}
        onDelete={setDeleting}
      />

      <footer className="flex items-center gap-3 border-t border-zinc-100 px-5 py-2 text-xs text-zinc-500">
        <span>{zh.terms.total(rows.length)}</span>
        <span>{zh.terms.seedCount(seedCount)}</span>
        <span className="ml-auto" />
        <select
          className={`${inputCls} w-auto appearance-none`}
          value={orderBy}
          onChange={(e) => setOrderBy(e.target.value as TermsOrderBy)}
          aria-label={zh.terms.preview.orderBy}
        >
          {TERMS_ORDER_BY.map((o) => (
            <option key={o} value={o}>
              {zh.terms.preview.orderByOptions[o]}
            </option>
          ))}
        </select>
        <button
          className={btnPrimary}
          disabled={selected.length === 0}
          onClick={() => setPreviewOpen(true)}
        >
          {zh.terms.selection.render}
        </button>
      </footer>

      {editor !== null && (
        <TermEditorDrawer
          key={editor.term?.id ?? 'new'}
          term={editor.term}
          allTerms={allItems}
          open
          onClose={() => setEditor(null)}
          onSaved={() => setEditor(null)}
        />
      )}

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogPanel
          title={zh.terms.preview.title}
          width="w-[min(920px,100vw)]"
          footer={
            <button className={btnGhost} onClick={() => setPreviewOpen(false)}>
              {zh.editor.close}
            </button>
          }
        >
          <div className="h-[60vh]">
            <TermsMdPreview termIds={selected} orderBy={orderBy} />
          </div>
        </DialogPanel>
      </Dialog>

      <Dialog open={deleting !== null} onOpenChange={(o) => (o ? undefined : setDeleting(null))}>
        <DialogPanel
          title={zh.terms.deleteDialog.title}
          footer={
            <>
              <button className={btnGhost} onClick={() => setDeleting(null)}>
                {zh.editor.cancel}
              </button>
              <button
                className={`${btnPrimary} border-red-600 bg-red-600 hover:bg-red-700`}
                disabled={remove.isPending}
                onClick={() => {
                  if (deleting === null) return
                  remove.mutate(deleting.id, {
                    onSuccess: (packs) => {
                      toast(zh.terms.deleteDialog.done)
                      if (packs !== null && packs !== '') {
                        toast(zh.terms.deleteDialog.referencedToast(packs), 'error')
                      }
                      setDeleting(null)
                    },
                    onError: (e) => toast(e.message, 'error'),
                  })
                }}
              >
                {zh.terms.deleteDialog.confirm}
              </button>
            </>
          }
        >
          {deleting !== null && (
            <div className="space-y-2 text-sm">
              <p>{zh.terms.deleteDialog.body(deleting.zh || deleting.en || deleting.id)}</p>
              {deleting.source === 'openvibe-seed' && (
                <p className="text-xs text-zinc-500">{zh.terms.deleteDialog.seedNote}</p>
              )}
            </div>
          )}
        </DialogPanel>
      </Dialog>
    </div>
  )
}
