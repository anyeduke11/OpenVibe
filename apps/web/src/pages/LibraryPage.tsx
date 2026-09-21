import { useEffect, useMemo, useState } from 'react'
import { PLATFORM_MARKS, PROMPT_STATUS, type PromptOut } from '@openvibe/shared'
import { zh } from '../i18n/zh'
import { FolderTree } from '../components/library/FolderTree'
import { ImportExportDialog } from '../components/library/ImportExportDialog'
import { PromptEditorDrawer } from '../components/library/PromptEditorDrawer'
import { PromptList } from '../components/library/PromptList'
import { TagFilterBar } from '../components/library/TagFilterBar'
import { VariableFillModal } from '../components/library/VariableFillModal'
import { Dialog, DialogPanel } from '../components/ui/Dialog'
import { toast } from '../components/ui/Toaster'
import { btnGhost, btnPrimary, inputCls } from '../components/ui/styles'
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
    <div className="flex h-full min-h-0">
      <aside className="w-52 shrink-0 overflow-auto border-r border-zinc-200 bg-white py-3">
        <FolderTree
          paths={paths}
          selected={folder ?? null}
          onSelect={(p) => setFolder(p ?? undefined)}
          onDropPrompt={movePrompt}
        />
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-zinc-100 px-5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="mr-auto text-base font-semibold">{zh.library.title}</h1>
            <input
              className={`${inputCls} w-72`}
              placeholder={zh.library.searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button className={btnGhost} onClick={() => setIoOpen(true)}>
              {zh.library.import}
            </button>
            <a className={btnGhost} href="/api/prompts/export?format=json" download>
              {zh.library.exportJson}
            </a>
            <a className={btnGhost} href="/api/prompts/export?format=md" download>
              {zh.library.exportMd}
            </a>
            <button className={btnPrimary} onClick={() => setEditor({ prompt: null })}>
              {zh.library.newPrompt}
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select
              className={`${inputCls} w-auto appearance-none`}
              value={status ?? ''}
              onChange={(e) => setStatus(e.target.value === '' ? undefined : e.target.value)}
            >
              <option value="">
                {zh.library.filters.all} · {zh.library.filters.status}
              </option>
              {PROMPT_STATUS.map((s) => (
                <option key={s} value={s}>
                  {zh.library.status[s]}
                </option>
              ))}
            </select>
            <select
              className={`${inputCls} w-auto appearance-none`}
              value={platform ?? ''}
              onChange={(e) => setPlatform(e.target.value === '' ? undefined : e.target.value)}
            >
              <option value="">
                {zh.library.filters.all} · {zh.library.filters.platform}
              </option>
              {PLATFORM_MARKS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <TagFilterBar tags={tags} selected={tag} onToggle={setTag} />
            {q.trim() !== '' && q.trim().length < 3 && (
              <span className="text-[11px] text-amber-700">{zh.library.shortQueryHint}</span>
            )}
            {list.isFetching && !list.isLoading && (
              <span className="text-[11px] text-zinc-400">刷新中…</span>
            )}
          </div>
        </header>

        <PromptList
          items={items}
          total={list.data?.total ?? 0}
          filters={filters}
          loading={list.isLoading}
          onEdit={(p) => setEditor({ prompt: p })}
          onCopy={onCopy}
          onDelete={setDeleting}
          onPageChange={setPage}
        />
      </section>

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

      <Dialog open={deleting !== null} onOpenChange={(o) => (o ? undefined : setDeleting(null))}>
        <DialogPanel
          title={zh.deleteDialog.title}
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
                      toast(zh.deleteDialog.done)
                      if (packs !== null && packs !== '') {
                        toast(zh.deleteDialog.referencedToast(packs), 'error')
                      }
                      setDeleting(null)
                    },
                    onError: (e) => toast(e.message, 'error'),
                  })
                }}
              >
                {zh.deleteDialog.confirm}
              </button>
            </>
          }
        >
          {deleting !== null && (
            <div className="space-y-2 text-sm">
              <p>{zh.deleteDialog.body(deleting.title)}</p>
              <p className="text-xs text-zinc-500">{zh.deleteDialog.packNote}</p>
            </div>
          )}
        </DialogPanel>
      </Dialog>
    </div>
  )
}
