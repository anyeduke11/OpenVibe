import { useQuery } from '@tanstack/react-query'
import { apiJson, qs } from '../api/client'

/**
 * 本机事件台账（读侧）。
 *
 * 只读本机 SQLite，绝不出网；与 D3「遥测默认关闭」是正交的两件事——这条是
 * 「本机可复算的自证层」，不是遥测。契约见 `GET /api/telemetry/events`。
 */
export interface LedgerEvent {
  id: number
  name: string
  ts: string
  props?: Record<string, unknown> | null
}

export interface LedgerOut {
  items: LedgerEvent[]
  total: number
}

export const LEDGER_PAGE_SIZE = 50

export function useLedger(limit = LEDGER_PAGE_SIZE) {
  return useQuery({
    queryKey: ['ledger', limit],
    queryFn: () => apiJson<LedgerOut>(`/api/telemetry/events${qs({ limit })}`),
    // 端点未上线时页面要能降级成「不可用」而不是整页报错
    retry: false,
    staleTime: 10_000,
  })
}
