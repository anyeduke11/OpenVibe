import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { AppError } from '@openvibe/shared'
import {
  interpretCapability,
  interpretSourceFindings,
  readFindings,
  readProjectRoot,
  readSnippet,
  readSnippets,
  runnerFromEnv,
  SourceServiceError,
  type SourceInterpretRunner,
  type SqliteDatabase,
} from '@openvibe/core'

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
})

export function registerLangSourceAiRoutes(
  app: FastifyInstance,
  deps: LangSourceAiRouteDeps,
): void {
  const now = deps.now ?? (() => new Date())
  /** runner 解析：**注入优先**；注入的 `null` 表示「明确没有」；没注入 ⇒ 看环境变量。 */
  const resolveRunner = (): SourceInterpretRunner | null =>
    deps.runner === undefined ? runnerFromEnv() : deps.runner

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
    const hit = readFindings(deps.db).find((f) => f.id === parsed.data.finding_id)
    if (hit === undefined) {
      throw new AppError('NOT_FOUND', '这条命中不在最近一次扫描里')
    }
    const snippet = readSnippet(root, hit.file_rel_path, hit.line)
    if (snippet === null) {
      // ⚠️ **读不到就如实说读不到**（文件被删了 / 读不了）—— 不编内容，也不假装空
      throw new AppError('NOT_FOUND', '读不到这个片段（文件可能已删除或无法读取）')
    }
    return {
      finding_id: hit.id,
      path: snippet.path,
      start_line: snippet.start_line,
      end_line: snippet.end_line,
      lines: snippet.lines,
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
    const findings = readFindings(deps.db)
    const windows = readSnippets(root, findings)
    return {
      snippets: findings.map((f) => {
        const w = windows.get(f.id)
        return {
          finding_id: f.id,
          path: f.file_rel_path,
          start_line: w?.start_line ?? null,
          end_line: w?.end_line ?? null,
          lines: w?.lines ?? null,
          topic_slug: f.topic_slug,
          topic_title: f.topic_title,
        }
      }),
    }
  })

  app.get('/api/lang/interpret/capability', async () => {
    return interpretCapability(resolveRunner())
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
      })
    } catch (err) {
      if (err instanceof SourceServiceError) {
        throw new AppError('VALIDATION_ERROR', err.message, { reason: err.reason })
      }
      throw err
    }
  })
}
