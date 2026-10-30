import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { openvibeHome } from '@openvibe/core'
import { DEFAULT_PORT, OpenvibeConfigSchema, type OpenvibeConfig } from '@openvibe/shared'

/**
 * 配置发现链（m6b §3）：旗标 > 环境变量（OPENVIBE_SERVER / OPENVIBE_TOKEN）> ~/.openvibe/config.json > 内置默认。
 * 只解析与读写，不发网络请求——离线模式（--file/--dir）不要求 token。
 */

export const DEFAULT_SERVER_URL = `http://127.0.0.1:${DEFAULT_PORT}`
export const CONFIG_FILE_NAME = 'config.json'

export type ConfigSource = 'flag' | 'env' | 'config.json' | 'default'

export interface ConfigFlags {
  server?: string
  token?: string
}

export interface ResolveOptions {
  env?: Record<string, string | undefined>
  /** ~/.openvibe 根目录，OPENVIBE_HOME 可覆盖（与 core openvibeHome 同源） */
  home?: string
}

export interface ResolvedConfig {
  serverUrl: string
  /** null = 未知；调用方据此拒绝在线请求并给出 hint，不影响离线模式 */
  token: string | null
  port: number
  /** port 是 serverUrl 的派生量（config.json 例外：用其独立的 port 字段），故与 serverUrl 同源 */
  sources: { serverUrl: ConfigSource; token: ConfigSource; port: ConfigSource }
  configPath: string
  /** 配置文件的非致命问题（损坏/字段缺失），人读即时打印、--json 折叠进 summary.warnings */
  warnings: string[]
  /**
   * 与 `warnings` 同序等长的诊断原文（允许英文）。
   *
   * ⚠️ 为什么要多这一路：warn 是**提示**通道（不阻断命令），但它的失败原因
   * 仍是排障依据（`Invalid URL` / `Unexpected token < in JSON`）。塞进中文句子
   * 会让终端混进机器串，丢掉又让排障失据 ⇒ 单独一路。
   */
  warningDetails?: (string | undefined)[]
  hint?: string
}

/** 用户给的旗标不合法 → 早失败，不带着坏配置去发请求 */
export class ConfigError extends Error {
  /**
   * 诊断原文（允许英文：Node 的 `Invalid URL` 等机器串）。
   *
   * 与 `message` 分通道：`message` 只写中文一句话，`detail` 承接排障原文。
   */
  readonly detail?: string
  constructor(message: string, detail?: string) {
    super(message)
    this.name = 'ConfigError'
    if (detail !== undefined) this.detail = detail
  }
}

export function configFilePath(home?: string): string {
  return join(home ?? openvibeHome(), CONFIG_FILE_NAME)
}

function normalizeServerUrl(raw: string, label: string): { serverUrl: string; port: number } {
  let url: URL
  try {
    url = new URL(raw)
  } catch (e) {
    // Node 的 `Invalid URL` 是英文机器串 ⇒ 走 detail 通道
    throw new ConfigError(`${label} 不是合法 URL：${raw}`, (e as Error).message)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ConfigError(`${label} 只支持 http/https，收到 ${url.protocol}`)
  }
  if (url.username || url.password) {
    throw new ConfigError(`${label} 不允许内嵌凭据`)
  }
  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80
  return { serverUrl: raw.replace(/\/+$/, ''), port }
}

function checkToken(raw: string, label: string): string {
  if (!/^[!-~]+$/.test(raw)) {
    throw new ConfigError(`${label} 含空白或控制字符`)
  }
  return raw
}

/** 除可选端点外的必填三字段：判定「坏的只是可选字段」的依据 */
const CoreConfigSchema = OpenvibeConfigSchema.omit({ telemetryEndpoint: true })
const CoreKeys = CoreConfigSchema.keyof()

function withNormalizedServerUrl(
  config: OpenvibeConfig,
  path: string,
): { config: OpenvibeConfig | null; error?: string; errorDetail?: string } {
  try {
    const { serverUrl } = normalizeServerUrl(config.serverUrl, path)
    return { config: { ...config, serverUrl } }
  } catch (e) {
    // ConfigError 的 message 已是中文（含出错的原值）；英文诊断原文在 detail 位
    return {
      config: null,
      error: (e as Error).message,
      errorDetail: (e as { detail?: string }).detail,
    }
  }
}

