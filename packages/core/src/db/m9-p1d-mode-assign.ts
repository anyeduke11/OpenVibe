/**
 * `packages/core/src/db/m9-p1d-mode-assign.ts` —— M9 v1.6 **P1d · 模式层的口径**
 * （`m9-dev-plan-2026-10.md` §6.5 ＋ `m9-dev-language-roadmap.md` §3.17 · **DL-33 / DL-35 / DL-36**）
 *
 * ## 它是什么
 *
 * `lang_topic_profiles` 那 234 行**不是手写的清单**，而是由本模块的规则**现算**出来的：
 * 「模式只改三件事」—— 学哪些（required）· 先学哪个（rank）· 看到多深（depth）。
 *
 * ⚠️ **为什么现算而不手写**：手写 234 行意味着三份事实（必学集 / 深度 / 顺序）
 *   要人肉保持一致，而**没有任何东西会检查它们是否一致**。
 *   ⇒ 口径只留这一处：规则在这里，行是它的展开；单测把「展开出来的行」
 *   与「按规则现算一遍」逐行对账（改规则 ⇒ 闸红）。
 *
 * ## 三条规则
 *
 * 1. **必学集只从「进学习路线的语言级知识点」里选**（`kind='language'`）。
 *    ⚠️ 库级条目（`kind='library'`，§1.4 实测占 35.7%）**不在任何模式的必学集里** ——
 *    它们本来就不进学习路线（DL-12）。这同时保证了 DL-33 的逐层包含**成立**：
 *    速成要一条库级条目的话，就没法把它塞进「精通 ⊇ 熟悉 ⊇ 速成」的链条里。
 * 2. **深度按模式给上限**：精通 `full` / 熟悉 `concept` / 速成 `headline`。
 *    ⚠️ `depth` 是**能力上限**（「这个模式允许展开到哪一层」），不是内容有没有 ——
 *    界面上有没有那一层内容是另一回事（P3 的事）。
 * 3. **顺序按模式排**：精通与熟悉按「站序 → 入库序」；速成按「6 项能力 → 其余按站序」。
 *    ⇒ 速成的主线就是必学集，排在后面的都是「以后要深入再来」。
 *
 * ## 速成必学集从哪来（owner 2026-10-20 裁定）
 *
 * 附件 CHAPTER 06 的**「速成后你应该具备的 6 项能力」**（看得懂 / 会运行 / 读报错 /
 * 会反馈 / 小步迭代 / 会兜底）**反推**出必学知识点。
 *
 * ⚠️ **三项能力映射不出知识点**：会反馈 / 小步迭代 / 会兜底是**工作流**
 *   （贴报错回给小步、每天提交一次、翻车时回退版本）—— 它们属于附件的
 *   「Vibe Coding 4 步工作流」与「6 个翻车点」两块**静态内容**，
 *   按 §3.17 不进 DAG、不参与掌握度 ⇒ **不硬映射成知识点**。
 *   真正映射的是前三项（看得懂 / 会运行 / 读报错），它们恰好是「读代码」侧的知识。
 *
 * ⚠️ **与附件的「最小必要知识 7 项」的关系**：那 7 项里有两项（安装依赖、运行与调试）
 *   在仓内**没有独立条目**（安装依赖落在资源与静态面板）⇒ 与 §3.17.1 的登记一致：
 *   「最小知识 7 项与知识点不是一一对应」⇒ 单独成面板，不硬映射成 DAG 节点。
 */
import type { LangProfile } from './m9-p1d-spec'

export type { LangProfile }

/** 一条参与模式分配的知识点。 */
export interface ModeTopic {
  id: number
  lang: 'python' | 'go'
  slug: string
  stage_id: number
  kind: 'language' | 'library'
  content_level: 'point' | 'full'
}

/** 一行 `lang_topic_profiles`。 */
export interface TopicProfileRow {
  topic_id: number
  profile: LangProfile
  depth: 'headline' | 'concept' | 'full'
  required: 0 | 1
  rank: number
  est_minutes: number | null
}

