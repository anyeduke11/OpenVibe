// `apps/server/test/langSource.api.test.ts` —— M9 v1.6 **P4 的七个端点**
// （`m9-dev-plan-2026-10.md` §6.10 P4.3 ~ P4.6 · `m9-dev-language-roadmap.md` §3.8 ~ §3.10 / §7）
//
// ## 它断什么
//
// | 判据 | 一句话 | 本文件里对应的那支 |
// |---|---|---|
// | **DL-21** | 清除记忆后**立刻回到全不勾** | 「记忆」组 |
// | **DL-22 / DL-23** | 导出清单**可 grep 复现**且**无绝对路径** | 「导出」组 |
// | **§3.9** | 出网台账**只存计数** | 「计数」组 |
//
// ## ⚠️ 扫描端点**不涉及任何 AI**
//
// T0 是本地静态分析 ⇒ 这个端点在 AI 不可用时照常工作（DL-17，
// 链路的「零 AI 依赖」由 `packages/core/src/source-scan/m9-source-scan.test.ts` 断）。
//
// ## ⚠️ 这里的扫描是**真跑**（真起 python3 子进程）
//
// 临时目录里放一个真实的 `.py` 文件 ⇒ 走 `python3 + ast` 那条路，
// 落库的是**真实命中** ⇒ 导出清单里的 `file:line` 指的是真实存在的文件。
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { newDb, type TestDbHandle } from '@openvibe/core/test-support'
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

async function makeHarness(): Promise<Harness> {
  const handle = newDb()
  const { app } = await buildApp({ db: handle.db, token: TOKEN })
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

function del(h: Harness, url: string) {
  return h.app.inject({ method: 'DELETE', url, headers: { authorization: `Bearer ${TOKEN}` } })
}

function addProject(db: TestDbHandle['db'], id: string, localPath: string | null): void {
  db.prepare(
    `INSERT INTO projects (id, name, stages_snapshot, status, local_path, created_at, updated_at)
     VALUES (?, ?, '[]', 'active', ?, '2026-10-21T00:00:00.000Z', '2026-10-21T00:00:00.000Z')`,
  ).run(id, `测试项目 ${id}`, localPath)
}

/**
 * 建**模式表会命中的那几个知识点**。
 *
 * ⚠️ 命中落库要按 `topic_slug` 解析 `topic_id`（`lang_topics` 的外键）
 * ⇒ 测试库里**必须先有这些行**，否则每条命中都是孤儿（`written = 0`）。
 * ⚠️ 这不是「为了让测试过」—— 它正是 §3.1 的关系：**命中挂在知识点上**。
 */
function addTopics(db: TestDbHandle['db']): void {
  const insert = db.prepare(
    `INSERT INTO lang_topics (lang, slug, title, summary, stage_id, kind)
     VALUES ('python', ?, ?, '', 1, 'language')`,
  )
  for (const slug of ['python-logging', 'python3-module', 'python-decorators']) {
    insert.run(slug, slug)
  }
}

/** 一个**真实**的 Python 项目目录（一个模块 ＋ 一个装饰器）。 */
function makePyProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ov-m9-api-'))
  dirs.push(dir)
  writeFileSync(
    join(dir, 'app.py'),
    ['import logging', '', '@decorator', 'def f():', '    pass', ''].join('\n'),
  )
  return dir
}

describe('M9 P4 · POST /api/lang/scan', () => {
  it('项目不存在 ⇒ 422（显式失败，不静默）', async () => {
    const h = await makeHarness()
    const res = await post(h, '/api/lang/scan', { project_id: 'nope' })
    expect(res.statusCode).toBe(422)
  })

  it('项目没设本地目录 ⇒ 422', async () => {
    const h = await makeHarness()
    addProject(h.handle.db, 'p1', null)
    const res = await post(h, '/api/lang/scan', { project_id: 'p1' })
    expect(res.statusCode).toBe(422)
  })

  it('本地目录不是绝对路径 ⇒ 422', async () => {
    const h = await makeHarness()
    addProject(h.handle.db, 'p1', 'relative/dir')
    const res = await post(h, '/api/lang/scan', { project_id: 'p1' })
    expect(res.statusCode).toBe(422)
  })

  it('⚠️ 真扫一个 Python 项目 ⇒ 落库成功，且**响应里没有命中列表**', async () => {
    const h = await makeHarness()
    const dir = makePyProject()
    addProject(h.handle.db, 'p1', dir)
    addTopics(h.handle.db)

    const res = await post(h, '/api/lang/scan', { project_id: 'p1' })

    expect(res.statusCode).toBe(200)
    const body = res.json() as {
      scan_id: number
      languages: { lang: string; mode: string | null; toolchain: string | null }[]
      written: number
    }
    // ⚠️ **扫描的账 ≠ 命中列表**（两种形状）⇒ 端点只回账
    expect(body).not.toHaveProperty('findings')
    expect(body.written).toBeGreaterThan(0)
    expect(body.languages.find((l) => l.lang === 'python')?.mode).toBe('parser')

    // 命中真的落库了
    const rows = h.handle.db
      .prepare('SELECT file_rel_path, line, confidence, scanner_mode FROM lang_topic_findings')
      .all() as { file_rel_path: string; confidence: string }[]
    expect(rows.length).toBe(body.written)
    expect(rows[0]?.file_rel_path).toBe('app.py')
  })

  it('缺 project_id ⇒ 422', async () => {
    const h = await makeHarness()
    const res = await post(h, '/api/lang/scan', {})
    expect(res.statusCode).toBe(422)
  })
})

