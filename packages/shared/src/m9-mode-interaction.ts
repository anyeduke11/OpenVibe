// `packages/shared/src/m9-mode-interaction.ts` —— M9 v1.6 **P1e · 模式交互层的计算层**
// （`m9-dev-plan-2026-10.md` §6.6 ＋ `m9-dev-language-roadmap.md` §3.18 / §3.19 / §3.20
//  · **DL-37 / DL-38 / DL-39**）
//
// ## 它是什么
//
// P1e 三个子任务里**能脱离界面独立成立**的那一半：
//   ① 转档映射（§3.18）：已点亮的速成必学 → 精通路线站位 ⇒ 站区间；
//   ② 模式选择的落点（§3.19）：答「速成」与答「跳过」必须**逐字一致**；
//   ③ 资源模式标记（§3.20）：由必学集合反查 ⇒ **两档**。
//
// ## ⚠️ 为什么住在 shared（不在 core）
//
// §3.20 明写：「与 §3.18 共用同一个反查函数 —— 两处都在问
// 「这条东西在本模式下是不是必学」，**写两遍必然漂移**。」
// 而 §3.18 的站位映射与 §3.20 的资源标记**都要在浏览器里现算**
// （转档弹层是界面件、资源标记随模式切换即时重算）⇒
// **web 必须能 import 这一份**。`packages/core` 带原生依赖、web 又没有指向它的
// workspace 链接 ⇒ 放 core 就等于让 web 抄一份 ⇒ 漂移。
// ⇒ 放 shared：web 与 core 都已依赖它，是唯一能同时被两端拿到的纯计算层。
//
// ## ⚠️ 为什么必须有一个**共用的反查函数**（本模块存在的第一理由）
//
// ⇒ 本模块**只提供这一个** `isRequiredIn`；DL-37 与 DL-39 的计算都从它派生。
//   （两处各写一遍「查 `lang_topic_profiles.required`」的 SQL，就是两处口径。）
//
// ## ⚠️ 为什么是**两档**而不是三档（DL-39 的反证腿）
//
// 「本模式必学」/「仅扩展阅读」**只有两档**。
// ⚠️ 第三档「熟悉用」**被 DL-39 明令断言不存在** —— §3.20 当场修正过：
//   `familiar.required ⊆ master.required` ⇒ 任何覆盖了熟悉必学的资源必然也覆盖了精通必学
//   ⇒ 「熟悉用」恒空。**造一个永不出现的档位是最容易写进实现又最难被发现的错。**
//   ⇒ 本模块用**类型**把这件事收死：`ResourceModeLabel` 只有两个取值，
//   想加第三档得先改类型（而类型一改，DL-39 的反证腿就会红）。
//
// ⚠️ **P1d 之后 §3.20 的口径补注**（owner 2026-10-20 裁定待裁 #6「真正分开」）：
//   冷门六条补建后 `master.required`（实测 78 条）**严格大于** `familiar.required`（实测 72 条）——
//   多出来的正是那 6 类冷门底层（精通必学、熟悉可跳过）。
//   ⚠️ **但 `familiar.required ⊆ master.required` 仍然成立**
//   （实测：熟悉必学而精通不必学 = **0** 条；精通必学而熟悉不必学 = 6 条）
//   ⇒ 「熟悉用」（覆盖了熟悉必学、却没覆盖精通必学）**仍然是恒空分支**
//   ⇒ **两档实施不仅正确，理由还更强**：它不必等第三档的取值来源落地。
//   ⚠️ P1d 曾把这条写成「`familiar.required` 不再是 `master.required` 的子集」——
//   **那是把包含方向说反了**（给精通集加条目不会破坏 ⊆），已于 2026-10-20 订正。
//   **判据 DL-39 的档位数是本模块的口径。**
//
// ## ⚠️ 转档**只给位置，不给结论**（§3.18 的核心纪律）
//
// 点亮一条速成必学 **≠** 完成那一站 —— 精通路线在那一站还要更多条目、更深的 `depth`。
// ⇒ 本模块的产物里**只有**站区间与剩余站数，**没有**「已完成第 N 站」这种结论字段。
//   文案层的断言（界面文本不含「已完成第 … 站」）由界面侧单测断。
import type { LangProfile } from './m9-modes'

