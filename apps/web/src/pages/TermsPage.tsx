import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  TERM_DOMAINS,
  TERM_STATUS,
  TERMS_ORDER_BY,
  type TermLevel,
  type TermOut,
  type TermsOrderBy,
} from '@openvibe/shared'
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
import { TermCardGrid } from '../components/terms/TermCardGrid'
import { TermEditorDrawer } from '../components/terms/TermEditorDrawer'
import { TermFilterBar } from '../components/terms/TermFilterBar'
import { searchByScenario } from '../components/terms/scenarioSearch'
import { TermRoadmapView } from '../components/terms/TermRoadmapView'
import { TermsMdPreview } from '../components/terms/TermsMdPreview'
import { TermsTable, type TermRowView } from '../components/terms/TermsTable'
import { ConfirmDeleteDialog, deleteReceipts } from '../components/ui/ConfirmDeleteDialog'
import { Dialog, DialogPanel } from '../components/ui/Dialog'
import { btnGhost, btnPrimary, inputCls, segCls, segItemCls } from '../components/ui/styles'
import { useDebounced } from '../hooks/useDebounced'
import { useTermList, useTermMutations, useTermSearch } from '../hooks/useTerms'

/**
 * 「卡片」这个视图名不进 i18n：`i18n/zh.ts` 正被并行会话改动（+98/−53 未经我核归属），
 * 往里加键必然混稿。与 DEV-0119 对 `/library` 筛选条文案的同一处置，待那轮重构落地后再迁入。
 */
const VIEW_CARDS = '卡片'

