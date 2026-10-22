import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  AppError,
  filterResourceCatalog,
  filterVibeResources,
  LangCodeSchema,
  type EffectiveProfile,
  type LangCodeOut,
  type LangProfile,
  type ProfileChoice,
  type ProfileSource,
} from '@openvibe/shared'
import {
  APP_META_KEYS,
  AppMetaRepo,
  readEffectiveProfile,
  readLitTopicIds,
  readResourceCatalogRows,
  readResourcesWithTopics,
  readRoadmap,
  readStageChoice,
  readStageTracks,
  readTopicDetail,
  readTopicProfiles,
  readTopicStages,
  readVibeResourceRows,
  writeStageChoice,
  type SqliteDatabase,
} from '@openvibe/core'

/**
 * M9「开发能力」页的读端（`m9-dev-language-roadmap.md` §3.5 · dev-plan §6.9 P3）。
 *
 * 两个端点：
 * - `GET /api/lang/roadmap?lang=python` —— 站列 ＋ 当前层 ＋ 三态；
 * - `GET /api/lang/topics/:id` —— 详情页（三段 ＋ 差异 ＋ 外链 ＋ 术语挂接）。
 *
 * ⚠️ **项目是可选参数**（`?project=`）：不传 ⇒ 按全库汇总（同一知识点取最高档），
 *   传了 ⇒ 只看那个项目的状态。⚠️ **掌握度永远是「某个项目的行为证据」**（§2.2），
 *   所以「当前项目」这件事必须由调用方显式给，不能由服务端猜。
 */

export interface LangRouteDeps {
  db: SqliteDatabase
}

const RoadmapQuery = z.object({
  lang: LangCodeSchema,
  /** 项目 id（可选）：给了就只看这个项目的状态 */
  project: z.string().min(1).optional(),
})

const TopicQuery = z.object({
  project: z.string().min(1).optional(),
})

const TopicParams = z.object({
  id: z.coerce.number().int().positive(),
})

/**
 * 模式选择的载荷（§3.19：首屏两个选项 ＋ 一个出口 ⇒ 出口＝`vibe`）。
 *
 * ⚠️ **端点接受**三档**，首屏组件仍然只给两档** —— 这是两件事：
 *   - 首屏那一个提问只有两个选项（§3.19）⇒ 组件层不变；
 *   - 但**落库**必须能装下「熟悉」 —— §3.21 的阶段推荐（阶段 1/2 实测就是 `familiar`）
 *     经用户点「改用推荐档」后会写这一档 ⇒ 端点只放两档 ⇒ 推荐档写不进去。
 *   ⇒ 端点放宽是**落库需要**，不是把首屏改成三选一。
 */
const ModeChoiceBody = z.object({
  choice: z.enum(['master', 'familiar', 'vibe']),
})

/**
 * 阶段选择的载荷（§3.21：`stage_id ∈ {0,1,2,3}`；`null` = 回到「还没进阶段」）。
 *
 * ⚠️ **越界 ⇒ 422**（不是静默忽略）—— 静默忽略会让界面以为选中了。
 */
const StageChoiceBody = z.object({
  stage: z.number().int().min(0).max(3).nullable(),
})

/** 模式相关的读端参数（`project` 可选：没有项目就没有「已点亮」）。 */
const ModesQuery = z.object({
  project: z.string().min(1).optional(),
})

/**
 * 资源页的读端参数（owner 2026-10-22 裁定「独立资源页 ＋ 支持筛选」）。
 *
 * ⚠️ **筛选维度只有四个**：关键字 · 分类 · 语言 · 模式标记。
 *   ⚠️ **没有 `tier`** —— `tier` 是「它在路线里排第几」（必要性矩阵的轴），
 *   而 `category` 才是「资源是什么形态」（规格 §3.1 明写：两套维度不能混）。
 */