describe('M9 P4 · GET /api/lang/findings', () => {
  it('返回最近一次扫描的命中，且**路径是相对的**（DL-23）', async () => {
    const h = await makeHarness()
    const dir = makePyProject()
    addProject(h.handle.db, 'p1', dir)
    addTopics(h.handle.db)
    await post(h, '/api/lang/scan', { project_id: 'p1' })

    const res = await get(h, '/api/lang/findings?project=p1')

    expect(res.statusCode).toBe(200)
    const body = res.json() as { findings: { file_rel_path: string }[] }
    expect(body.findings.length).toBeGreaterThan(0)
    for (const f of body.findings) {
      expect(f.file_rel_path.startsWith('/')).toBe(false)
      expect(f.file_rel_path).toBe('app.py')
    }
  })

  it('⚠️ **不带项目参数 ⇒ 422**（owner 2026-10-22：命中按项目隔离，必须显式给项目）', async () => {
    const h = await makeHarness()
    const res = await get(h, '/api/lang/findings')
    expect(res.statusCode).toBe(422)
  })

  it('⚠️ **多项目互不覆盖**（owner 2026-10-22 加项目列的**目的**）', async () => {
    const h = await makeHarness()
    const dirA = makePyProject()
    const dirB = makePyProject()
    addProject(h.handle.db, 'p1', dirA)
    addProject(h.handle.db, 'p2', dirB)
    addTopics(h.handle.db)

    await post(h, '/api/lang/scan', { project_id: 'p1' })
    const afterA = await get(h, '/api/lang/findings?project=p1')
    expect((afterA.json() as { findings: unknown[] }).findings.length).toBeGreaterThan(0)

    // ⚠️ 扫第二个项目 ⇒ **第一个项目的命中不许被清掉**
    await post(h, '/api/lang/scan', { project_id: 'p2' })
    const stillA = await get(h, '/api/lang/findings?project=p1')
    const nowB = await get(h, '/api/lang/findings?project=p2')
    expect((stillA.json() as { findings: unknown[] }).findings.length).toBeGreaterThan(0)
    expect((nowB.json() as { findings: unknown[] }).findings.length).toBeGreaterThan(0)
  })
})

describe('M9 P4 · DL-21 · 同意记忆', () => {
  it('没有记忆 ⇒ 读回来是「全不勾」（remember_all=false）', async () => {
    const h = await makeHarness()
    addProject(h.handle.db, 'p1', null)
    const res = await get(h, '/api/lang/source/consent?project=p1')
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ remember_all: false, remembered_at: null })
  })

  it('记「全发」⇒ 读回 true ⇒ 清除 ⇒ **立刻回到全不勾**', async () => {
    const h = await makeHarness()
    addProject(h.handle.db, 'p1', null)

    const written = await post(h, '/api/lang/source/consent', {
      project_id: 'p1',
      remember_all: true,
    })
    expect(written.statusCode).toBe(200)
    const read = await get(h, '/api/lang/source/consent?project=p1')
    expect(read.json()).toMatchObject({ remember_all: true })

    const cleared = await del(h, '/api/lang/source/consent?project=p1')
    expect(cleared.statusCode).toBe(200)
    expect(cleared.json()).toMatchObject({ cleared: true, remember_all: false, remembered_at: null })

    const after = await get(h, '/api/lang/source/consent?project=p1')
    expect(after.json()).toMatchObject({ remember_all: false, remembered_at: null })
  })

  it('记「全不发」也走同一条清除路径', async () => {
    const h = await makeHarness()
    addProject(h.handle.db, 'p1', null)
    await post(h, '/api/lang/source/consent', { project_id: 'p1', remember_all: false })
    const cleared = await del(h, '/api/lang/source/consent?project=p1')
    expect(cleared.statusCode).toBe(200)
    const after = await get(h, '/api/lang/source/consent?project=p1')
    expect(after.json()).toMatchObject({ remember_all: false, remembered_at: null })
  })

  it('缺 project ⇒ 422', async () => {
    const h = await makeHarness()
    expect((await get(h, '/api/lang/source/consent')).statusCode).toBe(422)
    expect((await del(h, '/api/lang/source/consent')).statusCode).toBe(422)
  })

  it('GET /api/lang/source/consents 列出**全部**记忆（设置页用）', async () => {
    const h = await makeHarness()
    addProject(h.handle.db, 'p1', null)
    addProject(h.handle.db, 'p2', null)
    await post(h, '/api/lang/source/consent', { project_id: 'p1', remember_all: true })
    await post(h, '/api/lang/source/consent', { project_id: 'p2', remember_all: false })

    const res = await get(h, '/api/lang/source/consents')

    expect(res.statusCode).toBe(200)
    const body = res.json() as { consents: { project_id: string }[] }
    expect(body.consents.map((c) => c.project_id).sort()).toEqual(['p1', 'p2'])
  })
})

