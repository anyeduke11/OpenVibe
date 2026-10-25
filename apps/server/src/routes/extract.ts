import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  adoptionStatsWithHistory,
  extractUsage,
  runDiscussion,
  writeAdoptionSnapshots,
  AppMetaRepo,
  clearExtractConsent,
  extractGateOpen,
  listExtractConsents,
  readExtractConsent,
  runExtraction,
  setExtractConsent,
  type ExtractRunner,
} from '@openvibe/core'
import { AppError, DiscussRequestInput, ExtractRequestInput, type ExtractConsentOut, type ExtractOut } from '@openvibe/shared'
import { parseOrThrow } from '../lib/validate'
import type { SqliteDatabase } from '@openvibe/core'

/**
 * M10/D · 提取链路由（spec `v023-d-ai-extract.md` FR-1/AN4/AN5）。
 * 路由只做「解析入参 → 调 core → 序列化」：总闸/同意/预算/锚定/落库全在
 * core/extract（服务层拦截——总闸关着时路由根本不拦，由 core 返回 gate-closed）。
 */

export interface ExtractRouteDeps {
  db: SqliteDatabase
  /** 注入 runner 的测试通道；缺省按 provider 配置现解析（提取与问答共用） */
  runner?: ExtractRunner | null
  now?: () => Date
  dailyCallLimit?: number
  discussDailyCallLimit?: number
}

const GateToggleInput = z.object({ enabled: z.boolean() })
const ConsentPutInput = z.object({ remember_all: z.boolean() })
const ProjectParams = z.object({ projectId: z.string().min(1) })

export function registerExtractRoutes(app: FastifyInstance, deps: ExtractRouteDeps): void {
  /** AN2 · discuss 问答（批次 E）：只读——上下文组装→LLM→逐段来源；治理面与提取共用 */
  app.post('/api/projects/:id/discuss', async (req): Promise<unknown> => {
    const { id } = req.params as { id: string }
    const input = parseOrThrow(DiscussRequestInput, req.body)
    return runDiscussion(
      deps.db,
      {
        projectId: id,
        question: input.question,
        fields: input.fields,
        budget: input.budget,
        confirm: input.confirm,
        remember: input.remember,
        providerId: input.provider_id,
      },
      { runner: deps.runner, now: deps.now, dailyCallLimit: deps.discussDailyCallLimit },
    )
  })

  /** 提取（AN1）：总闸/同意/预算/锚定/落 pending 全在 core */
  app.post('/api/extract', async (req): Promise<ExtractOut> => {
    const input = parseOrThrow(ExtractRequestInput, req.body)
    return runExtraction(
      deps.db,
      {
        projectId: input.project_id,
        logIds: input.log_ids,
        confirm: input.confirm,
        remember: input.remember,
        providerId: input.provider_id,
      },
      { runner: deps.runner, now: deps.now, dailyCallLimit: deps.dailyCallLimit },
    )
  })

  /** 总闸状态（设置页开关的读侧） */
  app.get('/api/extract/gate', async (): Promise<{ enabled: boolean }> => ({
    enabled: extractGateOpen(deps.db),
  }))

  /** 总闸开关（AN4；默认关——写侧在这里，拦截在 core 服务层） */
  app.post('/api/extract/gate', async (req): Promise<{ enabled: boolean }> => {
    const { enabled } = parseOrThrow(GateToggleInput, req.body)
    new AppMetaRepo(deps.db).write('aiExtractEnabled', enabled)
    return { enabled }
  })

  /** 同意列表（设置页「AI 与出网」区；DL-21 的清除面） */
  const consentView = (): ExtractConsentOut => ({
    consents: listExtractConsents(deps.db).map((c) => ({
      project_id: c.projectId,
      remember_all: c.rememberAll,
      remembered_at: c.rememberedAt,
    })),
  })

  app.get('/api/extract/consents', async (): Promise<ExtractConsentOut> => consentView())

  app.put('/api/extract/consents/:projectId', async (req): Promise<ExtractConsentOut> => {
    const params = parseOrThrow(ProjectParams, req.params)
    const { remember_all } = parseOrThrow(ConsentPutInput, req.body)
    const now = (deps.now ?? (() => new Date()))()
    setExtractConsent(deps.db, params.projectId, remember_all, now.toISOString())
    return consentView()
  })

  /** 清除 = 删行（DL-21：不留「曾记住」残影） */
  app.delete('/api/extract/consents/:projectId', async (req): Promise<ExtractConsentOut> => {
    const params = parseOrThrow(ProjectParams, req.params)
    if (readExtractConsent(deps.db, params.projectId) === null) {
      throw new AppError('NOT_FOUND', `该项目没有提取同意记录：${params.projectId}`)
    }
    clearExtractConsent(deps.db, params.projectId)
    return consentView()
  })

  /**
   * AN5 采纳率（影子门槛的数据面；现算 + 轮次历史）。
   * POST = 快照动作（达到窗口下限的 kind 落一行轮次记录，QG1「连续 2 轮」的判定源）。
   */
  app.get('/api/ai/adoption', async (): Promise<unknown> => adoptionStatsWithHistory(deps.db))
  app.post('/api/ai/adoption/snapshot', async (): Promise<unknown> => {
    const now = (deps.now ?? (() => new Date()))().toISOString()
    return { snapshots: writeAdoptionSnapshots(deps.db, now) }
  })

  /** 成本台账（「AI 与出网」区）：按 provider/model 分组的出网计数（本机现算） */
  app.get('/api/ai/extract/usage', async (): Promise<unknown> => ({ usage: extractUsage(deps.db) }))
}
