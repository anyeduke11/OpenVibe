import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiJson } from '../api/client'
import type {
  LangCode,
  LangProfile,
  ProfileChoice,
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
  const qs =
    projectId === undefined
      ? `lang=${lang}`
      : `lang=${lang}&project=${encodeURIComponent(projectId)}`
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

/**
 * **生效模式**的出参（服务端算好，§3.21）。
 *
 * ⚠️ **snake_case** —— 与本仓其余出参一致（服务端在边界上转一次）。
 * ⚠️ **界面不许自己算这一条** —— 优先级在服务端的 `resolveEffectiveProfile` 里。
 */
export interface EffectiveProfileOut {
  /** 生效档（`null` = 尚未选定） */
  profile: LangProfile | null
  /** 来源：`user` / `stage` / `unset` */
  source: 'user' | 'stage' | 'unset'
  /** 是否覆盖了阶段推荐 */
  differs_from_recommendation: boolean
  /** 阶段推荐（`null` = 没进阶段或该阶段无默认轨道） */
  recommendation: {
    stage_id: number
    profile: LangProfile
    lang: 'python' | 'go'
    note: string | null
  } | null
}

/** 模式层的读端出参（一次给全量，界面侧不必拼三四个请求）。 */
export interface LangModesOut {
  /** 用户自选过的模式（`null` = 还没自选 ⇒ 首次进入提问屏） */
  mode_choice: ProfileChoice | null
  /**
   * 当前成长阶段（§3.21；`null` = 还没进阶段）。
   *
   * ⚠️ 它只是**推荐值的来源** ⇒ 改了它**不直接**改生效模式
   *   （用户自选仍然优先 —— §3.21「自选降级为覆盖手段」）。
   */
  stage_choice: number | null
  /**
   * **当前生效的模式**（服务端算好的，§3.21）。
   *
   * ⚠️ **界面不许自己算这一条** —— 优先级（自选 ?? 阶段推荐 ?? 尚未选定）
   *   在服务端的 `resolveEffectiveProfile` 里 ⇒ 前端再算一遍必然漂移。
   */
  effective_profile: EffectiveProfileOut
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
 *
 * ⚠️ **三档**（`master` / `familiar` / `vibe`）—— 首屏组件仍只给两档，
 *   但阶段推荐可能落在「熟悉」，用户点「改用推荐档」时要能写进去。
 */
export function useLangModeChoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (choice: ProfileChoice) =>
      apiJson<{ mode_choice: ProfileChoice }>('/api/lang/modes/choice', {
        method: 'POST',
        body: { choice },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['lang-modes'] })
      void qc.invalidateQueries({ queryKey: ['lang-resources'] })
    },
  })
}

/**
 * 记一次阶段选择（§3.21：阶段 ⇒ 推荐档的来源）。
 *
 * ⚠️ **它不直接改生效模式** —— 用户自选仍然优先；
 *   界面上的「改用推荐档」是**另一次显式的模式选择**（走 `useLangModeChoice`）。
 */
export function useLangStageChoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (stage: number | null) =>
      apiJson<{ stage_choice: number | null; effective_profile: EffectiveProfileOut }>(
        '/api/lang/modes/stage',
        {
          method: 'POST',
          body: { stage },
        },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['lang-modes'] })
      void qc.invalidateQueries({ queryKey: ['lang-resources'] })
    },
  })
}
