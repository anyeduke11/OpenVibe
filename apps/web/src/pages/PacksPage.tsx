import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { PackOut } from '@openvibe/shared'
import { usePackList, usePackMutations } from '../hooks/usePacks'
import { laneEngineering } from '../i18n/lane-engineering'
import { zh } from '../i18n/zh'
import { PackDetailPane } from '../components/packs/PackDetailPane'
import { PackDetailSheet } from '../components/packs/PackDetailSheet'
import { Dialog, DialogPanel } from '../components/ui/Dialog'
import { Icon } from '../components/ui/icons'
import { toast } from '../components/ui/Toaster'
import {
  btnDanger,
  btnGhost,
  btnPrimary,
  chipPressed,
  emptyHintCls,
  h1Cls,
  h1SubCls,
  inputCls,
  ledgerNumCls,
  noteCls,
  noteTitleCls,
  rowCls,
  skelCls,
  tagCls,
} from '../components/ui/styles'

/**
 * /packs（m6a FR-1–FR-5）：列表 + 详情。
 *
 * 布局是主链不是台账——标准包是本产品的价值出口，所以详情不进抽屉：
 * 左边窄列选包，右边一屏读全「选集 → 产物字节 → 成本 → 干跑」，来回切页的次数是这里的主要成本。
 * 筛选刻意只用已在手的数据（名称 / 目标平台），不给每个包单发一次导出查询。
 */
