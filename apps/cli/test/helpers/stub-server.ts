import { createServer, type Server } from 'node:http'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'

/**
 * 子进程腿用的假服务端（node:http，无额外依赖）。
 *
 * 为什么不用 `fakeClient`：那支只活在被测进程内，而 `--json` 契约、退出码、
 * 「埋点失败不阻断主流程」这几条判据要看**真进程**走真 socket 的行为。
 *
 * 未登记的路由一律 404 —— 与 `helpers/fake-client.ts` 同一纪律：
 * 「只发了这几个请求」这类断言不会因为多调一个端点而静默通过。
 */

export interface StubRequest {
  method: string
  /** 含查询串的原样路径（`/api/projects/prj_1/context?fields=stage`） */
  url: string
  body?: unknown
}

export interface StubRoutes {
  /** GET /api/projects（?status=all 也落这里） */
  projects?: unknown
  /** GET /api/projects/:id/context */
  context?: unknown
  /** POST /api/projects/:id/devlog */
  devlog?: unknown
  /** POST /api/agent/command-run：不给则回 404（服务端未实现该端点时的真实形状） */
  commandRun?: unknown
}

export interface StubServer {
  url: string
  requests: StubRequest[]
  close(): Promise<void>
}

const send = (
  res: { statusCode: number; setHeader(k: string, v: string): void; end(b: string): void },
  status: number,
  body: unknown,
): void => {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

export async function startStubServer(routes: StubRoutes): Promise<StubServer> {
  const requests: StubRequest[] = []
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      const record: StubRequest = { method: req.method ?? 'GET', url: req.url ?? '/' }
      if (raw !== '') {
        try {
          record.body = JSON.parse(raw)
        } catch {
          record.body = raw
        }
      }
      requests.push(record)
      const path = (req.url ?? '/').split('?')[0] ?? '/'
      const isPost = req.method === 'POST'
      if (path === '/api/agent/command-run') {
        if (!isPost || routes.commandRun === undefined)
          send(res, 404, { code: 'NOT_FOUND', message: 'no such endpoint' })
        else send(res, 200, routes.commandRun)
        return
      }
      if (!isPost && path === '/api/projects') {
        send(res, 200, routes.projects ?? { items: [], total: 0 })
        return
      }
      if (!isPost && /^\/api\/projects\/[^/]+\/context$/.test(path)) {
        send(res, 200, routes.context ?? {})
        return
      }
      if (isPost && /^\/api\/projects\/[^/]+\/devlog$/.test(path)) {
        send(res, 201, routes.devlog ?? {})
        return
      }
      send(res, 404, { code: 'NOT_FOUND', message: `stub 未登记 ${record.method} ${path}` })
    })
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const port = (server.address() as AddressInfo).port
  return {
    url: `http://127.0.0.1:${String(port)}`,
    requests,
    async close() {
      server.close()
      await once(server, 'close')
    },
  }
}
