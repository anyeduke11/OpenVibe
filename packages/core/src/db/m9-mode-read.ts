/**
 * `packages/core/src/db/m9-mode-read.ts` —— **P1e / P1f 的读端**
 * （`m9-dev-language-roadmap.md` §3.18 / §3.19 / §3.20 / §3.21 · dev-plan §6.6 / §6.7）
 *
 * ## 它是什么
 *
 * P1e/P1f 的四个界面件（`ModeOnboarding` / `ModeTransferPanel` /
 * `ResourceModeChip` / `StageTracks`）一直**没有挂载** —— 因为读端**没有**
 * 「模式相关的行」这一层。⇒ 本文件把那一层补上。
 *
 * ## ⚠️ 为什么**另起一个文件**（而不是塞进 `m9-p2-state.ts`）
 *
 * DL-34 的可执行形态是**源码扫描**：`lang_topic_profiles` /
 * `lang_profile_phases` / `lang_stage_tracks` 三个表名**在掌握度推导文件的
 * SQL 里出现即红**（模式不得影响掌握度判定）。
 * ⇒ 模式表的读取必须住在**另一个文件**里，否则闸会当场红。
 *
 * ## ⚠️ 排序一律放 JS
 *
 * `lang_topic_profiles` 的主键是**复合键** `(topic_id, profile)` ⇒ 本仓的 SQL
 * 静态守卫只认单列唯一键作兜底排序键 ⇒ 这里**不许 ORDER BY**。
 */
import type { SqliteDatabase } from '../db'
import { readTopicStateMap } from './m9-p2-state'
import type {
  LangProfile,
  ResourceCatalogRow,
  TopicProfileLite,
  TopicStageLite,
  VibeResourceRow,
} from '@openvibe/shared'

/**
 * 读全部「知识点 × 模式」行（`lang_topic_profiles`）。
 *
 * ⚠️ **必须同时带 `topic_id` 与 `profile`** —— 这两列是复合主键；
 *   界面侧用 `isRequiredIn` 反查时也**必须**两个键一起比。
 */
export function readTopicProfiles(db: SqliteDatabase): TopicProfileLite[] {
  const rows = db
    .prepare(
      `SELECT topic_id, profile, required, rank, est_minutes
         FROM lang_topic_profiles`,
    )
    .all() as {
    topic_id: number
    profile: LangProfile
    required: 0 | 1
    rank: number
    est_minutes: number | null
  }[]
  return rows
    .map((r) => ({
      topic_id: r.topic_id,
      profile: r.profile,
      required: r.required,
      rank: r.rank,
      est_minutes: r.est_minutes,
    }))
    .sort(
      (a, b) => a.topic_id - b.topic_id || a.profile.localeCompare(b.profile) || a.rank - b.rank,
    )
}

/**
 * 读全部知识点的**站位信息**（`lang_topics` 的必要列）。
 *
 * ⚠️ `kind` 必须带上 —— 库级条目（`kind='library'`）的 `stage_id` 恒为 0，
 *   算站数时**必须**排除（DL-12：库级不进学习路线）。
 */
export function readTopicStages(db: SqliteDatabase): TopicStageLite[] {
  const rows = db.prepare('SELECT id, lang, slug, stage_id, kind FROM lang_topics').all() as {
    id: number
    lang: 'python' | 'go'
    slug: string
    stage_id: number
    kind: 'language' | 'library'
  }[]
  return rows
    .map((r) => ({
      id: r.id,
      lang: r.lang,
      slug: r.slug,
      stage_id: r.stage_id,
      kind: r.kind,
    }))
    .sort((a, b) => a.id - b.id)
}

/** 一条资源 ＋ 它挂接的知识点 id（**反查**方向：资源 ⇒ 知识点）。 */
export interface ResourceWithTopics {
  id: number
  name: string
  url: string
  /** 这条资源挂接了哪些知识点（`lang_topic_resources` 是「知识点 → 资源」⇒ 这里反过来） */
  topic_ids: number[]
  /** 挂接知识点的标题（界面点开资源时逐条列出） */
  topic_titles: { id: number; title: string }[]
}

/**
 * 读资源 ＋ 它们的挂接关系。
 *
 * ⚠️ **反查方向**：`lang_topic_resources` 的挂接方向是「知识点 → 资源」，
 *   而资源标记要问的是「这条资源挂接了哪些知识点」⇒ 这里**反着查**。
 *   （§3.20 明写：不新建反向索引 —— 反向索引一旦能反向认领知识点，
 *   它就会开始定义路线。）
 *
 * @param limit 最多读多少条资源（界面只展示一小节）
 */
export function readResourcesWithTopics(db: SqliteDatabase, limit = 20): ResourceWithTopics[] {
  const resources = db.prepare('SELECT id, name, url FROM lang_resources').all() as {
    id: number
    name: string
    url: string
  }[]
  const links = db.prepare('SELECT topic_id, resource_id FROM lang_topic_resources').all() as {
    topic_id: number
    resource_id: number
  }[]
  const titles = db.prepare('SELECT id, title FROM lang_topics').all() as {
    id: number
    title: string
  }[]
  const titleById = new Map<number, string>(titles.map((t) => [t.id, t.title]))
  const byResource = new Map<number, number[]>()
  for (const l of links) {
    const list = byResource.get(l.resource_id) ?? []
    list.push(l.topic_id)
    byResource.set(l.resource_id, list)
  }
  return resources.slice(0, limit).map((r) => {
    const topicIds = (byResource.get(r.id) ?? []).sort((a, b) => a - b)
    return {
      id: r.id,
      name: r.name,
      url: r.url,
      topic_ids: topicIds,
      topic_titles: topicIds
        .filter((id) => titleById.has(id))
        .map((id) => ({ id, title: titleById.get(id) as string })),
    }
  })
}

