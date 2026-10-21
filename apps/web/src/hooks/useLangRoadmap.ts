import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiJson } from '../api/client'
import type {
  LangCode,
  ModeChoice,
  RoadmapOut,
  StageTrack,
  TopicDetailOut,
  TopicProfileLite,
  TopicStageLite,
} from '@openvibe/shared'

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

/** 一条资源 ＋ 它挂接的知识点（**反查**方向：资源 ⇒ 知识点）。 */
export interface LangResourceEntry {
  id: number
  name: string
  url: string
  topic_ids: number[]
  topic_titles: { id: number; title: string }[]
}

/** 模式层的读端出参（一次给全量，界面侧不必拼三四个请求）。 */
export interface LangModesOut {
  /** 用户选过的模式（`null` = 还没选 ⇒ 首次进入提问屏） */
  mode_choice: ModeChoice | null
  /** 全部「知识点 × 模式」行 */
  profiles: TopicProfileLite[]
  /** 全部知识点的站位信息 */
  topics: TopicStageLite[]
  /** 阶段轨道（`lang_stage_tracks`） */
  stage_tracks: StageTrack[]
  /** 资源 ＋ 挂接的知识点 */
  resources: LangResourceEntry[]
  /** 已点亮的知识点 id（**某个项目**的行为证据） */
  lit_topic_ids: number[]
}

/**
 * 读模式层的数据（`projectId` 可选 ⇒ 没项目就没有「已点亮」那批）。
 *
 * ⚠️ **项目是可选的，但模式选择不是** —— 模式选择是**用户偏好**（落 `app_meta`），
 *   与项目无关。
 */
export function useLangModes(projectId?: string) {
  const qs = projectId === undefined ? '' : `?project=${encodeURIComponent(projectId)}`
  return useQuery({
    queryKey: ['lang-modes', projectId ?? ''],
    queryFn: () => apiJson<LangModesOut>(`/api/lang/modes${qs}`),
    staleTime: LANG_STALE_TIME,
  })
}

/**
 * 记一次模式选择（§3.19：只问一次；落点**不进 `lang_*`** ⇒ 服务端落 `app_meta`）。
 */
export function useLangModeChoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (choice: ModeChoice) =>
      apiJson<{ mode_choice: ModeChoice }>('/api/lang/modes/choice', {
        method: 'POST',
        body: { choice },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['lang-modes'] })
    },
  })
}
