import { useMemo } from 'react'
import type { TermOut } from '@openvibe/shared'
import { emptyHintCls } from '../ui/styles'
import { TermCard } from './TermCard'

/**
 * 术语库卡片视图：按领域分区，每区一网格（m3-terms-learning FR-4.1）。
 *
 * ⚠️ **分区在难度排序之前**，这是 FR-2.2 实测逼出来的顺序：两批词库的难度分布差异极大
 * （vibe-hub 前端批 L1 占 150/332，自建方法论批 L2 占 86/109），混在一张表里按难度排
 * 会显得「很偏」；先分区，读者在自己的领域里看到的难度分布才有可比性。
 *
 * ⚠️ **排序方向**：区内按 `starter` 优先 → `level` 升序 → 中文名序。
 * 「入门必看」先出，是这张卡要解决的核心问题（新手第一次打开该先看哪几个）。
 * 三级 tiebreak 都要，因为「先到者不变」的排序一旦上游顺序变了就会静默劣化。
 *
 * ⚠️ **未归类区（domain 为 null）排在最后**，不丢弃 —— 用户自建词条与上游新领域都会落这里，
 * 丢弃等于让它们在页面上凭空消失。
 */

const L = { ungrouped: '未归类', clear: '清除筛选' } as const

const byStarterThenLevelThenName = (a: TermOut, b: TermOut): number => {
  if (a.starter !== b.starter) return a.starter ? -1 : 1
  if (a.level !== b.level) return a.level.localeCompare(b.level)
  return (a.zh ?? a.en ?? '').localeCompare(b.zh ?? b.en ?? '', 'zh-CN')
}

export function TermCardGrid(props: {
  terms: TermOut[]
  /** 全部词条，用于解析 relatedTermIds —— 卡片自己不该拿不到关联却显示成「无关联」 */
  allTerms: TermOut[]
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  query?: string
  /** 筛选后为空时的一键清除（FR-4.4）。传了才渲染 */
  onClearFilters?: () => void
}) {
  const { terms, allTerms, selectedIds, onToggleSelect, query = '', onClearFilters } = props

  const byId = useMemo(() => new Map(allTerms.map((t) => [t.id, t])), [allTerms])
  const groups = useMemo(() => {
    const m = new Map<string, TermOut[]>()
    for (const t of terms) {
      const key = t.domain ?? ''
      const arr = m.get(key)
      if (arr) arr.push(t)
      else m.set(key, [t])
    }
    // 有领域的分区按 TERM_DOMAINS 的词表次序（那是筛选条 chip 的次序，读起来才对得上），
    // 未归类固定垫底。词表外的领域排到有领域之后、未归类之前。
    const KNOWN = new Set(['前端', '后端', 'AI', '产品', '测试', '技术栈', 'Git', '设计风格'])
    return [...m.entries()].sort((a, b) => {
      const ra = a[0] === '' ? 2 : KNOWN.has(a[0]) ? 0 : 1
      const rb = b[0] === '' ? 2 : KNOWN.has(b[0]) ? 0 : 1
      if (ra !== rb) return ra - rb
      if (ra === 0) return [...KNOWN].indexOf(a[0]) - [...KNOWN].indexOf(b[0])
      return a[0].localeCompare(b[0], 'zh-CN')
    })
  }, [terms])

  if (terms.length === 0) {
    return (
      <div className={emptyHintCls}>
        <p>当前筛选没命中任何词条。</p>
        {onClearFilters ? (
          <button type="button" className="btn-secondary mt-2" onClick={onClearFilters}>
            {L.clear}
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map(([domain, items]) => (
        <section key={domain || '__ungrouped__'}>
          <h2 className="mb-2 text-[12px] font-semibold tracking-wide text-ink-muted">
            {domain === '' ? L.ungrouped : domain}
            <span className="ml-1.5 text-ink-faint">{items.length}</span>
          </h2>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {items.sort(byStarterThenLevelThenName).map((t) => (
              <TermCard
                key={t.id}
                term={t}
                relatedTerms={t.relatedTermIds
                  .map((id) => byId.get(id))
                  .filter((r): r is TermOut => r !== undefined)}
                selected={selectedIds.has(t.id)}
                onToggleSelect={onToggleSelect}
                query={query}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