// ⚠️ **不转出 `LangProfile`** —— 它的唯一定义在 `./m9-modes`，
//   而 `packages/shared/src/index.ts` 用 `export *` 把两个模块都摊出去
//   ⇒ 两处都转出会变成「同名导出的歧义」，TS 直接报错。

/** 一条「知识点 × 模式」的行（`lang_topic_profiles` 的必要列）。 */
export interface TopicProfileLite {
  topic_id: number
  profile: LangProfile
  required: 0 | 1
  rank: number
  est_minutes: number | null
}

/** 一条知识点（`lang_topics` 的必要列）。 */
export interface TopicStageLite {
  id: number
  lang: 'python' | 'go'
  slug: string
  /** 站号（0 起）—— 库级条目恒为 0（DL-12：库级不进学习路线） */
  stage_id: number
  kind: 'language' | 'library'
}

// ============================================================================
// ① 共享反查
// ============================================================================

/**
 * **「这一行算不算必学」的唯一判定式** —— 全模块只有这一处写 `required === 1`。
 *
 * ⚠️ **为什么必须收成一处**：§3.20 写「两处都在问『这条东西在本模式下是不是必学』，
 *   写两遍必然漂移」。若 `isRequiredIn` 与 `requiredTopicIds` 各写一遍
 *   `profile === p && required === 1`，改了一处忘了另一处 ⇒ 转档与资源标记各说各话。
 *   ⇒ 判据：模块里 `required === 1` **只出现一次**（单测里断它）。
 */
function isRequiredRow(profile: LangProfile, row: TopicProfileLite): boolean {
  return row.profile === profile && row.required === 1
}

/**
 * **这条知识点在指定模式下是不是必学** —— DL-37 与 DL-39 共用的唯一口径。
 *
 * ⚠️ **入参是「行集合」而不是数据库** —— 本模块是纯计算层，不碰 DB、不碰网络。
 *   这样界面侧（拿 API 返回的数组）与单测（喂合成数据）走的是**同一条代码路径**。
 *
 * @param profile 当前模式
 * @param topicId 知识点 id
 * @param rows `lang_topic_profiles` 的行
 */
export function isRequiredIn(
  profile: LangProfile,
  topicId: number,
  rows: readonly TopicProfileLite[],
): boolean {
  for (const r of rows) {
    // ⚠️ **必须同时匹配 `topic_id` 与 `profile`** —— `lang_topic_profiles` 的主键是
    //   **(topic_id, profile)** 复合键：一个知识点在三个模式下各有一行。
    //   只按 topic_id 命中「第一行」，会把精通那行的 required 当成速成的 ⇒
    //   「精通必学」被误判成「速成不必学」。**这是复合键查表最常见的错法。**
    if (r.topic_id === topicId && r.profile === profile) return isRequiredRow(profile, r)
  }
  return false
}

/** 某模式下必学的知识点 id 集合（一次算完，供多处复用）。 */
export function requiredTopicIds(
  profile: LangProfile,
  rows: readonly TopicProfileLite[],
): Set<number> {
  const out = new Set<number>()
  for (const r of rows) {
    if (isRequiredRow(profile, r)) out.add(r.topic_id)
  }
  return out
}

// ============================================================================
// ② 转档映射（§3.18 · DL-37）
// ============================================================================

/** 转档计算的输入。 */
export interface TransferInput {
  /** 当前模式（转档入口在速成专区 ⇒ 传 `vibe`） */
  profile: LangProfile
  /** 当前语言 */
  lang: 'python' | 'go'
  /** 已点亮的知识点 id（点亮口径由调用方给，本模块不判「点亮」） */
  litTopicIds: ReadonlySet<number>
  /** 全部知识点（取 slug 与站号） */
  topics: readonly TopicStageLite[]
  /** 全部「知识点 × 模式」行 */
  profiles: readonly TopicProfileLite[]
}

