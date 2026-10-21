import { z } from 'zod'

/**
 * M9「开发能力」页的 API 契约（`m9-dev-language-roadmap.md` §3.5 · dev-plan §6.9 P3）。
 *
 * ## 为什么要单独一份契约
 *
 * web 与 server 只经 HTTP 交互 ⇒ 形状必须**先有出处**，否则两处各写一份就会漂。
 * ⇒ 契约放 shared（两边都依赖它），server 按它出参、web 按它收参。
 *
 * ## ⚠️ 三态的取值域是**闭集**
 *
 * `unused` / `active` / `mastered` 三个字面量（§3.3 ＋ §3.13 的入库值）。
 * 中文文案**不在契约里**（文案是界面层的事，且 §6.3 第 2 条把它管在界面侧）。
 */

/** 两门语言。 */
export const LangCodeSchema = z.enum(['python', 'go'])

/** 三态（§3.3）。 */
export const MasteryStateSchema = z.enum(['unused', 'active', 'mastered'])

/** 路线视图里的一条知识点。 */
export const RoadmapTopicOut = z.object({
  id: z.number().int(),
  slug: z.string(),
  title: z.string(),
  summary: z.string(),
  /** 站号（**0 起**，与库里一致） */
  stage_id: z.number().int(),
  state: MasteryStateSchema,
})

/** 路线视图里的一站。 */
export const RoadmapStationOut = z.object({
  /** 站号（**0 起**） */
  stage_id: z.number().int(),
  /** 对外的站号（**1 起**） */
  stage_no: z.number().int(),
  name: z.string(),
  topics: z.array(RoadmapTopicOut),
})

/** `GET /api/lang/roadmap` 的出参。 */
export const RoadmapOut = z.object({
  lang: LangCodeSchema,
  /** 知识点总数（N） */
  topic_count: z.number().int(),
  /** 当前站（**1 起**；§3.5 的「第 M 站」） */
  current_stage: z.number().int(),
  /** 站数 */
  station_count: z.number().int(),
  stations: z.array(RoadmapStationOut),
})

/** 知识点的三段内容（§3.7 的 steps / example / principle）。 */
export const TopicContentOut = z.object({
  steps: z.string().nullable(),
  example: z.string().nullable(),
  principle: z.string().nullable(),
})

/** 语言差异条目（§3.12）。 */
export const TopicDeltaOut = z.object({
  aspect: z.string(),
  summary: z.string(),
  since_version: z.string(),
  until_version: z.string().nullable(),
})

/** 挂接的资源（§3.15 的显式挂接）。 */
export const TopicResourceOut = z.object({
  name: z.string(),
  url: z.string(),
  role: z.enum(['primary', 'backup', 'practice']),
  /** 必要性档位（§1.6.1 的 tier 轴） */
  tier: z.string(),
})

/** 挂接的术语（§3.4 · **只读挂接，零写入**）。 */
export const TopicTermOut = z.object({
  term_id: z.string(),
  zh: z.string(),
  en: z.string(),
})

/** `GET /api/lang/topics/:id` 的出参。 */
export const TopicDetailOut = z.object({
  id: z.number().int(),
  slug: z.string(),
  title: z.string(),
  summary: z.string(),
  lang: LangCodeSchema,
  /** 站号（0 起） */
  stage_id: z.number().int(),
  /** 对外的站号（1 起） */
  stage_no: z.number().int(),
  state: MasteryStateSchema,
  /** 三段内容（缺哪段就是 null，**不填自撰文案**） */
  content: TopicContentOut,
  /** 语言差异（按 aspect 升序） */
  deltas: z.array(TopicDeltaOut),
  /** 挂接的资源（按 role 再按名字排序） */
  resources: z.array(TopicResourceOut),
  /** 挂接的术语 */
  terms: z.array(TopicTermOut),
})

export type LangCodeOut = z.infer<typeof LangCodeSchema>
export type RoadmapTopicOut = z.infer<typeof RoadmapTopicOut>
export type RoadmapStationOut = z.infer<typeof RoadmapStationOut>
export type RoadmapOut = z.infer<typeof RoadmapOut>
export type TopicContentOut = z.infer<typeof TopicContentOut>
export type TopicDeltaOut = z.infer<typeof TopicDeltaOut>
export type TopicResourceOut = z.infer<typeof TopicResourceOut>
export type TopicTermOut = z.infer<typeof TopicTermOut>
export type TopicDetailOut = z.infer<typeof TopicDetailOut>