/**
 * **冷门底层那 6 条**（精通专属、熟悉可跳过）——
 * owner 2026-10-20 裁定待裁 #6「真正分开」的落地清单。
 *
 * ⚠️ **口径来自附件与 spec 的两处点名**：
 *   - spec §6.3 第 6 条：元类/描述符深挖、runtime、反射、unsafe、cgo、pprof；
 *   - 附件「跳过」栏：Go 熟悉第 3 段点名的 pprof / 反射 / cgo（另加 goroutine 深入模式、
 *     gRPC 与微服务框架 —— 那两项**没有独立知识点且不属本轮 6 类**，如实登记在台账里）。
 */
export const COLD_TIER_TOPICS: readonly { lang: 'python' | 'go'; slug: string }[] = [
  { lang: 'python', slug: 'python3-metaclass' },
  { lang: 'go', slug: 'go-runtime' },
  { lang: 'go', slug: 'go-reflection' },
  { lang: 'go', slug: 'go-unsafe' },
  { lang: 'go', slug: 'go-cgo' },
  { lang: 'go', slug: 'go-pprof' },
]

/** 6 项能力（附件 CHAPTER 06 的原文顺序）。 */
export const VIBE_ABILITY_LABELS: readonly string[] = [
  '看得懂',
  '会运行',
  '读报错',
  '会反馈',
  '小步迭代',
  '会兜底',
]

/** 速成必学的一条：知识点 ＋ 「看懂并能提问」的分钟数。 */
export interface VibeEntry {
  slug: string
  minutes: number
}

/**
 * **6 项能力 → 必学知识点**（速成模式的必学集就是它的并集）。
 *
 * ⚠️ **分钟数是估的，且只算「看懂并能提问」**（§3.17 第 3 条）：
 *   不含练习与做项目 —— 合计约 130 分钟，而速成档是 3–7 天，
 *   那几天里练手与做项目占大头（附件自己的「Day 4–7 · 交付」段也是这么写的）。
 */
export const VIBE_ABILITY_MAP: Record<
  'python' | 'go',
  Record<string, readonly VibeEntry[]>
> = {
  python: {
    看得懂: [
      { slug: 'python3-basic-syntax', minutes: 8 },
      { slug: 'python3-comment', minutes: 3 },
      { slug: 'python3-data-type', minutes: 10 },
      { slug: 'python3-string', minutes: 8 },
      { slug: 'python3-list', minutes: 8 },
      { slug: 'python3-dictionary', minutes: 8 },
      { slug: 'python3-conditional-statements', minutes: 8 },
      { slug: 'python3-loop', minutes: 8 },
      { slug: 'python3-function', minutes: 12 },
      { slug: 'python3-module', minutes: 10 },
      { slug: 'python3-class', minutes: 12 },
      { slug: 'python-type-hints', minutes: 8 },
    ],
    会运行: [
      { slug: 'python3-interpreter', minutes: 8 },
      { slug: 'python3-inputoutput', minutes: 8 },
    ],
    读报错: [{ slug: 'python3-errors-execptions', minutes: 12 }],
    // 会反馈 / 小步迭代 / 会兜底 —— 工作流能力，属静态内容，不映射知识点
    会反馈: [],
    小步迭代: [],
    会兜底: [],
  },
  go: {
    看得懂: [
      { slug: 'go-basic-syntax', minutes: 8 },
      { slug: 'go-variables', minutes: 6 },
      { slug: 'go-data-types', minutes: 10 },
      { slug: 'go-scope-rules', minutes: 5 },
      { slug: 'go-structures', minutes: 10 },
      { slug: 'go-slice', minutes: 10 },
      { slug: 'go-map', minutes: 10 },
      { slug: 'go-type-casting', minutes: 6 },
      { slug: 'go-decision-making', minutes: 8 },
      { slug: 'go-loops', minutes: 8 },
      { slug: 'go-functions', minutes: 12 },
      { slug: 'go-modules', minutes: 8 },
      { slug: 'go-interfaces', minutes: 10 },
      { slug: 'go-type-assertion', minutes: 6 },
    ],
    会运行: [{ slug: 'go-program-structure', minutes: 8 }],
    读报错: [{ slug: 'go-error-handling', minutes: 12 }],
    会反馈: [],
    小步迭代: [],
    会兜底: [],
  },
}

