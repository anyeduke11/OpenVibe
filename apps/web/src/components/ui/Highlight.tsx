import type { ReactNode } from 'react'
import type { MatchRange } from '@openvibe/shared'

/**
 * 命中片段高亮（词条 m3 FR-3.2 / 技巧 m4 FR-2.2 共用同一口径）：
 * 按偏移切片包 `<mark>`，区间已由服务端合并去叠，这里不再做重叠消解。
 */
export function Highlight(props: { text: string; ranges: MatchRange[] }) {
  const { text, ranges } = props
  if (ranges.length === 0) return <>{text}</>
  const sorted = [...ranges].sort((a, b) => a.start - b.start)
  const nodes = [] as ReactNode[]
  let cursor = 0
  sorted.forEach((r, i) => {
    if (r.start < cursor) return
    if (r.start > cursor) nodes.push(text.slice(cursor, r.start))
    nodes.push(
      <mark key={i} className="rounded-sm bg-warn-soft px-0.5 text-warn">
        {text.slice(r.start, r.end)}
      </mark>,
    )
    cursor = r.end
  })
  if (cursor < text.length) nodes.push(text.slice(cursor))
  return <>{nodes}</>
}

/** 取某个字段的命中区间，供 `Highlight` 直接消费 */
export function rangesOf<M extends { field: string; start: number; end: number }>(
  matches: readonly M[],
  field: M['field'],
): MatchRange[] {
  return matches.filter((m) => m.field === field).map((m) => ({ start: m.start, end: m.end }))
}
