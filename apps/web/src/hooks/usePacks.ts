import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  ExportOut,
  InjectionOut,
  PackCreateInput,
  PackExportOut,
  PackOut,
  PackUpdateInput,
  PreviewOut,
} from '@openvibe/shared'
import { apiJson } from '../api/client'

/** dev-plan §5.3：标准包 key 目录 ['packs'] / ['pack',id] / ['pack-exports',id] / ['pack-preview',…] */
export const PACK_STALE_TIME = 15_000

export function usePackList() {
  return useQuery({
    queryKey: ['packs'],
    queryFn: () => apiJson<{ items: PackOut[]; total: number }>('/api/packs'),
    staleTime: PACK_STALE_TIME,
  })
}

export function usePack(id: string | null) {
  return useQuery({
    queryKey: ['pack', id],
    queryFn: () => apiJson<PackOut>(`/api/packs/${id ?? ''}`),
    enabled: id !== null && id !== '',
    staleTime: PACK_STALE_TIME,
  })
}

export function usePackExports(id: string | null) {
  return useQuery({
    queryKey: ['pack-exports', id],
    queryFn: () =>
      apiJson<{ items: PackExportOut[]; total: number }>(`/api/packs/${id ?? ''}/exports`),
    enabled: id !== null && id !== '',
    staleTime: PACK_STALE_TIME,
  })
}

export function usePackInjections(id: string | null) {
  return useQuery({
    queryKey: ['pack-injections', id],
    queryFn: () => apiJson<{ items: InjectionOut[]; total: number }>(`/api/packs/${id ?? ''}/injections`),
    enabled: id !== null && id !== '',
    staleTime: PACK_STALE_TIME,
  })
}

/**
 * 预览即产物：rev 是定义保存的代次——同版本号但选集变了也要重渲染，
 * 故把 rev 放进入键而不是复用缓存（m6a FR-2.3 由服务端同一 renderPack 保证字节一致）。
 */
export function usePackPreview(id: string | null, version: string, rev: number) {
  return useQuery({
    queryKey: ['pack-preview', id, version, rev],
    queryFn: () =>
      apiJson<PreviewOut>(`/api/packs/${id ?? ''}/preview`, { method: 'POST', body: { version } }),
    enabled: id !== null && id !== '',
    staleTime: PACK_STALE_TIME,
  })
}

export function usePackMutations(id?: string | null) {
  const qc = useQueryClient()
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['packs'] })
    if (id !== undefined && id !== null) void qc.invalidateQueries({ queryKey: ['pack', id] })
  }
  const invalidateExports = () => {
    void qc.invalidateQueries({ queryKey: ['pack-exports'] })
  }

  const create = useMutation({
    mutationFn: (input: PackCreateInput) =>
      apiJson<PackOut>('/api/packs', { method: 'POST', body: input }),
    onSuccess: invalidate,
  })
  const update = useMutation({
    mutationFn: ({ id: packId, patch }: { id: string; patch: PackUpdateInput }) =>
      apiJson<PackOut>(`/api/packs/${packId}`, { method: 'PATCH', body: patch }),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: (packId: string) => apiJson<void>(`/api/packs/${packId}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })
  /** 两条通道同一入口（m6a FR-3）：channel 决定目录是否落盘，bundle 恒可下载 */
  const exportPack = useMutation({
    mutationFn: ({ id: packId, body }: { id: string; body: { version: string; channel: 'download' | 'directory' } }) =>
      apiJson<ExportOut>(`/api/packs/${packId}/export`, { method: 'POST', body }),
    onSuccess: invalidateExports,
  })

  return { create, update, remove, exportPack }
}
