import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiJson, qs } from '../api/client'
import type { LocalEventsClearOut, LocalEventsSummaryOut } from '@openvibe/shared'

/**
 * 本机事件台账（local-event-ledger.md FR-4 / FR-7）的前端读面与清空面。
 *
 * ## ⚠️ 与 `useLedger.ts` 是两件事，别混
 *
 * `useLedger` 读的是 `/api/telemetry/events` → **`telemetry_events` 表**：
 * 受「匿名遥测」开关控制、**有 `sent_at` 会被发出**。本文件的 `/api/local-events/*`
 * 读的是 `local_events` 表：无条件本机写、永不出网、只能一键清空。
 * 两者 kind 闭集严格不同名（FR-2.2），混名会让「关了遥测就没记录」这个误解被 UI 坐实。
 *
 * ## 为什么入参是绝对日窗而不是「最近 N 天」
 *
 * 端点只收 `from`/`to`：`day` 是 UTC 日戳，「最近 N 天」在读侧算会随时刻漂移
 * （同一条记录今天查和明天查答案不同）。窗由调用方按 `now` 解析成绝对区间再发。
 * 代价是 UI 必须**标注 UTC 口径**——设置页那一节就是这么标的。
 */

/** 窗为 `[from, to)` 含头不含尾，故 `to` 取「明天」 */
const DAY_MS = 86_400_000

/** 与 `shared/utils.ts` / `repos/localEvents.ts` 的 `dayOf` 同口径：UTC 日戳 */
export function utcDayOf(at: Date): string {
  return at.toISOString().slice(0, 10)
}

/**
 * 把「最近 N 天」解析成绝对日窗。
 *
 * @param days `0` 表示「全部」（用一个远早于任何真实事件的起点，避免给下限编故事）
 */
export function resolveWindow(days: number, now: Date): { from: string; to: string } {
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const toUtc = todayUtc + DAY_MS
  const fromUtc = days > 0 ? todayUtc - (days - 1) * DAY_MS : Date.UTC(2000, 0, 1)
  return { from: utcDayOf(new Date(fromUtc)), to: utcDayOf(new Date(toUtc)) }
}

export type LocalEventsWindowDays = 0 | 7 | 30

export function useLocalEventsSummary(days: LocalEventsWindowDays, now: Date) {
  const { from, to } = resolveWindow(days, now)
  return useQuery({
    // 带上 from/to：窗变了就是另一个查询，否则切预设会命中旧缓存显示错窗的数
    queryKey: ['local-events', 'summary', from, to],
    queryFn: () =>
      apiJson<LocalEventsSummaryOut>(`/api/local-events/summary${qs({ from, to })}`),
    // 台账是本机读，断网/未登录不该反复重试刷错误提示
    retry: false,
    staleTime: 10_000,
  })
}

/** 「一键清空」（FR-3.2）—— 不可逆，UI 必须二次确认，服务端不代做这个决定 */
export function useClearLocalEvents() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      apiJson<LocalEventsClearOut>('/api/local-events/clear', { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['local-events'] })
    },
  })
}
