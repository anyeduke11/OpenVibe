import { randomBytes } from 'node:crypto'
import Fastify, { type FastifyInstance } from 'fastify'
import { APP_NAME, SCHEMA_VERSION } from '@openvibe/shared'
import { openDatabase, type SqliteDatabase } from '@openvibe/core'
import { registerAuth } from './plugins/auth'
import { registerErrors } from './plugins/errors'
import { registerAgentRoutes } from './routes/agent'
import { registerCliCommandRoutes } from './routes/cliCommands'
import { registerDevLogRoutes } from './routes/devlog'
import { registerFlowTemplateRoutes } from './routes/flowTemplates'
import { registerNavCountRoutes } from './routes/navCounts'
import { registerPackRoutes } from './routes/packs'
import { registerLocalEventsRoutes } from './routes/localEvents'
import { registerLangRoutes } from './routes/langRoadmap'
import { registerPlaybookRoutes } from './routes/playbooks'
import { registerProjectRoutes } from './routes/projects'
import { type PortRouteDeps, registerPortRoutes } from './routes/ports'
import { registerPromptRoutes, type PromptRouteDeps } from './routes/prompts'
import { registerSettingsRoutes, type SettingsRouteInput } from './routes/settings'
import { registerSkillRoutes } from './routes/skills'
import { registerTaskRoutes } from './routes/tasks'
import { registerTermRoutes } from './routes/terms'
import { registerTermRecommendationRoutes } from './routes/termRecommendations'
import { NO_WEB, setupStatic, type WebStatus } from './plugins/static'

export interface BuildAppOptions {
  /** 注入 SQLite 连接（测试用临时库；缺省 :memory:，C-7） */
  db?: SqliteDatabase
  /** CLI Bearer token（缺省随机生成；T7 起由 config.json 持久化） */
  token?: string
  appVersion?: string
  /** design §4 步骤 7 的 Web 产物目录；缺省不托管静态资源（仅 API，测试与 CLI 离线用例用） */
  webRoot?: string
  /** 遥测 os 标签的来源（测试注入平台别名；缺省 process.platform） */
  platform?: string
  /** 遥测 day/queued_at 的时钟注入点（缺省 new Date()） */
  now?: () => Date
  /** settings 路由的展示字段（dataDir/port/seedDir/dbPath）；缺省由 bootstrap 传入，测试可省 */
  settings?: Partial<SettingsRouteInput>
  /** skill 远程取数实现（DEV-0067 测试注入点；缺省全局 fetch，出站走 http-guard） */
  remoteFetchImpl?: typeof fetch
  /** 本机端口监听查询实现（m5 FR-8 测试注入点；缺省走真机 lsof / netstat） */
  listListenersImpl?: PortRouteDeps['listListenersImpl']
}

export interface BuiltApp {
  app: FastifyInstance
  db: SqliteDatabase
  token: string
  /** 静态托管结论（产物缺失时 served=false 并带构建提示） */
  web: WebStatus
}

/** 未注入版本时的兜底（bootstrap 与遥测上报共用同一个值，免得两处各写一份字面量） */
export const FALLBACK_APP_VERSION = '0.0.0'

/**
 * 构建 Fastify 实例（不 listen，测试用 app.inject）。
 * auth/errors 插件与资源路由直接挂根作用域（无封装，见 DEV-0013 C-7）。
 */
export async function buildApp(options: BuildAppOptions = {}): Promise<BuiltApp> {
  const db = options.db ?? openDatabase(':memory:')
  const token = options.token ?? randomBytes(24).toString('hex')
  const appVersion = options.appVersion ?? FALLBACK_APP_VERSION
  const app = Fastify({ logger: false })

  const web = options.webRoot ? await setupStatic(app, options.webRoot) : NO_WEB
  registerErrors(app, web.served && web.root ? { spaFallbackRoot: web.root } : {})
  registerAuth(app, { token })

  // `now` 透传给每个路由：台账的 `day` 由事件时间派生，不透传就只能拿到隐式 `new Date()`，
  // 测试无法钉住「这条事件落在哪一天」。见 lib/ledger.ts 的「为什么缺省也照记」。
  const deps: PromptRouteDeps = { db, now: options.now }
  registerAgentRoutes(app, deps)
  registerPromptRoutes(app, deps)
  registerTermRoutes(app, deps)
  registerTermRecommendationRoutes(app, deps)
  registerPlaybookRoutes(app, deps)
  registerFlowTemplateRoutes(app, deps)
  registerPackRoutes(app, deps)
  registerLocalEventsRoutes(app, { db, now: options.now })
  registerProjectRoutes(app, deps)
  // M9「开发能力」页读端（站列 ＋ 当前层 ＋ 详情）
  registerLangRoutes(app, { db })
  registerPortRoutes({ db, listListenersImpl: options.listListenersImpl })(app)
  registerTaskRoutes(app, deps)
  registerDevLogRoutes(app, deps)
  registerSkillRoutes(app, { ...deps, fetchImpl: options.remoteFetchImpl })
  // V2 只读聚合端点：侧栏角标一次取全 + CLI 命令参考（纯常量，无 DB 依赖）
  registerNavCountRoutes(app, deps)
  registerCliCommandRoutes(app)
  registerSettingsRoutes(app, {
    db,
    appVersion,
    platform: options.platform,
    now: options.now,
    ...options.settings,
  })

  app.get('/api/health', async () => ({
    status: 'ok',
    app: APP_NAME,
    version: appVersion,
    schemaVersion: SCHEMA_VERSION,
    db: { status: 'ready' },
  }))

  return { app, db, token, web }
}
