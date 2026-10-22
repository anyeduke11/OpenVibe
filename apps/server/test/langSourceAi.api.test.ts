// `apps/server/test/langSourceAi.api.test.ts` —— M9 v1.6 **P5 的四个端点**
// （`m9-dev-plan-2026-10.md` §6.11 · `m9-dev-language-roadmap.md` §3.8 / §5.5 / §7）
//
// ## 它断什么
//
// | 判据 | 一句话 | 本文件里对应的那支 |
// |---|---|---|
// | **DL-08** | AI 不可用时**确定性层照常**（T2 区不渲染） | 「能力」组 |
// | **DL-18** | 未勾选的片段**不得出网**、且**不含绝对路径** | 「解读」组（**捕获入参**） |
// | **DL-16** | 源码片段**不得进台账** | 「台账」组 |
//
// ## ⚠️ 有一条用例**真起一个子进程**（命令适配器的端到端）
//
// runner 的契约是「stdin 收 JSON、stdout 出 JSON」⇒ 那就得**真跑一次**，
// 否则「契约」只是一句注释。⇒ 这里用 `/bin/sh` 脚本当假 runner：
// 它把 stdin 抄进一个文件（证明**入参真的送到了**），再吐一份合法 JSON。
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { newDb, type TestDbHandle } from '@openvibe/core/test-support'
import {
  CommandInterpretRunner,
  memoryKeychainStore,
  type KeychainStore,
  type SourceInterpretRunner,
} from '@openvibe/core'
import type { SourceInterpretRequest, SourceInterpretResult } from '@openvibe/shared'
import { SOURCE_INTERPRET_SCHEMA_VERSION } from '@openvibe/shared'
import { buildApp } from '../src/app'

const TOKEN = 'test-token'

interface Harness {
  app: FastifyInstance
  handle: TestDbHandle
}

const openHandles: Harness[] = []
const dirs: string[] = []

afterEach(() => {
  while (openHandles.length > 0) {
    const h = openHandles.pop()
    void h?.app.close()
    h?.handle.close()
  }
  while (dirs.length > 0) {
    const d = dirs.pop()
    if (d !== undefined) rmSync(d, { recursive: true, force: true })
  }
})

/**
 * ⚠️ **钥匙串一律注入内存实现** —— 测试**绝不能**动用户真实的系统钥匙串。
 */
async function makeHarness(
  runner: SourceInterpretRunner | null | undefined,
  keychain: KeychainStore = memoryKeychainStore(),
): Promise<Harness> {
  const handle = newDb()
  const { app } = await buildApp({ db: handle.db, token: TOKEN, interpretRunner: runner, keychain })
  const harness = { app, handle }
  openHandles.push(harness)
  return harness
}

