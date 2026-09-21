// R4：web 与 server 只经 HTTP API 交互（同源相对路径 + dev 代理；浏览器自带 Origin 过鉴权）
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

interface RequestInitLite {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
}

async function request(path: string, init?: RequestInitLite): Promise<Response> {
  const body = init?.body === undefined ? undefined : JSON.stringify(init.body)
  const res = await fetch(path, {
    method: init?.method ?? 'GET',
    // 无 body 的请求不能带 content-type: application/json，否则 Fastify 以 400 拒绝（restore / delete）
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' } }),
    body,
  })
  if (!res.ok) {
    let code = 'INTERNAL'
    let message = `${String(res.status)} ${res.statusText}`
    let details: unknown
    try {
      const body = (await res.json()) as { code?: string; message?: string; details?: unknown }
      if (typeof body.code === 'string') code = body.code
      if (typeof body.message === 'string') message = body.message
      details = body.details
    } catch {
      // 非 JSON 错误体保留状态文案
    }
    throw new ApiError(res.status, code, message, details)
  }
  return res
}

export async function apiJson<T>(path: string, init?: RequestInitLite): Promise<T> {
  const res = await request(path, init)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export async function apiRaw(path: string, init?: RequestInitLite): Promise<Response> {
  return request(path, init)
}

export function qs(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') sp.set(k, String(v))
  }
  const s = sp.toString()
  return s === '' ? '' : `?${s}`
}