export function PacksPage() {
  const navigate = useNavigate()
  const list = usePackList()
  const { remove } = usePackMutations()
  const [q, setQ] = useState('')
  const [target, setTarget] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<PackOut | null>(null)
  const [history, setHistory] = useState<PackOut | null>(null)

  const items = list.data?.items ?? []

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return items.filter((p) => {
      if (target !== null && !p.targets.includes(target as PackOut['targets'][number])) return false
      if (needle === '') return true
      return (
        p.name.toLowerCase().includes(needle) || p.description.toLowerCase().includes(needle)
      )
    })
  }, [items, q, target])

  const selected = items.find((p) => p.id === selectedId)
  const filtered = q.trim() !== '' || target !== null

  const clearFilters = () => {
    setQ('')
    setTarget(null)
  }

  /** 目标平台 chip 只列库里真出现过的——六个 adapter 全列出来会让 3 个包也占一行筛选条 */
  const targetsInUse = useMemo(() => {
    const set = new Set<string>()
    for (const p of items) for (const t of p.targets) set.add(t)
    return [...set]
  }, [items])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-line-hair px-5 pt-4 pb-3">
        <h1 className={h1Cls}>{zh.packs.title}</h1>
        <p className={h1SubCls}>{laneEngineering.view.packs}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="pack-search">
            {laneEngineering.packs.searchLabel}
          </label>
          <input
            id="pack-search"
            className={`${inputCls} h-8 w-52 py-1`}
            value={q}
            placeholder={laneEngineering.packs.searchLabel}
            onChange={(e) => setQ(e.target.value)}
          />
          <button className={`${btnPrimary} ml-auto`} onClick={() => navigate('/packs/new')}>
            {zh.packs.newPack}
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {targetsInUse.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={target === t}
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] leading-[1.7] ${
                target === t ? chipPressed : 'border-line bg-panel-2 text-ink-muted'
              }`}
              onClick={() => setTarget(target === t ? null : t)}
            >
              {zh.packs.targetLabels[t] ?? t}
            </button>
          ))}
          {filtered && (
            <button
              type="button"
              className="ml-1 text-[11px] text-accent hover:underline"
              onClick={clearFilters}
            >
              {laneEngineering.state.clearFilter}
            </button>
          )}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-auto px-5 py-3 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:overflow-hidden">
        <div className="min-h-0 lg:overflow-auto">
          {list.isLoading &&
            [0, 1, 2].map((i) => (
              <div key={i} className={`${skelCls} mb-2 h-14`} aria-hidden />
            ))}

          {list.isError && (
            <div className={noteCls('danger')}>
              <span className={`${noteTitleCls} text-danger`}>
                {zh.common.failed((list.error as Error).message)}
              </span>
              <p className="text-ink-body">{laneEngineering.state.retryHint}</p>
              <button
                type="button"
                className={`${btnGhost} mt-1.5`}
                onClick={() => void list.refetch()}
              >
                {laneEngineering.state.retry}
              </button>
            </div>
          )}

          {items.length === 0 && !list.isLoading && !list.isError && (
            <div className={emptyHintCls}>
              <p>{zh.packs.empty}</p>
              <button className={btnPrimary} onClick={() => navigate('/packs/new')}>
                {zh.packs.newPack}
              </button>
            </div>
          )}

          {/* 筛出来的空 ≠ 库里没有：前者给清除筛选，后者才给新建 */}
          {items.length > 0 && shown.length === 0 && (
            <div className={emptyHintCls}>
              <p>{laneEngineering.state.noResult}</p>
              <button className={btnPrimary} onClick={clearFilters}>
                {laneEngineering.state.clearFilter}
              </button>
            </div>
          )}

          {shown.length > 0 && (
            <ul className="rounded-md border border-line">
              {shown.map((pack) => (
                <li key={pack.id} className={rowCls} aria-selected={pack.id === selectedId}>
                  <button
                    type="button"
                    className="flex w-full items-start gap-2 px-2.5 py-2 text-left"
                    onClick={() => setSelectedId(pack.id)}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink-body">
                        {pack.name}
                      </span>
                      <span className="block truncate text-[11px] text-ink-faint">
                        {pack.description === '' ? zh.common.none : pack.description}
                      </span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        {pack.targets.map((t) => (
                          <span key={t} className={tagCls}>
                            {zh.packs.targetLabels[t] ?? t}
                          </span>
                        ))}
                      </span>
                    </span>
                    <span className={`${ledgerNumCls} shrink-0 text-[11px] text-ink-faint`}>
                      {pack.updatedAt}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="min-h-0 lg:overflow-auto">
          {selected === undefined ? (
            <div className={emptyHintCls}>
              <p>{laneEngineering.packs.noSelection}</p>
              <p className="text-[11px]">{laneEngineering.packs.noSelectionHint}</p>
            </div>
          ) : (
            <PackDetailPane pack={selected} onOpenHistory={() => setHistory(selected)} />
          )}
        </div>
      </div>

      <footer className="flex items-center gap-3 border-t border-line-hair px-5 py-1.5 text-xs text-ink-muted">
        <span className="tabular-nums">
          {list.data === undefined ? '' : zh.packs.total(shown.length)}
        </span>
        {selected !== undefined && (
          <span className="ml-auto flex items-center gap-1.5">
            <button className={btnGhost} onClick={() => navigate(`/packs/${selected.id}/edit`)}>
              <Icon name="cog" size={13} />
              {zh.packs.actions.edit}
            </button>
            <button
              className={`${btnGhost} text-danger hover:border-danger-line hover:bg-danger-soft`}
              onClick={() => setDeleting(selected)}
            >
              {zh.packs.actions.del}
            </button>
          </span>
        )}
      </footer>

      <PackDetailSheet pack={history} onClose={() => setHistory(null)} />

      <Dialog open={deleting !== null} onOpenChange={(o) => (o ? undefined : setDeleting(null))}>
        <DialogPanel
          title={zh.packs.deleteDialog.title}
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
                    onSuccess: () => {
                      toast(zh.packs.deleteDialog.done)
                      if (selectedId === deleting.id) setSelectedId(null)
                      setDeleting(null)
                    },
                    onError: (e: Error) => toast(e.message, 'error'),
                  })
                }}
              >
                {zh.packs.deleteDialog.confirm}
              </button>
            </>
          }
        >
          {deleting !== null && (
            <div className="space-y-2 text-sm">
              <p>{zh.packs.deleteDialog.body(deleting.name)}</p>
              <div className="rounded-md border border-line bg-panel-2 px-3 py-2 text-xs">
                <span className={`${noteTitleCls} text-ink-body`}>
                  {laneEngineering.packs.impactTitle}
                </span>
                <ul className="space-y-0.5 text-ink-muted">
                  <li>· {laneEngineering.packs.impactGone}</li>
                  <li>· {laneEngineering.packs.impactKept}</li>
                </ul>
              </div>
            </div>
          )}
        </DialogPanel>
      </Dialog>
    </div>
  )
}
