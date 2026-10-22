import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { AppError, SourceInterpretSummary } from '@openvibe/shared'
import {
  capabilityOf,
  formatInterpretMarkdown,
  interpretSourceFindings,
  providerConfigView,
  readFindings,
  readProviderConfig,
  readProjectRoot,
  readSnippet,
  readSnippets,
  resolveProvider,
  resolveProviderRunner,
  writeProviderConfig,
  SourceServiceError,
  type SourceInterpretRunner,
  type SqliteDatabase,
} from '@openvibe/core'
import { InterpretProviderConfig, type InterpretProviderConfig as InterpretProviderConfigType } from '@openvibe/shared'

/**
 * M9「源码解读」（T2）端点（`m9-dev-language-roadmap.md` §3.8 / §5.5 / §7 DL-08 / DL-09 ·
 * dev-plan §6.11 P5.1 ~ P5.4）。
 *
 * 端点清单：
 * - `GET  /api/lang/snippet` —— 读命中行附近的**本地源码**（T1 硬要求：勾选前要看到全文）；
 * - `GET  /api/lang/interpret/capability` —— AI 是否可用（界面据此决定**要不要渲染 T2 区**）；
 * - `POST /api/lang/interpret` —— 解读**勾选过的**片段。
 *
 * ## ⚠️ `/api/lang/snippet` 是**本地读**，不是出网
 *
 * 它读的是用户本机项目里的文件，显示在用户自己的屏幕上 ⇒ 不属于「出网」。
 * ⚠️ 但它**必须是受控的**：路径必须相对项目根、不许 `..`、不许越界（core 侧兜住）。
 *
 * ## ⚠️ runner 从**环境变量**解析（仓内不硬编任何 provider）
 *
 * `OPENVIBE_M9_INTERPRETER`（命令）＋ `OPENVIBE_M9_INTERPRETER_MODEL` ＋
 * `OPENVIBE_M9_INTERPRETER_PROVIDER`。
 * ⚠️ **没配 ⇒ AI 不可用** ⇒ 界面**不渲染** T2 区（DL-08），
 *   而不是渲染一个「失败」态 —— 「没配」与「跑挂了」是两件事。
 */

export interface LangSourceAiRouteDeps {
  db: SqliteDatabase
  /** runner（**注入优先**；没注入则从环境变量解析） */
  runner?: SourceInterpretRunner | null
  /** 参照时刻（**注入测试用**） */
  now?: () => Date
}

const SnippetQuery = z.object({
  project: z.string().min(1),
  finding_id: z.coerce.number().int().positive(),
})

const ProjectQuery = z.object({
  project: z.string().min(1),
})

const InterpretBody = z.object({
  project_id: z.string().min(1),
  finding_ids: z.array(z.number().int().positive()),
  /**
   * 用户**动过**勾选没有（owner 2026-10-22）。
   *
   * ⚠️ **只影响台账的分类**，不影响「发了什么」——
   *   服务端仍然按**自己算出来的**勾选集合出网 ⇒ 这里撒谎最多让审计分类失真。
   */
  user_touched: z.boolean().optional(),
})

/** 导出请求（**只带结果**，不带片段正文 —— 那些压根没进这个形状）。 */
const InterpretExportBody = z.object({
  summary: SourceInterpretSummary,
})

/**
 * 保存 provider 配置的请求体（**`api_key` 可缺省** ⇒ 缺省＝保持原值）。
 *
 * ⚠️ 其它字段**必填**（整份覆盖，不做增量合并 —— 免得出现「半截配置」）。
 */
const ProviderSaveBody = z.object({
  ...InterpretProviderConfig.shape,
  api_key: z.string().optional(),
})

/** 文件名里只留安全字符（项目 id 可能带斜杠等）。 */
function safeFileName(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9_-]+/gu, '-').replace(/^-+|-+$/gu, '')
  return cleaned === '' ? 'project' : cleaned
}

