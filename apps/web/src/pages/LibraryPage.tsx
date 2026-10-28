import { useCallback, useEffect, useMemo, useState } from 'react'
import { PLATFORM_MARKS, PROMPT_STATUS, type PromptOut } from '@openvibe/shared'
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
import { FolderFilterBar } from '../components/library/FolderFilterBar'
import { ImportExportDialog } from '../components/library/ImportExportDialog'
import { PromptEditorDrawer } from '../components/library/PromptEditorDrawer'
import { PromptList } from '../components/library/PromptList'
import { TagFilterBar } from '../components/library/TagFilterBar'
import { VariableFillModal } from '../components/library/VariableFillModal'
import { ConfirmDeleteDialog, deleteReceipts } from '../components/ui/ConfirmDeleteDialog'
import { btnGhost, btnPrimary } from '../components/ui/styles'
import { toast } from '../components/ui/Toaster'
import { useDebounced } from '../hooks/useDebounced'
import { usePromptAggregates, usePromptList, usePromptMutations } from '../hooks/usePrompts'
import type { PromptFilters } from '../hooks/usePrompts'

const PAGE_SIZE = 20

export function LibraryPage() {
  const [page, setPage] = useState(1)
  const [tag, setTag] = useState<string | undefined>()
  const [folder, setFolder] = useState<string | undefined>()
  const [status, setStatus] = useState<string | undefined>()
  const [platform, setPlatform] = useState<string | undefined>()
  const [search, setSearch] = useState('')
  const q = useDebounced(search)

  const [editor, setEditor] = useState<{ prompt: PromptOut | null } | null>(null)
  const [copying, setCopying] = useState<PromptOut | null>(null)
  const [deleting, setDeleting] = useState<PromptOut | null>(null)
  const [ioOpen, setIoOpen] = useState(false)

  useEffect(() => {
    setPage(1)
  }, [q, tag, folder, status, platform])

  const base = { tag, folder, status, platform, q: q.trim() || undefined }
  const filters: PromptFilters = { page, size: PAGE_SIZE, ...base }
  const list = usePromptList(filters)
  const aggregates = usePromptAggregates(base)
  const { update, remove } = usePromptMutations()

  const items = list.data?.items ?? []
  const aggItems = aggregates.data?.items ?? []
  const paths = useMemo(
    () =>
      [...new Set(aggItems.map((p) => p.folderPath))].sort((a, b) => a.localeCompare(b, 'zh-CN')),
    [aggItems],
  )
  const tags = useMemo(() => [...new Set(aggItems.flatMap((p) => p.tags))].sort(), [aggItems])

  // 「无结果」与「库空」是两回事：前者有数据只是被筛掉，CTA 必须给「清除筛选」
  const activeFilters = [tag, folder, status, platform, q.trim() || undefined].filter(
    (v) => v !== undefined && v !== '',
  ).length
  const clearFilters = useCallback(() => {
    setTag(undefined)
    setFolder(undefined)
    setStatus(undefined)
    setPlatform(undefined)
    setSearch('')
    setPage(1)
  }, [])

  const movePrompt = (promptId: string, folderPath: string) => {
    const current = items.find((p) => p.id === promptId)
    if (current === undefined || current.folderPath === folderPath) return
    update.mutate(
      { id: promptId, patch: { folderPath } },
      {
        onSuccess: () => toast(`已移动到 ${folderPath}`),
        onError: (e) => toast(e.message, 'error'),
      },
    )
  }

  const onCopy = (prompt: PromptOut) => {
    if (prompt.variables.length === 0) {
      void navigator.clipboard
        .writeText(prompt.content)
        .then(() => toast(zh.copyModal.copied))
        .catch(() => toast(zh.copyModal.copyFailed, 'error'))
      return
    }
    setCopying(prompt)
  }

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col">
      <AssetPageHead
        title={zh.library.title}
        hint={lane.view.library}
        actions={
          <>
            {/* 导入与两种导出收在同一个对话框里，页头不再平铺三个 ghost 按钮 */}
            <button className={btnGhost} onClick={() => setIoOpen(true)}>
              {zh.library.import}
            </button>
            <AssetSearchBox
              value={search}
              onChange={setSearch}
              ariaLabel={zh.library.searchPlaceholder}
            />
            <button className={btnPrimary} onClick={() => setEditor({ prompt: null })}>
              {zh.library.newPrompt}
            </button>
          </>
        }
        filters={
          <AssetFilterBar trailing={<RefreshHint busy={list.isFetching && !list.isLoading} />}>
            <FilterSelect
              ariaLabel={zh.library.filters.status}
              allLabel={`${zh.library.filters.all} · ${zh.library.filters.status}`}
              value={status}
              options={PROMPT_STATUS.map((s) => ({ value: s, label: zh.library.status[s] }))}
              onChange={setStatus}
            />
            <FilterSelect
              ariaLabel={zh.library.filters.platform}
              allLabel={`${zh.library.filters.all} · ${zh.library.filters.platform}`}
              value={platform}
              options={PLATFORM_MARKS.map((m) => ({ value: m, label: m }))}
              onChange={setPlatform}
            />
            <FilterDivider />
            {/* 文件夹筛选横排放在状态/平台之后、标签之前：它是「归档维度」，
                与标签同属资产组织方式，靠右更贴标签条；靠左会挤掉状态/平台这两个
                高频下拉。两侧用 FilterDivider 分组，避免读成一长串无差别 chip。 */}
            <FolderFilterBar
              paths={paths}
              selected={folder}
              onToggle={setFolder}
              onDropPrompt={movePrompt}
            />
            <FilterDivider />
            <TagFilterBar tags={tags} selected={tag} onToggle={setTag} />
            <FilterTrail
              shortQuery={q.trim() !== '' && q.trim().length < 3}
              shortQueryHint={zh.library.shortQueryHint}
              activeFilters={activeFilters}
              onClear={clearFilters}
            />
          </AssetFilterBar>
        }
      />

      <PromptList
        items={items}
        total={list.data?.total ?? 0}
        filters={filters}
        loading={list.isLoading}
        error={list.error?.message ?? null}
        filtered={activeFilters > 0}
        onClearFilters={clearFilters}
        onRetry={() => void list.refetch()}
        onCreate={() => setEditor({ prompt: null })}
        onEdit={(p) => setEditor({ prompt: p })}
        onCopy={onCopy}
        onDelete={setDeleting}
        onPageChange={setPage}
      />

      {editor !== null && (
        <PromptEditorDrawer
          key={editor.prompt?.id ?? 'new'}
          prompt={editor.prompt}
          open
          onClose={() => setEditor(null)}
          onSaved={() => setEditor(null)}
        />
      )}

      {copying !== null && (
        <VariableFillModal
          key={copying.id}
          prompt={copying}
          open
          onClose={() => setCopying(null)}
        />
      )}

      <ImportExportDialog open={ioOpen} onClose={() => setIoOpen(false)} />

      <ConfirmDeleteDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={zh.deleteDialog.title}
        confirmLabel={zh.deleteDialog.confirm}
        pending={remove.isPending}
        onConfirm={() => {
          if (deleting === null) return
          remove.mutate(
            deleting.id,
            deleteReceipts({
              done: zh.deleteDialog.done,
              referenced: zh.deleteDialog.referencedToast,
              close: () => setDeleting(null),
            }),
          )
        }}
      >
        {deleting !== null && (
          <div className="space-y-2 text-sm">
            {/* 影响范围写进确认框正文：删什么、连带删什么、什么不受影响 */}
            <p className="proseCls">{zh.deleteDialog.body(deleting.title)}</p>
            <p className="proseCls text-xs text-ink-muted">{zh.deleteDialog.packNote}</p>
          </div>
        )}
      </ConfirmDeleteDialog>
    </section>
  )
}
