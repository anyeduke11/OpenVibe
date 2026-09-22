import { ApiError, type ApiClient } from '../../src/client'

/**
 * 假客户端：只做「按路径查表 + 记账」。
 * 未登记的路径一律抛错，因此「零外联 / 只发了这几个请求」这类断言（design §11.5 默认关闭、
 * m6b §7.3 离线只警告）不会因为多调了一个端点而静默通过。
 */
export interface FakeCall {
  method: 'GET' | 'POST'
  path: string
  body?: unknown
}

export type FakeRoutes = Record<string, unknown>

export interface FakeClientOptions {
  get?: FakeRoutes
  post?: FakeRoutes
  serverUrl?: string
  /** 命中即抛出的路径（模拟网络层失败，与 4xx 分开测） */
  failOn?: string[]
}

export interface FakeClient {
  client: ApiClient
  calls: FakeCall[]
  paths(): string[]
}

const valueOrThrow = (label: string, path: string, table: FakeRoutes | undefined): unknown => {
  if (!table || !(path in table))
    throw new ApiError(404, 'FAKE_MISS', `夹具未登记 ${label} ${path}`)
  const value = table[path]
  if (value instanceof Error) throw value
  return value
}

export function fakeClient(options: FakeClientOptions = {}): FakeClient {
  const calls: FakeCall[] = []
  const check = (method: 'GET' | 'POST', path: string): void => {
    if (options.failOn?.includes(path))
      throw new ApiError(500, 'FAKE_DOWN', `夹具模拟失败：${path}`)
  }
  const client: ApiClient = {
    serverUrl: options.serverUrl ?? 'http://127.0.0.1:0',
    getJson<T>(path: string): Promise<T> {
      calls.push({ method: 'GET', path })
      check('GET', path)
      return Promise.resolve(valueOrThrow('GET', path, options.get) as T)
    },
    postJson<T>(path: string, body: unknown): Promise<T> {
      calls.push({ method: 'POST', path, ...(body === undefined ? {} : { body }) })
      check('POST', path)
      return Promise.resolve(valueOrThrow('POST', path, options.post) as T)
    },
  }
  return { client, calls, paths: () => calls.map((c) => `${c.method} ${c.path}`) }
}

/** 在线 sync 的最小服务端面：注入历史上报恒成功，其余按调用方补充 */
export function onlineSyncRoutes(extra: { get?: FakeRoutes; post?: FakeRoutes } = {}): {
  get: FakeRoutes
  post: FakeRoutes
} {
  return {
    get: { ...(extra.get ?? {}) },
    post: { '/api/injections': { id: 'inj_1' }, ...(extra.post ?? {}) },
  }
}
