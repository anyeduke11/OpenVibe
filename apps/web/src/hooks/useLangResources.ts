import { useQuery } from '@tanstack/react-query'
import { apiJson } from '../api/client'
import type {
  ProfileChoice,
  ResourceCatalogItem,
  TopicProfileLite,
  VibeResourceRow,
} from '@openvibe/shared'

/**
 * M9 **资源页**的读端 hook（owner 2026-10-22 裁定：独立资源页 ＋ 支持筛选）。
 *
 * ## ⚠️ 一个端点给全
 *
 * `GET /api/lang/resources` 一次返回「当前模式 ＋ 模式行 ＋ 筛完的资源 ＋ 速成专区」⇒
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
  price?: string
  lang_label?: string
  alive?: 'all' | 'alive' | 'dead'
  fav?: boolean
  mode?: 'all' | '本模式必学' | '仅扩展阅读'
}

export interface LangResourceCatalogResponse {
  /** 用户自选过的模式（没自选过就是 null） */
  mode_choice: ProfileChoice | null
  /** 本次结果按哪个模式算的标记 */
  profile: 'master' | 'familiar' | 'vibe'
  /** 全部「知识点 × 模式」行（模式标记的判定输入） */
  profiles: TopicProfileLite[]
  /** 资源总数（**筛选前**） */
  total: number
  /** 筛完的资源 */
  resources: ResourceCatalogItem[]
  /**
   * **速成专区**的 11 条（§3.21 · 独立分区）。
   *
   * ⚠️ **维度筛选对它们不适用**（那 11 条没有分类/费用/阶段/精选）⇒
   *   只有**关键字**作用于它们。
   */
  vibe_resources: VibeResourceRow[]
}

export function useLangResources(filter: LangResourceFilter) {
  const params = new URLSearchParams()
  if (filter.q !== undefined && filter.q !== '') params.set('q', filter.q)
  if (filter.category !== undefined && filter.category !== '') {
    params.set('category', filter.category)
  }
  if (filter.lang !== undefined && filter.lang !== '') params.set('lang', filter.lang)
  if (filter.price !== undefined && filter.price !== '') params.set('price', filter.price)
  if (filter.lang_label !== undefined && filter.lang_label !== '') {
    params.set('lang_label', filter.lang_label)
  }
  if (filter.alive !== undefined && filter.alive !== 'all') params.set('alive', filter.alive)
  if (filter.fav === true) params.set('fav', '1')
  if (filter.mode !== undefined && filter.mode !== 'all') params.set('mode', filter.mode)
  const qs = params.toString()
  return useQuery({
    queryKey: ['lang-resources', qs],
    queryFn: () =>
      apiJson<LangResourceCatalogResponse>(`/api/lang/resources${qs === '' ? '' : `?${qs}`}`),
    staleTime: 30_000,
  })
}