function get(h: Harness, url: string) {
  return h.app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${TOKEN}` } })
}

function post(h: Harness, url: string, payload: unknown) {
  return h.app.inject({
    method: 'POST',
    url,
    headers: { authorization: `Bearer ${TOKEN}` },
    payload: payload as never,
  })
}

function put(h: Harness, url: string, payload: unknown) {
  return h.app.inject({
    method: 'PUT',
    url,
    headers: { authorization: `Bearer ${TOKEN}` },
    payload: payload as never,
  })
}

/** 一个真实的项目目录（正文里**故意**放一条绝对路径）。 */
function makeProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ov-m9-ai-api-'))
  dirs.push(dir)
  writeFileSync(
    join(dir, 'app.py'),
    [
      'import logging',
      '',
      'LOG_PATH = "/Users/duke/projects/demo/app.log"',
      '',
      'def f():',
      '    logging.info("hi")',
      '',
    ].join('\n'),
  )
  return dir
}

/** 建库：一个项目 ＋ 一个知识点 ＋ 两条命中。 */
function seed(db: TestDbHandle['db'], localPath: string): number[] {
  db.prepare(
    `INSERT INTO projects (id, name, stages_snapshot, status, local_path, created_at, updated_at)
     VALUES ('p1', '测试项目', '[]', 'active', ?, '2026-10-21T00:00:00.000Z', '2026-10-21T00:00:00.000Z')`,
  ).run(localPath)
  db.prepare(
    `INSERT INTO lang_topics (lang, slug, title, summary, stage_id, kind)
     VALUES ('python', 'python-logging', 'Python 日志', '', 1, 'language')`,
  ).run()
  db.prepare(
    `INSERT INTO lang_topic_findings
       (scan_id, topic_id, project_id, file_rel_path, line, col, matched_pattern, confidence, scanner_mode)
     VALUES (1, (SELECT id FROM lang_topics WHERE slug = 'python-logging'), 'p1',
             'app.py', 1, 1, 'import logging', 'confirmed', 'parser')`,
  ).run()
  db.prepare(
    `INSERT INTO lang_topic_findings
       (scan_id, topic_id, project_id, file_rel_path, line, col, matched_pattern, confidence, scanner_mode)
     VALUES (1, (SELECT id FROM lang_topics WHERE slug = 'python-logging'), 'p1',
             'app.py', 6, 5, 'logging.info("hi")', 'confirmed', 'parser')`,
  ).run()
  const rows = db.prepare('SELECT id FROM lang_topic_findings ORDER BY id').all() as { id: number }[]
  return rows.map((r) => r.id)
}

/** 捕获入参的假 runner。 */
function capturingRunner(): SourceInterpretRunner & { captured: SourceInterpretRequest[] } {
  const captured: SourceInterpretRequest[] = []
  return {
    id: 'fake-runner',
    model: 'fake-model',
    provider: 'fake-provider',
    captured,
    async interpret(request: SourceInterpretRequest): Promise<SourceInterpretResult> {
      captured.push(request)
      return {
        schema_version: SOURCE_INTERPRET_SCHEMA_VERSION,
        items: [],
        model: 'fake-model',
        provider: 'fake-provider',
      }
    },
  }
}

describe('M9 P5 · GET /api/lang/interpret/capability', () => {
  it('⚠️ **没有 runner** ⇒ available=false（界面据此不渲染 T2 区 · DL-08）', async () => {
    const h = await makeHarness(null)
    const res = await get(h, '/api/lang/interpret/capability')
    expect(res.statusCode).toBe(200)
    // ⚠️ **三档 ＋ 人话原因**（owner 2026-10-22 裁决一：设置页要告诉用户「为什么不可用」）
    expect(res.json()).toEqual({
      available: false,
      runner_id: null,
      status: 'unconfigured',
      detail: 'AI 解读不可用',
    })
  })

  it('有 runner ⇒ available=true ＋ runner_id', async () => {
    const h = await makeHarness(capturingRunner())
    const res = await get(h, '/api/lang/interpret/capability')
    expect(res.json()).toEqual({
      available: true,
      runner_id: 'fake-runner',
      status: 'ready',
      detail: 'AI 解读可用',
    })
  })
})

describe('M9 · provider 配置端点（owner 2026-10-22 裁决一：手动调控 ＋ 增强 2：多份并存）', () => {
  const BASE = {
    id: 'p1',
    name: '默认那份',
    projects: [],
    enabled: true,
    kind: 'command',
    cmd: '/bin/echo',
    args: [],
    endpoint: '',
    model: 'm1',
    provider: 'local',
    timeout_ms: 30000,
  }
  /**
   * 一份配置的集合（**默认那一份 = `p1`**）。
   *
   * ⚠️ 端点是**复数** `/api/lang/interpret/providers`（单数那个已删）⇒ 出参/入参都是**集合**。
   */
  const coll = (over: Record<string, unknown> = {}, defaultId = 'p1') => ({
    providers: [{ ...BASE, ...over }],
    default_provider_id: defaultId,
  })

  it('读配置 ⇒ 回到**集合视图**（没配过 ⇒ 空集合）', async () => {
    const h = await makeHarness(undefined)
    const res = await get(h, '/api/lang/interpret/providers')
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ providers: [], default_provider_id: '' })
  })

  it('写进去读得出来', async () => {
    const h = await makeHarness(undefined)
    const saved = await put(h, '/api/lang/interpret/providers', coll())
    expect(saved.statusCode).toBe(200)
    const res = await get(h, '/api/lang/interpret/providers')
    const body = res.json() as {
      providers: { enabled: boolean; kind: string; cmd: string; model: string }[]
      default_provider_id: string
    }
    expect(body.default_provider_id).toBe('p1')
    expect(body.providers).toHaveLength(1)
    expect(body.providers[0]).toMatchObject({
      enabled: true,
      kind: 'command',
      cmd: '/bin/echo',
      model: 'm1',
    })
  })

  it('⚠️ **key 缺省 = 保持原值**（读端回显不了全文 ⇒ 缺省不能当成清空）', async () => {
    const h = await makeHarness(undefined)
    await put(h, '/api/lang/interpret/providers', coll({ kind: 'openai_http', api_key: 'sk-keep-me-1234' }))
    // ⚠️ 再写一次，**不带** api_key
    await put(h, '/api/lang/interpret/providers', coll({ kind: 'openai_http', model: 'm2' }))
    const res = await get(h, '/api/lang/interpret/providers')
    const body = res.json() as {
      providers: { has_api_key: boolean; api_key_hint: string; model: string }[]
    }
    expect(body.providers[0]?.model).toBe('m2')
    expect(body.providers[0]?.has_api_key).toBe(true)
    expect(body.providers[0]?.api_key_hint).toBe('1234')
  })

  it('⚠️ **key 显式传空串 ⇒ 清除**', async () => {
    const h = await makeHarness(undefined)
    await put(h, '/api/lang/interpret/providers', coll({ kind: 'openai_http', api_key: 'sk-gone-5678' }))
    await put(h, '/api/lang/interpret/providers', coll({ kind: 'openai_http', api_key: '' }))
    const res = await get(h, '/api/lang/interpret/providers')
    const body = res.json() as { providers: { has_api_key: boolean }[] }
    expect(body.providers[0]?.has_api_key).toBe(false)
  })

  it('⚠️ **key 全文绝不出现在读端出参里**', async () => {
    const h = await makeHarness(undefined)
    await put(h, '/api/lang/interpret/providers', coll({ kind: 'openai_http', api_key: 'sk-SUPER-SECRET-9999' }))
    const res = await get(h, '/api/lang/interpret/providers')
    expect(res.body).not.toContain('SUPER-SECRET')
  })

  it('端点不是合法 URL ⇒ **422**（不等到真跑一次才暴露）', async () => {
    const h = await makeHarness(undefined)
    const res = await put(h, '/api/lang/interpret/providers', coll({ kind: 'openai_http', endpoint: '不是 URL' }))
    expect(res.statusCode).toBe(422)
  })

  it('⚠️ **配了能用的命令 ⇒ 能力三档是 ready**（且 available 与 status 自洽）', async () => {
    const h = await makeHarness(undefined)
    await put(h, '/api/lang/interpret/providers', coll())
    const res = await get(h, '/api/lang/interpret/capability')
    const body = res.json() as { available: boolean; status: string; detail: string }
    expect(body.status).toBe('ready')
    expect(body.available).toBe(true)
    expect(body.detail).not.toBe('')
  })

  it('⚠️ **命令找不到 ⇒ misconfigured**（不是「不可用」那种笼统说法）', async () => {
    const h = await makeHarness(undefined)
    await put(h, '/api/lang/interpret/providers', coll({ cmd: 'definitely-not-a-real-cmd-xyz' }))
    const res = await get(h, '/api/lang/interpret/capability')
    const body = res.json() as { available: boolean; status: string; detail: string }
    expect(body.status).toBe('misconfigured')
    expect(body.available).toBe(false)
    expect(body.detail).toContain('找不到命令')
  })

  it('⚠️ **关了开关 ⇒ unconfigured**（不是 misconfigured：没配 ≠ 配坏了）', async () => {
    const h = await makeHarness(undefined)
    await put(h, '/api/lang/interpret/providers', coll({ enabled: false }))
    const res = await get(h, '/api/lang/interpret/capability')
    const body = res.json() as { available: boolean; status: string; detail: string }
    expect(body.status).toBe('unconfigured')
    expect(body.available).toBe(false)
  })

  it('⚠️ **一份都不留 ⇒ 422**（至少要留一份 ⇒ 不许出现「什么也没配」这种状态）', async () => {
    const h = await makeHarness(undefined)
    const res = await put(h, '/api/lang/interpret/providers', { providers: [], default_provider_id: '' })
    expect(res.statusCode).toBe(422)
  })

  it('⚠️ **id 重复 ⇒ 422**（id 是「哪一份」的锚 ⇒ 重复就没法选）', async () => {
    const h = await makeHarness(undefined)
    const res = await put(h, '/api/lang/interpret/providers', {
      providers: [BASE, { ...BASE, name: '另一份' }],
      default_provider_id: 'p1',
    })
    expect(res.statusCode).toBe(422)
  })

  it('⚠️ **增强 2 · 多份并存**：各存一份 ⇒ 读回来是两份（互不覆盖）', async () => {
    const h = await makeHarness(undefined)
    const saved = await put(h, '/api/lang/interpret/providers', {
      providers: [
        { ...BASE, id: 'p1', name: '命令那份', kind: 'command', cmd: '/bin/echo' },
        { ...BASE, id: 'p2', name: '接口那份', kind: 'openai_http', cmd: '', endpoint: 'http://127.0.0.1:11434/v1/chat/completions' },
      ],
      default_provider_id: 'p2',
    })
    expect(saved.statusCode).toBe(200)
    const res = await get(h, '/api/lang/interpret/providers')
    const body = res.json() as {
      providers: { id: string; name: string; kind: string; cmd: string; endpoint: string }[]
      default_provider_id: string
    }
    expect(body.providers).toHaveLength(2)
    expect(body.providers[0]?.cmd).toBe('/bin/echo')
    expect(body.providers[1]?.endpoint).toBe('http://127.0.0.1:11434/v1/chat/completions')
    expect(body.default_provider_id).toBe('p2')
  })

  it('⚠️ **增强 2 · 按项目选**：探测带 `project_id` ⇒ 用绑定了那个项目的那一份', async () => {
    const h = await makeHarness(undefined)
    await put(h, '/api/lang/interpret/providers', {
      providers: [
        { ...BASE, id: 'p1', name: '默认那份', cmd: 'definitely-not-a-real-cmd-xyz' },
        { ...BASE, id: 'p2', name: '绑 pX 的那份', cmd: '/bin/echo', projects: ['pX'] },
      ],
      default_provider_id: 'p1',
    })
    // ⚠️ **默认那份是坏的**；按项目选到 p2 ⇒ 那是好的
    const res = await get(h, '/api/lang/interpret/capability?project_id=pX')
    const body = res.json() as { status: string; detail: string }
    expect(body.status).toBe('ready')
    expect(body.detail).toContain('命令适配器')
  })

  it('⚠️ **增强 2 · 显式指定那一份**：探测带 `provider_id` ⇒ 锁定那一份', async () => {
    const h = await makeHarness(undefined)
    await put(h, '/api/lang/interpret/providers', {
      providers: [
        { ...BASE, id: 'p1', name: '默认那份', cmd: '/bin/echo' },
        { ...BASE, id: 'p2', name: '另一份', cmd: 'definitely-not-a-real-cmd-xyz' },
      ],
      default_provider_id: 'p1',
    })
    const res = await get(h, '/api/lang/interpret/capability?provider_id=p2')
    const body = res.json() as { status: string; detail: string }
    expect(body.status).toBe('misconfigured')
    expect(body.detail).toContain('找不到命令')
  })

  it('⚠️ **增强 2 · 显式指定不存在的那一份** ⇒ 说清「找不到这份配置」（不是「没配」）', async () => {
    const h = await makeHarness(undefined)
    await put(h, '/api/lang/interpret/providers', coll())
    const res = await get(h, '/api/lang/interpret/capability?provider_id=p-nope')
    const body = res.json() as { status: string; detail: string }
    expect(body.status).toBe('misconfigured')
    expect(body.detail).toContain('找不到这份 provider 配置')
  })

  it('⚠️ **增强 2 · 老配置（单条）读回来也是集合**（**老配置不许丢**）', async () => {
    const h = await makeHarness(undefined)
    // ⚠️ **手工写一份「旧版形状」**（单条对象）
    h.handle.db
      .prepare("INSERT INTO app_meta (key, value) VALUES ('langInterpretProvider', ?)")
      .run(
        JSON.stringify({
          enabled: true,
          kind: 'command',
          cmd: '/bin/echo',
          args: [],
          endpoint: '',
          model: 'm1',
          provider: 'local',
          api_key: '',
          api_key_storage: 'none',
          timeout_ms: 30000,
        }),
      )
    const res = await get(h, '/api/lang/interpret/providers')
    const body = res.json() as { providers: { id: string; cmd: string }[]; default_provider_id: string }
    expect(body.providers).toHaveLength(1)
    expect(body.providers[0]?.cmd).toBe('/bin/echo')
    expect(body.providers[0]?.id).toBe('default')
    expect(body.default_provider_id).toBe('default')
  })
})

describe('M9 P5 · GET /api/lang/snippets（本地读确切内容）', () => {
  it('一次读完所有命中的片段（勾选前要看到全文）', async () => {
    const h = await makeHarness(null)
    const dir = makeProject()
    seed(h.handle.db, dir)

    const res = await get(h, '/api/lang/snippets?project=p1')

    expect(res.statusCode).toBe(200)
    const body = res.json() as { snippets: { finding_id: number; lines: string[] | null }[] }
    expect(body.snippets).toHaveLength(2)
    expect(body.snippets[0]?.lines).not.toBeNull()
    // ⚠️ 片段正文里**有**本机绝对路径（本地展示，不出网）
    expect(body.snippets.some((s) => (s.lines ?? []).join('\n').includes('/Users/duke'))).toBe(true)
  })

  it('缺 project ⇒ 422', async () => {
    const h = await makeHarness(null)
    expect((await get(h, '/api/lang/snippets')).statusCode).toBe(422)
  })

  it('单条 snippet：命中不存在 ⇒ 404；读不到 ⇒ 404', async () => {
    const h = await makeHarness(null)
    const dir = makeProject()
    seed(h.handle.db, dir)
    expect((await get(h, '/api/lang/snippet?project=p1&finding_id=999')).statusCode).toBe(404)

    // ⚠️ 把文件删掉 ⇒ 读不到 ⇒ **如实说读不到**（不编内容）
    rmSync(join(dir, 'app.py'), { force: true })
    const res = await get(h, '/api/lang/snippet?project=p1&finding_id=1')
    expect(res.statusCode).toBe(404)
  })
})

describe('M9 P5 · POST /api/lang/interpret（DL-18 / DL-16）', () => {
  it('① 捕获入参：**只含勾选过的片段**，且**不含本机绝对路径**', async () => {
    const runner = capturingRunner()
    const h = await makeHarness(runner)
    const dir = makeProject()
    const ids = seed(h.handle.db, dir)

    const res = await post(h, '/api/lang/interpret', { project_id: 'p1', finding_ids: [ids[0]] })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ status: 'ok', fragment_count: 1 })
    expect(runner.captured).toHaveLength(1)
    const sent = runner.captured[0] as SourceInterpretRequest
    expect(sent.fragments).toHaveLength(1)
    expect(sent.fragments[0]?.path).toBe('app.py')
    expect(sent.fragments[0]?.content).not.toContain('/Users/duke')
    // ⚠️ 项目内的绝对路径变成了**相对路径**（不丢信息）
    expect(sent.fragments[0]?.content).toContain('<外部路径>')
  })

  it('② **没有 runner** ⇒ status=unavailable，且**没有出网就没有台账**', async () => {
    const h = await makeHarness(null)
    const dir = makeProject()
    const ids = seed(h.handle.db, dir)

    const res = await post(h, '/api/lang/interpret', { project_id: 'p1', finding_ids: ids })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ status: 'unavailable', fragment_count: 0 })
    const rows = h.handle.db
      .prepare("SELECT id FROM local_events WHERE kind = 'ai_recommend_call'")
      .all()
    expect(rows).toHaveLength(0)
  })

  it('③ ⚠️ 台账只存**指纹与计数**，**没有正文**（DL-16）', async () => {
    const h = await makeHarness(capturingRunner())
    const dir = makeProject()
    const ids = seed(h.handle.db, dir)

    await post(h, '/api/lang/interpret', { project_id: 'p1', finding_ids: ids })

    const row = h.handle.db
      .prepare("SELECT payload_json FROM local_events WHERE kind = 'ai_recommend_call'")
      .get() as { payload_json: string }
    const payload = JSON.parse(row.payload_json) as Record<string, unknown>
    expect(Object.keys(payload).sort()).toEqual([
      'aiModel',
      'aiProvider',
      'candidateCount',
      'droppedCount',
      'durationMs',
      'failureReason',
      'inputHash',
      'passedCount',
      'result',
    ])
    expect(row.payload_json).not.toContain('import logging')
    expect(row.payload_json).not.toContain('/Users/')
  })

  it('④ 缺 project_id ⇒ 422；finding_ids 为空 ⇒ 200 且什么都没发', async () => {
    const h = await makeHarness(capturingRunner())
    const dir = makeProject()
    seed(h.handle.db, dir)
    expect((await post(h, '/api/lang/interpret', {})).statusCode).toBe(422)

    const res = await post(h, '/api/lang/interpret', { project_id: 'p1', finding_ids: [] })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ status: 'ok', fragment_count: 0 })
  })
})

describe('M9 P5 · 命令适配器（stdin 收 JSON、stdout 出 JSON）', () => {
  it('⚠️ **真起一个子进程**：入参真的送到了，输出真的被解析', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ov-m9-runner-'))
    dirs.push(dir)
    const captured = join(dir, 'captured.json')
    const script = join(dir, 'fake-runner.sh')
    writeFileSync(
      script,
      [
        '#!/bin/sh',
        `cat > ${JSON.stringify(captured)}`,
        `printf '%s' '{"schema_version":1,"items":[{"topic_slug":"python-logging","summary":"在导入日志模块","risks":[],"claim_state":null}],"model":"m","provider":"p"}'`,
        '',
      ].join('\n'),
    )
    chmodSync(script, 0o755)

    const runner = new CommandInterpretRunner({ cmd: script, model: 'm', provider: 'p' })
    const result = await runner.interpret({
      schema_version: SOURCE_INTERPRET_SCHEMA_VERSION,
      fragments: [
        {
          finding_id: 1,
          path: 'app.py',
          content: 'import logging',
          line: 1,
          topic_slug: 'python-logging',
          topic_title: 'Python 日志',
        },
      ],
      topics: [{ slug: 'python-logging', title: 'Python 日志' }],
    })

    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.summary).toBe('在导入日志模块')
    // ⚠️ **子进程真的收到了入参**（这是契约的另一半）
    const received = JSON.parse(readFileSync(captured, 'utf8')) as { fragments: unknown[] }
    expect(received.fragments).toHaveLength(1)
  })

  it('输出不合契约 ⇒ 归一成失败（不当成成功）', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ov-m9-runner-bad-'))
    dirs.push(dir)
    const script = join(dir, 'bad-runner.sh')
    // ⚠️ **版本号是对的** ⇒ 这一支断的才是「字段不合契约」（版本不对有单独一支）
    writeFileSync(
      script,
      `#!/bin/sh\nprintf '%s' '{"schema_version":1,"items":"不是数组"}'\n`,
    )
    chmodSync(script, 0o755)

    const runner = new CommandInterpretRunner({ cmd: script, model: 'm', provider: 'p' })
    await expect(
      runner.interpret({
        schema_version: SOURCE_INTERPRET_SCHEMA_VERSION,
        fragments: [],
        topics: [],
      }),
    ).rejects.toThrow(/不合契约/u)
  })

  it('⚠️ **版本号对不上** ⇒ 归一成「版本不匹配」（不是笼统的「不合契约」）', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ov-m9-runner-ver-'))
    dirs.push(dir)
    const script = join(dir, 'old-runner.sh')
    writeFileSync(
      script,
      `#!/bin/sh\nprintf '%s' '{"schema_version":0,"items":[],"model":"m","provider":"p"}'\n`,
    )
    chmodSync(script, 0o755)

    const runner = new CommandInterpretRunner({ cmd: script, model: 'm', provider: 'p' })
    let reason: string | undefined
    try {
      await runner.interpret({
        schema_version: SOURCE_INTERPRET_SCHEMA_VERSION,
        fragments: [],
        topics: [],
      })
    } catch (e) {
      reason = (e as { reason?: string }).reason
    }
    expect(reason).toBe('runner-version-mismatch')
  })

  it('命令不存在 ⇒ 归一成「找不到」（不是崩掉）', async () => {
    const runner = new CommandInterpretRunner({
      cmd: '/nonexistent/m9-runner',
      model: 'm',
      provider: 'p',
    })
    await expect(
      runner.interpret({
        schema_version: SOURCE_INTERPRET_SCHEMA_VERSION,
        fragments: [],
        topics: [],
      }),
    ).rejects.toThrow(/找不到解读命令/u)
  })
})

