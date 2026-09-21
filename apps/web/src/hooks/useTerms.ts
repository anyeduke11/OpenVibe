import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  TermCreateInput,
  TermOut,
  TermSearchOut,
  TermUpdateInput,
  TermsOrderBy,
} from '@openvibe/shared'
import { apiJson, apiRaw } from '../api/client'

/** dev-plan §5.3：术语 key 目录 ['terms'] / ['term-search',q] / ['terms-render',ids,orderBy] */
export const TERM_STALE_TIME = 15_000

interface TermsListBody {
  items: TermOut[]
  total: number
}

interface TermSearchBody {
  items: TermSearchOut[]
  total: number
}

export function useTermList() {
  return useQuery({
    queryKey: ['terms'],
    queryFn: () => apiJson<TermsListBody>('/api/terms'),
    staleTime: TERM_STALE_TIME,
  })
}

/** 空 q 不参与搜索（m3 FR-3）；<3 字走服务端 LIKE 降级 */
export function useTermSearch(q: string) {
  const trimmed = q.trim()
  return useQuery({
    queryKey: ['term-search', trimmed],
    queryFn: () =>
      apiJson<TermSearchBody>(`/api/terms/search?q=${encodeURIComponent(trimmed)}`),
    enabled: trimmed !== '',
    staleTime: TERM_STALE_TIME,
  })
}

export function useTermsMd(termIds: string[], orderBy: TermsOrderBy) {
  const key = termIds.join(',')
  return useQuery({
    queryKey: ['terms-render', key, orderBy],
    queryFn: () =>
      apiJson<{ content: string }>('/api/terms/render-terms-md', {
        method: 'POST',
        body: { termIds, orderBy },
      }),
    enabled: termIds.length > 0,
    staleTime: TERM_STALE_TIME,
  })
}

export function useTermMutations() {
  const qc = useQueryClient()
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['terms'] })
    void qc.invalidateQueries({ queryKey: ['term-search'] })
    // 渲染快照随词条变动失效，避免预览里出现已删条目（STALE_SELECTION）
    void qc.invalidateQueries({ queryKey: ['terms-render'] })
  }

  const create = useMutation({
    mutationFn: (input: TermCreateInput) =>
      apiJson<TermOut>('/api/terms', { method: 'POST', body: input }),
    onSuccess: invalidate,
  })
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TermUpdateInput }) =>
      apiJson<TermOut>(`/api/terms/${id}`, { method: 'PATCH', body: patch }),
    onSuccess: invalidate,
  })
  /** 删除走 apiRaw：X-Referenced-Packs 提示被哪些标准包选过（m6a §6.2 同源） */
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRaw(`/api/terms/${id}`, { method: 'DELETE' })
      return res.headers.get('x-referenced-packs')
    },
    onSuccess: invalidate,
  })

  return { create, update, remove }
}
