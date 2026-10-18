import { z } from 'zod'
import { TERM_LEVELS } from '../constants'

/**
 * 「本项目该掌握哪些术语」的出参（m3-terms-learning FR-6）。
 *
 * ⚠️ **P3 只有 `source='baseline'`**。FR-6.3 的 AI 增强层是 P4：届时本字段扩成
 * `z.enum(['baseline','ai'])`。**在 P4 落地之前这里刻意不给 ai** ——
 * 若现在就写进 `'ai'` 的取值空间，界面（FR-6.3.3 最后一行：降级时不得显示 AI 标记）
 * 就会有能力显示「AI 推荐」而背后没有 AI，那正是本 spec 最想防的静默欺骗。
 */

/** FR-6.4 绝对门槛：达不到就不推荐（判据是误报率，不是召回率） */
export const TERM_RECOMMEND_THRESHOLD = 3.0
/** FR-6.4 单项目上限：一屏能读完 */
export const TERM_RECOMMEND_LIMIT = 12

/**
 * 单条理由。`text` 装**命中原文**（checklist 那一句 / 阶段名 / skill 名），
 * FR-6.4 要求「必须显示为什么推给你」，没有原文用户无从判断该不该信。
 *
 * ⚠️ FR-7.2：`projects.local_path` **不得**出现在这里。三种 kind 的取值来源
 * 都只从 `stages_snapshot` 与 skill 的 name/description 来，**都不经过 local_path**，
 * 因此这条是结构上成立的，不是靠调用方自觉。
 */
export const TermRecommendationReason = z.object({
  /**
   * `domain` 那一支**不装原文** —— 它装的是项目领域名。
   * ⚠️ 之所以单独开一支而不是并进 `stage`：并进去会让「因为领域重合」
   * 被界面标成「阶段名命中」，那是**对理由的谎报** —— FR-6.4 要求理由属实，
   * 用户要靠它判断该不该信，标错来源比不给理由更坏。
   */
  kind: z.enum(['checklist', 'stage', 'skill', 'domain']),
  /** `domain` 装项目领域名；其余三支装命中的原文（checklist 那一句 / 阶段名 / skill 名） */
  text: z.string().min(1),
})
export type TermRecommendationReason = z.infer<typeof TermRecommendationReason>

export const TermRecommendation = z.object({
  termId: z.string(),
  zh: z.string().default(''),
  en: z.string().nullable().default(null),
  level: z.enum(TERM_LEVELS),
  starter: z.boolean(),
  domain: z.string().nullable(),
  score: z.number(),
  /**
   * **`min(1)` 是契约，不是巧合**：FR-6.4 要求每条推荐都能说清为什么推给你。
   * 取值全部来自项目自身文本（checklist / 阶段名 / 绑定 skill 名），
   * 因此非空是打分的**副产品**而不是额外填的文案 ——
   * 没有可引原文的词条拿不到 2.0/1.5/1.0 三项中的任何一项，进不了门槛。
   * 判据 WEB-M3T-05 断的就是这条。
   */
  reasons: z.array(TermRecommendationReason).min(1),
})
export type TermRecommendation = z.infer<typeof TermRecommendation>

export const TermRecommendationsResponse = z.object({
  projectId: z.string(),
  source: z.literal('baseline'),
  /** 回显门槛与上限：让调用方能区分「被门槛挡掉」与「确实没有可推的」 */
  threshold: z.number(),
  limit: z.number(),
  /**
   * 推导出来的项目领域（FR-6.2 的 1.5 因子依据）。
   * ⚠️ 它是**中间量**，出参带出来是为了可解释与可复算 —— FR-7 边界要求
   * 「只读、本地计算、不出网」，而这一条让「到底算了什么」能被第三方核对。
   */
  projectDomains: z.array(z.string()),
  items: z.array(TermRecommendation),
})
export type TermRecommendationsResponse = z.infer<typeof TermRecommendationsResponse>
