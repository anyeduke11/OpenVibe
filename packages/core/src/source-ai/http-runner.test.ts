// `packages/core/src/source-ai/http-runner.test.ts` —— **OpenAI 兼容 HTTP runner** 的判据测试
// （owner 2026-10-22 裁决一：「支持本地模型和 LLM API 接入」）。
//
// ## 它断什么
//
// | 断的事 | 为什么必须断 |
// |---|---|
// | **先比版本，再谈字段** | 版本对不上要归一成「契约变了」而不是「输出坏了」（增强 3） |
// | **剥 markdown 围栏** | 模型很爱把 JSON 包在 ```json 里 ⇒ 不剥就白跑一趟 |
// | **401/403 单列** | 「配了但没登录」要说清楚，否则用户会去查代码而问题在凭据 |
// | **没配 key 就不发 Authorization** | 本机模型通常不要凭据 ⇒ 硬发空 Bearer 反而被判未登录 |
// | **超时要归一** | 失败不许冒成异常（M3 FR-6.3.3） |
//
// ⚠️ **本机服务在进程内起**（不 spawn 子进程）⇒ 不会踩「父进程被冻 ⇒ 请求假超时」那个坑。
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { SOURCE_INTERPRET_SCHEMA_VERSION, type SourceInterpretRequest } from '@openvibe/shared'
import { HttpInterpretRunner, extractContent, stripJsonFence } from './http-runner'
import { InterpretRunnerError } from './runner'

const servers: Server[] = []
afterEach(() => {
  while (servers.length > 0) {
    const s = servers.pop()
    s?.closeAllConnections()
    s?.close()
  }
})

interface Started {
  url: string
  requests: { headers: IncomingMessage['headers']; body: string }[]
}

type Handler = (req: IncomingMessage, res: ServerResponse, body: string) => void

/** 起一个本机服务（**进程内**）。 */
async function startServer(handler: Handler): Promise<Started> {
  const state: Started = { url: '', requests: [] }
  const server = createServer((req, res) => {
    let raw = ''
    req.on('data', (c: Buffer) => {
      raw += c.toString('utf8')
    })
    req.on('end', () => {
      state.requests.push({ headers: req.headers, body: raw })
      handler(req, res, raw)
    })
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const addr = server.address()
  const port = typeof addr === 'object' && addr !== null ? addr.port : 0
  state.url = `http://127.0.0.1:${String(port)}/v1/chat/completions`
  return state
}

const REQUEST: SourceInterpretRequest = {
  schema_version: SOURCE_INTERPRET_SCHEMA_VERSION,
  topics: [{ slug: 'py-logging', title: 'Python 日志' }],
  fragments: [
    {
      finding_id: 1,
      path: 'app/main.py',
      content: 'import logging',
      line: 3,
      topic_slug: 'py-logging',
      topic_title: 'Python 日志',
    },
  ],
}

/** 一个合法的 OpenAI 兼容响应体。 */
function okBody(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    choices: [
      {
        message: {
          content: JSON.stringify({
            schema_version: SOURCE_INTERPRET_SCHEMA_VERSION,
            model: 'm-test',
            provider: 'p-test',
            items: [
              { topic_slug: 'py-logging', summary: '用了标准库日志', risks: [], claim_state: null },
            ],
            ...over,
          }),
        },
      },
    ],
  }
}

function runnerFor(url: string, apiKey = ''): HttpInterpretRunner {
  return new HttpInterpretRunner({
    endpoint: url,
    model: 'm-test',
    provider: 'p-test',
    apiKey,
    timeoutMs: 3_000,
  })
}

describe('M9 · HTTP runner · 正常路径', () => {
  it('OpenAI 兼容响应 ⇒ 解析出结果', async () => {
    const s = await startServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(okBody()))
    })
    const result = await runnerFor(s.url).interpret(REQUEST)
    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.topic_slug).toBe('py-logging')
  })

  it('⚠️ **模型把 JSON 包在 markdown 围栏里** ⇒ 也能解析（不剥就白跑一趟）', async () => {
    const s = await startServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      const inner = JSON.stringify({
        schema_version: SOURCE_INTERPRET_SCHEMA_VERSION,
        model: 'm-test',
        provider: 'p-test',
        items: [{ topic_slug: 'py-logging', summary: 'ok', risks: [], claim_state: null }],
      })
      res.end(
        JSON.stringify({ choices: [{ message: { content: '```json\n' + inner + '\n```' } }] }),
      )
    })
    const result = await runnerFor(s.url).interpret(REQUEST)
    expect(result.items).toHaveLength(1)
  })

  it('⚠️ **没配 key 就不发 Authorization 头**（本机模型通常不要凭据）', async () => {
    const s = await startServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(okBody()))
    })
    await runnerFor(s.url).interpret(REQUEST)
    expect(s.requests[0]?.headers['authorization']).toBeUndefined()
  })

  it('配了 key ⇒ 发 `Bearer <key>`', async () => {
    const s = await startServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(okBody()))
    })
    await runnerFor(s.url, 'sk-test-123').interpret(REQUEST)
    expect(s.requests[0]?.headers['authorization']).toBe('Bearer sk-test-123')
  })

  it('⚠️ **送出去的字节里没有绝对路径**（DL-18：路径不出网）', async () => {
    const s = await startServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(okBody()))
    })
    await runnerFor(s.url).interpret(REQUEST)
    const body = s.requests[0]?.body ?? ''
    expect(body).toContain('app/main.py')
    expect(body).not.toContain('/Users/')
  })
})

