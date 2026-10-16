import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DEVLOG_TYPES, ERROR_CODES, type DevLogOut } from '@openvibe/shared'
import { ServerUnreachable, type ApiClient } from '../src/client'
import { SESSION_LOG_EVIDENCE_COMMAND, SessionLogError, sessionLogAction } from '../src/commands/session'
import { ExitCode } from '../src/output'
import { fakeClient } from './helpers/fake-client'
import { runCli, tempHome } from './helpers/cli-run'
import { startStubServer } from './helpers/stub-server'

/**
 * M8 · `openvibe session log`（m8-agent-bridge.md FR-4.1 第三行 / FR-4.4 红线）。
 *
 * 这是三只新命令里**唯一会改服务端 DB** 的一只，所以断言重心是：
 * 1. 请求体形状照既有 `DevLogCreateInput`（不另造一套 CLI 专属形制）；
 * 2. **本机零落盘** —— 静态禁列扫描（含自证）+ 子进程跑完临时 HOME 仍为空目录；
 * 3. serve 没起时的失败形态：自由 code（不在 ERROR_CODES 12 项闭集内）+ 可执行提示。
 */

const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'commands')
const MODULES = ['ask.ts', 'status.ts', 'session.ts'] as const

/**
 * CLI 层禁列，针对**这三只**命令：
 * - 任何 `node:fs`（连读都不行：status 的路径解析只能拿服务端回的 localPath 做字符串比较，
 *   不许去探本地目录）；
 * - 写类 API 与 DB 驱动（FR-4.4 红线）。
 *
 * 作用域说明：只读 fs 对 sync/diff 是合法的（它们本来就要读项目树），这条禁列**只**管
 * M8 这三只，别拿它去套既有命令。
 */
const FORBIDDEN: readonly RegExp[] = [
  /from 'node:fs'/,
  /\b(writeFileSync|appendFileSync|mkdirSync|copyFileSync|createWriteStream|rmSync|unlinkSync)\b/,
  /\b(openDb|better-sqlite3|openDatabase)\b/,
]

function scanForForbidden(text: string): string[] {
  return FORBIDDEN.filter((re) => re.test(text)).map((re) => re.source)
}

const DEVLOG: DevLogOut = {
  id: 'log_1',
  projectId: 'prj_1',
  type: 'DEV',
  entryNo: 12,
  displayNo: 'DEV-0012',
  title: '接上 M8 CLI 三只命令',
  body: '',
  relatedFiles: [],
  evidence: null,
  linkedAssetIds: [],
  createdAt: '2026-10-15T00:00:00.000Z',
}