describe('M9 P4 · DL-22 / DL-23 · 导出清单', () => {
  it('导出是**附件**（text/plain）且只含相对路径', async () => {
    const h = await makeHarness()
    const dir = makePyProject()
    addProject(h.handle.db, 'p1', dir)
    addTopics(h.handle.db)
    await post(h, '/api/lang/scan', { project_id: 'p1' })

    const res = await get(h, '/api/lang/source/export?project=p1')

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/plain')
    expect(res.headers['content-disposition']).toContain('attachment')
    expect(res.body).toContain('app.py')
    // ⚠️ DL-23：**没有绝对路径**（导出的文件会被用户随手转发）
    expect(res.body).not.toContain(dir)
    expect(res.body).not.toContain('/Users/')
  })

  it('缺 project ⇒ 422', async () => {
    const h = await makeHarness()
    expect((await get(h, '/api/lang/source/export')).statusCode).toBe(422)
  })
})

describe('M9 P4 · §3.9 · 出网计数', () => {
  it('记一次出网 ⇒ 台账只存**计数**，不存片段与路径', async () => {
    const h = await makeHarness()
    addProject(h.handle.db, 'p1', null)

    const res = await post(h, '/api/lang/source/share', {
      project_id: 'p1',
      topic_id_count: 2,
      snippet_count: 4,
      consent_source: 'explicit_tick',
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ recorded: true })
    const row = h.handle.db
      .prepare('SELECT topic_id_count, snippet_count, consent_source FROM lang_source_shares')
      .get() as { topic_id_count: number; snippet_count: number; consent_source: string }
    expect(row).toEqual({ topic_id_count: 2, snippet_count: 4, consent_source: 'explicit_tick' })
  })

  it('⚠️ `consent_source` 只认两个值（explicit_tick / remembered）', async () => {
    const h = await makeHarness()
    addProject(h.handle.db, 'p1', null)
    const res = await post(h, '/api/lang/source/share', {
      project_id: 'p1',
      topic_id_count: 1,
      snippet_count: 1,
      consent_source: 'whatever',
    })
    expect(res.statusCode).toBe(422)
  })

  it('计数可读回（GET consent 带着 shares）', async () => {
    const h = await makeHarness()
    addProject(h.handle.db, 'p1', null)
    await post(h, '/api/lang/source/share', {
      project_id: 'p1',
      topic_id_count: 3,
      snippet_count: 7,
      consent_source: 'remembered',
    })
    const res = await get(h, '/api/lang/source/consent?project=p1')
    const body = res.json() as { shares: { snippet_count: number; consent_source: string }[] }
    expect(body.shares).toHaveLength(1)
    expect(body.shares[0]).toMatchObject({ snippet_count: 7, consent_source: 'remembered' })
  })
})

describe('M9 · GET /api/lang/source/share-daily（按日出网的分类计数）', () => {
  it('⚠️ **`from` / `to` 必填**（不给「近 N 天」那种相对窗口 ⇒ 不随日历漂移）', async () => {
    const h = await makeHarness()
    const res = await get(h, '/api/lang/source/share-daily')
    expect(res.statusCode).toBe(422)
  })

  it('日期格式不对 ⇒ 422', async () => {
    const h = await makeHarness()
    const res = await get(h, '/api/lang/source/share-daily?from=2026-10-20&to=not-a-date')
    expect(res.statusCode).toBe(422)
  })

  it('`from` 晚于 `to` ⇒ 422（不静默返回空）', async () => {
    const h = await makeHarness()
    const res = await get(h, '/api/lang/source/share-daily?from=2026-10-22&to=2026-10-20')
    expect(res.statusCode).toBe(422)
  })

  it('按 UTC 日聚合，三类计数分得开', async () => {
    const h = await makeHarness()
    addProject(h.handle.db, 'p1', null)
    h.handle.db
      .prepare(
        `INSERT INTO lang_source_shares
           (project_id, topic_id_count, snippet_count, created_at, consent_source, consent_detail)
         VALUES ('p1', 2, 3, '2026-10-20T01:00:00.000Z', 'explicit_tick', 'no_memory'),
                ('p1', 1, 2, '2026-10-20T02:00:00.000Z', 'remembered', 'memory_applied')`,
      )
      .run()
    const res = await get(h, '/api/lang/source/share-daily?from=2026-10-20&to=2026-10-21')
    expect(res.statusCode).toBe(200)
    const body = res.json() as {
      daily: { day: string; share_count: number; memory_applied_count: number; self_ticked_count: number }[]
    }
    expect(body.daily).toHaveLength(1)
    expect(body.daily[0]?.day).toBe('2026-10-20')
    expect(body.daily[0]?.share_count).toBe(2)
    expect(body.daily[0]?.memory_applied_count).toBe(1)
    expect(body.daily[0]?.self_ticked_count).toBe(1)
  })
})

