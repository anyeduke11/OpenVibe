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
  hint?: string
}

/** 用户给的旗标不合法 → 早失败，不带着坏配置去发请求 */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}

export function configFilePath(home?: string): string {
  return join(home ?? openvibeHome(), CONFIG_FILE_NAME)
}

function normalizeServerUrl(raw: string, label: string): { serverUrl: string; port: number } {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new ConfigError(`${label} 不是合法 URL：${raw}`)
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

/** 读 config.json；不存在 → {config:null}；损坏或字段不合法 → 附 error 且永不抛（配置降级不阻断命令） */
export function readConfigFile(home?: string): { config: OpenvibeConfig | null; error?: string } {
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
    return { config: null, error: `JSON 解析失败：${(e as Error).message}` }
  }
  const result = OpenvibeConfigSchema.safeParse(parsed)
  if (!result.success) {
    const issue = result.error.issues[0]
    return { config: null, error: `字段不合法：${issue ? issue.path.join('.') : '(未知)'}` }
  }
  try {
    const { serverUrl } = normalizeServerUrl(result.data.serverUrl, path)
    return { config: { ...result.data, serverUrl } }
  } catch (e) {
    return { config: null, error: `serverUrl 不合法：${(e as Error).message}` }
  }
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
  const { config, error } = readConfigFile(home)
  if (error) warnings.push(`无法使用 ${path}：${error}，已回退默认配置`)

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
    ...(token === null
      ? {
          hint: '未找到访问令牌，请先运行 `openvibe serve` 生成 config.json，或用 --token / OPENVIBE_TOKEN 指定',
        }
      : {}),
  }
}
