import { TERM_LEVELS, type TermLevel } from '@openvibe/shared'
import { chipCls, chipPressed } from '../ui/styles'

/**
 * `/terms` 横排筛选条（m3-terms-learning FR-4.1）。
 *
 * 形态沿用 DEV-0119 刚给 `/library` 定的横排条：单行、扁平 chip、可横向滚动，
 * **不再新增竖排侧栏**。三段用分隔竖线隔开（FR-4.1 的 `[全部] │ [领域…] │ [难度…] │ [只看完懂]`）：
 * 领域、难度、入门必需是三个独立维度，混在一堆 chip 里读者分不清哪组在管什么。
 *
 * ⚠️ **文案不进 i18n**：`i18n/zh.ts` 正被并行会话改动（工作树 +/− 未定），
 * 往里加键必然混稿。按 DEV-0119 的同一处置，这些文案就地定义在 `L` 里并在此登记，
 * 待那轮重构落地后再一次性迁进去。
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
    on ? chipPressed : 'border-line bg-panel-2 text-ink-muted hover:border-line-strong hover:bg-panel'
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
}) {
  const { domainCounts, total, domain, level, starterOnly } = props

  return (
    <div
      className="flex items-center gap-1.5 overflow-x-auto pb-1"
      role="group"
      aria-label={`${L.domainGroup}与${L.levelGroup}筛选`}
    >
      <button type="button" className={chipOf(domain === null)} aria-pressed={domain === null} onClick={() => props.onDomain(null)}>
        {L.all} {total}
      </button>

      <span aria-hidden className="h-4 w-px shrink-0 bg-line" />

      {domainCounts.map((d) => (
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
