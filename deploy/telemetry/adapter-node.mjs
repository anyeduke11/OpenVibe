// deploy/telemetry/worker.js 的 node:http 外壳：本地自测与端到端用例用的接收端。
// 真部署走 Cloudflare Workers + KV（见 README.md）；这里的计数只在内存里，重启即清零。
// 用法：node deploy/telemetry/adapter-node.mjs [port]
import { createServer } from 'node:http'
import { createTelemetryWorker, memoryKv } from './worker.js'

const worker = createTelemetryWorker(memoryKv())
const port = Number(process.argv[2] ?? process.env.PORT ?? 8799)

createServer(async (req, res) => {
  const chunks = []
  for await (const c of req) chunks.push(c)
  const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined
  const out = await worker.fetch(
    new Request(`http://127.0.0.1:${String(port)}${req.url ?? '/'}`, {
      method: req.method,
      headers: req.headers,
      ...(body === undefined ? {} : { body }),
    }),
  )
  res.writeHead(out.status, { 'content-type': out.headers.get('content-type') ?? 'text/plain' })
  res.end(Buffer.from(await out.arrayBuffer()))
}).listen(port, '127.0.0.1', function () {
  // port 传 0 时由内核分配，测试据此解析真实端口
  console.log(`openvibe 遥测接收端 http://127.0.0.1:${String(this.address().port)}/`)
})
