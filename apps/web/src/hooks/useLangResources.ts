import { useQuery } from '@tanstack/react-query'
import { apiJson } from '../api/client'
import type { ModeChoice, ResourceCatalogItem, TopicProfileLite } from '@openvibe/shared'

/**
 * M9 **资源页**的读端 hook（owner 2026-10-22 裁定：独立资源页 ＋ 支持筛选）。
 *
 * ## ⚠️ 一个端点给全
 *
 * `GET /api/lang/resources` 一次返回「当前模式 ＋ 模式行 ＋ 筛完的资源」⇒
 * 页面**一次请求**就能渲染（不必先问模式、再问资源）。
 *
 * ## ⚠️ 筛选条件进 queryKey
 *
 * 筛选变了就是**另一个结果集** ⇒ 它必须进 key，否则 React Query 会拿旧的缓存糊弄。
 */

/** 资源页的筛选条件（**与端点的 query 参数逐字对应**）。 */
export interface LangResourceFilter {
  q?: string
  category?: string
  lang?: string
  mode?: 'all' | '本模式必学' | '仅扩展阅读'
}

export interface LangResourceCatalogResponse {
  /** 用户选过的模式（没选过就是 null） */
  mode_choice: ModeChoice | null
  /** 本次结果按哪个模式算的标记 */
  profile: 'master' | 'familiar' | 'vibe'
  /** 全部「知识点 × 模式」行（模式标记的判定输入） */
  profiles: TopicProfileLite[]
  /** 资源总数（**筛选前**） */
  total: number
  /** 筛完的资源 */
  resources: ResourceCatalogItem[]
}

export function useLangResources(filter: LangResourceFilter) {
  const params = new URLSearchParams()
  if (filter.q !== undefined && filter.q !== '') params.set('q', filter.q)
  if (filter.category !== undefined && filter.category !== '') {
    params.set('category', filter.category)
  }
  if (filter.lang !== undefined && filter.lang !== '') params.set('lang', filter.lang)
  if (filter.mode !== undefined && filter.mode !== 'all') params.set('mode', filter.mode)
  const qs = params.toString()
  return useQuery({
    queryKey: ['lang-resources', qs],
    queryFn: () =>
      apiJson<LangResourceCatalogResponse>(`/api/lang/resources${qs === '' ? '' : `?${qs}`}`),
    staleTime: 30_000,
  })
}
