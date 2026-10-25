import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiJson } from '../api/client'
import type { AdoptionOut, ExtractConsentOut } from '@openvibe/shared'
import { SETTINGS_STALE_TIME } from './useSettings'

/** M10/D 批次 D：提取链的设置面（总闸/采纳率/同意）。取数口径与 useSettings 同族。 */
export function useExtractGate() {
  return useQuery({
    queryKey: ['extract-gate'],
    queryFn: () => apiJson<{ enabled: boolean }>('/api/extract/gate'),
    staleTime: SETTINGS_STALE_TIME,
  })
}

export function useExtractGateToggle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (enabled: boolean) =>
      apiJson<{ enabled: boolean }>('/api/extract/gate', { method: 'POST', body: { enabled } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['extract-gate'] })
    },
  })
}

export function useAdoption() {
  return useQuery({
    queryKey: ['ai-adoption'],
    queryFn: () => apiJson<AdoptionOut>('/api/ai/adoption'),
    staleTime: SETTINGS_STALE_TIME,
  })
}

export function useExtractConsents() {
  return useQuery({
    queryKey: ['extract-consents'],
    queryFn: () => apiJson<ExtractConsentOut>('/api/extract/consents'),
    staleTime: SETTINGS_STALE_TIME,
  })
}

export function useExtractConsentClear() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (projectId: string) =>
      apiJson<ExtractConsentOut>(`/api/extract/consents/${projectId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['extract-consents'] })
    },
  })
}

export interface ExtractUsageRowView {
  provider: string
  model: string
  calls: number
  okCalls: number
  candidates: number
  lastAt: string | null
}

/** 成本台账（「AI 与出网」区）：按 provider/model 分组的出网计数（本机现算） */
export function useExtractUsage() {
  return useQuery({
    queryKey: ['ai-extract-usage'],
    queryFn: () => apiJson<{ usage: ExtractUsageRowView[] }>('/api/ai/extract/usage'),
    staleTime: SETTINGS_STALE_TIME,
  })
}
