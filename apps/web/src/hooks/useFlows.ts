import { useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  FlowTemplateCreateInput,
  FlowTemplateOut,
  FlowTemplateUpdateInput,
} from '@openvibe/shared'
import { apiJson } from '../api/client'
import { useApiMutation } from '../hooks/useApiMutation'

export const FLOW_STALE_TIME = 15_000

/** dev-plan §5.3：flow duplicate/edit → ['flows']（项目快照已物化，不反向失效） */
export function useFlowTemplates() {
  return useQuery({
    queryKey: ['flows'],
    queryFn: () => apiJson<{ items: FlowTemplateOut[]; total: number }>('/api/flow-templates'),
    staleTime: FLOW_STALE_TIME,
  })
}

export function useFlowMutations() {
  const qc = useQueryClient()
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['flows'] })
  }

  const create = useApiMutation({
    mutationFn: (input: FlowTemplateCreateInput) =>
      apiJson<FlowTemplateOut>('/api/flow-templates', { method: 'POST', body: input }),
    onSuccess: invalidate,
  })
  const update = useApiMutation({
    mutationFn: ({ id, patch }: { id: string; patch: FlowTemplateUpdateInput }) =>
      apiJson<FlowTemplateOut>(`/api/flow-templates/${id}`, { method: 'PATCH', body: patch }),
    onSuccess: invalidate,
  })
  const remove = useApiMutation({
    mutationFn: (id: string) => apiJson<void>(`/api/flow-templates/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })
  const duplicate = useApiMutation({
    mutationFn: (id: string) =>
      apiJson<FlowTemplateOut>(`/api/flow-templates/${id}/duplicate`, { method: 'POST' }),
    onSuccess: invalidate,
  })

  return { create, update, remove, duplicate }
}