/** 一条映射（一条速成必学 ⇒ 一条站位）。 */
export interface TransferMappingEntry {
  topicId: number
  slug: string
  stationNo: number
}

/** 转档计划 —— **只有位置，没有结论**。 */
export interface TransferPlan {
  /** 已点亮的**速成必学**条数（只数必学的；点亮了非必学的不算） */
  litRequiredCount: number
  /** 站区间（**1 起**，界面上「第 N 站」）；`null` = 一条速成必学都没点亮 */
  stationFrom: number | null
  stationTo: number | null
  /** 该语言的**站总数**（实测：Python 8 站 · Go 6 站） */
  totalStations: number
  /** 逐条映射 —— DL-37 的「逐条相等」就断它 */
  mapping: TransferMappingEntry[]
  /** 还差几站（站区间起点到最后一站） */
  remainingStations: number
}

/**
 * 算转档计划（§3.18）。
 *
 * ⚠️ **映射是查表，不是维护**（§3.18）：站位直接取 `lang_topics.stage_id`，
 *   **不新建表、不新建映射表** —— 一张「速成→精通对照表」等着人手工维护，
 *   而手工维护的对照表第一个月就会和知识点改动脱节。
 *
 * ⚠️ **站号从 1 起**：库里 `stage_id` 是 0 起，界面写「第 N 站」⇒ 这里 `+1`。
 *   转换只在这一处做，别在界面里再转一次。
 *
 * ⚠️ **站总数按语言实测**（distinct `stage_id`，只数语言级条目 ——
 *   库级条目 `stage_id` 恒为 0，不构成一站）。
 */
export function computeTransferPlan(input: TransferInput): TransferPlan {
  const { profile, lang, litTopicIds, topics, profiles } = input

  // 该语言的站总数（distinct stage_id，只数语言级）
  const stages = new Set<number>()
  for (const t of topics) {
    if (t.lang === lang && t.kind === 'language') stages.add(t.stage_id)
  }
  const totalStations = stages.size

  const required = requiredTopicIds(profile, profiles)
  const mapping: TransferMappingEntry[] = []
  for (const t of topics) {
    if (t.lang !== lang) continue
    // ⚠️ 库级条目不进路线（DL-12）—— 它的 stage_id 恒为 0，会被误读成「第 1 站」
    if (t.kind !== 'language') continue
    if (!required.has(t.id)) continue
    if (!litTopicIds.has(t.id)) continue
    mapping.push({ topicId: t.id, slug: t.slug, stationNo: t.stage_id + 1 })
  }
  mapping.sort((a, b) => a.stationNo - b.stationNo || a.topicId - b.topicId)

  const litRequiredCount = mapping.length
  if (litRequiredCount === 0) {
    return {
      litRequiredCount: 0,
      stationFrom: null,
      stationTo: null,
      totalStations,
      mapping,
      remainingStations: totalStations,
    }
  }
  const stationFrom = mapping[0]!.stationNo
  const stationTo = mapping[mapping.length - 1]!.stationNo
  return {
    litRequiredCount,
    stationFrom,
    stationTo,
    totalStations,
    mapping,
    // ⚠️ 「还剩」= 从当前站位那一站到最后一站（含当前那一站 ——
    //   用户正站在第 stationFrom 站**之前**，那一站还没走完）。
    remainingStations: Math.max(0, totalStations - stationFrom + 1),
  }
}

// ============================================================================
// ④ 首次进入的入口形态（§3.19 · DL-38）
// ============================================================================

/** 首次进入的一次性提问的两个落点（§3.19）。 */
export type ModeChoice = 'vibe' | 'master'

