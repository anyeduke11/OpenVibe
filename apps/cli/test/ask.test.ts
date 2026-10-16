import { rmSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ProjectContextOut } from '@openvibe/shared'
import { ApiError, ServerUnreachable, type ApiClient } from '../src/client'
import { ASK_FIELDS, ASK_KEYWORDS, AskError, askAction } from '../src/commands/ask'
import { fakeClient } from './helpers/fake-client'
import { runCli } from './helpers/cli-run'
import { startStubServer } from './helpers/stub-server'

/**
 * M8 · `openvibe ask`（m8-agent-bridge.md FR-4.1 第一行 / FR-4.1.1）。
 *
 * 三组断言重心：
 * 1. **闭集**：七项关键词一个不多一个不少，非法词必须报错且**把七个词全列出来**——
 *    agent 拿到错误才能自己纠正，这比「非法输入」四个字有用得多；
 * 2. **关键词 → context 哪一段**：`?fields=` 的字面量映射（表驱动，期望值写死在测试里，
 *    不从 ASK_FIELDS 读，否则实现改了断言跟着改，等于没测）；
 * 3. **--json 契约**（§7-p）：stdout 恰好一个可解析对象，`summary.ok` 与退出码一致。
 */

const roots: string[] = []

afterAll(() => {
  while (roots.length > 0) rmSync(roots.pop() ?? '', { recursive: true, force: true })
})

/** 项目路径解析所依据的服务端项目列表（本地路径由服务端持有，CLI 只做字符串比较） */
const PROJECTS = {
  items: [
    {
      id: 'prj_1',
      name: 'OpenVibe 灵典',
      localPath: '/w/openvibe',
      flowTemplateId: 'ft_1',
      stagesSnapshot: [],
      currentStage: '实现',
      status: 'active',
      standardPackId: null,
      standardPackVersion: null,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-14T00:00:00.000Z',
    },
  ],
  total: 1,
}

/** 5 个检查项（2 勾）+ 6 个任务（3 todo / 2 doing / 1 done）—— 体量必须大于被测阈值 */
function contextFixture(): ProjectContextOut {
  return {
    project: {
      id: 'prj_1',
      name: 'OpenVibe 灵典',
      status: 'active',
      currentStage: '实现',
      flowTemplateId: 'ft_1',
      updatedAt: '2026-10-14T00:00:00.000Z',
    },
    stage: { current: '实现', total: 5, completed: 2 },
    checklist: {
      stageName: '实现',
      items: [
        { id: 'c1', label: '搭脚手架', checked: true },
        { id: 'c2', label: '写测试', checked: true },
        { id: 'c3', label: '接服务端', checked: false },
        { id: 'c4', label: '补可读性判据', checked: false },
        { id: 'c5', label: '登记 CLI_COMMANDS', checked: false },
      ],
    },
    tasks: {
      todo: 3,
      doing: 2,
      done: 1,
      items: [
        { id: 't1', title: '设计 token', status: 'todo', stageName: '实现' },
        { id: 't2', title: '写迁移', status: 'todo', stageName: '实现' },
        { id: 't3', title: '接路由', status: 'todo', stageName: '实现' },
        { id: 't4', title: 'CLI 接线', status: 'doing', stageName: '实现' },
        { id: 't5', title: 'Web 展示', status: 'doing', stageName: '实现' },
        { id: 't6', title: '定字号', status: 'done', stageName: '实现' },
      ],
    },
    logs: {
      items: Array.from({ length: 8 }, (_, i) => ({
        id: `log_${String(8 - i)}`,
        type: i % 2 === 0 ? ('DEV' as const) : ('CHECK' as const),
        entryNo: 8 - i,
        title: `第 ${String(8 - i)} 条`,
        evidence: null,
        createdAt: '2026-10-14T00:00:00.000Z',
      })),
    },
    pack: { id: null, name: null, version: null, drifted: null, outdated: null },
    assets: { prompts: 12, skills: 4, terms: 37, playbooks: 6 },
    truncated: [],
    fields: ['stage'],
  }
}

