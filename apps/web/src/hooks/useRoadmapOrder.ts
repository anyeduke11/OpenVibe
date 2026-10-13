import { useCallback, useState } from 'react'
import { TERM_ROADMAP } from '@openvibe/shared'

/**
 * 学习路线站顺序的自定义持久化（DEV-0077）：localStorage 按**稳定站 id** 存顺序，
 * 读取时与默认站清单归一——未知 id 丢弃（路线缩编）、缺 id 按默认序补尾（路线扩编），
 * 站方/版本演进前向兼容。顺序是显示层偏好：词条归属仍由 tag 决定，不动数据。
 */
const KEY = 'terms.roadmap.order.v1'

function load(): string[] | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    return parsed.filter((x): x is string => typeof x === 'string')
  } catch {
    return null
  }
}

/** 默认序 + 自定义序 → 展示序（归一：丢未知、补缺失） */
function mergeOrder(defaultIds: readonly string[], custom: readonly string[]): string[] {
  const known = new Set(defaultIds)
  const head = custom.filter((id) => known.has(id))
  const tail = defaultIds.filter((id) => !head.includes(id))
  return [...head, ...tail]
}

const defaultIds = TERM_ROADMAP.map((s) => s.id)

export function useRoadmapOrder() {
  const [custom, setCustom] = useState<string[] | null>(() => load())

  const order = custom === null ? defaultIds : mergeOrder(defaultIds, custom)
  const isCustom = custom !== null

  const persist = useCallback((next: string[] | null) => {
    try {
      if (next === null) localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      /* localStorage 不可用时顺序仅本次会话生效 */
    }
  }, [])

  const move = useCallback(
    (id: string, delta: -1 | 1) => {
      setCustom((prev) => {
        const base = mergeOrder(defaultIds, prev ?? [])
        const i = base.indexOf(id)
        const j = i + delta
        if (i < 0 || j < 0 || j >= base.length) return prev
        const next = [...base]
        const tmp = next[i]
        next[i] = next[j] ?? ''
        next[j] = tmp ?? ''
        persist(next)
        return next
      })
    },
    [persist],
  )

  const reset = useCallback(() => {
    setCustom(null)
    persist(null)
  }, [persist])

  return { order, isCustom, move, reset }
}