describe('session log 的请求体（既有 DevLogCreateInput 形制）', () => {
  it('CLI-SESSION-01: 全字段落位；--evidence 补 command 槽位；--related 保序去重且不按逗号拆', async () => {
    const fake = fakeClient({ post: { '/api/projects/prj_1/devlog': DEVLOG } })

    const outcome = await sessionLogAction(
      {
        project: 'prj_1',
        type: 'dev',
        title: '接上 M8 CLI 三只命令',
        body: 'ask/status/session 全部经 HTTP',
        evidence: 'pnpm typecheck rc=0',
        related: ['docs/specs/m8-agent-bridge.md', 'docs/specs/m8-agent-bridge.md', '  ', 'src/index.ts,src/ask.ts'],
      },
      { client: fake.client },
    )

    expect(fake.calls[0]?.method).toBe('POST')
    expect(fake.calls[0]?.body).toEqual({
      type: 'DEV',
      title: '接上 M8 CLI 三只命令',
      body: 'ask/status/session 全部经 HTTP',
      // 重复项去掉、空串去掉；带逗号的路径**不拆**（拆了就改了用户给的路径）
      relatedFiles: ['docs/specs/m8-agent-bridge.md', 'src/index.ts,src/ask.ts'],
      evidence: { command: SESSION_LOG_EVIDENCE_COMMAND, resultSummary: 'pnpm typecheck rc=0' },
    })
    expect(outcome.entry.displayNo).toBe('DEV-0012')
    expect(outcome.hints.join('\n')).toContain('openvibe ask logs --project prj_1')
  })

  it('CLI-SESSION-02: 缺省字段照 schema 默认（title/body 空串、relatedFiles 空数组、evidence 不给键）', async () => {
    const fake = fakeClient({ post: { '/api/projects/prj_1/devlog': DEVLOG } })

    await sessionLogAction({ project: 'prj_1', type: 'CHECK' }, { client: fake.client })

    expect(fake.calls[0]?.body).toEqual({ type: 'CHECK', title: '', body: '', relatedFiles: [] })
    expect(fake.calls[0]?.body).not.toHaveProperty('evidence')
  })

  it('CLI-SESSION-03: --type 只认 DEV/CHECK；--project 缺/空 ⇒ 本地零请求', async () => {
    const fake = fakeClient({ post: { '/api/projects/prj_1/devlog': DEVLOG } })

    const badType = await sessionLogAction({ project: 'prj_1', type: 'DEVLOG' }, { client: fake.client }).catch(
      (e: unknown) => e,
    )
    expect((badType as SessionLogError).code).toBe('BAD_TYPE')
    for (const t of DEVLOG_TYPES) expect((badType as Error).message).toContain(t)

    const noProject = await sessionLogAction({ project: '  ', type: 'DEV' }, { client: fake.client }).catch(
      (e: unknown) => e,
    )
    expect((noProject as SessionLogError).code).toBe('USAGE')
    expect((noProject as Error).message).toContain('--project')
    expect(fake.paths()).toEqual([])
  })

  it('CLI-SESSION-04: 无客户端 / 服务端不可达 ⇒ 自由 code + 「先跑 openvibe serve」', async () => {
    const offline = await sessionLogAction({ project: 'prj_1', type: 'DEV' }, {}).catch(
      (e: unknown) => e,
    )
    expect((offline as SessionLogError).code).toBe('SERVER_REQUIRED')
    expect((offline as Error).message).toContain('openvibe serve')

    const down: ApiClient = {
      serverUrl: 'http://127.0.0.1:1',
      getJson: () => Promise.reject(new Error('unused')),
      postJson: () => Promise.reject(new ServerUnreachable('http://127.0.0.1:1', 'connect ECONNREFUSED')),
    }
    const err = await sessionLogAction({ project: 'prj_1', type: 'DEV' }, { client: down }).catch(
      (e: unknown) => e,
    )
    expect((err as SessionLogError).code).toBe('SERVER_UNREACHABLE')
    expect((err as Error).message).toContain('openvibe serve')
    // CLI 层自由 code 不进服务端信封的闭集（FR-6.2）
    for (const code of ['SERVER_REQUIRED', 'SERVER_UNREACHABLE', 'BAD_TYPE'])
      expect(ERROR_CODES as readonly string[]).not.toContain(code)
  })
})

describe('CLI 侧不碰本地磁盘（FR-4.4 红线）', () => {
  it('CLI-SESSION-05: 三个命令模块零禁列命中（node:fs / 写类 API / DB 驱动）', () => {
    for (const mod of MODULES) expect(scanForForbidden(readFileSync(join(SRC_DIR, mod), 'utf8')), mod).toEqual([])
  })

  it('CLI-SESSION-06: 扫描器自证——脏样本必须被逐条报出，干净样本放行', () => {
    // 脏样本体量必须**大于**判据条数：三类禁列各来一处，外加一段正常代码当负对照
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
    // 负对照：只经 HTTP + 纯字符串比较的形状（这三只命令该长的样子）必须放行
    const clean = [
      "import { resolve } from 'node:path'",
      "import type { ApiClient } from '../client'",
      'export async function snapshot(client: ApiClient, dir: string) {',
      '  return client.getJson<unknown>(`/api/projects/${resolve(dir)}/context`)',
      '}',
    ].join('\n')
    expect(scanForForbidden(clean)).toEqual([])
  })
})