describe('M9 增强 1 · GET /api/lang/source/share-summary（出网计数可读）', () => {
  it('① 出网之后 ⇒ 汇总里有这个项目与次数', async () => {
    const h = await makeHarness(capturingRunner())
    const dir = makeProject()
    const ids = seed(h.handle.db, dir)
    await post(h, '/api/lang/interpret', { project_id: 'p1', finding_ids: ids })

    const res = await get(h, '/api/lang/source/share-summary')
    expect(res.statusCode).toBe(200)
    const body = res.json() as {
      summaries: { project_id: string; share_count: number; snippet_total: number }[]
    }
    expect(body.summaries).toHaveLength(1)
    expect(body.summaries[0]?.project_id).toBe('p1')
    expect(body.summaries[0]?.share_count).toBe(1)
    expect(body.summaries[0]?.snippet_total).toBe(2)
  })

  it('② 没有出网 ⇒ 空数组（不是空对象）', async () => {
    const h = await makeHarness(null)
    const res = await get(h, '/api/lang/source/share-summary')
    expect(res.json()).toEqual({ summaries: [] })
  })
})

describe('M9 增强 4 · POST /api/lang/interpret/export（解读结果导出）', () => {
  it('① 导出的是 markdown，**产物里没有绝对路径**（脱敏在服务端做）', async () => {
    const h = await makeHarness(null)
    const dir = makeProject()
    seed(h.handle.db, dir)

    const res = await post(h, '/api/lang/interpret/export', {
      summary: {
        status: 'ok',
        project_id: 'p1',
        fragment_count: 1,
        item_count: 1,
        risk_count: 1,
        divergence_count: 0,
        divergences: [],
        items: [
          {
            topic_slug: 'python-logging',
            summary: `这个文件在 ${dir}/app.py 里`,
            risks: [`日志写到了 ${dir}/app.log`],
            claim_state: null,
          },
        ],
        input_hash: 'abc123',
        provider: 'sensenova',
        usage: { prompt_tokens: 1200, completion_tokens: 340, total_tokens: 1540 },
        failure_reason: null,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(String(res.headers['content-type'])).toContain('text/markdown')
    // ⚠️ **文件名由服务端给**（前端不重复实现清洗规则）
    expect(res.headers['x-m9-filename']).toBe('m9-interpret-p1.md')
    expect(res.body).toContain('# 源码解读结果')
    expect(res.body).not.toContain(dir)
    // ⚠️ **增强 4 · 导出件里也要说清「谁答的、用了多少 token」**（复盘第一问题）
    expect(res.body).toContain('sensenova')
    expect(res.body).toContain('1540')
  })

  it('② 摘要不合法 ⇒ 422（不许拿半截数据糊弄出一份文件）', async () => {
    const h = await makeHarness(null)
    const res = await post(h, '/api/lang/interpret/export', { summary: { status: 'ok' } })
    expect(res.statusCode).toBe(422)
  })
})

// ---------------------------------------------------------------------------
// 批次 D · API key 走系统钥匙串（降级路径也要被断到）
// ---------------------------------------------------------------------------

describe('M9 · provider 配置 · key 存在哪（钥匙串 / 明文降级）', () => {
  const BASE = {
    id: 'p1',
    name: '默认那份',
    projects: [],
    enabled: true,
    kind: 'openai_http',
    cmd: '',
    args: [],
    endpoint: 'https://api.example.com/v1/chat/completions',
    model: 'm1',
    provider: 'cloud',
    timeout_ms: 30000,
  }
  const coll = (over: Record<string, unknown> = {}) => ({
    providers: [{ ...BASE, ...over }],
    default_provider_id: 'p1',
  })

  it('① ⚠️ 写 key ⇒ **进系统钥匙串**，配置里**不留全文**', async () => {
    const store = memoryKeychainStore()
    const h = await makeHarness(undefined, store)
    const saved = await put(h, '/api/lang/interpret/providers', coll({ api_key: 'sk-keychain-1234' }))
    expect(saved.statusCode).toBe(200)
    const body = saved.json() as {
      providers: { has_api_key: boolean; api_key_hint: string; api_key_storage: string }[]
    }
    expect(body.providers[0]?.has_api_key).toBe(true)
    expect(body.providers[0]?.api_key_hint).toBe('1234')
    expect(body.providers[0]?.api_key_storage).toBe('keychain')
    // ⚠️ **钥匙串里真的有了**
    expect(store.items.get('api-key:p1')).toBe('sk-keychain-1234')
    // ⚠️ **数据库里没有全文**
    const raw = h.handle.db
      .prepare("SELECT value FROM app_meta WHERE key = 'langInterpretProvider'")
      .get() as { value: string }
    expect(raw.value).not.toContain('sk-keychain-1234')
  })

  it('② ⚠️ **降级**：本机没有钥匙串 ⇒ 明文存 ＋ **如实标成 inline**', async () => {
    const store = memoryKeychainStore({ failWith: '本机不是 macOS ⇒ 没有系统钥匙串可用' })
    const h = await makeHarness(undefined, store)
    const saved = await put(h, '/api/lang/interpret/providers', coll({ api_key: 'sk-plain-0000' }))
    const body = saved.json() as {
      providers: { api_key_storage: string; api_key_storage_detail: string }[]
    }
    expect(body.providers[0]?.api_key_storage).toBe('inline')
    // ⚠️ **界面必须能看出「以明文存」**
    expect(body.providers[0]?.api_key_storage_detail).toContain('明文')
  })

  it('③ ⚠️ 清除 key ⇒ **钥匙串里那一项也删掉**（不是「删了但还在」）', async () => {
    const store = memoryKeychainStore()
    const h = await makeHarness(undefined, store)
    await put(h, '/api/lang/interpret/providers', coll({ api_key: 'sk-keychain-1234' }))
    expect(store.items.get('api-key:p1')).toBe('sk-keychain-1234')
    await put(h, '/api/lang/interpret/providers', coll({ api_key: '' }))
    expect(store.items.get('api-key:p1')).toBeUndefined()
  })

  it('④ ⚠️ **key 缺省 = 保持原值** ⇒ 钥匙串里那一把**不动**', async () => {
    const store = memoryKeychainStore()
    const h = await makeHarness(undefined, store)
    await put(h, '/api/lang/interpret/providers', coll({ api_key: 'sk-keychain-1234' }))
    await put(h, '/api/lang/interpret/providers', coll({ model: 'm2' }))
    expect(store.items.get('api-key:p1')).toBe('sk-keychain-1234')
    const res = await get(h, '/api/lang/interpret/providers')
    const body = res.json() as {
      providers: { has_api_key: boolean; api_key_hint: string; api_key_storage: string }[]
    }
    expect(body.providers[0]?.has_api_key).toBe(true)
    expect(body.providers[0]?.api_key_hint).toBe('1234')
    expect(body.providers[0]?.api_key_storage).toBe('keychain')
  })

  it('⑤ ⚠️ 读端**永远不回显全文**（钥匙串模式下也是）', async () => {
    const store = memoryKeychainStore()
    const h = await makeHarness(undefined, store)
    await put(h, '/api/lang/interpret/providers', coll({ api_key: 'sk-SUPER-SECRET-9999' }))
    const res = await get(h, '/api/lang/interpret/providers')
    expect(res.body).not.toContain('SUPER-SECRET')
    expect(res.body).toContain('9999')
  })

  it('⑥ ⚠️ 客户端**不许声明**存储位置（那是服务端算出来的事实）', async () => {
    const h = await makeHarness(undefined)
    const res = await put(h, '/api/lang/interpret/providers', coll({ api_key: 'sk-abc-1111', api_key_storage: 'keychain' }))
    // ⚠️ 多余字段被剥掉（zod 默认 strip）⇒ 不报错，但**也不采信**
    expect(res.statusCode).toBe(200)
    const body = res.json() as { providers: { api_key_storage: string }[] }
    expect(body.providers[0]?.api_key_storage).toBe('keychain')
    // ⚠️ 它确实进了钥匙串（因为服务端自己判断），但**不是**因为客户端这么说
    const raw = h.handle.db
      .prepare("SELECT value FROM app_meta WHERE key = 'langInterpretProvider'")
      .get() as { value: string }
    expect(raw.value).not.toContain('sk-abc-1111')
  })

  it('⑦ ⚠️ **增强 2 · 多份各有一把 key**（钥匙串项按 id 分账号，互不覆盖）', async () => {
    const store = memoryKeychainStore()
    const h = await makeHarness(undefined, store)
    const saved = await put(h, '/api/lang/interpret/providers', {
      providers: [
        { ...BASE, id: 'p1', api_key: 'sk-first-1111' },
        { ...BASE, id: 'p2', api_key: 'sk-second-2222' },
      ],
      default_provider_id: 'p1',
    })
    expect(saved.statusCode).toBe(200)
    expect(store.items.get('api-key:p1')).toBe('sk-first-1111')
    expect(store.items.get('api-key:p2')).toBe('sk-second-2222')
    const res = await get(h, '/api/lang/interpret/providers')
    const body = res.json() as { providers: { api_key_hint: string }[] }
    expect(body.providers[0]?.api_key_hint).toBe('1111')
    expect(body.providers[1]?.api_key_hint).toBe('2222')
  })
})
