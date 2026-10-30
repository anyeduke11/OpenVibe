// R4：web 与 server 只经 HTTP API 交互（同源相对路径 + dev 代理；浏览器自带 Origin 过鉴权）
//
// ⚠️ 文案取 `i18n/core` 而不是 `i18n/zh`：本文件被入口 `index.tsx` 引入，
// 而 `zh.ts` 是页级 30kB（跟着懒加载页走）——从这里 import 会把 30kB 拖进入口 chunk。
// `core.ts` 是壳层那一份（≈0.4kB），已在入口里，不增体积。
import { common } from '../i18n/core'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
    /**
     * 诊断原文（允许英文：server 侧捕获到的第三方英文原文）。
     *
     * 与 `message` 分通道：`message` 是中文人话（用户看到的那句），
     * `detail` 是排障依据（如 `EACCES: permission denied`）。
     * 缺省即不产生该字段。
     */
    readonly detail?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

interface RequestInitLite {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  /** 页面已经跳走/关掉也要送达的小写入（fetch keepalive，浏览器上限 64 kB） */
  keepalive?: boolean
}

async function request(path: string, init?: RequestInitLite): Promise<Response> {
  const body = init?.body === undefined ? undefined : JSON.stringify(init.body)
  let res: Response
  try {
    res = await fetch(path, {
      method: init?.method ?? 'GET',
      // 无 body 的请求不能带 content-type: application/json，否则 Fastify 以 400 拒绝（restore / delete）
      ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' } }),
      ...(init?.keepalive === true ? { keepalive: true } : {}),
      body,
    })
  } catch {
    // 传输层失败：连接被拒 / DNS 失败 / 请求被浏览器中止。
    // 浏览器的 TypeError.message 是英文机器串（"Failed to fetch"），直接透出去会
    // 在中文界面上漏出实现细节（措辞还随浏览器版本漂移）——在这一层换成中文。
    //
    // 为什么不是普通 Error：普通 Error 的 message 会被展示点原样取走（`err.message`），
    // 而「拿不到 server 的 {code,message}」这个判断只有一个出口知道 ⇒ 出口负责归一化。
    throw new ApiError(0, 'TRANSPORT_FAILED', common.unreachable)
  }
  if (!res.ok) {
    // 错误说明的**唯一权威来源**是 server 的 `{code, message}` JSON 体
    // （server 侧 plugins/errors.ts 保证错误一律是这个形状）。
    // 拿不到它 ⇒ 出问题的是链路本身（后端没起 / 代理打不通），不是某个接口的业务逻辑，
    // ⇒ 给一句链路层中文，而不是浏览器的 `statusText`（"Internal Server Error" 等英文机器串）。
    let code = 'INTERNAL'
    let message = common.unreachable
    let details: unknown
    let detail: string | undefined
    try {
      const body = (await res.json()) as {
        code?: string
        message?: string
        details?: unknown
        detail?: string
      }
      if (typeof body.code === 'string') code = body.code
      if (typeof body.message === 'string' && body.message !== '') message = body.message
      details = body.details
      if (typeof body.detail === 'string' && body.detail !== '') detail = body.detail
    } catch {
      // 非 JSON 错误体：dev 代理在后端没起时回的是 500 + text/plain 空体。
      // 保留上面那句中文兜底。
    }
    throw new ApiError(res.status, code, message, details, detail)
  }
  return res
}

export async function apiJson<T>(path: string, init?: RequestInitLite): Promise<T> {
  const res = await request(path, init)
  if (res.status === 204) return undefined as T
  try {
    return (await res.json()) as T
  } catch {
    // 成功响应但 body 不是合法 JSON（代理返回了 HTML、空体被截断等）。
    // 原生 `res.json()` 会抛 `SyntaxError`，其 message 是英文机器串
    //（"Unexpected end of JSON input" / "Unexpected token '<' ..."），
    // 且**不是 ApiError** ⇒ 会绕过本文件的归一化边界直达界面。
    // 与传输层失败同口径：拿不到 server 的 {code,message} ⇒ 归为链路层，给一句中文。
    throw new ApiError(res.status, 'INVALID_JSON', common.unreachable)
  }
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