describe('ask 的问题词闭集（FR-4.1.1）', () => {
  it('CLI-ASK-01: 非法词 → UNKNOWN_QUERY，且错误信息把七个合法词**全**列出来，零请求', async () => {
    const fake = fakeClient({ get: { '/api/projects?status=all': PROJECTS } })

    const err = await askAction({ question: '这个项目做完能上线吗' }, { client: fake.client }).catch(
      (e: unknown) => e,
    )

    expect(err).toBeInstanceOf(AskError)
    expect((err as AskError).code).toBe('UNKNOWN_QUERY')
    const message = (err as Error).message
    // 逐个断言而不是「消息里有个 status 就算」：少列一个词这条就红
    for (const keyword of ['status', 'next', 'checklist', 'assets', 'terms', 'playbook', 'logs'])
      expect(message).toContain(keyword)
    expect((err as AskError).details).toMatchObject({ keywords: [...ASK_KEYWORDS] })
    expect(fake.paths()).toEqual([])
  })

  it('CLI-ASK-02: 闭集恰好七项，且每项都能解析（大小写/空白归一，不接受任何自由文本）', async () => {
    expect([...ASK_KEYWORDS]).toHaveLength(7)
    for (const keyword of ASK_KEYWORDS) {
      const fake = fakeClient({
        get: { [`/api/projects/prj_1/context?fields=${ASK_FIELDS[keyword].join(',')}`]: contextFixture() },
      })
      const outcome = await askAction({ question: ` ${keyword.toUpperCase()} `, project: 'prj_1' }, { client: fake.client })
      expect(outcome.question).toBe(keyword)
    }
    const fake = fakeClient({})
    for (const bad of ['状态', 'status?', 'next step', ''])
      await expect(
        askAction({ question: bad, project: 'prj_1' }, { client: fake.client }),
      ).rejects.toBeInstanceOf(AskError)
    expect(fake.paths()).toEqual([])
  })
})

describe('ask 七个关键词 → context 的哪一段（FR-3.3 的 ?fields= 裁剪）', () => {
  // 期望串**写死**在这里。改成从 ASK_FIELDS 派生的话，这支就变成同源永真。
  const CASES: [keyword: string, fields: string][] = [
    ['status', 'stage'],
    ['next', 'checklist,tasks'],
    ['checklist', 'checklist'],
    ['assets', 'assets'],
    ['terms', 'assets'],
    ['playbook', 'assets'],
    ['logs', 'logs'],
  ]

  it('CLI-ASK-03: 表驱动——每个关键词只向服务端要它的那一段', async () => {
    expect(CASES).toHaveLength(7)
    for (const [keyword, fields] of CASES) {
      const fake = fakeClient({
        get: { [`/api/projects/prj_1/context?fields=${fields}`]: contextFixture() },
      })
      const outcome = await askAction({ question: keyword, project: 'prj_1' }, { client: fake.client })
      expect(fake.paths(), keyword).toEqual([`GET /api/projects/prj_1/context?fields=${fields}`])
      expect(outcome.fields, keyword).toEqual(fields.split(','))
      expect(fake.calls.every((c) => c.method === 'GET'), keyword).toBe(true)
    }
  })
})

