import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  AppError,
  LangCodeSchema,
  type LangCodeOut,
  type ModeChoice,
} from '@openvibe/shared'
import {
  APP_META_KEYS,
  AppMetaRepo,
  readLitTopicIds,
  readResourcesWithTopics,
  readRoadmap,
  readStageTracks,
  readTopicDetail,
  readTopicProfiles,
  readTopicStages,
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

/** 模式选择的载荷（§3.19：两个选项 ＋ 一个出口 ⇒ 出口＝`vibe`）。 */
const ModeChoiceBody = z.object({
  choice: z.enum(['vibe', 'master']),
})

/** 模式相关的读端参数（`project` 可选：没有项目就没有「已点亮」）。 */
const ModesQuery = z.object({
  project: z.string().min(1).optional(),
})

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
    const choice = meta.read<ModeChoice | null>(APP_META_KEYS.langModeChoice, null)
    return {
      mode_choice: choice,
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
      throw new AppError('VALIDATION_ERROR', 'choice 必须是 vibe 或 master')
    }
    new AppMetaRepo(deps.db).write(APP_META_KEYS.langModeChoice, parsed.data.choice)
    return { mode_choice: parsed.data.choice }
  })
}
