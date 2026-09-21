import Fastify, { type FastifyInstance } from 'fastify'
import { APP_NAME, SCHEMA_VERSION } from '@openvibe/shared'

export interface BuildAppOptions {
  appVersion?: string
}

/**
 * 构建 Fastify 实例（不 listen，测试用 app.inject）。
 * T1 仅含 /api/health；路由注册器、鉴权与静态托管插件随 T2–T6 落地（dev-plan §4）。
 */
export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })
  const appVersion = options.appVersion ?? '0.0.0'

  app.get('/api/health', async () => ({
    status: 'ok',
    app: APP_NAME,
    version: appVersion,
    schemaVersion: SCHEMA_VERSION,
    db: { status: 'pending', detail: '存储层随 T2 落地' },
  }))

  return app
}
