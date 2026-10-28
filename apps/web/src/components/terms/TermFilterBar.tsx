import { useMemo, useState } from 'react'
import { TERM_LEVELS, type TermLevel } from '@openvibe/shared'
import { lane } from '../../i18n/lane-assets'
import { chipCls, chipPressed } from '../ui/styles'

/**
 * `/terms` 横排筛选条（m3-terms-learning FR-4.1）。
 *
 * 形态沿用 DEV-0119 刚给 `/library` 定的横排条：单行、扁平 chip、可横向滚动，
 * **不再新增竖排侧栏**。三段用分隔竖线隔开（FR-4.1 的 `[全部] │ [领域…] │ [难度…] │ [只看完懂]`）：
 * 领域、难度、入门必需是三个独立维度，混在一堆 chip 里读者分不清哪组在管什么。
 *
 * ⚠️ **领域 chip 必须折叠**，否则难度与「只看完懂」会被推出视口。实测：8 个领域各带计数
 * 约 900px，加上既有的 status 下拉与标签条之后，难度组落在 x=1624（视口 1600 之外）——
 * 也就是**最该被新手用的两个控件默认看不见**。FR-4.1 的示意图本来就画了折叠
 * （`[前端 140] [后端 69] [AI 30] … │ 难度 L1 L2 L3 │ ☑ 只看完懂`），此处照它落地。
 * 折叠规则与 FolderFilterBar 同口径：**超量折叠，选中的那个永远补在末尾** ——
 * 筛完的项被折叠藏起来，用户只会觉得「筛没了」。
 *
 * 根元素用 `shrink-0` 而非 `min-w-0`：外层 `AssetFilterBar` 的轨道是**刻意**的
 * `overflow-x-auto`（其文档写明「单行筛选条：横向滚动、永不换行」）。本条一栏若可缩，
 * 会被轨道挤成「盒子比内容窄」——那种状态下内容溢出盒子、**看起来**能滚其实是被祖先裁掉。
 * 宁可让轨道里别的可缩项（status 下拉、标签条）让位，也不要在这里再套一个滚动区。
 * 实测（1600 视口）：本条自然宽 576px，轨道 scrollWidth=clientWidth=1170（溢出 0），
 * 难度组与「只看完懂」默认全在轨道窗口内，不需要横向滚动。
 *
 * ⚠️ **文案不进 i18n**：`i18n/zh.ts` 正被并行会话改动，往里加键必然混稿。
 * 「更多/收起」复用既有的 `lane.row`（与 FolderFilterBar 同源），其余就地定义在 `L` 里。
 */
const L = {
  all: '全部',
  starterOnly: '只看完懂',
  domainGroup: '领域',
  levelGroup: '难度',
} as const

/** 与 FolderFilterBar 同纪律：形制层择一，三元不散进 JSX（否则 Tailwind 任意挑一个生效） */
const chipOf = (on: boolean): string =>
  `${chipCls} shrink-0 transition-colors ${
    on
      ? chipPressed
      : 'border-line bg-panel-2 text-ink-muted hover:border-line-strong hover:bg-panel'
  }`

export interface DomainCount {
  domain: string
  count: number
}

export function TermFilterBar(props: {
  /** 领域 → 条数。调用方按当前其余筛选条件算好，故计数与实际结果一致 */
  domainCounts: DomainCount[]
  total: number
  domain: string | null
  level: TermLevel | null
  starterOnly: boolean
  onDomain: (domain: string | null) => void
  onLevel: (level: TermLevel | null) => void
  onStarterOnly: (on: boolean) => void
  /** 折叠前最多露几个领域 chip。默认 4 —— 8 个领域各带计数约 900px，不折会把难度组顶出视口 */
  limit?: number
}) {
  const { domainCounts, total, domain, level, starterOnly } = props
  const [expanded, setExpanded] = useState(false)
  const limit = props.limit ?? 4

  const all = useMemo(() => domainCounts, [domainCounts])
  const selectedIdx = domain === null ? -1 : all.findIndex((d) => d.domain === domain)
  const collapsible = all.length > limit
  const shown = useMemo(() => {
    if (!collapsible || expanded) return all
    if (selectedIdx >= limit) return [...all.slice(0, limit), all[selectedIdx] as DomainCount]
    return all.slice(0, limit)
  }, [all, collapsible, expanded, limit, selectedIdx])
  const hidden = all.length - shown.length

  return (
    <div
      className="flex shrink-0 items-center gap-1.5"
      role="group"
      aria-label={`${L.domainGroup}与${L.levelGroup}筛选`}
    >
      <button
        type="button"
        className={chipOf(domain === null)}
        aria-pressed={domain === null}
        onClick={() => props.onDomain(null)}
      >
        {L.all} {total}
      </button>

      <span aria-hidden className="h-4 w-px shrink-0 bg-line" />

      {shown.map((d) => (
        <button
          key={d.domain}
          type="button"
          className={chipOf(domain === d.domain)}
          aria-pressed={domain === d.domain}
          onClick={() => props.onDomain(domain === d.domain ? null : d.domain)}
        >
          {d.domain} {d.count}
        </button>
      ))}
      {collapsible ? (
        <button
          type="button"
          className={`${chipCls} shrink-0 border-line bg-panel-2 text-ink-muted`}
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? lane.row.fewer : `${lane.row.more} +${String(hidden)}`}
        </button>
      ) : null}

      <span aria-hidden className="h-4 w-px shrink-0 bg-line" />

      <span className="shrink-0 text-[11.5px] text-ink-faint">{L.levelGroup}</span>
      {TERM_LEVELS.map((l) => (
        <button
          key={l}
          type="button"
          className={chipOf(level === l)}
          aria-pressed={level === l}
          onClick={() => props.onLevel(level === l ? null : l)}
        >
          {l}
        </button>
      ))}

      <span aria-hidden className="h-4 w-px shrink-0 bg-line" />

      <button
        type="button"
        className={chipOf(starterOnly)}
        aria-pressed={starterOnly}
        onClick={() => props.onStarterOnly(!starterOnly)}
      >
        {L.starterOnly}
      </button>
    </div>
  )
}