describe('M9 · GET /api/lang/source/share-by-provider（按 provider 分组的台账）', () => {
  it('⚠️ **`from` / `to` 必填**（不给相对窗口 ⇒ 不随日历漂移）', async () => {
    const h = await makeHarness()
    const res = await get(h, '/api/lang/source/share-by-provider')
    expect(res.statusCode).toBe(422)
  })

  it('日期格式不对 ⇒ 422', async () => {
    const h = await makeHarness()
    const res = await get(h, '/api/lang/source/share-by-provider?from=2026-10-20&to=not-a-date')
    expect(res.statusCode).toBe(422)
  })

  it('`from` 晚于 `to` ⇒ 422（不静默返回空）', async () => {
    const h = await makeHarness()
    const res = await get(h, '/api/lang/source/share-by-provider?from=2026-10-22&to=2026-10-20')
    expect(res.statusCode).toBe(422)
  })

  it('按 provider ＋ 模型分组，次数与用量逐字相加', async () => {
    const h = await makeHarness()
    addProject(h.handle.db, 'p1', null)
    h.handle.db
      .prepare(
        `INSERT INTO lang_source_shares
           (project_id, topic_id_count, snippet_count, created_at, consent_source, consent_detail,
            provider, model, usage_total_tokens)
         VALUES ('p1', 2, 3, '2026-10-20T01:00:00.000Z', 'explicit_tick', 'no_memory', 'sensenova', 'deepseek-v4-flash', 150),
                ('p1', 1, 2, '2026-10-20T02:00:00.000Z', 'explicit_tick', 'no_memory', 'sensenova', 'deepseek-v4-flash', 50),
                ('p1', 1, 1, '2026-10-20T03:00:00.000Z', 'explicit_tick', 'no_memory', 'agnes', 'agnes-3.0-flash', 30)`,
      )
      .run()
    const res = await get(h, '/api/lang/source/share-by-provider?from=2026-10-20&to=2026-10-21')
    expect(res.statusCode).toBe(200)
    const body = res.json() as {
      groups: {
        provider: string
        model: string
        share_count: number
        snippet_total: number
        usage_total_tokens: number | null
        usage_known_count: number
      }[]
    }
    expect(body.groups).toHaveLength(2)
    const sensenova = body.groups.find((g) => g.provider === 'sensenova')
    expect(sensenova?.model).toBe('deepseek-v4-flash')
    expect(sensenova?.share_count).toBe(2)
    expect(sensenova?.snippet_total).toBe(5)
    expect(sensenova?.usage_total_tokens).toBe(200)
    expect(sensenova?.usage_known_count).toBe(2)
  })

  it('⚠️ **「未知」那一组不许消失**（provider 改过 ⇒ 改之前出的网没有标识）', async () => {
    const h = await makeHarness()
    addProject(h.handle.db, 'p1', null)
    h.handle.db
      .prepare(
        `INSERT INTO lang_source_shares
           (project_id, topic_id_count, snippet_count, created_at, consent_source, consent_detail)
         VALUES ('p1', 1, 1, '2026-10-20T01:00:00.000Z', 'explicit_tick', 'no_memory')`,
      )
      .run()
    const res = await get(h, '/api/lang/source/share-by-provider?from=2026-10-20&to=2026-10-21')
    const body = res.json() as {
      groups: { provider: string; share_count: number; usage_total_tokens: number | null; usage_known_count: number }[]
    }
    expect(body.groups).toHaveLength(1)
    expect(body.groups[0]?.provider).toBe('')
    // ⚠️ **没有用量 ⇒ 合计是 null，不是 0**
    expect(body.groups[0]?.usage_total_tokens).toBeNull()
    expect(body.groups[0]?.usage_known_count).toBe(0)
  })
})
