import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { TaskCreateInput, TaskOut, TaskStatus, TaskUpdateInput } from '@openvibe/shared'
import { apiJson } from '../api/client'
import { PROJECT_STALE_TIME } from './useProjects'

export function useTasks(projectId: string | null) {
  return useQuery({
    queryKey: ['project-tasks', projectId],
    queryFn: () =>
      apiJson<{ items: TaskOut[]; total: number }>(`/api/projects/${projectId ?? ''}/tasks`),
    enabled: projectId !== null && projectId !== '',
    staleTime: PROJECT_STALE_TIME,
  })
}

/** 看板移动：status + order 同发给服务端，列内重编号由 TasksRepo.move 负责（m5 FR-4.1） */
export interface TaskMove {
  id: string
  status: TaskStatus
  order: number
}

export function useTaskMutations(projectId: string) {
  const qc = useQueryClient()
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['project-tasks', projectId] })
    // 任务计数进健康摘要（m5 §3）
    void qc.invalidateQueries({ queryKey: ['project', projectId] })
    void qc.invalidateQueries({ queryKey: ['projects'] })
  }

  const create = useMutation({
    mutationFn: (input: TaskCreateInput) =>
      apiJson<TaskOut>(`/api/projects/${projectId}/tasks`, { method: 'POST', body: input }),
    onSuccess: invalidate,
  })
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TaskUpdateInput }) =>
      apiJson<TaskOut>(`/api/tasks/${id}`, { method: 'PATCH', body: patch }),
    onSuccess: invalidate,
  })
  const move = useMutation({
    mutationFn: (m: TaskMove) =>
      apiJson<TaskOut>(`/api/tasks/${m.id}`, {
        method: 'PATCH',
        body: { status: m.status, order: m.order },
      }),
    onSuccess: invalidate,
    onError: invalidate,
  })
  const remove = useMutation({
    mutationFn: (id: string) => apiJson<void>(`/api/tasks/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })

  return { create, update, move, remove }
}
