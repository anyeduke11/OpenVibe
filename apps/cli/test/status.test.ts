import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ProjectContextOut, ProjectOut } from '@openvibe/shared'
import { ApiError, ServerUnreachable, type ApiClient } from '../src/client'
import {
  MAX_CANDIDATES,
  RECENT_LOGS,
  StatusError,
  candidateNames,
  matchProjectByPath,
  statusAction,
} from '../src/commands/status'
import { ExitCode } from '../src/output'
import { fakeClient } from './helpers/fake-client'
import { runCli } from './helpers/cli-run'
import { startStubServer } from './helpers/stub-server'

/**
 * M8 · `openvibe status`（m8-agent-bridge.md FR-4.1 第二行 / FR-4.1.2）。
 *
 * 断言重心三处：
 * 1. **目录 → 项目**：最长前缀优先（父子嵌套时取更深的），`/a/bb` 不得落到 `/a/b` 头上；
 * 2. **解析不出** ⇒ 既有 `NOT_FOUND` + 候选项目名，且候选数封顶 5（fixture 给 7 个项目）；
 * 3. **漂移语义**：`drifted === true` ⇒ 退出码 2；`drifted === null`（读不到 lock）⇒ **不算**漂移，
 *    仍是 0 且文案说「判不了」。把 null 当 false 是本仓明令禁止的假零（FR-3.2.1）。
 */

/** 服务端项目列表里的一个条目（形状照 ProjectOut，省略的字段与解析无关） */
const project = (id: string, name: string, localPath: string | null): ProjectOut => ({
  id,
  name,
  localPath,
  flowTemplateId: null,
  stagesSnapshot: [],
  currentStage: null,
  status: 'active',
  standardPackId: null,
  standardPackVersion: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-14T00:00:00.000Z',
})

const PROJECTS: { items: ProjectOut[]; total: number } = {
  items: [project('prj_parent', '工作区根', '/w'), project('prj_child', 'OpenVibe 灵典', '/w/openvibe')],
  total: 2,
}

