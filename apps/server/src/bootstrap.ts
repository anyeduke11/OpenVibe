import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import {
  migrate,
  openDatabase,
  runSeed,
  type SeedBundleResult,
  type SqliteDatabase,
} from '@openvibe/core'
import { DEFAULT_PORT } from '@openvibe/shared'
import { buildApp } from './app'
import type { WebStatus } from './plugins/static'

/**
 * dev-plan §1.2 启动序列的服务端半边：步骤 3（建库+migration）/4（幂等播种）/6（listen）/7（静态托管）。
 * 步骤 1（配置发现链）与 2（~/.openvibe 初始化 + token 落盘）在 apps/cli/src/commands/serve.ts——
 * 发现链的归属由 m6b §3 定在 CLI，R4 亦禁止 server 反向 import cli。
 * 步骤 5（首启自动组装预置 default 包）依赖 T8 的 20 条精选提示词，本切片尚未实现。
 */

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

/** content/seed 相对仓库布局；OPENVIBE_SEED_DIR 供打包/沙箱覆盖 */
export function defaultSeedDir(): string {
  return process.env.OPENVIBE_SEED_DIR ?? join(HERE, '..', '..', '..', 'content', 'seed')
}

export function defaultWebRoot(): string {
  return join(HERE, '..', '..', 'web', 'dist')
}

export interface BootstrapOptions {
  dbPath: string
  seedDir?: string
  webRoot?: string
  /** 0 = 随机端口（测试用）；缺省 8787 */
  port?: number
  /** 缺省 127.0.0.1；非回环地址直接拒绝（design §11.1） */
  host?: string
  /** 缺省随机 32 字节 hex（m6b §7.8 的 0600 持久化由 serve 负责） */
  token?: string
  appVersion?: string
}

export interface SeedSummary {
  created: Record<string, number>
  updated: Record<string, number>
  skipped: Record<string, number>
  /** core 的 bundle 粒度结论：content_hash 未变即 skipped，与逐条 skipped 计数含义不同 */
  bundles: Record<string, SeedBundleResult['status']>
  warnings: string[]
}

export interface BootstrapResult {
  app: FastifyInstance
  db: SqliteDatabase
  dbPath: string
  /** 实际监听地址（port:0 时为内核分配端口） */
  url: string
  token: string
  seed: SeedSummary
  web: WebStatus
  /** 非致命问题（播种跳过、产物缺失等）：人读即时打印，--json 折叠进 summary.warnings */
  warnings: string[]
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
  const { app, web } = await buildApp({
    db,
    token,
    webRoot: options.webRoot ?? defaultWebRoot(),
    ...(options.appVersion ? { appVersion: options.appVersion } : {}),
  })
  warnings.push(...web.warnings)

  const seed: SeedSummary = { created: {}, updated: {}, skipped: {}, bundles: {}, warnings: [] }
  const seedDir = options.seedDir ?? defaultSeedDir()
  if (!existsSync(seedDir)) {
    const w = `种子目录不存在：${seedDir}，已跳过播种`
    warnings.push(w)
  } else {
    // dev-plan §4.3：seed 失败不阻塞启动，单条问题只记 warning
    for (const r of runSeed(db, seedDir)) {
      seed.created[r.bundle] = r.created
      seed.updated[r.bundle] = r.updated
      seed.skipped[r.bundle] = r.skipped
      seed.bundles[r.bundle] = r.status
      for (const w of r.warnings) seed.warnings.push(`${r.bundle}: ${w}`)
    }
  }

  const port = options.port ?? DEFAULT_PORT
  try {
    await app.listen({ host: bindHost, port })
  } catch (e) {
    await app.close().catch(() => undefined)
    db.close()
    throw new BootError('LISTEN_FAILED', `端口 ${port} 监听失败：${message(e)}`)
  }
  const address = app.server.address() as AddressInfo
  const url = `http://${address.address.includes(':') ? `[${address.address}]` : address.address}:${address.port}`

  return {
    app,
    db,
    dbPath,
    url,
    token,
    seed,
    web,
    warnings,
    async close() {
      await app.close()
      db.close()
    },
  }
}
