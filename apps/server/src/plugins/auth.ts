import type { FastifyInstance } from 'fastify'
import { AppError } from '@openvibe/shared'

// design §11 双通道鉴权（dev-plan §4.2）：
//   带 Origin（浏览器）→ 必须 localhost/127.0.0.1 白名单，否则 403 FORBIDDEN_ORIGIN
//   不带 Origin 的同源/地址栏导航（下载）→ Sec-Fetch-Site 放行（DEV-0013 C-10）
//   其余程序请求（CLI 等）→ 必须 Bearer token，否则 401 UNAUTHORIZED
//   GET /api/health 豁免；onRequest 另校验 Host 防 DNS rebinding。
const LOCAL_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/
const HEALTH_PATH = '/api/health'

export interface AuthOptions {
  token: string
}

export function registerAuth(app: FastifyInstance, options: AuthOptions): void {
  app.addHook('onRequest', async (req) => {
    const hostname = (req.headers.host ?? '').replace(/:\d+$/, '')
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      throw new AppError('FORBIDDEN_ORIGIN', `Host 非本地回环：${hostname || '(空)'}`)
    }
  })

  app.addHook('preHandler', async (req) => {
    const path = req.url.split('?')[0] ?? ''
    if (!path.startsWith('/api') || path === HEALTH_PATH) return

    const origin = req.headers.origin
    if (origin !== undefined) {
      if (!LOCAL_ORIGIN_RE.test(origin)) {
        throw new AppError('FORBIDDEN_ORIGIN', `Origin 不在本地白名单：${origin}`)
      }
      return
    }
    if (req.headers.authorization === `Bearer ${options.token}`) return
    // 下载链接 / 地址栏导航不带 Origin（DEV-0013 C-10）：只信浏览器强制写入、
    // 页面 JS 不可伪造的 Sec-Fetch-Site。跨站请求（恶意网页 img/fetch）为 cross-site，
    // 走下面的 Bearer 分支被拒；本机程序不带任何标记同样 401。
    const site = req.headers['sec-fetch-site']
    if (site === 'same-origin' || site === 'none') return
    throw new AppError('UNAUTHORIZED', '程序请求需携带 Authorization: Bearer <token>')
  })
}
