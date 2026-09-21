import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  InjectionStatusOut,
  ProjectCreateInput,
  ProjectOut,
  ProjectUpdateInput,
} from '@openvibe/shared'
import { apiJson } from '../api/client'

/** dev-plan §5.3：staleTime 15s；项目侧写后失效 ['projects']/['project',id] 及子资源 */
export const PROJECT_STALE_TIME = 15_000

/** 健康摘要（m5 §3）：web 不 import core（R3 边界），形状在此单独声明 */
export interface ProjectHealth {
  stage: string | null
  unchecked: number
  total: number
  lastLogAt: string | null
  logCount: number
  taskCount: number
  injection: { packId: string | null; version: string | null }
}

export interface ProjectView extends ProjectOut {
  health: ProjectHealth
}

/** 创建/更新响应额外带路径提示（m5 FR-1.3：路径合法但当前不存在只警告，不报错） */
export interface ProjectMutationResult extends ProjectView {
  localPathWarning: string | null
}

export interface CheckState {
  stageName: string
  itemId: string
  checkedAt: string
}

export function useProjectList(status: string) {
  return useQuery({
    queryKey: ['projects', status],
    queryFn: () =>
      apiJson<{ items: ProjectView[]; total: number }>(
        `/api/projects${status === 'all' ? '' : `?status=${status}`}`,
      ),
    staleTime: PROJECT_STALE_TIME,
  })
}

export function useProject(id: string | null) {
  return useQuery({
    queryKey: ['project', id],
    queryFn: () => apiJson<ProjectView>(`/api/projects/${id ?? ''}`),
    enabled: id !== null && id !== '',
    staleTime: PROJECT_STALE_TIME,
  })
}

export function useCheckStates(id: string | null) {
  return useQuery({
    queryKey: ['project-checks', id],
    queryFn: () =>
      apiJson<{ items: CheckState[]; total: number }>(`/api/projects/${id ?? ''}/check-states`),
    enabled: id !== null && id !== '',
    staleTime: PROJECT_STALE_TIME,
  })
}

/** 注入状态只读解析 lock（m5 FR-6.2）：窗口聚焦即刷新，无推送 */
export function useInjectionStatus(id: string | null) {
  return useQuery({
    queryKey: ['injection-status', id],
    queryFn: () =>
      apiJson<InjectionStatusOut>(`/api/projects/${id ?? ''}/injection-status`),
    enabled: id !== null && id !== '',
    staleTime: 0,
    refetchOnWindowFocus: true,
  })
}

export function useProjectMutations(id?: string) {
  const qc = useQueryClient()
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['projects'] })
    if (id !== undefined) {
      void qc.invalidateQueries({ queryKey: ['project', id] })
      void qc.invalidateQueries({ queryKey: ['project-checks', id] })
      void qc.invalidateQueries({ queryKey: ['project-tasks', id] })
      void qc.invalidateQueries({ queryKey: ['project-devlog', id] })
    }
  }

  const create = useMutation({
    mutationFn: (input: ProjectCreateInput) =>
      apiJson<ProjectMutationResult>('/api/projects', { method: 'POST', body: input }),
    onSuccess: invalidate,
  })
  const update = useMutation({
    mutationFn: ({ id: pid, patch }: { id: string; patch: ProjectUpdateInput }) =>
      apiJson<ProjectMutationResult>(`/api/projects/${pid}`, { method: 'PATCH', body: patch }),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: (pid: string) => apiJson<void>(`/api/projects/${pid}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })
  const switchStage = useMutation({
    mutationFn: ({ stageName }: { stageName: string }) =>
      apiJson<ProjectView>(`/api/projects/${id ?? ''}/stages/current`, {
        method: 'POST',
        body: { stageName },
      }),
    onSuccess: invalidate,
  })
  /** 勾选即时持久化（m5 FR-3.2）：PUT 幂等，取消勾选由服务端删登记行 */
  const setCheck = useMutation({
    mutationFn: (input: { stageName: string; itemId: string; checked: boolean }) =>
      apiJson<{ checkStates: CheckState[]; health: ProjectHealth }>(
        `/api/projects/${id ?? ''}/check-states`,
        { method: 'PUT', body: input },
      ),
    onSuccess: () => {
      invalidate()
    },
  })

  return { create, update, remove, switchStage, setCheck }
}