function contextFixture(patch: Partial<ProjectContextOut> = {}): ProjectContextOut {
  return {
    project: {
      id: 'prj_child',
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
        { id: 'c2', label: '写测试', checked: false },
        { id: 'c3', label: '接服务端', checked: false },
      ],
    },
    tasks: {
      todo: 2,
      doing: 1,
      done: 4,
      items: [
        { id: 't1', title: '设计 token', status: 'todo', stageName: '实现' },
        { id: 't2', title: '写迁移', status: 'todo', stageName: '实现' },
        { id: 't3', title: 'CLI 接线', status: 'doing', stageName: '实现' },
        { id: 't4', title: '定字号', status: 'done', stageName: '实现' },
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
    assets: { prompts: 1, skills: 1, terms: 1, playbooks: 1 },
    truncated: [],
    fields: ['stage', 'checklist', 'tasks', 'logs', 'pack'],
    ...patch,
  }
}

describe('status 的目录 → 项目解析（FR-4.1.2）', () => {
  it('CLI-STATUS-01: 最长前缀优先——子目录命中更深的项目；同名前缀（/w/openvibe-2）不落到 /w/openvibe 头上', () => {
    const items = PROJECTS.items
    expect(matchProjectByPath(items, '/w/openvibe')?.id).toBe('prj_child')
    expect(matchProjectByPath(items, '/w/openvibe/src/commands')?.id).toBe('prj_child')
    expect(matchProjectByPath(items, '/w/openvibe/')?.id).toBe('prj_child')
    expect(matchProjectByPath(items, '/w')?.id).toBe('prj_parent')
    expect(matchProjectByPath(items, '/elsewhere')).toBeNull()
    expect(matchProjectByPath([project('p_none', '未绑路径', null)], '/w/openvibe')).toBeNull()

    // 前缀比较必须带分隔符：三个项目里，/w/openvibe-2 归它自己，不归 /w/openvibe，也不归 /w
    const siblings = [
      project('p_root', '根', '/w'),
      project('p_a', 'A', '/w/openvibe'),
      project('p_b', 'B', '/w/openvibe-2'),
    ]
    expect(matchProjectByPath(siblings, '/w/openvibe-2')?.id).toBe('p_b')
    expect(matchProjectByPath(siblings, '/w/openvibe-2/src')?.id).toBe('p_b')
    expect(matchProjectByPath(siblings, '/w/openvibe')?.id).toBe('p_a')
  })

  it('CLI-STATUS-02: 解析不出 ⇒ NOT_FOUND + 候选项目名（7 个项目只列 5 个），且零 context 请求', async () => {
    const seven = {
      items: [
        project('prj_1', '招商银行智能风控网关', '/w/boc'),
        project('prj_2', '中信证券数据中台', '/w/citic'),
        project('prj_3', '浦发银行安全运营', '/w/spdb'),
        project('prj_4', '平安集团日志留存', '/w/pingan'),
        project('prj_5', '兴业银行堡垒机', '/w/cib'),
        project('prj_6', '光大银行密码机', '/w/ceb'),
        project('prj_7', '民生银行抗量子', '/w/cmbc'),
      ],
      total: 7,
    }
    const fake = fakeClient({ get: { '/api/projects?status=all': seven } })

    const notAProject = join(tmpdir(), 'not-a-project') // 平台无关：win 上 /tmp 字面量会与回显路径形态不一致
    const err = await statusAction({ dir: notAProject }, { client: fake.client }).catch(
      (e: unknown) => e,
    )

    expect(err).toBeInstanceOf(StatusError)
    expect((err as StatusError).code).toBe('NOT_FOUND')
    const details = (err as StatusError).details as { candidates: string[]; path: string }
    expect(details.path).toBe(notAProject)
    expect(details.candidates).toHaveLength(MAX_CANDIDATES)
    // 码点序取前 5（默认 sort 即 UTF-16 码点序，与 shared 的 compareCodeUnit 同口径）：
    // 断言「哪两个被舍掉」，比硬编码一份手写顺序更能说明封顶这件事
    const sorted = [...seven.items.map((p) => p.name)].sort()
    expect(details.candidates).toEqual(sorted.slice(0, MAX_CANDIDATES))
    const dropped = sorted.slice(MAX_CANDIDATES)
    expect(dropped).toHaveLength(2)
    expect((err as Error).message).toContain(sorted[0] as string)
    for (const name of dropped) expect((err as Error).message).not.toContain(name)
    expect(candidateNames(seven.items, 2)).toHaveLength(2)
    expect(fake.paths()).toEqual(['GET /api/projects?status=all'])
  })
})

describe('status 的快照', () => {
  it('CLI-STATUS-03: 阶段/完成度/未完检查项/任务分布/最近日志/包态齐全；CLI 自己的裁剪也留痕', async () => {
    const fake = fakeClient({
      get: {
        '/api/projects?status=all': PROJECTS,
        '/api/projects/prj_child/context?fields=stage,checklist,tasks,logs,pack': contextFixture(),
      },
    })

    const outcome = await statusAction({ dir: '/w/openvibe' }, { client: fake.client })
    const s = outcome.snapshot

    expect(s.project).toEqual({ id: 'prj_child', name: 'OpenVibe 灵典', status: 'active', localPath: '/w/openvibe' })
    expect(s.stage).toEqual({ current: '实现', total: 5, completed: 2 })
    expect(s.checklist.total).toBe(3)
    expect(s.checklist.checked).toBe(1)
    expect(s.checklist.pending).toEqual([
      { id: 'c2', label: '写测试' },
      { id: 'c3', label: '接服务端' },
    ])
    expect(s.tasks).toEqual({ todo: 2, doing: 1, done: 4 })
    // 8 条日志只展示 5 条 ⇒ 数量明写 + 裁剪进 truncated（不许静默少给）
    expect(s.logs.total).toBe(8)
    expect(s.logs.shown).toBe(RECENT_LOGS)
    expect(s.logs.recent[0]?.entryNo).toBe(8)
    const note = s.truncated.find((t) => t.section === 'logs')
    expect(note).toMatchObject({ dropped: 3, reason: 'budget' })
    expect(outcome.warnings.join('\n')).toContain('openvibe ask logs')
  })

  it('CLI-STATUS-04: 漂移 ⇒ 退出码 2 且提示去 diff；读不到 lock（null）⇒ 不算漂移，仍退 0', async () => {
    const drifted = fakeClient({
      get: {
        '/api/projects?status=all': PROJECTS,
        '/api/projects/prj_child/context?fields=stage,checklist,tasks,logs,pack': contextFixture({
          pack: { id: 'pk_1', name: '标准包', version: '1.0.0', drifted: true, outdated: false },
        }),
      },
    })
    const dirArg = process.platform === 'win32' ? 'W:\\openvibe' : '/w/openvibe' // 平台形态自洽：hint 回显用户给的路径
    const d = await statusAction({ dir: dirArg }, { client: drifted.client })
    expect(d.exitCode).toBe(ExitCode.drift)
    expect(d.snapshot.pack.drifted).toBe(true)
    expect(d.hints.join('\n')).toContain(`openvibe diff ${dirArg}`)

    const unknown = fakeClient({
      get: {
        '/api/projects?status=all': PROJECTS,
        '/api/projects/prj_child/context?fields=stage,checklist,tasks,logs,pack': contextFixture({
          pack: { id: null, name: null, version: null, drifted: null, outdated: null },
          truncated: [
            { section: 'pack', dropped: 4, reason: 'no_lock_file', detail: '读不到 .openvibe/pack.lock.json' },
          ],
        }),
      },
    })
    const u = await statusAction({ dir: '/w/openvibe' }, { client: unknown.client })
    expect(u.exitCode).toBe(ExitCode.ok)
    expect(u.snapshot.truncated.map((t) => t.reason)).toContain('no_lock_file')
    expect(u.warnings.join('\n')).toContain('读不到 .openvibe/pack.lock.json')
  })

  it('CLI-STATUS-05: 无客户端 / 服务端不可达 ⇒ 自由 code + 可执行提示', async () => {
    const offline = await statusAction({}, {}).catch((e: unknown) => e)
    expect((offline as StatusError).code).toBe('SERVER_REQUIRED')
    expect((offline as Error).message).toContain('openvibe serve')

    const down: ApiClient = {
      serverUrl: 'http://127.0.0.1:1',
      getJson: () => Promise.reject(new ServerUnreachable('http://127.0.0.1:1', 'connect ECONNREFUSED')),
      postJson: () => Promise.reject(new Error('unused')),
    }
    const err = await statusAction({}, { client: down }).catch((e: unknown) => e)
    expect((err as StatusError).code).toBe('SERVER_UNREACHABLE')
    expect((err as Error).message).toContain('ECONNREFUSED')

    const missing = fakeClient({
      get: {
        '/api/projects?status=all': PROJECTS,
        '/api/projects/prj_child/context?fields=stage,checklist,tasks,logs,pack': new ApiError(
          404,
          'NOT_FOUND',
          '项目不存在: prj_child',
        ),
      },
    })
    const m = await statusAction({ dir: '/w/openvibe' }, { client: missing.client }).catch(
      (e: unknown) => e,
    )
    expect((m as { code?: string }).code).toBe('NOT_FOUND')
  })
})

describe('--json 契约与三值退出码（m8 §7-p，真子进程）', () => {
  const stubFor = async (ctx: ProjectContextOut) =>
    startStubServer({ projects: PROJECTS, context: ctx, commandRun: { ok: true } })

  it('CLI-STATUS-06: 三值表驱动——干净退 0/漂移退 2/解析不出退 1，summary.ok 逐档与退出码一致', async () => {
    const clean = await stubFor(contextFixture())
    const drifted = await stubFor(
      contextFixture({ pack: { id: 'pk_1', name: '标准包', version: '1.0.0', drifted: true, outdated: false } }),
    )
    try {
      const cases: {
        dir: string
        port: string
        exit: number
        ok: boolean
        why: string
      }[] = [
        { dir: '/w/openvibe', port: clean.url, exit: ExitCode.ok, ok: true, why: '无漂移' },
        { dir: '/w/openvibe', port: drifted.url, exit: ExitCode.drift, ok: false, why: 'pack 已漂移' },
        { dir: '/tmp/nope', port: clean.url, exit: ExitCode.error, ok: false, why: '目录未绑定项目' },
      ]
      for (const c of cases) {
        const res = await runCli(['--json', '--server', c.port, '--token', 't', 'status', c.dir])
        const env = JSON.parse(res.stdout) as {
          command: string
          summary: { ok: boolean; exitCode?: number; error?: { code: string } }
        }
        expect(res.status, c.why).toBe(c.exit)
        expect(env.command).toBe('status')
        expect(env.summary.ok, `${c.why}：summary.ok 必须与退出码 ${String(c.exit)} 一致`).toBe(c.ok)
        if (c.exit === ExitCode.error) expect(env.summary.error?.code).toBe('NOT_FOUND')
        else expect(env.summary.exitCode).toBe(c.exit)
        expect(res.stderr).not.toContain('"command"')
      }
    } finally {
      await clean.close()
      await drifted.close()
    }
  })

  it('CLI-STATUS-07: 埋点随退出码上报（0 与 2 都要发），且埋点端点 404 不阻断漂移档', async () => {
    const stub = await stubFor(
      contextFixture({ pack: { id: 'pk_1', name: '标准包', version: '1.0.0', drifted: true, outdated: false } }),
    )
    try {
      await runCli(['--json', '--server', stub.url, '--token', 't', 'status', '/w/openvibe'], {
        env: { OPENVIBE_AGENT: 'codex' },
      })
      expect(stub.requests.filter((r) => r.url === '/api/agent/command-run')[0]?.body).toEqual({
        command: 'status',
        exitCode: 2,
        agent: 'codex',
      })
      await stub.close()

      const noTelemetry = await startStubServer({
        projects: PROJECTS,
        context: contextFixture({ pack: { id: 'pk_1', name: '标准包', version: '1.0.0', drifted: true, outdated: false } }),
      })
      const res = await runCli(['--json', '--server', noTelemetry.url, '--token', 't', 'status', '/w/openvibe'])
      const env = JSON.parse(res.stdout) as {
        summary: { ok: boolean; exitCode: number; commandRun: { sent: boolean } }
      }
      expect(res.status).toBe(2)
      expect(env.summary.ok).toBe(false)
      expect(env.summary.exitCode).toBe(2)
      expect(env.summary.commandRun.sent).toBe(false)
      await noTelemetry.close()
    } finally {
      // stub 已在腿内关过；重复 close 会抛，忽略
    }
  })
})
