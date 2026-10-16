import { createServer, type Server } from 'node:http'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ERROR_CODES, REQUIREMENT_PRIORITIES, type AgentIngestBatchResult } from '@openvibe/shared'
import { ServerUnreachable, type ApiClient } from '../src/client'
import {
  AGENT_INGEST_PATH,
  DEFAULT_REQUIREMENT_PRIORITY,
  DEFAULT_SOURCE_PLATFORM,
  RequirementAddError,
  buildRequirement,
  parsePriority,
  requirementAddAction,
  requirementIdempotencyKey,
} from '../src/commands/requirement'
import { COMMAND_RUN_PATH } from '../src/commands/status'
import { ExitCode } from '../src/output'
import { fakeClient } from './helpers/fake-client'
import { runCli, tempHome } from './helpers/cli-run'

/**
 * M8 · `openvibe requirement add`（m8-agent-bridge.md FR-4.1 表格的延后项 / FR-2.1.1 的人工确认门）。
 *
 * 断言重心与 `session-log.test.ts` 同型但**多两处**：
 * 1. **必须走 `POST /api/agent/ingest`**：禁止为它新建直接写 `requirements` 表的端点
 *    （FR-2.1.1 + FR-2.5）。所以请求体形状是被钉死的判据，不是实现细节。
 * 2. **幂等键可复算**（FR-2.3 由调用方构造）：同输入两次必须同键，否则重试会变成新条目。
 * 3. **本机零落盘**：静态禁列扫描（含自证）+ 子进程跑完临时 HOME 仍为空目录。
 */

const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'commands')
const MODULE = 'requirement.ts'

/**
 * 与 session-log 的禁列同型，但作用域收窄到本文件（那份管 ask/status/session 三只，本件不碰它）。
 * `node:crypto` **不在**禁列里：算幂等键要哈希，那不是文件操作。
 */
const FORBIDDEN: readonly RegExp[] = [
  /from 'node:fs'/,
  /\b(writeFileSync|appendFileSync|mkdirSync|copyFileSync|createWriteStream|rmSync|unlinkSync)\b/,
  /\b(openDb|better-sqlite3|openDatabase)\b/,
]

function scanForForbidden(text: string): string[] {
  return FORBIDDEN.filter((re) => re.test(text)).map((re) => re.source)
}

interface CommandRunBody {
  command: string
  exitCode: number
  agent: string | null
}

interface BatchBody {
  projectId: string
  items: {
    kind: string
    idempotencyKey: string
    payload: { title: string; detail: string; priority: string }
    sourcePlatform: string
    cwd?: string
    sourceSessionId?: string
  }[]
}

const ACCEPTED: AgentIngestBatchResult = {
  accepted: 1,
  duplicate: 0,
  conflict: 0,
  rejected: 0,
  items: [{ index: 0, status: 'accepted', id: 'agi_1' }],
}

/**
 * 子进程腿的假服务端。
 *
 * ⚠️ **为什么不在本文件复用 `helpers/stub-server.ts`**：那份是 session/ask/status 三只的
 * 共享夹具、登记了 `/api/agent/ingest` 之外的路由，而那份文件不属本件独占面。
 * 改它会把本件的改动面扩到别人的夹具上；在这里自建一份十行的 node:http 更小、更可控。
 * 纪律照抄那份：未登记的路由一律 404 ⇒ 「只发了这几个请求」不会因为多调一个端点而静默通过。
 */
interface IngestStub {
  url: string
  requests: { method: string; url: string; body?: unknown }[]
  close(): Promise<void>
}