export function TermsPage() {
  const [search, setSearch] = useState('')
  const q = useDebounced(search)
  const [status, setStatus] = useState<string | undefined>()
  const [tag, setTag] = useState<string | undefined>()
  const [selected, setSelected] = useState<string[]>([])
  const [orderBy, setOrderBy] = useState<TermsOrderBy>('en-alpha')
  // 三选一，默认卡片（owner 2026-10-18 裁定）：卡片是本轮要的效果，表格与路线图是效率工具，
  // 默认给前者。三者都保留 —— 441 条要成批选入 TERMS.md 仍靠表格的密集多选（FR-4.3）。
  const [view, setView] = useState<'cards' | 'table' | 'roadmap'>('cards')
  // 学习化三维筛选（m3-terms-learning FR-4.1）。与既有的 status/tag 筛选**互相独立**：
  // status/tag 问的是「这条词条现在什么状态、打的什么标签」，三维问的是「我学到哪一层了」。
  const [domain, setDomain] = useState<string | null>(null)
  const [level, setLevel] = useState<TermLevel | null>(null)
  const [starterOnly, setStarterOnly] = useState(false)
  const [editor, setEditor] = useState<{ term: TermOut | null } | null>(null)
  const [deleting, setDeleting] = useState<TermOut | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)

  const list = useTermList()
  const trimmed = q.trim()
  const search_ = useTermSearch(trimmed)
  const { remove } = useTermMutations()
  const searching = trimmed !== ''

  const allItems = useMemo(() => list.data?.items ?? [], [list.data])

  // 场景句回退（FR-5.2）：**只在服务端那条搜索一条都没命中时启用**。
  // 「命中排后」在这里是结构性的 —— 两个分支从不同时产出结果，不是靠排序把场景句压下去。
  const nameHits = search_.data?.items ?? []
  const usingScenarioFallback = searching && nameHits.length === 0
  const scenarioHits = useMemo(
    () => (usingScenarioFallback ? searchByScenario(trimmed, allItems) : []),
    [usingScenarioFallback, trimmed, allItems],
  )

  const rows: TermRowView[] = useMemo(() => {
    const base: TermRowView[] = searching
      ? usingScenarioFallback
        ? scenarioHits.map((term) => ({ term, matches: [] }))
        : nameHits.map((hit) => ({ term: hit.term, matches: hit.matches }))
      : allItems.map((term) => ({ term, matches: [] }))
    // 判定内联而非抽成闭包：闭包每次渲染都是新引用，要么进依赖数组导致每帧重算，
    // 要么就得挂一条本仓没配的 eslint 规则去压制它（实测报 rule not found）。
    return base.filter(
      ({ term }) =>
        (status === undefined || term.status === status) &&
        (tag === undefined || term.tags.includes(tag)) &&
        (domain === null || term.domain === domain) &&
        (level === null || term.level === level) &&
        (!starterOnly || term.starter),
    )
  }, [
    searching,
    usingScenarioFallback,
    scenarioHits,
    nameHits,
    allItems,
    status,
    tag,
    domain,
    level,
    starterOnly,
  ])

  // 领域 chip 的计数取「除领域外其余筛选都已生效」的那一批 ⇒ 选了别的维度时计数不会互相打架，
  // 且点「全部」时看到的总数就是当前结果数。
  const domainCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const { term } of rows) {
      if (term.domain === domain && domain !== null) continue
      if (status !== undefined && term.status !== status) continue
      if (tag !== undefined && !term.tags.includes(tag)) continue
      if (level !== null && term.level !== level) continue
      if (starterOnly && !term.starter) continue
      const key = term.domain ?? ''
      m.set(key, (m.get(key) ?? 0) + 1)
    }
    return [...m.entries()]
      .filter(([k]) => k !== '')
      .map(([domain, count]) => ({ domain, count }))
      .sort(
        (a, b) => TERM_DOMAINS.indexOf(a.domain as never) - TERM_DOMAINS.indexOf(b.domain as never),
      )
  }, [rows, status, tag, level, starterOnly, domain])

  const tags = useMemo(() => controlledTagsOf(allItems), [allItems])

  useEffect(() => {
    const visible = new Set(rows.map((r) => r.term.id))
    setSelected((prev) => prev.filter((id) => visible.has(id)))
  }, [rows])

  const seedCount = useMemo(
    () => allItems.filter((t) => t.source === 'openvibe-seed').length,
    [allItems],
  )

  const activeFilters = [status, tag, trimmed || undefined].filter(
    (v) => v !== undefined && v !== '',
  ).length
  const clearFilters = useCallback(() => {
    setStatus(undefined)
    setTag(undefined)
    setSearch('')
    setDomain(null)
    setLevel(null)
    setStarterOnly(false)
  }, [])

  // 搜索与列表两条请求都可能失败，四态要拿当前生效的那条
  const active = searching ? search_ : list
  const error = active.error?.message ?? null
  const retry = () => void active.refetch()

  const onToggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  return (
    <div className="flex h-full min-h-0 flex-col">
      <AssetPageHead
        title={zh.terms.title}
        hint={lane.view.terms}
        actions={
          <>
            <AssetSearchBox
              value={search}
              onChange={setSearch}
              ariaLabel={zh.terms.searchPlaceholder}
            />
            <button className={btnPrimary} onClick={() => setEditor({ term: null })}>
              {zh.terms.newTerm}
            </button>
          </>
        }
        filters={
          <AssetFilterBar
            trailing={
              <>
                <RefreshHint busy={(list.isFetching || search_.isFetching) && !active.isLoading} />
                {/* 视图切换不是筛选，钉在滚动轨道外：滚标签时它不该跟着滚走 */}
                <span className={segCls}>
                  {(['cards', 'table', 'roadmap'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={view === v}
                      className={segItemCls}
                      onClick={() => setView(v)}
                    >
                      {v === 'cards'
                        ? VIEW_CARDS
                        : v === 'table'
                          ? zh.terms.viewTable
                          : zh.terms.viewRoadmap}
                    </button>
                  ))}
                </span>
              </>
            }
          >
            <FilterSelect
              ariaLabel={zh.library.filters.status}
              allLabel={`${zh.library.filters.all} · ${zh.library.filters.status}`}
              value={status}
              options={TERM_STATUS.map((s) => ({ value: s, label: zh.terms.status[s] }))}
              onChange={setStatus}
            />
            <FilterDivider />
            <TagFilterBar tags={tags} selected={tag} onToggle={setTag} />
            <FilterDivider />
            <TermFilterBar
              domainCounts={domainCounts}
              total={rows.length}
              domain={domain}
              level={level}
              starterOnly={starterOnly}
              onDomain={setDomain}
              onLevel={setLevel}
              onStarterOnly={setStarterOnly}
            />
            <FilterTrail
              shortQuery={searching && trimmed.length < 3}
              shortQueryHint={zh.terms.shortQueryHint}
              activeFilters={activeFilters}
              onClear={clearFilters}
            />
          </AssetFilterBar>
        }
      />

      {view === 'cards' ? (
        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          <TermCardGrid
            terms={rows.map((r) => r.term)}
            allTerms={allItems}
            selectedIds={new Set(selected)}
            onToggleSelect={onToggle}
            query={usingScenarioFallback ? trimmed : ''}
            onClearFilters={clearFilters}
          />
        </div>
      ) : view === 'table' ? (
        <TermsTable
          rows={rows}
          selected={selected}
          loading={active.isLoading}
          error={error}
          searching={searching}
          filtered={activeFilters > 0}
          onClearFilters={clearFilters}
          onRetry={retry}
          onCreate={() => setEditor({ term: null })}
          onToggle={onToggle}
          onSelectAll={setSelected}
          onEdit={(term) => setEditor({ term })}
          onDelete={setDeleting}
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <TermRoadmapView
            terms={rows.map((r) => r.term)}
            loading={active.isLoading}
            error={error}
            filtered={activeFilters > 0}
            onClearFilters={clearFilters}
            onRetry={retry}
            onEdit={(term) => setEditor({ term })}
          />
        </div>
      )}

      <footer className="flex shrink-0 items-center gap-3 border-t border-line-hair px-5 py-1.5 text-xs text-ink-muted">
        <span className="tabular-nums whitespace-nowrap">{zh.terms.total(rows.length)}</span>
        <span className="tabular-nums whitespace-nowrap">{zh.terms.seedCount(seedCount)}</span>
        <span className="ml-auto" />
        <select
          className={`${inputCls} w-auto! appearance-none`}
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
          title={selected.length === 0 ? zh.terms.selection.none : undefined}
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

      <ConfirmDeleteDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={zh.terms.deleteDialog.title}
        confirmLabel={zh.terms.deleteDialog.confirm}
        pending={remove.isPending}
        onConfirm={() => {
          if (deleting === null) return
          remove.mutate(
            deleting.id,
            deleteReceipts({
              done: zh.terms.deleteDialog.done,
              referenced: zh.terms.deleteDialog.referencedToast,
              close: () => setDeleting(null),
            }),
          )
        }}
      >
        {deleting !== null && (
          <div className="space-y-2 text-sm">
            <p className="proseCls">
              {zh.terms.deleteDialog.body(deleting.zh || deleting.en || deleting.id)}
            </p>
            {deleting.source === 'openvibe-seed' && (
              <p className="proseCls text-xs text-ink-muted">{zh.terms.deleteDialog.seedNote}</p>
            )}
          </div>
        )}
      </ConfirmDeleteDialog>
    </div>
  )
}
