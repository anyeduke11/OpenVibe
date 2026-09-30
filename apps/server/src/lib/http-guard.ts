import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { AppError } from '@openvibe/shared'

/**
 * 远程 skill 源的出站守卫（DEV-0067）：仅 https、主机白名单、DNS 解析结果全为公网、
 * 重定向逐跳复检。Mimosa 生成前约束的四条（http/https only / 校验 host / 拒绝环回与
 * 私有保留地址）都落在这里，取数方一律走 guardedFetch，不许裸 fetch。
 */

/** 仓库与市场 API 的固定白名单 */
const ALLOWED_HOSTS = new Set(['api.github.com', 'raw.githubusercontent.com', 'api.skillhub.cn'])

/** 环回/私有/保留地址判定（v4 段 + v6 常见保留段 + v4-mapped v6） */
export function isPublicIp(ip: string): boolean {
  if (ip.includes(':')) {
    const mapped = ip.toLowerCase().match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/)
    if (mapped?.[1] !== undefined) return isPublicIp(mapped[1])
    const first = Number.parseInt(ip.split(':')[0] ?? 'ffff', 16)
    if (!Number.isFinite(first)) return false
    if (first === 0 || first === 0xfe80 || (first & 0xfe00) === 0xfc00 || (first & 0xff00) === 0xff00) {
      return false
    }
    return true
  }
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return false
  const [a, b] = parts as [number, number, number, number]
  if (a === 0 || a === 10 || a === 127) return false
  if (a === 100 && b >= 64 && b <= 127) return false // CGNAT 100.64/10
  if (a === 169 && b === 254) return false // link-local
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && (b === 0 || b === 168)) return false
  if (a === 198 && (b === 18 || b === 19)) return false // benchmark
  if (a >= 224) return false // 组播 + 保留
  return true
}

function hostAllowed(hostname: string, extraSuffixes: readonly string[]): boolean {
  if (ALLOWED_HOSTS.has(hostname)) return true
  // 后缀匹配必须是「.suffix 结尾或全等」：拦得住 myqcloud.com.evil.com，也拦得住 evil-myqcloud.com
  return extraSuffixes.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`))
}

/** DNS 解析的窄签名：守卫只用 all:true 形态（node:dns/promises 的 lookup 满足它） */
export type DnsLookupAll = (
  hostname: string,
  options: { all: true },
) => Promise<{ address: string }[]>

/**
 * 校验一个出站 URL：https only → 主机在白名单（或给定的重定向后缀内）→ 主机名不是 IP 字面量
 * → DNS 解析的所有地址都是公网。任一不过即抛 AppError（422/403/502）。
 * lookupImpl 可注入（测试固定解析结果，不碰真实网络）。
 */
export async function assertRemoteUrl(
  raw: string,
  extraSuffixes: readonly string[] = [],
  lookupImpl: DnsLookupAll = lookup as unknown as DnsLookupAll,
): Promise<URL> {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new AppError('VALIDATION_ERROR', `非法 URL: ${raw}`)
  }
  if (url.protocol !== 'https:') {
    throw new AppError('VALIDATION_ERROR', `远程源仅允许 https，拒绝: ${url.protocol}`)
  }
  if (isIP(url.hostname) !== 0 || !hostAllowed(url.hostname, extraSuffixes)) {
    throw new AppError('FORBIDDEN_ORIGIN', `主机不在远程源白名单内: ${url.hostname}`)
  }
  let addresses: { address: string }[]
  try {
    addresses = await lookupImpl(url.hostname, { all: true })
  } catch {
    throw new AppError('REMOTE_UNREACHABLE', `DNS 解析失败: ${url.hostname}`)
  }
  for (const { address } of addresses) {
    if (!isPublicIp(address)) {
      throw new AppError('FORBIDDEN_ORIGIN', `${url.hostname} 解析到私有/保留地址 ${address}，已拦截`)
    }
  }
  return url
}

const USER_AGENT = 'openvibe-skill-ledger'
/** 单请求硬超时（DEV-0068）：远端挂起不拖死导入/检查 */
const FETCH_TIMEOUT_MS = 15_000

/** 手动逐跳跟随重定向（≤3 跳），每一跳都过 assertRemoteUrl——follow 模式会绕过守卫 */
export async function guardedFetch(
  rawUrl: string,
  init: {
    headers?: Record<string, string>
    extraSuffixes?: readonly string[]
    lookupImpl?: DnsLookupAll
  } = {},
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  let current = rawUrl
  for (let hop = 0; hop <= 3; hop++) {
    const url = await assertRemoteUrl(current, init.extraSuffixes ?? [], init.lookupImpl)
    const res = await fetchImpl(url, {
      redirect: 'manual',
      headers: { 'user-agent': USER_AGENT, ...init.headers },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location')
      if (location === null) {
        throw new AppError('REMOTE_UNREACHABLE', `远端 ${res.status} 重定向但缺 Location: ${current}`)
      }
      current = new URL(location, url).toString()
      continue
    }
    return res
  }
  throw new AppError('REMOTE_UNREACHABLE', `重定向超过 3 跳，放弃: ${rawUrl}`)
}

export async function guardedJson<T>(
  rawUrl: string,
  fetchImpl: typeof fetch = fetch,
  headers: Record<string, string> = {},
): Promise<T> {
  const res = await guardedFetch(rawUrl, { headers: { accept: 'application/json', ...headers } }, fetchImpl)
  if (!res.ok) {
    throw new AppError('REMOTE_UNREACHABLE', `远端 ${res.status}: ${rawUrl}`)
  }
  return (await res.json()) as T
}

export async function guardedText(
  rawUrl: string,
  extraSuffixes: readonly string[] = [],
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const res = await guardedFetch(rawUrl, { extraSuffixes }, fetchImpl)
  if (!res.ok) {
    throw new AppError('REMOTE_UNREACHABLE', `远端 ${res.status}: ${rawUrl}`)
  }
  return await res.text()
}