/** 各模式的深度上限（规则 2）。 */
export const PROFILE_DEPTH: Record<LangProfile, 'headline' | 'concept' | 'full'> = {
  master: 'full',
  familiar: 'concept',
  vibe: 'headline',
}

/** 某语言的速成必学集合（slug → 分钟数）。 */
export function vibeMinutesBySlug(lang: 'python' | 'go'): Map<string, number> {
  const map = new Map<string, number>()
  for (const entries of Object.values(VIBE_ABILITY_MAP[lang])) {
    for (const e of entries) map.set(e.slug, e.minutes)
  }
  return map
}

/**
 * 现算 `lang_topic_profiles` 的全部行。
 *
 * @param topics 库里的全部知识点（含库级 —— 库级**不会**出现在结果里，规则 1）。
 */
export function assignTopicProfiles(topics: readonly ModeTopic[]): TopicProfileRow[] {
  const route = topics.filter((t) => t.kind === 'language')
  const cold = new Set(COLD_TIER_TOPICS.map((c) => `${c.lang}:${c.slug}`))
  const rows: TopicProfileRow[] = []

  for (const lang of ['python', 'go'] as const) {
    const langTopics = route.filter((t) => t.lang === lang)
    // 精通 / 熟悉：按「站序 → 入库序」排
    const byStage = [...langTopics].sort(
      (a, b) => a.stage_id - b.stage_id || a.id - b.id,
    )
    byStage.forEach((topic, index) => {
      const rank = index + 1
      rows.push({
        topic_id: topic.id,
        profile: 'master',
        depth: PROFILE_DEPTH.master,
        required: 1,
        rank,
        est_minutes: null,
      })
      const isCold = cold.has(`${topic.lang}:${topic.slug}`)
      rows.push({
        topic_id: topic.id,
        profile: 'familiar',
        depth: PROFILE_DEPTH.familiar,
        // ⚠️ 冷门底层那 6 条**熟悉不要求**（这正是「精通与熟悉真正分开」的地方）
        required: isCold ? 0 : 1,
        rank,
        est_minutes: null,
      })
    })

    // 速成：必学集在前（按 6 项能力的顺序），其余按站序排在后面
    const minutes = vibeMinutesBySlug(lang)
    const abilityOrder: string[] = []
    for (const ability of VIBE_ABILITY_LABELS) {
      for (const e of VIBE_ABILITY_MAP[lang][ability] ?? []) {
        if (!abilityOrder.includes(e.slug)) abilityOrder.push(e.slug)
      }
    }
    const bySlug = new Map(byStage.map((t) => [t.slug, t]))
    const ordered: ModeTopic[] = []
    for (const slug of abilityOrder) {
      const t = bySlug.get(slug)
      if (t !== undefined) ordered.push(t)
    }
    for (const t of byStage) {
      if (!abilityOrder.includes(t.slug)) ordered.push(t)
    }
    ordered.forEach((topic, index) => {
      const isRequired = minutes.has(topic.slug)
      rows.push({
        topic_id: topic.id,
        profile: 'vibe',
        depth: PROFILE_DEPTH.vibe,
        required: isRequired ? 1 : 0,
        rank: index + 1,
        est_minutes: isRequired ? (minutes.get(topic.slug) ?? null) : null,
      })
    })
  }
  return rows
}

/** 速成必学集在某语言上的分钟数合计（界面文案要写「不含练习与做项目」）。 */
export function vibeTotalMinutes(lang: 'python' | 'go'): number {
  let total = 0
  for (const m of vibeMinutesBySlug(lang).values()) total += m
  return total
}
