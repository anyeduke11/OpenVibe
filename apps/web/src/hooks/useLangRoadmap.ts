import { useQuery } from '@tanstack/react-query'
import { apiJson } from '../api/client'
import type { LangCode, RoadmapOut, TopicDetailOut } from '@openvibe/shared'

/**
 * M9「开发能力」页的读端 hook（dev-plan §6.9 P3）。
 *
 * ⚠️ **项目是可选参数**：不传 ⇒ 按全库汇总；传了 ⇒ 只看那个项目的状态。
 * ⚠️ 掌握度永远是「某个项目的行为证据」（§2.2）⇒ **当前项目必须由调用方显式给**，
 *   服务端不猜（猜错就把别的项目的证据算成你的）。
 */

/** 读端结果的陈旧时间（本地库，15 秒足够） */
export const LANG_STALE_TIME = 15_000

/** 一门语言的路线视图。 */
export function useLangRoadmap(lang: LangCode, projectId?: string) {
  const qs = projectId === undefined ? `lang=${lang}` : `lang=${lang}&project=${encodeURIComponent(projectId)}`
  return useQuery({
    queryKey: ['lang-roadmap', lang, projectId ?? ''],
    queryFn: () => apiJson<RoadmapOut>(`/api/lang/roadmap?${qs}`),
    staleTime: LANG_STALE_TIME,
  })
}

/** 一个知识点的详情（`id = null` ⇒ 不查）。 */
export function useLangTopic(id: number | null, projectId?: string) {
  const qs = projectId === undefined ? '' : `?project=${encodeURIComponent(projectId)}`
  return useQuery({
    queryKey: ['lang-topic', id, projectId ?? ''],
    queryFn: () => apiJson<TopicDetailOut>(`/api/lang/topics/${String(id ?? 0)}${qs}`),
    enabled: id !== null,
    staleTime: LANG_STALE_TIME,
  })
}