/**
 * 读 config.json；不存在 → {config:null}；损坏或字段不合法 → 附 error 且永不抛（配置降级不阻断命令）。
 *
 * `errorDetail` 是英文诊断原文（`Invalid URL` / `Unexpected token < in JSON`），
 * 与中文 `error` 分通道 —— 这条走 warn 通道，混进中文句子会让终端出现机器串。
 */
export function readConfigFile(home?: string): {
  config: OpenvibeConfig | null
  error?: string
  errorDetail?: string
} {
  const path = configFilePath(home)
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    return { config: null }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    return {
      config: null,
      error: 'JSON 解析失败，文件不是合法 JSON',
      errorDetail: (e as Error).message,
    }
  }
  const result = OpenvibeConfigSchema.safeParse(parsed)
  if (result.success) return withNormalizedServerUrl(result.data, path)

  const field = result.error.issues[0]?.path.join('.') ?? '(未知)'
  // 坏在可选字段上时逐字段降级（T9a-4）：整份作废会让 serve 重新生成令牌并覆盖 config.json，
  // 手打错一个遥测端点于是能把其它终端里正在用的令牌换掉——只摘掉坏的那个字段，其余照常读出
  const core = CoreConfigSchema.safeParse(parsed)
  if (core.success && !CoreKeys.safeParse(field).success) {
    const r = withNormalizedServerUrl(core.data, path)
    if (r.config) return { ...r, error: `${field} 不合法，该字段已忽略（其余照常使用）` }
    return r
  }
  return { config: null, error: `字段不合法：${field}` }
}

/** 落盘 0600（m6b §7.8）。写入前校验，坏配置不落盘。 */
export function writeConfigFile(config: OpenvibeConfig, home?: string): string {
  const path = configFilePath(home)
  const validated = OpenvibeConfigSchema.parse(config)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(validated, null, 2)}\n`, { mode: 0o600 })
  // writeFile 的 mode 只在新建时生效，文件已存在时沿用旧权限，必须显式 chmod 才守得住 0600
  chmodSync(path, 0o600)
  return path
}

export function resolveConfig(
  flags: ConfigFlags = {},
  options: ResolveOptions = {},
): ResolvedConfig {
  const env = options.env ?? process.env
  const home = options.home
  const path = configFilePath(home)
  const warnings: string[] = []
  const warningDetails: (string | undefined)[] = []
  const { config, error, errorDetail } = readConfigFile(home)
  if (error) {
    warnings.push(config ? `${path}：${error}` : `无法使用 ${path}：${error}，已回退默认配置`)
    warningDetails.push(errorDetail)
  }

  let serverUrl: string
  let port: number
  let serverSource: ConfigSource
  if (flags.server !== undefined) {
    ;({ serverUrl, port } = normalizeServerUrl(flags.server, '--server'))
    serverSource = 'flag'
  } else if (env.OPENVIBE_SERVER) {
    ;({ serverUrl, port } = normalizeServerUrl(env.OPENVIBE_SERVER, 'OPENVIBE_SERVER'))
    serverSource = 'env'
  } else if (config) {
    serverUrl = config.serverUrl
    port = config.port
    serverSource = 'config.json'
  } else {
    ;({ serverUrl, port } = normalizeServerUrl(DEFAULT_SERVER_URL, '默认值'))
    serverSource = 'default'
  }

  let token: string | null = null
  let tokenSource: ConfigSource = 'default'
  if (flags.token !== undefined) {
    token = checkToken(flags.token, '--token')
    tokenSource = 'flag'
  } else if (env.OPENVIBE_TOKEN) {
    token = checkToken(env.OPENVIBE_TOKEN, 'OPENVIBE_TOKEN')
    tokenSource = 'env'
  } else if (config) {
    token = config.token
    tokenSource = 'config.json'
  }

  return {
    serverUrl,
    token,
    port,
    sources: { serverUrl: serverSource, token: tokenSource, port: serverSource },
    configPath: path,
    warnings,
    // 活引用（不是快照）：警告在 resolveConfig 之后仍可能被追加
    warningDetails,
    ...(token === null
      ? {
          hint: '未找到访问令牌，请先运行 `openvibe serve` 生成 config.json，或用 --token / OPENVIBE_TOKEN 指定',
        }
      : {}),
  }
}