describe('M9 · HTTP runner · 失败一律归一（不许把异常冒到界面）', () => {
  it('HTTP 401 ⇒ `runner-failed` 且**说清是凭据问题**', async () => {
    const s = await startServer((_req, res) => {
      res.writeHead(401)
      res.end('unauthorized')
    })
    await expect(runnerFor(s.url, 'sk-bad').interpret(REQUEST)).rejects.toMatchObject({
      reason: 'runner-failed',
    })
    await expect(runnerFor(s.url, 'sk-bad').interpret(REQUEST)).rejects.toThrow(/凭据/)
  })

  it('HTTP 500 ⇒ `runner-failed`', async () => {
    const s = await startServer((_req, res) => {
      res.writeHead(500)
      res.end('boom')
    })
    await expect(runnerFor(s.url).interpret(REQUEST)).rejects.toBeInstanceOf(InterpretRunnerError)
  })

  it('响应不是 JSON ⇒ `runner-invalid-json`', async () => {
    const s = await startServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end('这不是 JSON')
    })
    await expect(runnerFor(s.url).interpret(REQUEST)).rejects.toMatchObject({
      reason: 'runner-invalid-json',
    })
  })

  it('⚠️ **契约版本对不上** ⇒ `runner-version-mismatch`（不是「输出坏了」）', async () => {
    const s = await startServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  schema_version: 99,
                  model: 'm',
                  provider: 'p',
                  items: [],
                }),
              },
            },
          ],
        }),
      )
    })
    await expect(runnerFor(s.url).interpret(REQUEST)).rejects.toMatchObject({
      reason: 'runner-version-mismatch',
    })
  })

  it('版本对但**字段不合契约** ⇒ `runner-invalid-schema`', async () => {
    const s = await startServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  schema_version: SOURCE_INTERPRET_SCHEMA_VERSION,
                  model: 'm',
                  provider: 'p',
                  items: [{ topic_slug: 'x' }],
                }),
              },
            },
          ],
        }),
      )
    })
    await expect(runnerFor(s.url).interpret(REQUEST)).rejects.toMatchObject({
      reason: 'runner-invalid-schema',
    })
  })

  it('**超时** ⇒ `runner-timeout`', async () => {
    const s = await startServer(() => {
      // ⚠️ **故意不回应** ⇒ 让客户端超时
    })
    const runner = new HttpInterpretRunner({
      endpoint: s.url,
      model: 'm',
      provider: 'p',
      timeoutMs: 200,
    })
    await expect(runner.interpret(REQUEST)).rejects.toMatchObject({ reason: 'runner-timeout' })
  })

  it('**没配端点** ⇒ `runner-not-found`', async () => {
    const runner = new HttpInterpretRunner({ endpoint: '  ', model: 'm', provider: 'p' })
    await expect(runner.interpret(REQUEST)).rejects.toMatchObject({ reason: 'runner-not-found' })
  })
})

describe('M9 · HTTP runner · 两个纯函数', () => {
  it('`stripJsonFence` 只剥围栏，不动内容', () => {
    expect(stripJsonFence('```json\n{"a":1}\n```')).toBe('{"a":1}')
    expect(stripJsonFence('```\n{"a":1}\n```')).toBe('{"a":1}')
    expect(stripJsonFence('{"a":1}')).toBe('{"a":1}')
    expect(stripJsonFence('{"a":"```x```"}')).toBe('{"a":"```x```"}')
  })

  it('`extractContent` 认 `message.content`，也认旧式的 `text`', () => {
    expect(extractContent({ choices: [{ message: { content: 'abc' } }] })).toBe('abc')
    expect(extractContent({ choices: [{ text: 'abc' }] })).toBe('abc')
    expect(extractContent({ choices: [] })).toBeNull()
    expect(extractContent(null)).toBeNull()
    expect(extractContent({ nope: 1 })).toBeNull()
  })
})