/**
 * 读资源页要用的**全量**资源行（`lang_resources` ＋ 挂接反查）。
 *
 * ⚠️ **为什么与 `readResourcesWithTopics` 分开**：那个函数是「界面上展示一小节」
 *   （`limit = 20`）；资源页要**全量**（89 条）才能筛选 ⇒ 两个口径两个函数，
 *   **不靠「把 limit 传大」糊弄**（那个 limit 还被既有界面当「一小节」的语义用）。
 *
 * ⚠️ **排序**：主查询按 `id`（单列唯一键 ⇒ 允许 ORDER BY）；
 *   挂接关系表是**复合主键** ⇒ **不在 SQL 里排**（守卫的兜底键白名单只认单列唯一键），
 *   排序放 JS。
 *
 * ⚠️ **只读 `lang_resources`**，**不含 `lang_vibe_resources`**（速成专区 11 条）——
 *   那 11 条没有 `category` / `lang` 维度（§1.7 明写：硬塞进主表会给它们编一套
 *   不存在的筛选维度）⇒ 混进同一份筛选结果就是骗人。
 */
export function readResourceCatalogRows(db: SqliteDatabase): ResourceCatalogRow[] {
  const resources = db
    .prepare(
      `SELECT id, name, url, summary, category, lang, price, lang_label, tier, is_fav, alive,
              last_checked_at, consecutive_fails
         FROM lang_resources
        ORDER BY id ASC`,
    )
    .all() as {
    id: number
    name: string
    url: string
    summary: string
    category: string
    lang: string
    price: string
    lang_label: string
    tier: string
    is_fav: number
    alive: number
    last_checked_at: string | null
    consecutive_fails: number
  }[]
  const links = db.prepare('SELECT topic_id, resource_id FROM lang_topic_resources').all() as {
    topic_id: number
    resource_id: number
  }[]
  const byResource = new Map<number, number[]>()
  for (const l of links) {
    const list = byResource.get(l.resource_id) ?? []
    list.push(l.topic_id)
    byResource.set(l.resource_id, list)
  }
  const titles = db.prepare('SELECT id, title FROM lang_topics').all() as {
    id: number
    title: string
  }[]
  const titleById = new Map<number, string>(titles.map((t) => [t.id, t.title]))
  return resources.map((r) => {
    const topicIds = (byResource.get(r.id) ?? []).sort((a, b) => a - b)
    return {
      id: r.id,
      name: r.name,
      url: r.url,
      summary: r.summary,
      category: r.category,
      lang: r.lang,
      price: r.price,
      lang_label: r.lang_label,
      tier: r.tier,
      is_fav: r.is_fav === 1,
      alive: r.alive === 1,
      // ⚠️ **巡检日 ≠ 取证日**（§3.14：「核实过」是快照，不是结论）
      last_checked_at: r.last_checked_at,
      consecutive_fails: r.consecutive_fails,
      // ⚠️ **排序放 JS**（复合主键表不能在 SQL 里 ORDER BY）
      topic_ids: topicIds,
      topic_titles: topicIds
        .filter((id) => titleById.has(id))
        .map((id) => ({ id, title: titleById.get(id) as string })),
    }
  })
}

/**
 * 读**速成专区**的资源行（`lang_vibe_resources` · §3.21 另附 11 条）。
 *
 * ⚠️ **刻意没有维度列** —— 这 11 条在附件里没有分类 / 费用 / 阶段 / 精选 / 星数
 *   ⇒ 给它们编一套就是伪造 ⇒ 资源页里它们是**独立分区**，**筛选器不适用**
 *   （只受关键字搜索影响，那不是维度）。
 *
 * ⚠️ **失效巡检与主表同款**（§3.21 末段：这张表更容易烂，恰恰更该巡检）。
 *
 * ⚠️ **排序**：按 `id`（单列唯一键 ⇒ 允许 ORDER BY）。
 */
export function readVibeResourceRows(db: SqliteDatabase): VibeResourceRow[] {
  const rows = db
    .prepare(
      `SELECT id, "group", name, url, summary, alive, last_checked_at, consecutive_fails
         FROM lang_vibe_resources
        ORDER BY id ASC`,
    )
    .all() as {
    id: number
    group: string
    name: string
    url: string
    summary: string
    alive: number
    last_checked_at: string | null
    consecutive_fails: number
  }[]
  return rows.map((r) => ({
    id: r.id,
    group: r.group,
    name: r.name,
    url: r.url,
    summary: r.summary,
    alive: r.alive === 1,
    last_checked_at: r.last_checked_at,
    consecutive_fails: r.consecutive_fails,
  }))
}

/**
 * 读「**已点亮**的知识点 id」（该项目的）。
 *
 * ⚠️ **点亮口径 = 不是 `unused`**（§3.3 的三态：`unused` / `active` / `mastered`）
 *   ⇒ `active` 与 `mastered` 都算点亮。
 *
 * @param projectId 项目 id（掌握度是**某个项目的行为证据** ⇒ 必须给项目）
 */
export function readLitTopicIds(db: SqliteDatabase, projectId: string): number[] {
  const states = readTopicStateMap(db, projectId)
  const out: number[] = []
  for (const [id, state] of states) {
    if (state !== 'unused') out.push(id)
  }
  return out.sort((a, b) => a - b)
}
