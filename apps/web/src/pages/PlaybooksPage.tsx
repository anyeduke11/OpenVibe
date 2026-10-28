import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PlaybookOut } from '@openvibe/shared'
import { lane } from '../i18n/lane-assets'
import { zh } from '../i18n/zh'
import {
  AssetFilterBar,
  AssetPageHead,
  AssetSearchBox,
  FilterDivider,
  FilterSelect,
  FilterTrail,
} from '../components/library/AssetPageHead'
import { RefreshHint } from '../components/library/AssetStates'
import { controlledTagsOf } from '../components/library/controlledTags'
import { TagFilterBar } from '../components/library/TagFilterBar'
import { PlaybookEditorDrawer } from '../components/playbooks/PlaybookEditorDrawer'
import { PlaybooksMdPreview } from '../components/playbooks/PlaybooksMdPreview'
import { PlaybooksTable, type PlaybookRowView } from '../components/playbooks/PlaybooksTable'
import { ConfirmDeleteDialog, deleteReceipts } from '../components/ui/ConfirmDeleteDialog'
import { Dialog, DialogPanel } from '../components/ui/Dialog'
import { btnGhost, btnPrimary } from '../components/ui/styles'
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

  const tags = useMemo(() => controlledTagsOf(allItems), [allItems])

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

  const activeFilters = [status, tag, trimmed || undefined].filter(
    (v) => v !== undefined && v !== '',
  ).length
  const clearFilters = useCallback(() => {
    setStatus(undefined)
    setTag(undefined)
    setSearch('')
  }, [])

  // 搜索与列表两条请求都可能失败，四态取当前生效的那条
  const active = searching ? search_ : list

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
      <AssetPageHead
        title={zh.playbooks.title}
        hint={lane.view.playbooks}
        actions={
          <>
            <AssetSearchBox
              value={search}
              onChange={setSearch}
              ariaLabel={zh.playbooks.searchPlaceholder}
            />
            <button className={btnPrimary} onClick={() => setEditor({ playbook: null })}>
              {zh.playbooks.newPlaybook}
            </button>
          </>
        }
        filters={
          <AssetFilterBar
            trailing={
              <RefreshHint busy={(list.isFetching || search_.isFetching) && !active.isLoading} />
            }
          >
            <FilterSelect
              ariaLabel={zh.library.filters.status}
              allLabel={`${zh.library.filters.all} · ${zh.library.filters.status}`}
              value={status}
              options={(['draft', 'published'] as const).map((s) => ({
                value: s,
                label: zh.playbooks.status[s],
              }))}
              onChange={setStatus}
            />
            <FilterDivider />
            <TagFilterBar tags={tags} selected={tag} onToggle={setTag} />
            <FilterTrail
              shortQuery={searching && trimmed.length < 3}
              shortQueryHint={zh.playbooks.shortQueryHint}
              activeFilters={activeFilters}
              onClear={clearFilters}
            />
          </AssetFilterBar>
        }
      />

      <PlaybooksTable
        rows={rows}
        selected={selected}
        loading={active.isLoading}
        error={active.error?.message ?? null}
        filtered={activeFilters > 0}
        onClearFilters={clearFilters}
        onRetry={() => void active.refetch()}
        onCreate={() => setEditor({ playbook: null })}
        onToggle={onToggle}
        onSelectAll={setSelected}
        onEdit={(playbook) => setEditor({ playbook })}
        onDelete={setDeleting}
      />

      <footer className="flex shrink-0 items-center gap-3 border-t border-line-hair px-5 py-1.5 text-xs text-ink-muted">
        <span className="tabular-nums">{zh.playbooks.total(rows.length)}</span>
        <span className="tabular-nums">{zh.playbooks.seedCount(seedCount)}</span>
        <span className="tabular-nums">{zh.playbooks.verifiedCount(verifiedCount)}</span>
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
          {blockedByDraft && (
            <p className="mt-2 text-[11px] text-warn">{zh.playbooks.preview.draftSkipped}</p>
          )}
        </DialogPanel>
      </Dialog>

      <ConfirmDeleteDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={zh.playbooks.deleteDialog.title}
        confirmLabel={zh.playbooks.deleteDialog.confirm}
        pending={remove.isPending}
        onConfirm={() => {
          if (deleting === null) return
          remove.mutate(
            deleting.id,
            deleteReceipts({
              done: zh.playbooks.deleteDialog.done,
              referenced: zh.playbooks.deleteDialog.referencedToast,
              close: () => setDeleting(null),
            }),
          )
        }}
      >
        {deleting !== null && (
          <div className="space-y-2 text-sm">
            {/* 影响范围：删什么、种子条目删了不会自动恢复、可改再删 */}
            <p className="proseCls">{zh.playbooks.deleteDialog.body(deleting.scenario)}</p>
            {deleting.source === 'openvibe-seed' && (
              <p className="proseCls text-xs text-ink-muted">
                {zh.playbooks.deleteDialog.seedNote}
              </p>
            )}
            <div className="flex justify-end pt-1">
              <button className={btnGhost} onClick={() => setEditor({ playbook: deleting })}>
                {zh.playbooks.deleteDialog.editFirst}
              </button>
            </div>
          </div>
        )}
      </ConfirmDeleteDialog>
    </div>
  )
}
