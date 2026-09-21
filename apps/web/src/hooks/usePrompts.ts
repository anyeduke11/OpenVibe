import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  PromptCreateInput,
  PromptOut,
  PromptUpdateInput,
  PromptVersionOut,
} from '@openvibe/shared'
import { apiJson, apiRaw, qs } from '../api/client'

export interface PromptFilters {
  page: number
  size?: number
  tag?: string
  folder?: string
  platform?: string
  status?: string
  q?: string
}

export interface PromptListResult {
  items: PromptOut[]
  total: number
  page: number
}

export interface PromptCreateResult extends PromptOut {
  warnings: string[]
}

export interface PromptUpdateResult {
  prompt: PromptOut
  versionCreated: PromptVersionOut | null
  warnings: string[]
}

export interface ImportReport {
  created: string[]
  skipped: { title: string; reason: string }[]
}

/** dev-plan §5.3：staleTime 15s；写后精确失效 ['prompts'] / ['prompt',id] / ['prompt-versions',id] */
export const PROMPT_STALE_TIME = 15_000

export function usePromptList(filters: PromptFilters) {
  return useQuery({
    queryKey: ['prompts', filters],
    queryFn: () => apiJson<PromptListResult>(`/api/prompts${qs({ ...filters })}`),
    staleTime: PROMPT_STALE_TIME,
  })
}

/** 当前过滤结果的全部条目（供文件夹树/标签栏聚合，走缓存不分页拉取） */
export function usePromptAggregates(base: Omit<PromptFilters, 'page' | 'size'>) {
  return useQuery({
    queryKey: ['prompts-aggregate', base],
    queryFn: () => apiJson<PromptListResult>(`/api/prompts${qs({ ...base, page: 1, size: 200 })}`),
    staleTime: PROMPT_STALE_TIME,
  })
}

export function usePromptVersions(promptId: string | null) {
  return useQuery({
    queryKey: ['prompt-versions', promptId],
    queryFn: () => apiJson<PromptVersionOut[]>(`/api/prompts/${promptId ?? ''}/versions`),
    enabled: promptId !== null && promptId !== '',
    staleTime: PROMPT_STALE_TIME,
  })
}

export function usePromptMutations() {
  const qc = useQueryClient()
  const invalidate = (id?: string) => {
    void qc.invalidateQueries({ queryKey: ['prompts'] })
    void qc.invalidateQueries({ queryKey: ['prompts-aggregate'] })
    if (id !== undefined) void qc.invalidateQueries({ queryKey: ['prompt', id] })
  }
  const invalidateVersions = (id?: string) => {
    if (id !== undefined) void qc.invalidateQueries({ queryKey: ['prompt-versions', id] })
  }

  const create = useMutation({
    mutationFn: (input: PromptCreateInput) =>
      apiJson<PromptCreateResult>('/api/prompts', { method: 'POST', body: input }),
    onSuccess: () => invalidate(),
  })
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: PromptUpdateInput }) =>
      apiJson<PromptUpdateResult>(`/api/prompts/${id}`, { method: 'PATCH', body: patch }),
    onSuccess: (_r, vars) => {
      invalidate(vars.id)
      invalidateVersions(vars.id)
    },
  })
  const restore = useMutation({
    mutationFn: ({ id, versionNo }: { id: string; versionNo: number }) =>
      apiJson<{ prompt: PromptOut; newVersionNo: number }>(
        `/api/prompts/${id}/versions/${String(versionNo)}/restore`,
        { method: 'POST' },
      ),
    onSuccess: (_r, vars) => {
      invalidate(vars.id)
      invalidateVersions(vars.id)
    },
  })
  const importPrompts = useMutation({
    mutationFn: (body: { files: { filename: string; content: string }[] }) =>
      apiJson<ImportReport>('/api/prompts/import', { method: 'POST', body }),
    onSuccess: () => invalidate(),
  })
  /** 删除走 apiRaw：X-Referenced-Packs 响应头携带引用包名（m1 §6.3 / DEV-0013 C-6） */
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRaw(`/api/prompts/${id}`, { method: 'DELETE' })
      return res.headers.get('x-referenced-packs')
    },
    onSuccess: (_r, id) => {
      invalidate(id)
      invalidateVersions(id)
    },
  })

  return { create, update, restore, importPrompts, remove }
}
