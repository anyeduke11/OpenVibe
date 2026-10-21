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

/**
 * M9「源码识别」的 API 契约（`m9-dev-language-roadmap.md` §3.8 / §3.9 / §3.10 · dev-plan §6.10 P4）。
 *
 * ⚠️ **扫描结果与命中列表是两种形状，不合并**：
 * - `LangScanSummary` = 一次扫描的**账**（走了哪条路、命中多少、有没有告警）；
 * - `SourceFindingRow` = 落库后的命中行（带知识点标题，给界面显示）。
 * ⇒ 扫描端点**不回**命中列表（避免同一份数据两种形状），界面扫完再读 `/api/lang/findings`。
 */

/** 一条命中（`lang_topic_findings` 的一行 ＋ 知识点信息）。 */
export const SourceFindingRow = z.object({
  id: z.number().int(),
  scan_id: z.number().int(),
  topic_id: z.number().int(),
  topic_slug: z.string(),
  topic_title: z.string(),
  lang: LangCodeSchema,
  /** **相对**项目根的路径（DL-23：绝不出现绝对路径） */
  file_rel_path: z.string(),
  line: z.number().int(),
  col: z.number().int(),
  /** 可 grep 的字面串（DL-22） */
  matched_pattern: z.string(),
  confidence: z.enum(['confirmed', 'possible']),
  scanner_mode: z.enum(['parser', 'heuristic']),
})
export type SourceFindingRow = z.infer<typeof SourceFindingRow>

/** 某门语言这一侧的扫描情况（⚠️ `mode = null` = 这一侧**没扫成**，不是「没命中」）。 */
export const LangScanInfo = z.object({
  lang: LangCodeSchema,
  mode: z.enum(['parser', 'heuristic']).nullable(),
  toolchain: z.string().nullable(),
  file_count: z.number().int(),
  hit_count: z.number().int(),
  notice: z.string().nullable(),
})
export type LangScanInfo = z.infer<typeof LangScanInfo>

/** `POST /api/lang/scan` 的出参。 */
export const LangScanSummary = z.object({
  project_id: z.string(),
  scan_id: z.number().int(),
  languages: z.array(LangScanInfo),
  /** ⚠️ 显式告警（空数组 = 没有告警，不是「未知」） */
  warnings: z.array(z.string()),
  written: z.number().int(),
  unknown_slugs: z.array(z.string()),
  states_updated: z.number().int(),
})
export type LangScanSummary = z.infer<typeof LangScanSummary>

/** `GET /api/lang/findings` 的出参。 */
export const LangFindingsResponse = z.object({
  findings: z.array(SourceFindingRow),
})
export type LangFindingsResponse = z.infer<typeof LangFindingsResponse>

/** `GET|POST /api/lang/source/consent` 的出参。 */
export const LangConsentResponse = z.object({
  remember_all: z.boolean(),
  remembered_at: z.string().nullable(),
  shares: z.array(
    z.object({
      id: z.number().int(),
      project_id: z.string(),
      topic_id_count: z.number().int(),
      snippet_count: z.number().int(),
      created_at: z.string(),
      consent_source: z.enum(['explicit_tick', 'remembered']),
    }),
  ),
})
export type LangConsentResponse = z.infer<typeof LangConsentResponse>