describe('ask 的答案塑形与项目解析', () => {
  it('CLI-ASK-04: next —— 未完检查项与未完任务分列，已勾/已完成的不出现', async () => {
    const fake = fakeClient({
      get: { '/api/projects/prj_1/context?fields=checklist,tasks': contextFixture() },
    })

    const outcome = await askAction({ question: 'next', project: 'prj_1' }, { client: fake.client })

    expect(outcome.answer.pendingChecklist).toEqual([
      { id: 'c3', label: '接服务端' },
      { id: 'c4', label: '补可读性判据' },
      { id: 'c5', label: '登记 CLI_COMMANDS' },
    ])
    expect(outcome.answer.taskCounts).toEqual({ todo: 3, doing: 2, done: 1 })
    expect((outcome.answer.openTasks as { title: string }[]).map((t) => t.title)).toEqual([
      '设计 token',
      '写迁移',
      '接路由',
      'CLI 接线',
      'Web 展示',
    ])
  })

  it('CLI-ASK-05: 缺省 --project ⇒ 先解析 cwd 命中的项目；给 --project 则零额外请求', async () => {
    const fake = fakeClient({
      get: {
        '/api/projects?status=all': PROJECTS,
        '/api/projects/prj_1/context?fields=stage': contextFixture(),
      },
    })
    const inCwd = await askAction({ question: 'status' }, { client: fake.client, cwd: '/w/openvibe' })
    expect(fake.paths()).toEqual([
      'GET /api/projects?status=all',
      'GET /api/projects/prj_1/context?fields=stage',
    ])
    expect(inCwd.projectId).toBe('prj_1')

    const byId = await askAction({ question: 'status', project: 'prj_1' }, { client: fake.client })
    expect(fake.calls).toHaveLength(3)
    expect(byId.projectName).toBe('OpenVibe 灵典')
  })

  it('CLI-ASK-06: 服务端的裁剪留痕透传给调用方（不许把「被砍掉」当「不存在」）', async () => {
    const ctx = contextFixture()
    ctx.truncated = [
      { section: 'logs', dropped: 3, reason: 'budget', detail: '预算不足，日志段保留最近 5 条' },
    ]
    const fake = fakeClient({ get: { '/api/projects/prj_1/context?fields=stage': ctx } })

    const outcome = await askAction({ question: 'status', project: 'prj_1' }, { client: fake.client })

    expect(outcome.truncated).toEqual(ctx.truncated)
    expect(outcome.warnings.join('\n')).toContain('预算不足，日志段保留最近 5 条')
    expect(outcome.hints.join('\n')).toContain('truncated')
  })

  it('CLI-ASK-07: 无客户端 / 服务端不可达 ⇒ 自由 code + 可执行提示，零本地动作', async () => {
    const offline = await askAction({ question: 'status' }, {}).catch((e: unknown) => e)
    expect((offline as AskError).code).toBe('SERVER_REQUIRED')
    expect((offline as Error).message).toContain('openvibe serve')

    const down: ApiClient = {
      serverUrl: 'http://127.0.0.1:1',
      getJson: () => Promise.reject(new ServerUnreachable('http://127.0.0.1:1', 'connect ECONNREFUSED')),
      postJson: () => Promise.reject(new Error('unused')),
    }
    const err = await askAction({ question: 'status', project: 'prj_1' }, { client: down }).catch(
      (e: unknown) => e,
    )
    expect((err as AskError).code).toBe('SERVER_UNREACHABLE')
    expect((err as Error).message).toContain('ECONNREFUSED')
    expect((err as Error).message).toContain('openvibe serve')
  })

  it('CLI-ASK-08: 服务端 4xx 的 code 原样上抛，CLI 不改写', async () => {
    const fake = fakeClient({
      get: {
        '/api/projects/prj_1/context?fields=stage': new ApiError(404, 'NOT_FOUND', '项目不存在: prj_1'),
      },
    })
    const err = await askAction({ question: 'status', project: 'prj_1' }, { client: fake.client }).catch(
      (e: unknown) => e,
    )
    expect((err as { code?: string }).code).toBe('NOT_FOUND')
  })
})

