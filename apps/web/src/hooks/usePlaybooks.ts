import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  PlaybookCreateInput,
  PlaybookOut,
  PlaybookSearchOut,
  PlaybookUpdateInput,
} from '@openvibe/shared'
import { apiJson, apiRaw } from '../api/client'

/** 与 useTerms 同口径的缓存窗口；技巧库读多写少，且列表页不做实时协同 */
export const PLAYBOOK_STALE_TIME = 15_000

interface PlaybooksListBody {
  items: PlaybookOut[]
  total: number
}

interface PlaybookSearchBody {
  items: PlaybookSearchOut[]
  total: number
}

export function usePlaybookList() {
  return useQuery({
    queryKey: ['playbooks'],
    queryFn: () => apiJson<PlaybooksListBody>('/api/playbooks'),
    staleTime: PLAYBOOK_STALE_TIME,
  })
}

/** 空 q 不参与搜索（与 terms 同）；<3 字走服务端 LIKE 降级 */
export function usePlaybookSearch(q: string) {
  const trimmed = q.trim()
  return useQuery({
    queryKey: ['playbook-search', trimmed],
    queryFn: () =>
      apiJson<PlaybookSearchBody>(`/api/playbooks/search?q=${encodeURIComponent(trimmed)}`),
    enabled: trimmed !== '',
    staleTime: PLAYBOOK_STALE_TIME,
  })
}

/** PLAYBOOKS.md 只读预览（m4 FR-6.1）：服务端确定性渲染，前端不加工字节 */
export function usePlaybooksMd(playbookIds: string[]) {
  return useQuery({
    queryKey: ['playbooks-render', playbookIds.join(',')],
    queryFn: () =>
      apiJson<{ content: string }>('/api/playbooks/render-playbooks-md', {
        method: 'POST',
        body: { playbookIds },
      }),
    enabled: playbookIds.length > 0,
    staleTime: PLAYBOOK_STALE_TIME,
  })
}

export function usePlaybookMutations() {
  const qc = useQueryClient()
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['playbooks'] })
    void qc.invalidateQueries({ queryKey: ['playbook-search'] })
    // 渲染快照随条目变动失效，否则预览里会出现已删条目（STALE_SELECTION）
    void qc.invalidateQueries({ queryKey: ['playbooks-render'] })
  }

  const create = useMutation({
    mutationFn: (input: PlaybookCreateInput) =>
      apiJson<PlaybookOut>('/api/playbooks', { method: 'POST', body: input }),
    onSuccess: invalidate,
  })
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: PlaybookUpdateInput }) =>
      apiJson<PlaybookOut>(`/api/playbooks/${id}`, { method: 'PATCH', body: patch }),
    onSuccess: invalidate,
  })
  /** 删除走 apiRaw：X-Referenced-Packs 提示被哪些标准包选过（m6a §6.2 同源） */
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRaw(`/api/playbooks/${id}`, { method: 'DELETE' })
      return res.headers.get('x-referenced-packs')
    },
    onSuccess: invalidate,
  })

  return { create, update, remove }
}
