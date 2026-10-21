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
  type SourceInterpretRunner,
} from '@openvibe/core'
import type { SourceInterpretRequest, SourceInterpretResult } from '@openvibe/shared'
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

async function makeHarness(runner: SourceInterpretRunner | null | undefined): Promise<Harness> {
  const handle = newDb()
  const { app } = await buildApp({ db: handle.db, token: TOKEN, interpretRunner: runner })
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
       (scan_id, topic_id, file_rel_path, line, col, matched_pattern, confidence, scanner_mode)
     VALUES (1, (SELECT id FROM lang_topics WHERE slug = 'python-logging'),
             'app.py', 1, 1, 'import logging', 'confirmed', 'parser')`,
  ).run()
  db.prepare(
    `INSERT INTO lang_topic_findings
       (scan_id, topic_id, file_rel_path, line, col, matched_pattern, confidence, scanner_mode)
     VALUES (1, (SELECT id FROM lang_topics WHERE slug = 'python-logging'),
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
      return { items: [], model: 'fake-model', provider: 'fake-provider' }
    },
  }
}

describe('M9 P5 · GET /api/lang/interpret/capability', () => {
  it('⚠️ **没有 runner** ⇒ available=false（界面据此不渲染 T2 区 · DL-08）', async () => {
    const h = await makeHarness(null)
    const res = await get(h, '/api/lang/interpret/capability')
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ available: false, runner_id: null })
  })

  it('有 runner ⇒ available=true ＋ runner_id', async () => {
    const h = await makeHarness(capturingRunner())
    const res = await get(h, '/api/lang/interpret/capability')
    expect(res.json()).toEqual({ available: true, runner_id: 'fake-runner' })
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
        `printf '%s' '{"items":[{"topic_slug":"python-logging","summary":"在导入日志模块","risks":[],"claim_state":null}],"model":"m","provider":"p"}'`,
        '',
      ].join('\n'),
    )
    chmodSync(script, 0o755)

    const runner = new CommandInterpretRunner({ cmd: script, model: 'm', provider: 'p' })
    const result = await runner.interpret({
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
    writeFileSync(script, `#!/bin/sh\nprintf '%s' '{"items":"不是数组"}'\n`)
    chmodSync(script, 0o755)

    const runner = new CommandInterpretRunner({ cmd: script, model: 'm', provider: 'p' })
    await expect(
      runner.interpret({ fragments: [], topics: [] }),
    ).rejects.toThrow(/不合契约/u)
  })

  it('命令不存在 ⇒ 归一成「找不到」（不是崩掉）', async () => {
    const runner = new CommandInterpretRunner({
      cmd: '/nonexistent/m9-runner',
      model: 'm',
      provider: 'p',
    })
    await expect(runner.interpret({ fragments: [], topics: [] })).rejects.toThrow(/找不到解读命令/u)
  })
})
