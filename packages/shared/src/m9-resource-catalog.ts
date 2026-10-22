// `packages/shared/src/m9-resource-catalog.ts` —— **资源页的筛选**（纯计算层）。
//
// ## 它是什么
//
// 资源页（owner 2026-10-22 裁定「新建独立的资源页，并支持筛选」）的**筛选口径**：
// 关键字 · 分类 · 语言 · 模式标记（四档变两档）。
//
// ## ⚠️ 为什么筛选落在 shared 而不是 core
//
// 分层纪律（CLAUDE.md / dev-plan）：**纯计算层落 `packages/shared/src/`，
// core 侧只做落库 / 读取**。
// ⇒ 「哪些资源该留下」是纯计算（不碰数据库）⇒ 它在 shared；
// core 只负责把行**读出来**。
//
// ## ⚠️ 筛选维度只用 `category`，**不用 `tier`**
//
// `lang_resources` 有两套六档维度，肉眼看不出来：
// - `category`（official / github / course / book / video / practice）—— **「资源是什么形态」**；
// - `tier`（a–e）—— **「它在路线里排第几」**（必要性矩阵的轴）。
//
// 规格 §3.1 明写「**`category` 是筛选器用的**，两套维度不能混」⇒ 筛选只认 `category`。
//
// ## ⚠️ 模式标记**只两档**（DL-39）
//
// `resourceModeLabel` 由「本模式必学集合」反查派生（§3.20）⇒ 判定口径**只在 shared 一处**，
// 本文件**只调用它**，不另写一份。
import { resourceModeLabel, type ResourceModeLabel, type TopicProfileLite } from './m9-mode-interaction'
import type { LangProfile } from './m9-modes'

/** 资源页的一行（**读端给的形状**）。 */
export interface ResourceCatalogRow {
  id: number
  name: string
  url: string
  summary: string
  /** 资源形态（筛选维度） */
  category: string
  /** 语言（'python' | 'go'） */
  lang: string
  /** 费用（'free' | 'paid' | 'mix'） */
  price: string
  /** 界面语言（'zh' | 'en' | 'bi'） */
  lang_label: string
  /** §1.6.1 的档位（**展示用**，不是筛选维度） */
  tier: string
  /** 是否精选 */
  is_fav: boolean
  /** §3.14 的失效巡检结果（false ⇒ 已标灰） */
  alive: boolean
  /** 这条资源挂接了哪些知识点（反查） */
  topic_ids: number[]
  /** 挂接知识点的标题（点开标记时逐条列出） */
  topic_titles: { id: number; title: string }[]
}

/** 资源页的筛选条件。 */
export interface ResourceCatalogFilter {
  /** 关键字（匹配名称 / 摘要 / URL；**大小写不敏感**） */
  q?: string
  /** 分类（`category`） */
  category?: string
  /** 语言（`lang`） */
  lang?: string
  /** 模式标记筛选（'all' = 不筛） */
  mode?: 'all' | ResourceModeLabel
  /** 当前模式（决定「本模式必学」怎么算） */
  profile: LangProfile
  /** 全部「知识点 × 模式」行（`lang_topic_profiles`） */
  profiles: readonly TopicProfileLite[]
}

/** 筛选后的行 **＋ 模式标记**（标记在**同一处**算出来，不许前端再算一遍）。 */
export interface ResourceCatalogItem extends ResourceCatalogRow {
  /** 两档标记（§3.20） */
  mode_label: ResourceModeLabel
}

/** 分类的可选值（**与表里的 CHECK 逐字一致**）。 */
export const RESOURCE_CATEGORY_VALUES = [
  'official',
  'github',
  'course',
  'book',
  'video',
  'practice',
] as const
export type ResourceCategory = (typeof RESOURCE_CATEGORY_VALUES)[number]

/** 关键字归一（**去空白 ＋ 小写**）。 */
function normalize(text: string): string {
  return text.trim().toLowerCase()
}

/**
 * 筛出该留下的资源。
 *
 * ⚠️ **四道筛是「与」的关系**（逐条叠加，不是任选其一）。
 * ⚠️ **空值 = 不筛**（`undefined` / 空串 ⇒ 该维度不参与）⇒
 *   「分类」下拉框里「全部」就是空串。
 *
 * @param rows 全部资源行
 * @param filter 筛选条件
 */
export function filterResourceCatalog(
  rows: readonly ResourceCatalogRow[],
  filter: ResourceCatalogFilter,
): ResourceCatalogItem[] {
  const q = filter.q === undefined ? '' : normalize(filter.q)
  const category = filter.category === undefined ? '' : filter.category.trim()
  const lang = filter.lang === undefined ? '' : filter.lang.trim()
  const mode = filter.mode === undefined ? 'all' : filter.mode

  const out: ResourceCatalogItem[] = []
  for (const row of rows) {
    if (category !== '' && row.category !== category) continue
    if (lang !== '' && row.lang !== lang) continue
    if (q !== '') {
      const haystack = normalize(`${row.name} ${row.summary} ${row.url}`)
      if (!haystack.includes(q)) continue
    }
    const label = resourceModeLabel(filter.profile, row.topic_ids, filter.profiles)
    if (mode !== 'all' && label !== mode) continue
    out.push({ ...row, mode_label: label })
  }
  return out
}
