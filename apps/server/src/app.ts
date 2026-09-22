import { randomBytes } from 'node:crypto'
import Fastify, { type FastifyInstance } from 'fastify'
import { APP_NAME, SCHEMA_VERSION } from '@openvibe/shared'
import { openDatabase, type SqliteDatabase } from '@openvibe/core'
import { registerAuth } from './plugins/auth'
import { registerErrors } from './plugins/errors'
import { registerDevLogRoutes } from './routes/devlog'
import { registerFlowTemplateRoutes } from './routes/flowTemplates'
import { registerPackRoutes } from './routes/packs'
import { registerProjectRoutes } from './routes/projects'
import { registerPromptRoutes, type PromptRouteDeps } from './routes/prompts'
import { registerSettingsRoutes } from './routes/settings'
import { registerSkillRoutes } from './routes/skills'
import { registerTaskRoutes } from './routes/tasks'
import { registerTermRoutes } from './routes/terms'
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
}

export interface BuiltApp {
  app: FastifyInstance
  db: SqliteDatabase
  token: string
  /** 静态托管结论（产物缺失时 served=false 并带构建提示） */
  web: WebStatus
}

/**
 * 构建 Fastify 实例（不 listen，测试用 app.inject）。
 * auth/errors 插件与资源路由直接挂根作用域（无封装，见 DEV-0013 C-7）。
 */
export async function buildApp(options: BuildAppOptions = {}): Promise<BuiltApp> {
  const db = options.db ?? openDatabase(':memory:')
  const token = options.token ?? randomBytes(24).toString('hex')
  const appVersion = options.appVersion ?? '0.0.0'
  const app = Fastify({ logger: false })

  const web = options.webRoot ? await setupStatic(app, options.webRoot) : NO_WEB
  registerErrors(app, web.served && web.root ? { spaFallbackRoot: web.root } : {})
  registerAuth(app, { token })

  const deps: PromptRouteDeps = { db }
  registerPromptRoutes(app, deps)
  registerTermRoutes(app, deps)
  registerFlowTemplateRoutes(app, deps)
  registerPackRoutes(app, deps)
  registerProjectRoutes(app, deps)
  registerTaskRoutes(app, deps)
  registerDevLogRoutes(app, deps)
  registerSkillRoutes(app, deps)
  registerSettingsRoutes(app, { db, appVersion, platform: options.platform, now: options.now })

  app.get('/api/health', async () => ({
    status: 'ok',
    app: APP_NAME,
    version: appVersion,
    schemaVersion: SCHEMA_VERSION,
    db: { status: 'ready' },
  }))

  return { app, db, token, web }
}
