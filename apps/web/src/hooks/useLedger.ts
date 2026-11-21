import { useQuery } from '@tanstack/react-query'
import { apiJson, qs } from '../api/client'

/**
 * 遥测事件读侧（`GET /api/telemetry/events` → `telemetry_events` 表）。
 *
 * ⚠️ 这**不是**本机事件台账：本表受 `telemetryEnabled` 开关控制、带 `sent_at`、
 * 开关打开后**会出网**（D3 白名单三类）。真正的「本机自证层」是
 * `hooks/useLocalEvents.ts` → `/api/local-events/summary` → `local_events`
 * （append-only、不出网、设置页 LocalLedgerSection 呈现）——两者是
 * FR-2.2 要求严格区分的正交两层，历史上本注释曾写反（local-event-ledger.md ⚠️l）。
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