describe('--json 契约与三值退出码（m8 §7-p，真子进程）', () => {
  it('CLI-SESSION-07: ok 档——退 0、stdout 单对象、summary.ok=true、埋点 exitCode=0，且本机零落盘', async () => {
    const stub = await startStubServer({ devlog: DEVLOG, commandRun: { ok: true } })
    const home = tempHome()
    try {
      const res = await runCli(
        [
          '--json', '--server', stub.url, '--token', 't',
          'session', 'log', '--project', 'prj_1', '--type', 'DEV',
          '--title', '接上 M8 CLI 三只命令', '--evidence', 'pnpm typecheck rc=0',
          '--related', 'docs/specs/m8-agent-bridge.md',
        ],
        { home, env: { OPENVIBE_AGENT: 'claude-code' } },
      )
      const env = JSON.parse(res.stdout) as {
        command: string
        summary: { ok: boolean; exitCode: number; entry: DevLogOut; commandRun: { sent: boolean } }
      }
      expect(res.status).toBe(0)
      expect(env.command).toBe('session')
      expect(env.summary.ok).toBe(true)
      expect(env.summary.exitCode).toBe(0)
      expect(env.summary.entry.displayNo).toBe('DEV-0012')
      expect(env.summary.commandRun.sent).toBe(true)
      expect(stub.requests.filter((r) => r.url === '/api/agent/command-run')[0]?.body).toEqual({
        command: 'session',
        exitCode: 0,
        agent: 'claude-code',
      })
      expect(stub.requests.find((r) => r.url === '/api/projects/prj_1/devlog')?.body).toMatchObject({
        type: 'DEV',
        relatedFiles: ['docs/specs/m8-agent-bridge.md'],
      })
      // 成功腿同样不许在本机留痕：连 ~/.openvibe 都没建出来
      expect(readdirSync(home)).toEqual([])
    } finally {
      await stub.close()
    }
  })

  it('CLI-SESSION-08: error 档——serve 没起 ⇒ 退 1 + 自由 code + 可执行提示，且临时 HOME 零文件', async () => {
    const home = tempHome()
    // 127.0.0.1:1 无人监听 ⇒ 连不上，等价于「serve 未启动」
    const res = await runCli(
      ['--json', '--server', 'http://127.0.0.1:1', '--token', 't', 'session', 'log', '--project', 'prj_1', '--type', 'DEV'],
      { home },
    )
    const env = JSON.parse(res.stdout) as {
      command: string
      summary: { ok: boolean; error: { code: string; message: string } }
    }
    expect(res.status).toBe(ExitCode.error)
    expect(env.command).toBe('session')
    expect(env.summary.ok).toBe(false)
    expect(env.summary.error.code).toBe('SERVER_UNREACHABLE')
    expect(ERROR_CODES as readonly string[]).not.toContain(env.summary.error.code)
    expect(env.summary.error.message).toContain('openvibe serve')
    // 本机零落盘：跑完连配置目录都还是空的
    expect(readdirSync(home)).toEqual([])
  })

  it('CLI-SESSION-09: drift 档（2）在本命令不可达——它是写命令，没有「已漂移」这种本地态', async () => {
    // 与 ask 的 CLI-ASK-13 同型：把「不可达」钉成事实，而不是留一条谁也实现不出来的用例。
    // session log 只发一次 POST（devlog），响应里没有 pack/漂移概念，故成功恒退 0。
    const stub = await startStubServer({ devlog: DEVLOG, commandRun: { ok: true } })
    try {
      const res = await runCli(
        ['--json', '--server', stub.url, '--token', 't', 'session', 'log', '--project', 'prj_1', '--type', 'CHECK'],
        { home: tempHome() },
      )
      const env = JSON.parse(res.stdout) as { summary: { ok: boolean; exitCode: number } }
      expect(res.status).toBe(ExitCode.ok)
      expect(env.summary.ok).toBe(true)
      expect(env.summary.exitCode).toBe(0)
    } finally {
      await stub.close()
    }
  })
})
