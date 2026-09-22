import { DEFAULT_SERVER_URL } from './config'

/**
 * 唯一的 HTTP 出口（design §9：fetch + 5s 超时 + 401 详式提示）。
 * 不做自动重试（m6b §6.6 的上限是「不超过 2 次」，一次成功或一次失败即返回，
 * 重试会把「服务端不可达」这种需要人介入的状态隐藏掉）。
 */
export const HTTP_TIMEOUT_MS = 5_000

/** 客户端只需要这两项，发现链的其余字段（来源、告警）由调用方持有 */
export interface ServerTarget {
  serverUrl: string
  token: string | null
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly hint?: string
  constructor(status: number, code: string, message: string, hint?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    if (hint) this.hint = hint
  }
}

/** 连不上服务端（未启动 / 地址不对）。sync 的离线分支与 scan 的硬失败都据此分流 */
export class ServerUnreachable extends Error {
  readonly detail: string
  constructor(serverUrl: string, detail: string) {
    super(`无法连接 OpenVibe 服务（${serverUrl}）：${detail}`)
    this.name = 'ServerUnreachable'
    this.detail = detail
  }
}

export type FetchLike = (
  input: string,
  init: {
    method?: string
    headers?: Record<string, string>
    body?: string
    signal?: AbortSignal
  },
) => Promise<{
  status: number
  ok: boolean
  json(): Promise<unknown>
  text(): Promise<string>
}>

export interface ClientOptions {
  serverUrl: string
  token: string | null
  fetchImpl?: FetchLike
  timeoutMs?: number
}

export interface ApiClient {
  readonly serverUrl: string
  getJson<T>(path: string): Promise<T>
  postJson<T>(path: string, body: unknown): Promise<T>
}

/** 令牌缺失时不发消息：离线模式（sync --file/--dir）根本不走客户端 */
export function requireToken(config: ServerTarget): string {
  if (!config.token) {
    throw new ApiError(
      401,
      'UNAUTHORIZED',
      '未找到访问令牌，无法调用服务端 API',
      '先运行 `openvibe serve` 生成 ~/.openvibe/config.json，或用 --token / OPENVIBE_TOKEN 指定',
    )
  }
  return config.token
}

export function createClient(options: ClientOptions): ApiClient {
  const serverUrl = (options.serverUrl || DEFAULT_SERVER_URL).replace(/\/+$/, '')
  const doFetch: FetchLike = options.fetchImpl ?? (fetch as unknown as FetchLike)
  const timeoutMs = options.timeoutMs ?? HTTP_TIMEOUT_MS

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${serverUrl}${path}`
    let response: Awaited<ReturnType<FetchLike>>
    try {
      response = await doFetch(url, {
        method,
        headers: {
          accept: 'application/json',
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (e) {
      throw new ServerUnreachable(serverUrl, (e as Error).message ?? String(e))
    }

    const text = await response.text()
    let parsed: unknown = null
    if (text) {
      try {
        parsed = JSON.parse(text)
      } catch {
        parsed = null
      }
    }
    if (!response.ok) {
      const envelope = parsed as { code?: string; message?: string } | null
      const code = envelope?.code ?? `HTTP_${response.status}`
      const message = envelope?.message ?? `${method} ${path} 返回 ${response.status}`
      throw new ApiError(
        response.status,
        code,
        message,
        response.status === 401
          ? '令牌无效或已轮换：重跑 `openvibe serve` 会在 config.json 写回新令牌'
          : undefined,
      )
    }
    if (parsed === null)
      throw new ApiError(response.status, 'BAD_RESPONSE', `响应不是 JSON：${path}`)
    return parsed as T
  }

  return {
    serverUrl,
    getJson<T>(path: string): Promise<T> {
      return request<unknown>('GET', path).then((v) => v as T)
    },
    postJson<T>(path: string, body: unknown): Promise<T> {
      return request<unknown>('POST', path, body).then((v) => v as T)
    },
  }
}

/** 从旗标/环境/配置文件解析出的三元组，够客户端用即可 */
export function clientFromConfig(config: ServerTarget, fetchImpl?: FetchLike): ApiClient {
  return createClient({
    serverUrl: config.serverUrl || DEFAULT_SERVER_URL,
    token: requireToken(config),
    ...(fetchImpl ? { fetchImpl } : {}),
  })
}