async function startIngestStub(respond: unknown = ACCEPTED): Promise<IngestStub> {
  const requests: IngestStub['requests'] = []
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      const record: IngestStub['requests'][number] = { method: req.method ?? 'GET', url: req.url ?? '/' }
      if (raw !== '') {
        try {
          record.body = JSON.parse(raw)
        } catch {
          record.body = raw
        }
      }
      requests.push(record)
      const path = (req.url ?? '/').split('?')[0] ?? '/'
      const send = (status: number, body: unknown): void => {
        res.statusCode = status
        res.setHeader('content-type', 'application/json; charset=utf-8')
        res.end(JSON.stringify(body))
      }
      if (req.method === 'POST' && path === AGENT_INGEST_PATH) {
        send(200, respond)
        return
      }
      // 埋点端点已登记（2026-10-16 owner 授权扩闭集后）：本命令现在**应当**发 command-run。
      // ⚠️ 此前这里刻意返 404，作为「本命令不得偷发埋点」的守卫 —— 那守卫钉的是旧契约
      // （服务端闭集只有 ask|status|session，发 requirement 必 422）。契约扩后守卫已翻面，
      // 若日后有人把上报悄悄去掉，下面按「requests 恰好两次」的断言会红。
      if (req.method === 'POST' && path === COMMAND_RUN_PATH) {
        send(200, { ok: true })
        return
      }
      send(404, { code: 'NOT_FOUND', message: `stub 未登记 ${record.method} ${path}` })
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

describe('requirement add 的请求体：单一写端点 + 人工确认门（FR-2.1.1 / FR-2.5）', () => {
  it('CLI-REQ-01: 只发 POST /api/agent/ingest 一条 requirement 项，载荷三键对齐服务端 publishRequirement', async () => {
    const fake = fakeClient({ post: { [AGENT_INGEST_PATH]: ACCEPTED } })

    const outcome = await requirementAddAction(
      {
        project: 'prj_1',
        title: '接入 M8 第四只 CLI 命令',
        detail: 'requirement add 走回流端点',
        priority: 'P1',
      },
      { client: fake.client, cwd: '/w/openvibe', platform: 'claude-code' },
    )

    expect(fake.paths()).toEqual([`POST ${AGENT_INGEST_PATH}`])
    const body = fake.calls[0]?.body as BatchBody
    expect(body.projectId).toBe('prj_1')
    expect(body.items).toHaveLength(1)
    expect(body.items[0]?.kind).toBe('requirement')
    // 键名照 agentService.publishRequirement 实际读的三个：title / detail / priority
    expect(body.items[0]?.payload).toEqual({
      title: '接入 M8 第四只 CLI 命令',
      detail: 'requirement add 走回流端点',
      priority: 'P1',
    })
    expect(body.items[0]?.sourcePlatform).toBe('claude-code')
    // cwd 是自报字段（FR-1.2.2）：只入库不进 payload_json，故不影响幂等判定
    expect(body.items[0]?.cwd).toBe('/w/openvibe')
    // ⚠️ 绝不编造 sourceSessionId：agent_sessions 全仓无写入路径，编一个只会让服务端落 NULL，
    // 且看起来像「关联到了某个会话」
    expect(body.items[0]).not.toHaveProperty('sourceSessionId')
    expect(outcome.item.status).toBe('accepted')
    expect(outcome.exitCode).toBe(ExitCode.ok)
    expect(outcome.error).toBeUndefined()
  })

  it('CLI-REQ-02: 缺省字段照 schema 默认——detail 空串、priority 缺省 P2、platform 缺省 cli', async () => {
    const fake = fakeClient({ post: { [AGENT_INGEST_PATH]: ACCEPTED } })

    await requirementAddAction({ project: 'prj_1', title: '最小入参' }, { client: fake.client })

    const body = fake.calls[0]?.body as BatchBody
    expect(body.items[0]?.payload).toEqual({ title: '最小入参', detail: '', priority: 'P2' })
    expect(DEFAULT_REQUIREMENT_PRIORITY).toBe('P2')
    expect(body.items[0]?.sourcePlatform).toBe(DEFAULT_SOURCE_PLATFORM)
    // cwd 缺省空串 ⇒ 不给这个键（schema 是 nullable().optional()，给空串无意义）
    expect(body.items[0]).not.toHaveProperty('cwd')
  })

  it('CLI-REQ-03: 必填项缺失/空白与非法 priority ⇒ 本地零请求', async () => {
    const fake = fakeClient({ post: { [AGENT_INGEST_PATH]: ACCEPTED } })

    const noProject = await requirementAddAction({ project: '  ', title: 'x' }, { client: fake.client }).catch(
      (e: unknown) => e,
    )
    expect((noProject as RequirementAddError).code).toBe('USAGE')
    expect((noProject as Error).message).toContain('--project')

    const noTitle = await requirementAddAction({ project: 'prj_1', title: '   ' }, { client: fake.client }).catch(
      (e: unknown) => e,
    )
    expect((noTitle as RequirementAddError).code).toBe('BAD_TITLE')
    expect((noTitle as Error).message).toContain('--title')

    const badPriority = await requirementAddAction(
      { project: 'prj_1', title: 'x', priority: 'P3' },
      { client: fake.client },
    ).catch((e: unknown) => e)
    expect((badPriority as RequirementAddError).code).toBe('BAD_PRIORITY')
    for (const p of REQUIREMENT_PRIORITIES) expect((badPriority as Error).message).toContain(p)

    expect(fake.paths()).toEqual([])
  })

  it('CLI-REQ-04: --priority 大小写宽容（p0 ⇒ P0），但只认三值闭集', () => {
    expect(parsePriority('p0')).toBe('P0')
    expect(parsePriority(' P1 ')).toBe('P1')
    expect(parsePriority('P2')).toBe('P2')
    expect(() => parsePriority('P9')).toThrow(RequirementAddError)
    expect(() => parsePriority('')).toThrow(RequirementAddError)
  })

  it('CLI-REQ-05: 逐条 rejected / conflict ⇒ 退 1 且带上服务端的理由；accepted/duplicate ⇒ 退 0', async () => {
    const batch = (
      over: Partial<AgentIngestBatchResult> & Pick<AgentIngestBatchResult, 'items'>,
    ): AgentIngestBatchResult => ({ accepted: 0, duplicate: 0, conflict: 0, rejected: 0, ...over })
    const cases: { name: string; res: AgentIngestBatchResult; code: string | undefined; exit: number }[] = [
      {
        name: 'rejected',
        res: batch({ rejected: 1, items: [{ index: 0, status: 'rejected', reason: 'payload 超限' }] }),
        code: 'INGEST_REJECTED',
        exit: ExitCode.error,
      },
      {
        name: 'conflict',
        res: batch({
          conflict: 1,
          items: [
            { index: 0, status: 'conflict', existingKeySha: 'aaaaaaaa', incomingKeySha: 'bbbbbbbb' },
          ],
        }),
        code: 'INGEST_CONFLICT',
        exit: ExitCode.error,
      },
      {
        name: 'duplicate',
        res: batch({ duplicate: 1, items: [{ index: 0, status: 'duplicate', id: 'agi_9' }] }),
        code: undefined,
        exit: ExitCode.ok,
      },
    ]

    for (const c of cases) {
      const fake = fakeClient({ post: { [AGENT_INGEST_PATH]: c.res } })
      const outcome = await requirementAddAction({ project: 'prj_1', title: '逐条结果' }, { client: fake.client })
      expect(outcome.item.status, c.name).toBe(c.res.items[0]?.status)
      expect(outcome.exitCode, c.name).toBe(c.exit)
      expect(outcome.error?.code, c.name).toBe(c.code)
      // 失败两态必须留下服务端给的理由，否则调用方无从判断该不该换键重试
      if (c.exit === ExitCode.error) expect(outcome.warnings.join('\n'), c.name).toContain('逐条结果为')
    }
  })

  it('CLI-REQ-06: 服务端回空 items ⇒ 判 BAD_RESPONSE 退 1，绝不默认按成功收工', async () => {
    const fake = fakeClient({
      post: { [AGENT_INGEST_PATH]: { accepted: 0, duplicate: 0, conflict: 0, rejected: 0, items: [] } },
    })
    const err = await requirementAddAction({ project: 'prj_1', title: '协议异常' }, { client: fake.client }).catch(
      (e: unknown) => e,
    )
    expect((err as RequirementAddError).code).toBe('BAD_RESPONSE')
    expect((err as Error).message).toContain(AGENT_INGEST_PATH)
  })

  it('CLI-REQ-07: 无客户端 / 服务端不可达 ⇒ 自由 code + 「先跑 openvibe serve」，且不进 ERROR_CODES 闭集', async () => {
    const offline = await requirementAddAction({ project: 'prj_1', title: '离线' }, {}).catch((e: unknown) => e)
    expect((offline as RequirementAddError).code).toBe('SERVER_REQUIRED')
    expect((offline as Error).message).toContain('openvibe serve')

    const down: ApiClient = {
      serverUrl: 'http://127.0.0.1:1',
      getJson: () => Promise.reject(new Error('unused')),
      postJson: () => Promise.reject(new ServerUnreachable('http://127.0.0.1:1', 'connect ECONNREFUSED')),
    }
    const err = await requirementAddAction({ project: 'prj_1', title: '离线' }, { client: down }).catch(
      (e: unknown) => e,
    )
    expect((err as RequirementAddError).code).toBe('SERVER_UNREACHABLE')
    expect((err as Error).message).toContain('openvibe serve')
    // CLI 层自由 code 不进服务端信封的 12 项闭集（FR-6.2）
    for (const code of ['SERVER_REQUIRED', 'SERVER_UNREACHABLE', 'BAD_PRIORITY', 'BAD_TITLE', 'BAD_RESPONSE'])
      expect(ERROR_CODES as readonly string[]).not.toContain(code)
  })
})

describe('幂等键：由调用方构造、可复算、重试不产生新条目（FR-2.3）', () => {
  it('CLI-REQ-08: 同输入两次 ⇒ 同键；任一参与字段变化 ⇒ 换键', () => {
    const base = { project: 'prj_1', title: 'A', detail: 'B', priority: 'P2' }
    const key = requirementIdempotencyKey(base)
    expect(key).toBe(requirementIdempotencyKey({ ...base }))
    // 缺省 kind 即 'requirement'，显式给出同一个字面量必须与缺省一致（口径别分叉）
    expect(requirementIdempotencyKey({ ...base, kind: 'requirement' })).toBe(key)
    expect(key.startsWith('cli-requirement-')).toBe(true)
    expect(key).toMatch(/^cli-requirement-[0-9a-f]{64}$/)

    for (const changed of [
      { ...base, project: 'prj_2' },
      { ...base, title: 'A2' },
      { ...base, detail: 'B2' },
      { ...base, priority: 'P0' },
    ])
      expect(requirementIdempotencyKey(changed), JSON.stringify(changed)).not.toBe(key)
  })

  it('CLI-REQ-09: 拼接无歧义——分隔符让跨字段挪位撞不上键', () => {
    const a = requirementIdempotencyKey({ project: 'ab', title: 'c', detail: '', priority: 'P2' })
    const b = requirementIdempotencyKey({ project: 'a', title: 'bc', detail: '', priority: 'P2' })
    expect(a).not.toBe(b)
  })

  it('CLI-REQ-10: 重试 ⇒ 服务端判 duplicate ⇒ 退 0（而不是把重试判失败）', async () => {
    const dup: AgentIngestBatchResult = {
      accepted: 0,
      duplicate: 1,
      conflict: 0,
      rejected: 0,
      items: [{ index: 0, status: 'duplicate', id: 'agi_first' }],
    }
    const first = fakeClient({ post: { [AGENT_INGEST_PATH]: ACCEPTED } })
    const second = fakeClient({ post: { [AGENT_INGEST_PATH]: dup } })
    const opts = { project: 'prj_1', title: '同一条需求', detail: '', priority: 'P2' } as const

    const a = await requirementAddAction(opts, { client: first.client })
    // ⚠️ 必须跨过毫秒边界再发第二腿：两次调用若落在**同一毫秒**里，掺进键里的任何
    // 时间戳都会碰巧相同，这条断言就成了永真（实测：把键改成掺 Date.now() 时本腿最初没红，
    // 只有 CLI-REQ-08/14 抓住）。留 5ms 间隔后该腿对时间戳型熵也敏感。
    await new Promise((r) => setTimeout(r, 5))
    const b = await requirementAddAction(opts, { client: second.client })

    // 两腿的请求体逐字相同 ⇒ 幂等键可由调用方独立复算，不依赖服务端回传
    expect(first.calls[0]?.body).toEqual(second.calls[0]?.body)
    expect(a.idempotencyKey).toBe(b.idempotencyKey)
    expect(b.exitCode).toBe(ExitCode.ok)
    expect(b.item.id).toBe('agi_first')
  })
})

describe('CLI 侧不碰本地磁盘（FR-4.4 红线）', () => {
  it('CLI-REQ-11: requirement.ts 零禁列命中（node:fs / 写类 API / DB 驱动）', () => {
    expect(scanForForbidden(readFileSync(join(SRC_DIR, MODULE), 'utf8'))).toEqual([])
  })

  it('CLI-REQ-12: 扫描器自证——脏样本必须被逐条报出，干净样本放行', () => {
    const dirty = [
      "import { writeFileSync, mkdirSync } from 'node:fs'",
      'export function save(p: string) {',
      '  mkdirSync("/tmp/x", { recursive: true })',
      '  writeFileSync(p, "hi")',
      '}',
      "import { openDb } from '@openvibe/core'",
      'export const db = openDb("/tmp/x.db")',
    ].join('\n')
    const hits = scanForForbidden(dirty)
    expect(hits).toHaveLength(FORBIDDEN.length)
    expect(hits.join('\n')).toContain('node:fs')
    expect(hits.join('\n')).toContain('openDb')
    // 负对照：本命令该长的样子（只经 HTTP + 只 import node:crypto 算键）必须放行
    const clean = [
      "import { createHash } from 'node:crypto'",
      "import type { ApiClient } from '../client'",
      'export async function add(client: ApiClient, project: string) {',
      '  const key = createHash("sha256").update(project).digest("hex")',
      '  return client.postJson("/api/agent/ingest", { projectId: project, items: [{ idempotencyKey: key }] })',
      '}',
    ].join('\n')
    expect(scanForForbidden(clean)).toEqual([])
  })

  it('CLI-REQ-13: 只经 HTTP：本命令模块不 import 任何 node: 内置模块（除 node:crypto）', () => {
    const src = readFileSync(join(SRC_DIR, MODULE), 'utf8')
    const builtins = [...src.matchAll(/from '(node:[a-z_/]+)'/g)].map((m) => m[1])
    expect([...new Set(builtins)].sort()).toEqual(['node:crypto'])
  })
})

describe('--json 契约与三值退出码（m8 §7-p，真子进程）', () => {
  it('CLI-REQ-14: ok 档——退 0、stdout 单对象、summary.ok=true、幂等键可在 summary 里复算，且本机零落盘', async () => {
    const stub = await startIngestStub()
    const home = tempHome()
    try {
      const res = await runCli(
        [
          '--json', '--server', stub.url, '--token', 't',
          'requirement', 'add', '--project', 'prj_1', '--title', '接入 M8 第四只 CLI 命令',
          '--detail', '走 POST /api/agent/ingest', '--priority', 'P1',
        ],
        { home, env: { OPENVIBE_AGENT: 'claude-code' } },
      )
      // stdout 恰好一个可 JSON.parse 的对象（不是多个对象拼在一起）
      const env = JSON.parse(res.stdout) as {
        command: string
        summary: {
          ok: boolean
          exitCode: number
          project: string
          payload: { title: string; detail: string; priority: string }
          idempotencyKey: string
          sourcePlatform: string
          item: { status: string }
          commandRun: { sent: boolean; reason: string }
        }
      }
      expect(res.status).toBe(0)
      expect(env.command).toBe('requirement')
      expect(env.summary.ok).toBe(true)
      expect(env.summary.exitCode).toBe(0)
      expect(env.summary.item.status).toBe('accepted')
      expect(env.summary.project).toBe('prj_1')
      expect(env.summary.sourcePlatform).toBe('claude-code')
      // 幂等键从 stdout 就能独立复算（构造口径写在 commands/requirement.ts 里）
      expect(env.summary.idempotencyKey).toBe(
        requirementIdempotencyKey({
          project: 'prj_1',
          title: '接入 M8 第四只 CLI 命令',
          detail: '走 POST /api/agent/ingest',
          priority: 'P1',
        }),
      )

      // 恰好两次 POST：一次业务 ingest、一次 command-run 埋点。没有 GET、没有第三条。
      // ⚠️ 此处原为「只有 1 次、埋点不上报」，那是埋点闭集未扩时的形态。
      // 2026-10-16 owner 授权扩闭集（服务端 CLI_COMMAND_RUN_COMMANDS 加 requirement）后改为两次 ——
      // 关键判据不是「两次」，而是**第二次必须是 requirement 埋点且 exitCode 如实**：
      // 拿 `session` 顶替会让台账出现与真实执行不符的记录，比不记更坏。
      expect(stub.requests).toHaveLength(2)
      const sent = stub.requests[0] as { method: string; url: string; body: BatchBody }
      expect(sent.method).toBe('POST')
      expect(sent.url).toBe(AGENT_INGEST_PATH)
      expect(sent.body.projectId).toBe('prj_1')
      expect(sent.body.items).toHaveLength(1)
      expect(sent.body.items[0]?.kind).toBe('requirement')
      expect(sent.body.items[0]?.idempotencyKey).toBe(env.summary.idempotencyKey)
      expect(sent.body.items[0]?.payload).toEqual({
        title: '接入 M8 第四只 CLI 命令',
        detail: '走 POST /api/agent/ingest',
        priority: 'P1',
      })
      // 埋点：确实发出去了，且 command 逐字是 requirement（不是 session 顶替）
      const run = stub.requests[1] as { method: string; url: string; body: CommandRunBody }
      expect(run.method).toBe('POST')
      expect(run.url).toBe(COMMAND_RUN_PATH)
      expect(run.body.command).toBe('requirement')
      expect(run.body.exitCode).toBe(0)
      expect(env.summary.commandRun.sent).toBe(true)
      expect(env.summary.commandRun.reason).toBe('sent')

      // 成功腿同样零落盘：连 ~/.openvibe 都没建出来
      expect(readdirSync(home)).toEqual([])
    } finally {
      await stub.close()
    }
  })

  it('CLI-REQ-15: 缺 --project / 缺 --title ⇒ 退 1 且零请求', async () => {
    const stub = await startIngestStub()
    const home = tempHome()
    try {
      const noProject = await runCli(
        ['--server', stub.url, '--token', 't', 'requirement', 'add', '--title', 'x'],
        { home },
      )
      expect(noProject.status).toBe(ExitCode.error)
      expect(noProject.stderr).toContain('--project')

      const noTitle = await runCli(
        ['--server', stub.url, '--token', 't', 'requirement', 'add', '--project', 'prj_1'],
        { home },
      )
      expect(noTitle.status).toBe(ExitCode.error)
      expect(noTitle.stderr).toContain('--title')

      expect(stub.requests).toEqual([])
      expect(readdirSync(home)).toEqual([])
    } finally {
      await stub.close()
    }
  })

  it('CLI-REQ-16: 非法 --priority ⇒ 退 1 且零请求', async () => {
    const stub = await startIngestStub()
    const home = tempHome()
    try {
      const res = await runCli(
        ['--json', '--server', stub.url, '--token', 't', 'requirement', 'add', '--project', 'prj_1', '--title', 'x', '--priority', 'P9'],
        { home },
      )
      const env = JSON.parse(res.stdout) as { summary: { ok: boolean; error: { code: string; message: string } } }
      expect(res.status).toBe(ExitCode.error)
      expect(env.summary.ok).toBe(false)
      expect(env.summary.error.code).toBe('BAD_PRIORITY')
      expect(ERROR_CODES as readonly string[]).not.toContain(env.summary.error.code)
      expect(stub.requests).toEqual([])
      expect(readdirSync(home)).toEqual([])
    } finally {
      await stub.close()
    }
  })

  it('CLI-REQ-17: 服务端不可达 ⇒ 退 1 + 自由 code + 可执行提示，且临时 HOME 零文件', async () => {
    const home = tempHome()
    // 127.0.0.1:1 无人监听 ⇒ 连不上，等价于「serve 未启动」
    const res = await runCli(
      ['--json', '--server', 'http://127.0.0.1:1', '--token', 't', 'requirement', 'add', '--project', 'prj_1', '--title', 'x'],
      { home },
    )
    const env = JSON.parse(res.stdout) as {
      command: string
      summary: { ok: boolean; error: { code: string; message: string } }
    }
    expect(res.status).toBe(ExitCode.error)
    expect(env.command).toBe('requirement')
    expect(env.summary.ok).toBe(false)
    expect(env.summary.error.code).toBe('SERVER_UNREACHABLE')
    expect(ERROR_CODES as readonly string[]).not.toContain(env.summary.error.code)
    expect(env.summary.error.message).toContain('openvibe serve')
    expect(readdirSync(home)).toEqual([])
  })

  it('CLI-REQ-18: 服务端逐条 rejected ⇒ 退 1，--json 仍是 stdout 单对象且 ok 与退出码一致', async () => {
    const stub = await startIngestStub({
      accepted: 0,
      duplicate: 0,
      conflict: 0,
      rejected: 1,
      items: [{ index: 0, status: 'rejected', reason: 'requirement 缺 title' }],
    })
    const home = tempHome()
    try {
      const res = await runCli(
        ['--json', '--server', stub.url, '--token', 't', 'requirement', 'add', '--project', 'prj_1', '--title', 'x'],
        { home },
      )
      const env = JSON.parse(res.stdout) as {
        summary: {
          ok: boolean
          exitCode: number
          item: { status: string; reason?: string }
          error: { code: string; message: string }
          idempotencyKey: string
        }
      }
      expect(res.status).toBe(ExitCode.error)
      // ok 与退出码同源：不可能出现「退 1 却报 ok:true」
      expect(env.summary.ok).toBe(false)
      expect(env.summary.exitCode).toBe(ExitCode.error)
      expect(env.summary.item.status).toBe('rejected')
      expect(env.summary.item.reason).toBe('requirement 缺 title')
      expect(env.summary.error.code).toBe('INGEST_REJECTED')
      // 失败腿同样上报埋点，且 **exitCode 如实为 1** —— 埋点的价值就在于失败也可见。
      // ⚠️ 若把失败记成 exitCode 0，台账会显示「这条命令成功了」，那是把观测面做坏了。
      expect(stub.requests).toHaveLength(2)
      const failRun = stub.requests[1] as { method: string; url: string; body: CommandRunBody }
      expect(failRun.url).toBe(COMMAND_RUN_PATH)
      expect(failRun.body.command).toBe('requirement')
      expect(failRun.body.exitCode).toBe(ExitCode.error)
      expect(readdirSync(home)).toEqual([])
    } finally {
      await stub.close()
    }
  })

  it('CLI-REQ-19: drift 档（2）在本命令不可达——它是纯写命令，没有「已漂移」这种本地态', async () => {
    // 与 CLI-SESSION-09 / CLI-ASK-13 同型：把「不可达」钉成事实，而不是留一条谁也实现不出来的用例。
    // requirement add 只发一次 POST（agent/ingest），响应里没有 pack/漂移概念，故成功恒退 0；
    // 服务端逐条 rejected/conflict 是「没进去」⇒ error(1)，不是 drift(2)。
    const stub = await startIngestStub()
    try {
      const res = await runCli(
        ['--json', '--server', stub.url, '--token', 't', 'requirement', 'add', '--project', 'prj_1', '--title', 'x'],
        { home: tempHome() },
      )
      const env = JSON.parse(res.stdout) as { summary: { ok: boolean; exitCode: number } }
      expect(res.status).toBe(ExitCode.ok)
      expect(env.summary.ok).toBe(true)
      expect(env.summary.exitCode).toBe(ExitCode.ok)
    } finally {
      await stub.close()
    }
  })
})

describe('入参组装（纯函数面）', () => {
  it('CLI-REQ-20: 组装结果与 parsePriority 同源，缺省 priority 走 P2', () => {
    expect(buildRequirement({ project: ' prj_1 ', title: ' 标题 ' })).toEqual({
      project: 'prj_1',
      payload: { title: '标题', detail: '', priority: 'P2' },
    })
    expect(buildRequirement({ project: 'prj_1', title: 't', priority: 'p0' }).payload.priority).toBe('P0')
    expect(() => buildRequirement({ project: 'prj_1', title: 't', priority: 'urgent' })).toThrow(
      RequirementAddError,
    )
  })
})