const ResourceCatalogQuery = z.object({
  /** 当前模式（缺省 ⇒ 取用户的选择，再缺省 ⇒ 精通） */
  profile: z.enum(['master', 'familiar', 'vibe']).optional(),
  /** 关键字（名称 / 摘要 / URL） */
  q: z.string().optional(),
  /** 分类 */
  category: z.string().optional(),
  /** 语言 */
  lang: z.string().optional(),
  /** 费用 */
  price: z.string().optional(),
  /** 界面语言 */
  lang_label: z.string().optional(),
  /** 失效巡检筛选 */
  alive: z.enum(['all', 'alive', 'dead']).optional(),
  /** 只看精选 */
  fav: z.enum(['0', '1']).optional(),
  /** 模式标记筛选（'all' = 不筛） */
  mode: z.enum(['all', '本模式必学', '仅扩展阅读']).optional(),
})

/**
 * 生效模式的**出参形状**（snake_case —— 与本仓其余出参一致）。
 *
 * ⚠️ **服务端做这一次改名** —— shared 的 `EffectiveProfile` 是 camelCase 的
 *   （它是**计算层**的类型，不是传输格式）⇒ 边界上转一次，界面拿到的就是本仓的常规形状。
 */
export interface EffectiveProfileView {
  /** 生效档（`null` = 尚未选定） */
  profile: LangProfile | null
  /** 来源：`user` / `stage` / `unset` */
  source: ProfileSource
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

/** shared 的计算结果 ⇒ 出参形状（**唯一的转换处**）。 */
function toEffectiveProfileView(eff: EffectiveProfile): EffectiveProfileView {
  return {
    profile: eff.profile,
    source: eff.source,
    differs_from_recommendation: eff.differsFromRecommendation,
    recommendation:
      eff.recommendation === null
        ? null
        : {
            stage_id: eff.recommendation.stageId,
            profile: eff.recommendation.profile,
            lang: eff.recommendation.lang,
            note: eff.recommendation.note,
          },
  }
}

export function registerLangRoutes(app: FastifyInstance, deps: LangRouteDeps): void {
  app.get('/api/lang/roadmap', async (req) => {
    const parsed = RoadmapQuery.safeParse(req.query)
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'lang 必须是 python 或 go')
    }
    const { lang, project } = parsed.data
    const view = readRoadmap(deps.db, lang as LangCodeOut, project)
    return view
  })

  app.get('/api/lang/topics/:id', async (req) => {
    const params = TopicParams.safeParse(req.params)
    if (!params.success) {
      throw new AppError('VALIDATION_ERROR', 'id 必须是正整数')
    }
    const query = TopicQuery.safeParse(req.query)
    const project = query.success ? query.data.project : undefined
    const detail = readTopicDetail(deps.db, params.data.id, project)
    if (detail === null) {
      throw new AppError('NOT_FOUND', `知识点 ${String(params.data.id)} 不存在`)
    }
    return detail
  })

  // ⚠️ **模式层的读端**（P1e / P1f 的四个界面件一直缺的就是这一层）
  //   ⇒ 一次给全量，界面侧不必自己拼三四个请求。
  app.get('/api/lang/modes', async (req) => {
    const parsed = ModesQuery.safeParse(req.query)
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'project 参数不合法')
    }
    const meta = new AppMetaRepo(deps.db)
    const choice = meta.read<ProfileChoice | null>(APP_META_KEYS.langModeChoice, null)
    // ⚠️ **生效模式只算一处**（`readEffectiveProfile`）——
    //   「用户自选 ?? 阶段推荐 ?? 尚未选定」的优先级在 shared 的
    //   `resolveEffectiveProfile` 里，这里只是把三个输入喂给它。
    const effective = readEffectiveProfile(deps.db)
    return {
      mode_choice: choice,
      // ⚠️ **阶段选择**（§3.21）：推荐值的来源，**不是**生效模式的落点
      stage_choice: readStageChoice(deps.db),
      effective_profile: toEffectiveProfileView(effective),
      profiles: readTopicProfiles(deps.db),
      topics: readTopicStages(deps.db),
      stage_tracks: readStageTracks(deps.db),
      resources: readResourcesWithTopics(deps.db),
      // ⚠️ 「已点亮」是**某个项目**的行为证据 ⇒ 没给项目就没有这批
      lit_topic_ids: parsed.data.project === undefined
        ? []
        : readLitTopicIds(deps.db, parsed.data.project),
    }
  })

  // ⚠️ 记一次模式选择（§3.19：只问一次；落点**不进 `lang_*`** ⇒ 落 `app_meta`）
  app.post('/api/lang/modes/choice', async (req) => {
    const parsed = ModeChoiceBody.safeParse(req.body)
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'choice 必须是 master、familiar 或 vibe')
    }
    new AppMetaRepo(deps.db).write(APP_META_KEYS.langModeChoice, parsed.data.choice)
    return { mode_choice: parsed.data.choice }
  })

  /**
   * **记一次阶段选择**（§3.21：阶段 → 推荐档的来源）。
   *
   * ⚠️ **它不直接改生效模式** —— 用户自选仍然优先（§3.21「自选降级为覆盖手段」）；
   *   阶段只改**推荐值**。界面上的「改用推荐档」是**另一次显式的模式选择**，
   *   走 `POST /api/lang/modes/choice` ⇒ 两件事不混在一个写入里。
   */
  app.post('/api/lang/modes/stage', async (req) => {
    const parsed = StageChoiceBody.safeParse(req.body)
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'stage 必须是 0–3 的整数或 null')
    }
    writeStageChoice(deps.db, parsed.data.stage)
    return {
      stage_choice: parsed.data.stage,
      effective_profile: toEffectiveProfileView(readEffectiveProfile(deps.db)),
    }
  })

  /**
   * **资源页**的读端（owner 2026-10-22 裁定：独立资源页 ＋ 支持筛选）。
   *
   * ⚠️ **一个端点把页面要的东西都给全**（模式选择 ＋ 模式行 ＋ 资源列表）
   *   ⇒ 页面**一次请求**就能渲染，不必先问「当前是什么模式」再问「资源有哪些」。
   *
   * ⚠️ **筛选是纯计算** ⇒ 它在 `@openvibe/shared` 的 `filterResourceCatalog`，
   *   这里只负责**读行 ＋ 调用**（口径只留一处）。
   */
  app.get('/api/lang/resources', async (req) => {
    const parsed = ResourceCatalogQuery.safeParse(req.query)
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', '资源筛选参数不合法')
    }
    const meta = new AppMetaRepo(deps.db)
    const choice = meta.read<ProfileChoice | null>(APP_META_KEYS.langModeChoice, null)
    // ⚠️ **模式缺省时的顺序**：显式参数 → 用户自选 → 阶段推荐 → 精通。
    //   ⚠️ 用户的「速成」选择**不能**被悄悄换成精通（那是模式选择的语义，见 §3.19）。
    //   ⚠️ 「用户自选 ?? 阶段推荐」这一段是 `readEffectiveProfile` 算的（口径只留一处）。
    const effective = readEffectiveProfile(deps.db)
    const profile = parsed.data.profile ?? effective.profile ?? 'master'
    const profiles = readTopicProfiles(deps.db)
    const rows = readResourceCatalogRows(deps.db)
    const items = filterResourceCatalog(rows, {
      q: parsed.data.q,
      category: parsed.data.category,
      lang: parsed.data.lang,
      price: parsed.data.price,
      langLabel: parsed.data.lang_label,
      alive: parsed.data.alive ?? 'all',
      favOnly: parsed.data.fav === '1',
      mode: parsed.data.mode ?? 'all',
      profile,
      profiles,
    })
    return {
      mode_choice: choice,
      profile,
      profiles,
      total: rows.length,
      resources: items,
      // ⚠️ **速成专区是独立分区**（§3.21）：这 11 条**没有**分类/费用/阶段/精选维度
      //   ⇒ 维度筛选对它们**不适用**（给它们编一套就是伪造）⇒ 只受**关键字**影响。
      vibe_resources: filterVibeResources(readVibeResourceRows(deps.db), parsed.data.q),
    }
  })
}