describe('--json 契约与三值退出码（m8 §7-p，真子进程）', () => {
  const run = (args: string[], agent?: string) =>
    runCli(args, agent === undefined ? {} : { env: { OPENVIBE_AGENT: agent } })

  // 一个词一支（而不是一支里连跑七次）：七次 spawnSync 串起来会顶穿本 project 的 30s 闸，
  // 机器一忙就变成随机红。表驱动仍在，期望值仍逐词写死。
  let clean: Awaited<ReturnType<typeof startStubServer>>

  beforeAll(async () => {
    clean = await startStubServer({ projects: PROJECTS, context: contextFixture(), commandRun: { ok: true } })
  })

  afterAll(async () => {
    await clean?.close()
  })

  for (const keyword of ASK_KEYWORDS) {
    it(`CLI-ASK-09[${keyword}]: ok 档——stdout 恰好一个 JSON 对象，summary.ok=true 且与退出码 0 一致`, async () => {
      const res = await run([
        '--json', '--server', clean.url, '--token', 'test-token', 'ask', keyword, '--project', 'prj_1',
      ])
      // 整个 stdout 能 JSON.parse ⇒ 它恰好是一个 JSON 文档（两个对象会解析失败）
      const env = JSON.parse(res.stdout) as {
        command: string
        summary: { ok: boolean; exitCode: number; question: string; answer: unknown }
      }
      expect(res.status, `${keyword}: ${res.stderr}`).toBe(0)
      expect(env.command).toBe('ask')
      expect(env.summary.question).toBe(keyword)
      expect(env.summary.ok).toBe(true)
      expect(env.summary.exitCode).toBe(0)
      expect(env.summary.answer).toBeTruthy()
      // 人读文案一律静默：stderr 里不得混进 JSON，stdout 末尾不得有多余文本
      expect(res.stderr).not.toContain('"command"')
      expect(res.stdout.trimEnd().endsWith('}')).toBe(true)
    })
  }

  it('CLI-ASK-10: error 档——非法词退 1，stdout 仍是单对象，error.code=UNKNOWN_QUERY 且列全七词', async () => {
    const stub = await startStubServer({ projects: PROJECTS, context: contextFixture() })
    try {
      const res = await run([
        '--json', '--server', stub.url, '--token', 'test-token', 'ask', '什么时候能上线',
      ])
      const env = JSON.parse(res.stdout) as {
        command: string
        summary: { ok: boolean; error: { code: string; message: string } }
      }
      expect(res.status).toBe(1)
      expect(env.command).toBe('ask')
      expect(env.summary.ok).toBe(false)
      expect(env.summary.error.code).toBe('UNKNOWN_QUERY')
      for (const keyword of ASK_KEYWORDS) expect(env.summary.error.message).toContain(keyword)
      // 闭集错误是本地判定：一个业务请求都不该发出去（唯一那条是收尾埋点）
      expect(stub.requests.filter((r) => r.url !== '/api/agent/command-run')).toEqual([])
      // 失败也上报：命令「结束时」上报，含失败退出码
      expect(stub.requests.at(-1)?.body).toEqual({ command: 'ask', exitCode: 1, agent: null })
    } finally {
      await stub.close()
    }
  })

  it('CLI-ASK-11: 埋点——结束时 POST {command,exitCode,agent}，agent 取 OPENVIBE_AGENT；未给则 null', async () => {
    const stub = await startStubServer({ projects: PROJECTS, context: contextFixture(), commandRun: { ok: true } })
    try {
      await run(['--json', '--server', stub.url, '--token', 't', 'ask', 'status', '--project', 'prj_1'], 'claude-code')
      const posted = stub.requests.filter((r) => r.url === '/api/agent/command-run')
      expect(posted).toHaveLength(1)
      expect(posted[0]?.method).toBe('POST')
      expect(posted[0]?.body).toEqual({ command: 'ask', exitCode: 0, agent: 'claude-code' })

      await run(['--json', '--server', stub.url, '--token', 't', 'ask', 'status', '--project', 'prj_1'])
      expect(stub.requests.filter((r) => r.url === '/api/agent/command-run')[1]?.body).toEqual({
        command: 'ask',
        exitCode: 0,
        agent: null,
      })
    } finally {
      await stub.close()
    }
  })

  it('CLI-ASK-12: 埋点端点 404 不阻断主流程——命令仍退 0、stdout 仍单对象，sent=false', async () => {
    // commandRun 不给 ⇒ stub 回 404（服务端该端点尚未落地时的真实形状）
    const stub = await startStubServer({ projects: PROJECTS, context: contextFixture() })
    try {
      const res = await run([
        '--json', '--server', stub.url, '--token', 't', 'ask', 'status', '--project', 'prj_1',
      ])
      const env = JSON.parse(res.stdout) as { summary: { ok: boolean; commandRun: { sent: boolean; reason: string } } }
      expect(res.status).toBe(0)
      expect(env.summary.ok).toBe(true)
      expect(env.summary.commandRun).toEqual({ sent: false, reason: 'error', detail: expect.any(String) })
    } finally {
      await stub.close()
    }
  })

  it('CLI-ASK-13: drift 档（2）在本命令**不可达**，且不是漏测——七个词都到不了 2', async () => {
    // 漂移态住在 context 的 pack 段，而 ask 的七个别名里没有哪个取 pack 段（见 ASK_FIELDS）：
    // 七个词只查阶段/检查项/任务/日志/资产计数，语义上不承载「项目树与 lock 不一致」。
    // 造漂移（pack.drifted=true）后重跑全部七词，仍全部退 0 —— 这条把「不可达」钉成事实。
    const ctx = contextFixture()
    ctx.pack = { id: 'pk_1', name: '标准包', version: '1.0.0', drifted: true, outdated: false }
    const stub = await startStubServer({ projects: PROJECTS, context: ctx, commandRun: { ok: true } })
    try {
      for (const keyword of ASK_KEYWORDS) {
        const res = await run([
          '--json', '--server', stub.url, '--token', 't', 'ask', keyword, '--project', 'prj_1',
        ])
        expect(res.status, keyword).toBe(0)
      }
    } finally {
      await stub.close()
    }
  }, 90_000)
})
