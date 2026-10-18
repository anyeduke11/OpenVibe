import { useQuery } from '@tanstack/react-query'
import type { TermRecommendationsResponse } from '@openvibe/shared'
import { apiJson } from '../api/client'

/**
 * m3 FR-6 · 「本项目该掌握哪些术语」。
 *
 * ⚠️ `staleTime` 比一般资源长：推荐是**纯本地确定性计算**，同一份项目快照算多少次
 * 结果都一样（服务端判据「两次调用逐字一致」钉的就是这条）。缓存久一点不会产生陈旧数据。
 */
export const TERM_RECOMMEND_STALE_TIME = 60_000

export function useTermRecommendations(projectId: string | undefined) {
  return useQuery({
    queryKey: ['term-recommendations', projectId],
    enabled: projectId !== undefined && projectId !== '',
    staleTime: TERM_RECOMMEND_STALE_TIME,
    queryFn: () =>
      apiJson<TermRecommendationsResponse>(`/api/projects/${projectId}/term-recommendations`),
  })
}
