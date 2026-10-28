import { useQuery } from '@tanstack/react-query'
import { apiJson } from '../api/client'
import { SETTINGS_STALE_TIME } from './useSettings'

/**
 * 侧栏各组的 API total 计数（DESIGN.md Layout：「资产」组每项带 API total 计数）。
 *
 * 单端点一次取齐，不是七个请求：侧栏常驻，并行查询会在每次失效时把 server
 * 打满。契约与 `GET /api/nav-counts` 一一对应；字段名同时在此声明一份，
 * 是为了让本hook 不依赖 `@openvibe/shared` 的导出时机（端点与类型由同一轮交付）。
 */
export interface NavCounts {
  prompts: number
  terms: number
  playbooks: number
  skills: number
  flows: number
  projects: number
  packs: number
}

export function useNavCounts() {
  return useQuery({
    queryKey: ['nav-counts'],
    queryFn: () => apiJson<NavCounts>('/api/nav-counts'),
    staleTime: SETTINGS_STALE_TIME,
  })
}