export function registerLangSourceAiRoutes(
  app: FastifyInstance,
  deps: LangSourceAiRouteDeps,
): void {
  const now = deps.now ?? (() => new Date())
  /**
   * runner 解析：**注入优先**；注入的 `null` 表示「明确没有」；
   * 没注入 ⇒ 看**设置页配的**（配置优先）⇒ 再回退环境变量（`resolveProviderRunner` 内）。
   */
  const resolveRunner = (): SourceInterpretRunner | null =>
    deps.runner === undefined ? resolveProviderRunner(deps.db) : deps.runner

  app.get('/api/lang/snippet', async (req) => {
    const parsed = SnippetQuery.safeParse(req.query)
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'project 与 finding_id 必填')
    }
    let root: string
    try {
      root = readProjectRoot(deps.db, parsed.data.project)
    } catch (err) {
      if (err instanceof SourceServiceError) {
        throw new AppError('VALIDATION_ERROR', err.message, { reason: err.reason })
      }
      throw err
    }
    const hit = readFindings(deps.db, parsed.data.project).find(
      (f) => f.id === parsed.data.finding_id,
    )
    if (hit === undefined) {
      throw new AppError('NOT_FOUND', '这条命中不在最近一次扫描里')
    }
    const read = readSnippet(root, hit.file_rel_path, hit.line)
    if (read.window === null) {
      // ⚠️ **读不到就如实说读不到**（文件被删了 / 读不了）—— 不编内容，也不假装空
      //   ⇒ 并把**原因**带出去（界面要能区分「文件没了」与「行号越界」）
      throw new AppError('NOT_FOUND', '读不到这个片段（文件可能已删除或无法读取）', {
        reason: read.failure ?? 'unreadable',
      })
    }
    return {
      finding_id: hit.id,
      path: read.window.path,
      start_line: read.window.start_line,
      end_line: read.window.end_line,
      lines: read.window.lines,
      failure: null,
      topic_slug: hit.topic_slug,
      topic_title: hit.topic_title,
    }
  })

  app.get('/api/lang/snippets', async (req) => {
    const parsed = ProjectQuery.safeParse(req.query)
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'project 必填')
    }
    let root: string
    try {
      root = readProjectRoot(deps.db, parsed.data.project)
    } catch (err) {
      if (err instanceof SourceServiceError) {
        throw new AppError('VALIDATION_ERROR', err.message, { reason: err.reason })
      }
      throw err
    }
    const findings = readFindings(deps.db, parsed.data.project)
    const windows = readSnippets(root, findings)
    return {
      snippets: findings.map((f) => {
        const read = windows.get(f.id)
        const w = read?.window
        return {
          finding_id: f.id,
          path: f.file_rel_path,
          start_line: w?.start_line ?? null,
          end_line: w?.end_line ?? null,
          lines: w?.lines ?? null,
          // ⚠️ **读不到的原因**（界面据此显示不同的提示，不是同一个兜底）
          failure: w === undefined ? null : read?.failure ?? null,
          topic_slug: f.topic_slug,
          topic_title: f.topic_title,
        }
      }),
    }
  })

  app.get('/api/lang/interpret/capability', async () => {
    // ⚠️ **注入优先**（测试注入的 runner 直接算「可用」）；
    //   没注入 ⇒ 走配置层探测（**三档 ＋ 人话原因** —— 设置页要告诉用户「为什么不可用」）。
    if (deps.runner !== undefined) {
      return capabilityOf({
        runner: deps.runner,
        status: deps.runner === null ? 'unconfigured' : 'ready',
        detail: deps.runner === null ? 'AI 解读不可用' : 'AI 解读可用',
      })
    }
    return capabilityOf(await resolveProvider(deps.db))
  })

  // ============ provider 配置（owner 2026-10-22 裁决一：手动调控）============

  /**
   * 读 provider 配置（**脱敏视图** —— key 只给末 4 位）。
   *
   * ⚠️ **读端永不回显 key 全文**：视图形状里**装不下**全文（`InterpretProviderView`）
   *   ⇒ 这件事在类型上就发生不了。
   */
  app.get('/api/lang/interpret/provider', async () => {
    const { config } = readProviderConfig(deps.db)
    return providerConfigView(config)
  })

  /**
   * 写 provider 配置（**整份覆盖**；`api_key` 除外）。
   *
   * ⚠️ **`api_key` 缺省 = 保持原值**，**空串 = 清除** ——
   *   因为读端**只回显末 4 位**（回显不了全文）⇒ 若「缺省」被当成「清空」，
   *   用户改一下模型名就会把 key 抹掉。
   *   ⇒ 想清 key 要**显式**传空串。
   */
  app.put('/api/lang/interpret/provider', async (req) => {
    const parsed = ProviderSaveBody.safeParse(req.body)
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'provider 配置不合法')
    }
    const current = readProviderConfig(deps.db).config
    const next: InterpretProviderConfigType = {
      ...current,
      ...parsed.data,
      api_key: parsed.data.api_key === undefined ? current.api_key : parsed.data.api_key,
    }
    if (next.kind === 'openai_http' && next.endpoint.trim() !== '') {
      // ⚠️ **端点必须像 URL** —— 不校验的话，配错的东西会等到「真跑一次」才暴露
      let ok = false
      try {
        const u = new URL(next.endpoint.trim())
        ok = u.protocol === 'http:' || u.protocol === 'https:'
      } catch {
        ok = false
      }
      if (!ok) {
        throw new AppError('VALIDATION_ERROR', '端点必须是一个 http:// 或 https:// 地址')
      }
    }
    writeProviderConfig(deps.db, next)
    return providerConfigView(next)
  })

  app.post('/api/lang/interpret', async (req) => {
    const parsed = InterpretBody.safeParse(req.body)
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'project_id 与 finding_ids 必填')
    }
    try {
      return await interpretSourceFindings(deps.db, {
        projectId: parsed.data.project_id,
        findingIds: parsed.data.finding_ids,
        runner: resolveRunner(),
        now,
        userTouched: parsed.data.user_touched === true,
      })
    } catch (err) {
      if (err instanceof SourceServiceError) {
        throw new AppError('VALIDATION_ERROR', err.message, { reason: err.reason })
      }
      throw err
    }
  })

  // ⚠️ **导出是用户主动动作**（增强 4）：结果**不写库**，产物落在用户自己的磁盘上。
  //   ⇒ 脱敏在**服务端**做（不采信客户端说「我已经脱敏了」）。
  app.post('/api/lang/interpret/export', async (req, reply) => {
    const parsed = InterpretExportBody.safeParse(req.body)
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', '解读结果不合法')
    }
    const summary = parsed.data.summary
    let root: string
    try {
      root = readProjectRoot(deps.db, summary.project_id)
    } catch (err) {
      if (err instanceof SourceServiceError) {
        throw new AppError('VALIDATION_ERROR', err.message, { reason: err.reason })
      }
      throw err
    }
    const text = formatInterpretMarkdown(summary, { projectRoot: root })
    const filename = `m9-interpret-${safeFileName(summary.project_id)}.md`
    return reply
      .header('content-type', 'text/markdown; charset=utf-8')
      .header('content-disposition', `attachment; filename="${filename}"`)
      // ⚠️ **文件名由服务端给**（前端不重复实现清洗规则 ⇒ 口径只留一处）
      .header('x-m9-filename', filename)
      .send(text)
  })
}
