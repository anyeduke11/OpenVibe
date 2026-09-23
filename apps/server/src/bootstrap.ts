import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { migrate, openDatabase, runSeed, type SqliteDatabase } from '@openvibe/core'
import { DEFAULT_PORT, TELEMETRY_FLUSH_INTERVAL_MS, type SeedSummary } from '@openvibe/shared'
import { buildApp, FALLBACK_APP_VERSION } from './app'
import { resolveWebRoot } from './lib/asset-roots'
import { ensureDefaultPack, type DefaultPackOutcome } from './lib/default-pack'
import { defaultSeedDir } from './lib/seed-dir'
import { startTelemetryFlush } from './lib/telemetry-flush'
import type { WebStatus } from './plugins/static'
import { seedSummaryOf } from './routes/settings'

/**
 * dev-plan §1.2 启动序列的服务端半边：步骤 3（建库+migration）/4（幂等播种）/5（组装预置 default 包）
 * /6（listen）/7（静态托管）。
 * 步骤 1（配置发现链）与 2（~/.openvibe 初始化 + token 落盘）在 apps/cli/src/commands/serve.ts——
 * 发现链的归属由 m6b §3 定在 CLI，R4 亦禁止 server 反向 import cli。
 */

/** 种子目录与 SeedSummary 自 T8b 起分别住在 lib/seed-dir 与 @openvibe/shared，此处保留出口兼容 serve/index */
export { defaultSeedDir }
export type { SeedSummary }

/** dev-plan §4.3：启动失败的可判别原因，CLI 据此给退出码与人读文案 */
export const BOOT_ERROR_CODES = [
  'HOST_NOT_LOOPBACK',
  'DB_OPEN_FAILED',
  'MIGRATION_FAILED',
  'LISTEN_FAILED',
] as const
export type BootErrorCode = (typeof BOOT_ERROR_CODES)[number]

export class BootError extends Error {
  code: BootErrorCode

  constructor(code: BootErrorCode, message: string) {
    super(message)
    this.name = 'BootError'
    this.code = code
  }
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1'])
const HERE = dirname(fileURLToPath(import.meta.url))

export function defaultWebRoot(): string {
  return resolveWebRoot(HERE)
}

export interface BootstrapOptions {
  dbPath: string
  /** ~/.openvibe 根，GET /api/settings 展示用；缺省取 dbPath 的父目录 */
  dataDir?: string
  seedDir?: string
  webRoot?: string
  /** 0 = 随机端口（测试用）；缺省 8787 */
  port?: number
  /** 缺省 127.0.0.1；非回环地址直接拒绝（design §11.1） */
  host?: string
  /** 缺省随机 32 字节 hex（m6b §7.8 的 0600 持久化由 serve 负责） */
  token?: string
  appVersion?: string
  /** 匿名遥测计数端点（design §11.5 / dev-plan §4.6）；缺省空串 = 不外发也不建定时器 */
  telemetryEndpoint?: string
}

export interface BootstrapResult {
  app: FastifyInstance
  db: SqliteDatabase
  dbPath: string
  /** 实际监听地址（port:0 时为内核分配端口） */
  url: string
  token: string
  seed: SeedSummary
  /** dev-plan §4.3 步骤 5 的结论；skipped/failed 的 reason 已折叠进 warnings */
  defaultPack: DefaultPackOutcome
  web: WebStatus
  /** 非致命问题（播种跳过、产物缺失等）：人读即时打印，--json 折叠进 summary.warnings */
  warnings: string[]
  /**
   * 遥测外发腿的生效配置（design §11.5）：endpoint 为空串即「结构性零外联」——
   * 连上报定时器都不建。intervalMs 供 CLI 与人读文案复用，不再各处抄常量。
   */
  telemetry: { endpoint: string; intervalMs: number }
  close(): Promise<void>
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e))

export async function bootstrap(options: BootstrapOptions): Promise<BootstrapResult> {
  const host = options.host ?? '127.0.0.1'
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new BootError('HOST_NOT_LOOPBACK', `只允许本地回环地址绑定，收到 ${host}（design §11.1）`)
  }
  // localhost 可能解析到 ::1；统一按 IPv4 回环绑定，地址栏与 Host 校验（auth.ts）才一致
  const bindHost = host === 'localhost' ? '127.0.0.1' : host
  const dbPath = options.dbPath
  const warnings: string[] = []

  let db: SqliteDatabase
  try {
    db = openDatabase(dbPath, { autoMigrate: false })
  } catch (e) {
    throw new BootError('DB_OPEN_FAILED', `数据库无法打开：${dbPath} — ${message(e)}`)
  }
  try {
    migrate(db)
  } catch (e) {
    db.close()
    throw new BootError('MIGRATION_FAILED', `数据库迁移失败：${message(e)}`)
  }

  const token = options.token ?? randomBytes(32).toString('hex')
  const port = options.port ?? DEFAULT_PORT
  const seedDir = options.seedDir ?? defaultSeedDir()
  const appVersion = options.appVersion ?? FALLBACK_APP_VERSION
  const telemetryEndpoint = options.telemetryEndpoint ?? ''
  const { app, web } = await buildApp({
    db,
    token,
    webRoot: options.webRoot ?? defaultWebRoot(),
    appVersion,
    settings: {
      dataDir: options.dataDir ?? dirname(dbPath),
      port,
      seedDir,
      dbPath,
    },
  })
  warnings.push(...web.warnings)

  // dev-plan §4.3：seed 失败不阻塞启动，单条问题只记 warning
  let seed: SeedSummary = { created: {}, updated: {}, skipped: {}, bundles: {}, warnings: [] }
  if (!existsSync(seedDir)) {
    warnings.push(`种子目录不存在：${seedDir}，已跳过播种`)
  } else {
    seed = seedSummaryOf(runSeed(db, seedDir))
  }

  // 步骤 5：预置 default 包（onboarding FR-1）。同样不阻塞启动——失败只降级为 warning，
  // 设置页的「重建预置包」用同一个 ensureDefaultPack 兜底。
  const defaultPack = ensureDefaultPack(db)
  if (defaultPack.reason) warnings.push(`预置包：${defaultPack.reason}`)

  try {
    await app.listen({ host: bindHost, port })
  } catch (e) {
    await app.close().catch(() => undefined)
    db.close()
    throw new BootError('LISTEN_FAILED', `端口 ${port} 监听失败：${message(e)}`)
  }
  const address = app.server.address() as AddressInfo
  const url = `http://${address.address.includes(':') ? `[${address.address}]` : address.address}:${address.port}`

  // 步骤 9（T8d）：遥测出队腿。endpoint 空串时 startTelemetryFlush 直接给 no-op，
  // 于是「未配置端点 = 零外联」不依赖任何运行时判断。
  const stopTelemetry = startTelemetryFlush({
    db,
    endpoint: telemetryEndpoint,
    onError: (line) => warnings.push(line),
  })

  return {
    app,
    db,
    dbPath,
    url,
    token,
    seed,
    defaultPack,
    web,
    warnings,
    telemetry: { endpoint: telemetryEndpoint, intervalMs: TELEMETRY_FLUSH_INTERVAL_MS },
    async close() {
      stopTelemetry()
      await app.close()
      db.close()
    },
  }
}