/**
 * **落库的学习模式**（**三档**）。
 *
 * ⚠️ **与 `ModeChoice` 差在哪（别混）**：
 *   - `ModeChoice` 是**首屏那一个提问**的答案域 —— §3.19 明写「两个选项 ＋ 一个出口」
 *     ⇒ 它**只有两档**，且**首屏组件不许扩**；
 *   - `ProfileChoice` 是**存下来的那个选择** —— §3.21 的阶段推荐会给出「熟悉」
 *     （阶段 1/2 的推荐档实测就是 `familiar`），用户点「改用推荐档」就会写这一档
 *     ⇒ **落库必须能装下三档**，否则推荐档写不进去。
 *
 * ⚠️ **两者不是同一个东西，所以不是同一个类型** —— 混成一个会让首屏组件
 *   的类型悄悄放宽成三档（「首屏两个选项」那条纪律就形同虚设了）。
 */
export type ProfileChoice = LangProfile

/**
 * 首屏的**入口形态**（§3.19 的折叠纪律）。
 *
 * ⚠️ **「折叠」与「隐藏」是两件事**：
 *   折叠 = 精通/熟悉收成**一行**「以后要深入再来」，那一行**一直可点**；
 *   隐藏 = 把精通/熟悉整段拿掉 ⇒ 半年后想深入的用户**找不到入口**（§3.19 第 4 条）。
 *   ⇒ 本函数用 `collapsedDeepModes` 这个**布尔**表达「收成一行」，
 *   而**不是**表达「那一行在不在」—— 那行由组件无条件渲染。
 */
export interface ModeEntryPlan {
  /** 精通/熟悉是否**折叠成一行**（true）还是**直接展开**（false） */
  collapsedDeepModes: boolean
  /** 是否展示两门语言的精通路线对比（不折叠时才有） */
  showMasterRoutes: boolean
}

/**
 * 算首屏的入口形态。
 *
 * - 提问屏（还没答）与速成落点屏 ⇒ 精通/熟悉**折叠成一行**；
 * - 精通落点屏 ⇒ **展开**两门语言的精通路线对比（§3.19 表第二行「不折叠」）。
 */
export function modeEntryPlan(answer: ModeChoice | null): ModeEntryPlan {
  if (answer === 'master') return { collapsedDeepModes: false, showMasterRoutes: true }
  return { collapsedDeepModes: true, showMasterRoutes: false }
}

// ============================================================================
// ③ 资源模式标记（§3.20 · DL-39）
// ============================================================================

/**
 * 资源模式标记的**两档**取值。
 *
 * ⚠️ **只有两个值** —— 第三档「熟悉用」是 DL-39 反令断言不存在的（见文件头）。
 *   用 `type` 收死：想加第三档得先改这个联合类型，而单测会盯着它。
 */
export type ResourceModeLabel = '本模式必学' | '仅扩展阅读'

/** 两档的中文文案（唯一出处 —— 界面不许另写一份）。 */
export const RESOURCE_MODE_LABELS: readonly ResourceModeLabel[] = ['本模式必学', '仅扩展阅读']

/**
 * 资源的模式标记（DL-39）。
 *
 * 判定式（§3.20 原文）：
 * `resource.rlabel(profile) = 覆盖了 ≥1 条 profile.required 的知识点 ? '本模式必学' : '仅扩展阅读'`
 *
 * ⚠️ **不新建反向索引**（§3.20）：判定走的是「当前 profile 的必学集合」这一份**已经在手**的集合，
 *   **不需要额外索引** —— 反向索引一旦能反向认领知识点，它就会开始定义路线。
 *
 * @param topicIds 这条资源挂接的知识点 id（`lang_topic_resources` 的挂接方向是「知识点 → 资源」，
 *                 所以这里是**反查**出来的：哪些知识点挂到了这条资源）
 */
export function resourceModeLabel(
  profile: LangProfile,
  topicIds: readonly number[],
  profiles: readonly TopicProfileLite[],
): ResourceModeLabel {
  const required = requiredTopicIds(profile, profiles)
  for (const id of topicIds) {
    if (required.has(id)) return '本模式必学'
  }
  return '仅扩展阅读'
}
