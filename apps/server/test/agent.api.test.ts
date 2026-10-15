import { describe, expect, it, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { FlowTemplatesRepo, ProjectsRepo } from '@openvibe/core'
import { newDb, type TestDbHandle } from '@openvibe/core/test-support'
import { buildApp } from '../src/app'

/**
 * M8 · Agent 回流写入面的 API 集成测试（m8-agent-bridge.md FR-2.7 / FR-5）。
 *
 * 覆盖的判据是 spec §7 里的 d/e/f/h 四条：
 * d 三态幂等 · e 冲突不回显载荷 · f 部分成功逐条返回 · h 一律 pending
 */

const TOKEN = 'test-token'
const openHandles: { app: FastifyInstance; handle: TestDbHandle }[] = []

async function harness(): Promise<{ app: FastifyInstance; projectId: string; handle: TestDbHandle }> {
  const handle = newDb()
  const { app } = await buildApp({ db: handle.db, token: TOKEN })
  const template = new FlowTemplatesRepo(handle.db).create({
    name: '个人轻量流',
    kind: 'light',
    stages: [{ name: '启动', checklist: [{ id: 'c1', text: '需求一句话' }], artifacts: [] }],
  })
  const projectId = new ProjectsRepo(handle.db).create({ name: '接入演示', flowTemplateId: template.id }).id
  openHandles.push({ app, handle })
  return { app, projectId, handle }
}

afterEach(() => {
  while (openHandles.length > 0) {
    const h = openHandles.pop()
    void h?.app.close()
    h?.handle.close()
  }
})

function post(h: FastifyInstance, url: string, payload: unknown) {
  return h.inject({ method: 'POST', url, payload: payload as object, headers: { authorization: `Bearer ${TOKEN}` } })
}

function one(projectId: string, idempotencyKey: string, payload: unknown = { body: 'x' }) {
  return { projectId, items: [{ kind: 'dev_log', idempotencyKey, payload, sourcePlatform: 'trae' }] }
}

describe('IT-M8 · POST /api/agent/ingest', () => {
  it('d · 三态幂等：首次 accepted，重放 duplicate，异载荷 conflict', async () => {
    const { app, projectId } = await harness()

    const first = await post(app, '/api/agent/ingest', one(projectId, 'k1'))
    expect(first.statusCode).toBe(200)
    expect(first.json()).toMatchObject({ accepted: 1, duplicate: 0, conflict: 0, rejected: 0 })

    const replay = await post(app, '/api/agent/ingest', one(projectId, 'k1'))
    expect(replay.json()).toMatchObject({ accepted: 0, duplicate: 1 })

    const conflict = await post(app, '/api/agent/ingest', one(projectId, 'k1', { body: '改过的' }))
    expect(conflict.json()).toMatchObject({ conflict: 1 })
    closeAll(app)
  })

  it('h · 一律 pending：任何 kind 落库都是 pending，reviewed_at 为 null', async () => {
    const { app, projectId } = await harness()
    for (const kind of ['dev_log', 'session', 'requirement', 'task_status', 'check_state'] as const) {
      await post(app, '/api/agent/ingest', {
        projectId,
        items: [{ kind, idempotencyKey: `k-${kind}`, payload: { body: 'x' }, sourcePlatform: 'trae' }],
      })
    }
    const list = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/agent-ingests`,
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    const { items } = list.json() as { items: { status: string; reviewedAt: string | null }[] }
    expect(items).toHaveLength(5)
    expect(items.every((i) => i.status === 'pending')).toBe(true)
    expect(items.every((i) => i.reviewedAt === null)).toBe(true)
    closeAll(app)
  })

  it('f · 部分成功：超限那条 rejected，其余照落，**整体 200**', async () => {
    const { app, projectId } = await harness()
    const huge = { body: 'x'.repeat(600 * 1024) } // 超单条 512 KB
    const res = await post(app, '/api/agent/ingest', {
      projectId,
      items: [
        { kind: 'dev_log', idempotencyKey: 'ok1', payload: { body: 'a' }, sourcePlatform: 'trae' },
        { kind: 'dev_log', idempotencyKey: 'big', payload: huge, sourcePlatform: 'trae' },
        { kind: 'dev_log', idempotencyKey: 'ok2', payload: { body: 'b' }, sourcePlatform: 'trae' },
      ],
    })
    // 整体恒 200 —— 全条失败也 200，否则 agent 读不到「哪条错了」
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toMatchObject({ accepted: 2, rejected: 1 })
    expect(body.items.map((i: { index: number; status: string }) => [i.index, i.status])).toEqual([
      [0, 'accepted'],
      [1, 'rejected'],
      [2, 'accepted'],
    ])
    expect(body.items[1].reason).toContain('超单条上限')
    closeAll(app)
  })

  it('⚠️ 超大请求经 HTTP 被 Fastify 的 bodyLimit 挡在服务层之前（**413**，非我方裁决）', async () => {
    const { app, projectId, handle } = await harness()
    // 这条记录的是**实况**，不是我们想要的形状：
    // `apps/server/src/app.ts` 用 `Fastify({ logger: false })`，未设 bodyLimit ⇒ Fastify 默认 **1 MB**。
    // 所以 2 MB 总量上限经 HTTP **永远触达不到**，请求先在传输层被 413 拒掉。
    // 域内上限（512 KB / 20 条 / 2 MB）仍然由服务层把关（见同文件的 service 层直测），
    // 但要让 agent 真能推 1 MB 以上的载荷，必须显式抬 bodyLimit —— 那是**全 server 面**的改动。
    const chunk = 'z'.repeat(400 * 1024)
    const items = Array.from({ length: 6 }, (_, i) => ({
      kind: 'dev_log' as const,
      idempotencyKey: `bulk-${i}`,
      payload: { body: chunk },
      sourcePlatform: 'trae',
    }))
    const res = await post(app, '/api/agent/ingest', { projectId, items })
    expect(res.statusCode).toBe(413)
    // 一条都没落库 —— 传输层就拒了，不存在「部分落库」
    expect(handle.db.prepare('SELECT COUNT(*) AS c FROM agent_ingests').get()).toEqual({ c: 0 })
    closeAll(app)
  })

  it('单次条数上限：超 20 条 ⇒ 422（整批拒，不逐条挤牙膏）', async () => {
    const { app, projectId } = await harness()
    const items = Array.from({ length: 21 }, (_, i) => ({
      kind: 'dev_log' as const,
      idempotencyKey: `n-${i}`,
      payload: { body: 'x' },
      sourcePlatform: 'trae',
    }))
    const res = await post(app, '/api/agent/ingest', { projectId, items })
    expect(res.statusCode).toBe(422)
    expect(res.json().code).toBe('VALIDATION_ERROR')
    closeAll(app)
  })

  it('e · 冲突响应只给 sha 前 8 位，**不含完整载荷**', async () => {
    const { app, projectId } = await harness()
    await post(app, '/api/agent/ingest', one(projectId, 'k2', { body: '机密内容甲' }))
    const conflict = await post(app, '/api/agent/ingest', one(projectId, 'k2', { body: '机密内容乙' }))
    expect(conflict.json().items[0]).toMatchObject({
      status: 'conflict',
      existingKeySha: expect.stringMatching(/^[0-9a-f]{8}$/),
      incomingKeySha: expect.stringMatching(/^[0-9a-f]{8}$/),
    })
    expect(conflict.body).not.toContain('机密内容')
    closeAll(app)
  })

  it('上报侧的 body/cwd 照收（业务载荷本就该存），**禁列管的是台账那一侧**', async () => {
    const { app, projectId } = await harness()
    const res = await post(app, '/api/agent/ingest', {
      projectId,
      items: [
        { kind: 'dev_log', idempotencyKey: 'k3', payload: { body: '正文', cwd: '/Users/me/proj' }, sourcePlatform: 'trae' },
      ],
    })
    expect(res.json()).toMatchObject({ accepted: 1 })
    closeAll(app)
  })

  it('台账那侧走**白名单构造**：accepted 事件的 payload 键恰为 kind + sourcePlatform，**不带 body 与 cwd**', async () => {
    const { app, projectId, handle } = await harness()
    await post(app, '/api/agent/ingest', {
      projectId,
      items: [
        { kind: 'dev_log', idempotencyKey: 'k3b', payload: { body: '机密正文', cwd: '/Users/me/secret' }, sourcePlatform: 'trae' },
      ],
    })
    const row = handle.db
      .prepare("SELECT payload_json FROM local_events WHERE kind = 'agent_ingest_accepted'")
      .get() as { payload_json: string }
    const keys = Object.keys(JSON.parse(row.payload_json)).sort()
    expect(keys).toEqual(['kind', 'sourcePlatform'])
    expect(row.payload_json).not.toContain('机密正文')
    expect(row.payload_json).not.toContain('/Users/me/secret')
    closeAll(app)
  })

  it('鉴权：无 token ⇒ 既有 401 形制', async () => {
    const { app, projectId } = await harness()
    const res = await app.inject({ method: 'POST', url: '/api/agent/ingest', payload: one(projectId, 'k4') })
    expect(res.statusCode).toBe(401)
    closeAll(app)
  })

  it('人工裁决：review 后转 published；冲突记录拒裁决', async () => {
    const { app, projectId } = await harness()
    const created = await post(app, '/api/agent/ingest', one(projectId, 'k5'))
    const id = created.json().items[0].id as string

    const reviewed = await post(app, `/api/agent/ingests/${id}/review`, { to: 'published' })
    expect(reviewed.json()).toMatchObject({ status: 'published' })

    await post(app, '/api/agent/ingest', one(projectId, 'k6', { body: '甲' }))
    await post(app, '/api/agent/ingest', one(projectId, 'k6', { body: '乙' }))
    const list = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/agent-ingests`,
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    const conflicted = (list.json().items as { id: string; status: string }[]).find((i) => i.status === 'conflict')
    const res = await post(app, `/api/agent/ingests/${conflicted!.id}/review`, { to: 'published' })
    expect(res.statusCode).toBe(422)
    expect(res.json().code).toBe('IDEMPOTENCY_CONFLICT')
    closeAll(app)
  })

  it('台账：M8 事件真的写进去了，且不在遥测白名单里', async () => {
    const { app, projectId, handle } = await harness()
    await post(app, '/api/agent/ingest', one(projectId, 'k7'))
    const big = await post(app, '/api/agent/ingest', one(projectId, 'k8', { body: 'y'.repeat(600 * 1024) }))
    expect(big.json()).toMatchObject({ rejected: 1 })
    const rows = handle.db
      .prepare('SELECT kind FROM local_events WHERE kind LIKE \'agent_%\' ORDER BY id ASC')
      .all() as { kind: string }[]
    expect(rows.map((r) => r.kind)).toEqual(['agent_ingest_accepted', 'agent_ingest_rejected'])
    closeAll(app)
  })
})

function closeAll(app: FastifyInstance): void {
  const idx = openHandles.findIndex((x) => x.app === app)
  if (idx < 0) return
  const h = openHandles.splice(idx, 1)[0]!
  void h.app.close()
  h.handle.close()
}
