import { useQuery } from '@tanstack/react-query'
import { apiJson } from '../api/client'
import type { ProjectPortsOut } from '@openvibe/shared'

/** 端口与服务台账（m5 FR-8）：声明 × 本机监听 合并视图；15s 轻轮询跟运行态 */
export function useProjectPorts(id: string | null) {
  return useQuery({
    queryKey: ['ports', id],
    queryFn: () => apiJson<ProjectPortsOut>(`/api/projects/${id ?? ''}/ports`),
    enabled: id !== null && id !== '',
    staleTime: 5_000,
    refetchInterval: 15_000,
  })
}
