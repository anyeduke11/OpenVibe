import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { AppError } from '@openvibe/shared'
import {
  clearConsent,
  exportFindingsText,
  readAllConsents,
  readConsent,
  readFindings,
  readShares,
  recordShare,
  runProjectScan,
  setConsent,
  SourceServiceError,
  type SqliteDatabase,
} from '@openvibe/core'

/**
 * M9「源码识别」端点（`m9-dev-language-roadmap.md` §3.8 / §3.9 / §3.10 · dev-plan §6.10 P4）。
 *
 * 端点清单：
 * - `POST /api/lang/scan` —— 扫项目并落库 + 重算掌握度；
 * - `GET  /api/lang/findings` —— 读最近一次扫描的命中；
 * - `GET  /api/lang/source/consent` —— 读「记住我的选择」；
 * - `POST /api/lang/source/consent` —— 写记忆；
 * - `DELETE /api/lang/source/consent` —— **清除记忆**（DL-21）；
 * - `GET  /api/lang/source/export` —— 导出**可 grep 复现**的清单（DL-22 / DL-23）；
 * - `POST /api/lang/source/share` —— 记一次出网计数（**只存计数**，§3.9）。
 *
 * ## ⚠️ 扫描端点**不涉及任何 AI**
 *
 * T0 是**本地静态分析**（§3.8 / §5.5）⇒ 这个端点**不依赖 AI**，
 * AI 不可用时它照常工作（DL-17）。
 */

export interface LangSourceRouteDeps {
  db: SqliteDatabase
  /** 状态的参照日（**注入测试用**，默认取当前时刻） */
  now?: () => string
}

const ScanBody = z.object({
  project_id: z.string().min(1),
})

const ConsentBody = z.object({
  project_id: z.string().min(1),
  remember_all: z.boolean(),
})

const ShareBody = z.object({
  project_id: z.string().min(1),
  topic_id_count: z.number().int().min(0),
  snippet_count: z.number().int().min(0),
  consent_source: z.enum(['explicit_tick', 'remembered']),
})

const ProjectQuery = z.object({
  project: z.string().min(1),
})

export function registerLangSourceRoutes(app: FastifyInstance, deps: LangSourceRouteDeps): void {
  const now = deps.now ?? (() => new Date().toISOString())

  app.post('/api/lang/scan', async (req) => {
    const parsed = ScanBody.safeParse(req.body)
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'project_id 必填')
    }
    try {
      const result = await runProjectScan(deps.db, parsed.data.project_id, now())
      // ⚠️ **不回命中列表**（扫描的账 与 命中列表是两种形状）⇒ 界面扫完读 /api/lang/findings
      return {
        project_id: result.scan.project_id,
        scan_id: result.scan.scan_id,
        languages: result.scan.languages,
        warnings: result.scan.warnings,
        written: result.written,
        unknown_slugs: result.unknownSlugs,
        states_updated: result.statesUpdated,
      }
    } catch (err) {
      if (err instanceof SourceServiceError) {
        throw new AppError('VALIDATION_ERROR', err.message, { reason: err.reason })
      }
      throw err
    }
  })

  app.get('/api/lang/findings', async () => {
    // ⚠️ **不带项目参数** —— `lang_topic_findings` 没有项目列（§3.10）⇒ 命中只属于最近一次扫描
    return { findings: readFindings(deps.db) }
  })

  app.get('/api/lang/source/consent', async (req) => {
    const parsed = ProjectQuery.safeParse(req.query)
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'project 必填')
    }
    // ⚠️ **没有行 = 没有记忆** ⇒ 返回 `remember_all: false`（回到全不勾）
    const row = readConsent(deps.db, parsed.data.project)
    return {
      remember_all: row?.remember_all ?? false,
      remembered_at: row?.remembered_at ?? null,
      shares: readShares(deps.db, parsed.data.project),
    }
  })

  app.get('/api/lang/source/consents', async () => {
    // ⚠️ 设置页用：列出「你 Remember 过哪些项目」⇒ 每一条都能单独清除（DL-21）
    return { consents: readAllConsents(deps.db) }
  })

  app.post('/api/lang/source/consent', async (req) => {
    const parsed = ConsentBody.safeParse(req.body)
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'project_id 与 remember_all 必填')
    }
    const row = setConsent(
      deps.db,
      parsed.data.project_id,
      parsed.data.remember_all,
      now(),
    )
    return { remember_all: row.remember_all, remembered_at: row.remembered_at }
  })

  app.delete('/api/lang/source/consent', async (req) => {
    const parsed = ProjectQuery.safeParse(req.query)
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'project 必填')
    }
    // ⚠️ DL-21：清除后**立刻回到全不勾** ⇒ 行被删掉，读回来是 null
    const cleared = clearConsent(deps.db, parsed.data.project)
    return { cleared, remember_all: false, remembered_at: null }
  })

  app.get('/api/lang/source/export', async (req, reply) => {
    const parsed = ProjectQuery.safeParse(req.query)
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'project 必填')
    }
    const text = exportFindingsText(deps.db, parsed.data.project)
    return reply
      .header('content-type', 'text/plain; charset=utf-8')
      .header('content-disposition', 'attachment; filename="m9-source-findings.txt"')
      .send(text)
  })

  app.post('/api/lang/source/share', async (req) => {
    const parsed = ShareBody.safeParse(req.body)
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'share 载荷不合法')
    }
    // ⚠️ **只存计数**（§3.9）：不存片段内容、不存文件路径
    recordShare(deps.db, { ...parsed.data, created_at: now() })
    return { recorded: true }
  })
}
