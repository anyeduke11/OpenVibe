import { describe, expect, it, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import {
  APP_META_KEYS,
  AppMetaRepo,
  FlowTemplatesRepo,
  ProjectsRepo,
  TasksRepo,
} from '@openvibe/core'
import { newDb, type TestDbHandle } from '@openvibe/core/test-support'
import { AGENT_INGEST_LIMITS, AGENT_PAYLOAD_KEYS, TASK_STATUS } from '@openvibe/shared'
import { buildApp } from '../src/app'
import { AGENT_INGEST_BODY_LIMIT } from '../src/routes/agent'

/**
 * M8 · Agent 回流写入面的 API 集成测试（m8-agent-bridge.md FR-2.7 / FR-5）。
 *
 * 覆盖的判据是 spec §7 里的 d/e/f/h 四条：
 * d 三态幂等 · e 冲突不回显载荷 · f 部分成功逐条返回 · h 一律 pending
 */

const TOKEN = 'test-token'
const openHandles: { app: FastifyInstance; handle: TestDbHandle }[] = []

async function harness(): Promise<{
  app: FastifyInstance
  projectId: string
  handle: TestDbHandle
}> {
  const handle = newDb()
  const { app } = await buildApp({ db: handle.db, token: TOKEN })
  const template = new FlowTemplatesRepo(handle.db).create({
    name: '个人轻量流',
    kind: 'light',
    stages: [{ name: '启动', checklist: [{ id: 'c1', text: '需求一句话' }], artifacts: [] }],
  })
  const projectId = new ProjectsRepo(handle.db).create({
    name: '接入演示',
    flowTemplateId: template.id,
  }).id
  // M8-E 写侧总闸默认关（FR-5.5.2.1）⇒ 本 harness 显式打开，否则全部 ingest 用例先撞 422
  new AppMetaRepo(handle.db).write(APP_META_KEYS.agentWriteEnabled, true)
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
  return h.inject({
    method: 'POST',
    url,
    payload: payload as object,
    headers: { authorization: `Bearer ${TOKEN}` },
  })
}

function one(projectId: string, idempotencyKey: string, payload: unknown = { body: 'x' }) {
  return {
    projectId,
    items: [{ kind: 'dev_log', idempotencyKey, payload, sourcePlatform: 'trae' }],
  }
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
    for (const kind of [
      'dev_log',
      'session',
      'requirement',
      'task_status',
      'check_state',
    ] as const) {
      await post(app, '/api/agent/ingest', {
        projectId,
        items: [
          { kind, idempotencyKey: `k-${kind}`, payload: { body: 'x' }, sourcePlatform: 'trae' },
        ],
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

  it('⬆️ 超 2 MB 的载荷现在能穿过传输层，由**服务层**逐条裁决（FR-2.6 第三值经 HTTP 首次可达）', async () => {
    const { app, projectId, handle } = await harness()
    // **本条取代 2026-10-15 那条「413，非我方裁决」的记录。**
    // 当时 `apps/server/src/app.ts` 未设 `bodyLimit`，Fastify 默认 1 MB ⇒ 这类请求在到达服务层前
    // 就被 413 拒掉，FR-2.6 的 2 MB 总量上限**经 HTTP 永远吃不到**。
    // owner 已裁「抬」，实现为**按端点**覆盖（见 `src/routes/agent.ts` 的 `AGENT_INGEST_BODY_LIMIT`）。
    // 抬完之后同一条判据的落点变了：**该由服务层说话，不再由传输层代答。**
    //
    // 6 × 400 KB = 2,458,208 B 的整包 ⇒ 超过域内 2 MB 总量上限；
    // 但每条 400 KB 低于单条 512 KB ⇒ 前 5 条照落、第 6 条因累计超总量被拒。
    const chunk = 'z'.repeat(400 * 1024)
    const items = Array.from({ length: 6 }, (_, i) => ({
      kind: 'dev_log' as const,
      idempotencyKey: `bulk-${i}`,
      payload: { body: chunk },
      sourcePlatform: 'trae',
    }))
    const res = await post(app, '/api/agent/ingest', { projectId, items })

    // 整包远大于 1 MB，**却没有** 413 —— 这一条就是「传输层不再挡 2 MB」的证明
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toMatchObject({ accepted: 5, rejected: 1 })
    // 拒绝理由来自**域内**规则（服务层），不再是传输层
    expect(body.items[5].reason).toContain('超总量上限')
    // 落库的是前 5 条，被拒的那条一个字节都没进去
    const rows = handle.db
      .prepare('SELECT idempotency_key FROM agent_ingests ORDER BY rowid ASC')
      .all() as {
      idempotency_key: string
    }[]
    expect(rows).toHaveLength(5)
    expect(rows.map((r) => r.idempotency_key)).toEqual([
      'bulk-0',
      'bulk-1',
      'bulk-2',
      'bulk-3',
      'bulk-4',
    ])
    closeAll(app)
  })

  it('⬆️ 上限是**有界**的：超过放宽值仍是 413（证明这条判据不是永真）', async () => {
    const { app, projectId, handle } = await harness()
    // 上一条若写成「不再有 413」就是永真。这里补上反面：**仍然存在一个更大的上限在挡**。
    // 用 `AGENT_INGEST_BODY_LIMIT + 1 MiB` 而不是写死 9 MiB：
    // 上限值日后若被重定，这条判据自动跟着走，不会悄悄变成另一个口径。
    const over =
      Buffer.byteLength(JSON.stringify({ projectId, items: [] })) +
      AGENT_INGEST_BODY_LIMIT +
      1024 * 1024
    const res = await post(app, '/api/agent/ingest', {
      projectId,
      items: [
        {
          kind: 'dev_log',
          idempotencyKey: 'over',
          payload: { body: 'x'.repeat(over) },
          sourcePlatform: 'trae',
        },
      ],
    })
    expect(res.statusCode).toBe(413)
    // ⚠️ 断言 `message` 而不是 `FST_ERR_CTP_BODY_TOO_LARGE`：`plugins/errors.ts:33-39` 把
    // 非 AppError 的 4xx 统一归一成 `code:'VALIDATION_ERROR'`，原始 Fastify 码到不了客户端
    // （既有行为，非本轮引入）。413 与这句文案才是「传输层挡的」实证。
    expect(res.json().message).toMatch(/body is too large/i)
    // 传输层就拒了，不存在「部分落库」
    expect(handle.db.prepare('SELECT COUNT(*) AS c FROM agent_ingests').get()).toEqual({ c: 0 })
    closeAll(app)
  })

  it('⬆️ 放宽是**按端点**的：同实例的 devlog 端点仍在默认 1 MB 处 413（不是全局抬高）', async () => {
    const { app, projectId, handle } = await harness()
    // 如果实现走的是 `Fastify({ bodyLimit })` 全局抬高，这条就会变 201 —— 它就是那道防线。
    const body = 'q'.repeat(2 * 1024 * 1024)
    const res = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/devlog`,
      payload: { type: 'DEV', title: '正常标题', body },
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    expect(res.statusCode).toBe(413)
    expect(res.json().message).toMatch(/body is too large/i)
    expect(handle.db.prepare('SELECT COUNT(*) AS c FROM dev_log_entries').get()).toEqual({ c: 0 })
    closeAll(app)
  })

  it('⬆️ 放宽值恒大于域内 2 MB 总量上限（否则 FR-2.6 第三值仍然触达不到，等于没抬）', () => {
    // 这是「抬了有没有用」的最小判据：放宽值必须**严格大于**域内上限，
    // 否则服务层那条 2 MB 规则依然被传输层抢在前面，抬限白做。
    expect(AGENT_INGEST_BODY_LIMIT).toBeGreaterThan(AGENT_INGEST_LIMITS.requestTotalMaxBytes)
    // 且必须有界（不是 Number.MAX_SAFE_INTEGER 那种「等于没设」）
    expect(AGENT_INGEST_BODY_LIMIT).toBeLessThanOrEqual(64 * 1024 * 1024)
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
    const conflict = await post(
      app,
      '/api/agent/ingest',
      one(projectId, 'k2', { body: '机密内容乙' }),
    )
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
        {
          kind: 'dev_log',
          idempotencyKey: 'k3',
          payload: { body: '正文', cwd: '/Users/me/proj' },
          sourcePlatform: 'trae',
        },
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
        {
          kind: 'dev_log',
          idempotencyKey: 'k3b',
          payload: { body: '机密正文', cwd: '/Users/me/secret' },
          sourcePlatform: 'trae',
        },
      ],
    })
    const row = handle.db
      .prepare("SELECT payload_json FROM local_events WHERE kind = 'agent_ingest_accepted'")
      .get() as { payload_json: string }
    const keys = Object.keys(JSON.parse(row.payload_json)).sort()
    expect(keys).toEqual([...AGENT_PAYLOAD_KEYS.agent_ingest_accepted].sort())
    expect(row.payload_json).not.toContain('机密正文')
    expect(row.payload_json).not.toContain('/Users/me/secret')
    closeAll(app)
  })

  it('鉴权：无 token ⇒ 既有 401 形制', async () => {
    const { app, projectId } = await harness()
    const res = await app.inject({
      method: 'POST',
      url: '/api/agent/ingest',
      payload: one(projectId, 'k4'),
    })
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
    const conflicted = (list.json().items as { id: string; status: string }[]).find(
      (i) => i.status === 'conflict',
    )
    const res = await post(app, `/api/agent/ingests/${conflicted!.id}/review`, { to: 'published' })
    expect(res.statusCode).toBe(422)
    expect(res.json().code).toBe('IDEMPOTENCY_CONFLICT')
    closeAll(app)
  })

  it('台账：M8 事件真的写进去了，且不在遥测白名单里', async () => {
    const { app, projectId, handle } = await harness()
    await post(app, '/api/agent/ingest', one(projectId, 'k7'))
    const big = await post(
      app,
      '/api/agent/ingest',
      one(projectId, 'k8', { body: 'y'.repeat(600 * 1024) }),
    )
    expect(big.json()).toMatchObject({ rejected: 1 })
    const rows = handle.db
      .prepare("SELECT kind FROM local_events WHERE kind LIKE 'agent_%' ORDER BY id ASC")
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

/**
 * 发布分发（FR-2.8 / FR-2.9）的 **API 面凭据** i/j。
 *
 * 与服务层那组的关系：服务层钉的是「分发到哪张表的哪个方法」，
 * 这两条钉的是**经 HTTP 真跑一遍时人工确认门依然成立** ——
 * 「用户在 Web 点确认」这个动作的入口就是 `POST /api/agent/ingests/:id/review`，
 * 只在服务层测，等于把最该守的那道门留在外面。
 */
describe('IT-M8 · 人工确认后的发布分发', () => {
  it('i · 确认一条 dev_log ⇒ dev_log_entries 真多出一行（**这条路径此前从未存在**）', async () => {
    const { app, projectId, handle } = await harness()
    // 先确认「确认之前业务表是空的」—— FR-2.5 的全部
    expect(handle.db.prepare('SELECT COUNT(*) AS c FROM dev_log_entries').get()).toEqual({ c: 0 })

    const created = await post(app, '/api/agent/ingest', {
      projectId,
      items: [
        {
          kind: 'dev_log',
          idempotencyKey: 'pub-i',
          payload: { type: 'DEV', title: '经 HTTP 确认的日志', body: '正文在此' },
          sourcePlatform: 'trae',
        },
      ],
    })
    const id = created.json().items[0].id as string

    // 落库即 pending，此刻业务表仍然必须是空的
    expect(handle.db.prepare('SELECT COUNT(*) AS c FROM dev_log_entries').get()).toEqual({ c: 0 })

    const reviewed = await post(app, `/api/agent/ingests/${id}/review`, { to: 'published' })
    expect(reviewed.json()).toMatchObject({ status: 'published' })

    const row = handle.db.prepare('SELECT type, entry_no, title FROM dev_log_entries').get() as {
      type: string
      entry_no: number
      title: string
    }
    expect(row).toEqual({ type: 'DEV', entry_no: 1, title: '经 HTTP 确认的日志' })
    closeAll(app)
  })

  it('j · 确认一条上报 blocked 的 task_status ⇒ 整条 rejected，业务表**零写入**，闭集仍是三项', async () => {
    const { app, projectId, handle } = await harness()
    // 先建一条既有任务，让「更新 tasks.status」这件事有对象可写
    const taskId = new TasksRepo(handle.db).create(projectId, { title: '等 agent 上报' }).id

    const created = await post(app, '/api/agent/ingest', {
      projectId,
      items: [
        {
          kind: 'task_status',
          idempotencyKey: 'pub-j',
          payload: { taskId, status: 'blocked' },
          sourcePlatform: 'trae',
        },
      ],
    })
    const id = created.json().items[0].id as string

    const reviewed = await post(app, `/api/agent/ingests/${id}/review`, { to: 'published' })
    // 用户点了「确认」，但载荷非法 ⇒ 退回 rejected 而不是 published（FR-2.9）
    expect(reviewed.json()).toMatchObject({ status: 'rejected' })
    expect(reviewed.json().rejectReason).toContain('不扩列')

    // 零写入：任务状态一个字节都没动
    expect(new TasksRepo(handle.db).get(taskId)!.status).toBe('todo')
    for (const t of ['dev_log_entries', 'project_check_states', 'requirements']) {
      expect(handle.db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get(), t).toEqual({ c: 0 })
    }
    // 闭集没有被偷偷扩列
    expect(TASK_STATUS).toEqual(['todo', 'doing', 'done'])
    closeAll(app)
  })
})
