import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { DevLogCreateInput, DevLogOut, DevLogType, ReflowOriginOut } from '@openvibe/shared'
import { apiJson } from '../api/client'
import { PROJECT_STALE_TIME } from './useProjects'

export function useDevLog(projectId: string | null, type: DevLogType) {
  return useQuery({
    queryKey: ['project-devlog', projectId, type],
    queryFn: () =>
      apiJson<{ items: DevLogOut[]; total: number }>(
        `/api/projects/${projectId ?? ''}/devlog?type=${type}`,
      ),
    enabled: projectId !== null && projectId !== '',
    staleTime: PROJECT_STALE_TIME,
  })
}

/** 回流反查（m5 FR-7.2）：资产详情页显示「来源：项目 X 的 DEV-0007」 */
export function useReflowOrigin(assetId: string | null) {
  return useQuery({
    queryKey: ['reflow-origin', assetId],
    queryFn: () =>
      apiJson<{ origin: ReflowOriginOut | null }>(`/api/reflow-origin/${assetId ?? ''}`),
    enabled: assetId !== null && assetId !== '',
    staleTime: PROJECT_STALE_TIME,
  })
}

export function useDevLogMutations(projectId: string) {
  const qc = useQueryClient()
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['project-devlog', projectId] })
    void qc.invalidateQueries({ queryKey: ['project', projectId] })
    void qc.invalidateQueries({ queryKey: ['projects'] })
  }

  const create = useMutation({
    mutationFn: (input: DevLogCreateInput) =>
      apiJson<DevLogOut>(`/api/projects/${projectId}/devlog`, { method: 'POST', body: input }),
    onSuccess: invalidate,
  })
  /** 回流第二跳：新资产 id 记进 linkedAssetIds（m5 FR-7.1），失败只提示不回滚资产 */
  const linkAsset = useMutation({
    mutationFn: ({ logId, assetId }: { logId: string; assetId: string }) =>
      apiJson<{ log: DevLogOut }>(`/api/projects/${projectId}/devlog/${logId}/assets`, {
        method: 'POST',
        body: { assetId },
      }),
    onSuccess: invalidate,
  })

  return { create, linkAsset }
}
