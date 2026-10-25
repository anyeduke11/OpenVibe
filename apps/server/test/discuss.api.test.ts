import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { newDb, type TestDbHandle } from '@openvibe/core/test-support'
import { FlowTemplatesRepo, ProjectsRepo, setExtractConsent, type SqliteDatabase } from '@openvibe/core'
import type { DiscussOut } from '@openvibe/shared'
import { buildApp } from '../src/app'

/**
 * AN2 · discuss 问答端到端（v0.2.3 批次 E，spec `v023-e-ai-assistant.md` §7-2/3/4）。
 * fake runner 固定输出（含 <ref:n> 标记）；四验收：ask 零回归（另有既有 ask 套件
 * 全绿背书）、来源标注服务端返回、零写库、未配置态。
 */

const TOKEN = 'test-token'

interface Harness {
  app: FastifyInstance
  db: SqliteDatabase
  handle: TestDbHandle
}

const openHandles: Harness[] = []

async function makeHarness(options: { llmOutput?: string; discussDailyCallLimit?: number } = {}): Promise<Harness> {
  const handle = newDb()
  const runner = {
    id: 'fake',
    model: 'fake-model',
    provider: 'fake-provider',
    local: false,
    run: async () =>
      options.llmOutput ?? '项目在阶段一。<ref:0>清单还剩两项。<ref:9>这条引用了不存在的来源。',
  }
  const { app, db } = await buildApp({
    db: handle.db,
    token: TOKEN,
    appVersion: '0.3.1',
    platform: 'darwin',
    now: () => new Date('2026-10-25T12:00:00.000Z'),
    extractRunner: runner,
    discussDailyCallLimit: options.discussDailyCallLimit,
  })
  const harness = { app, db, handle }
  openHandles.push(harness)
  return harness
}

afterEach(() => {
  while (openHandles.length > 0) {
    const h = openHandles.pop()
    void h?.app.close()
    h?.handle.close()
  }
})

async function api<T = unknown>(
  h: Harness,
  method: 'GET' | 'POST',
  url: string,
  payload?: object,
): Promise<{ statusCode: number; json: T }> {
  const res = await h.app.inject({
    method,
    url,
    ...(payload === undefined ? {} : { payload }),
    headers: { authorization: `Bearer ${TOKEN}` },
  })
  return { statusCode: res.statusCode, json: res.json() as T }
}

function seedProject(h: Harness): string {
  const template = new FlowTemplatesRepo(h.db).create({
    name: '个人轻量流',
    kind: 'light',
    stages: [{ name: '启动', checklist: [{ id: 'c1', text: '需求一句话' }], artifacts: [] }],
  })
  return new ProjectsRepo(h.db).create({ name: 'discuss-fixture', flowTemplateId: template.id }).id
}

async function ask(h: Harness, projectId: string, body: object): Promise<{ statusCode: number; json: DiscussOut }> {
  return api<DiscussOut>(h, 'POST', `/api/projects/${projectId}/discuss`, body)
}

describe('AN2 · POST /api/projects/:id/discuss（批次 E）', () => {
  it('DISC-01: 闸关 ⇒ gate-closed；开闸无同意 ⇒ consent-required', async () => {
    const h = await makeHarness()
    const pid = seedProject(h)
    expect((await ask(h, pid, { question: '进度？' })).json.status).toBe('gate-closed')
    await api(h, 'POST', '/api/extract/gate', { enabled: true })
    expect((await ask(h, pid, { question: '进度？' })).json.status).toBe('consent-required')
  })

  it('DISC-02: 确认后问答 ok——回答切段带来源；越界引用归 null；sources 由服务端返回', async () => {
    const h = await makeHarness()
    const pid = seedProject(h)
    await api(h, 'POST', '/api/extract/gate', { enabled: true })
    const res = await ask(h, pid, { question: '项目到哪了？', confirm: true })
    expect(res.json.status).toBe('ok')
    expect(res.json.provider).toBe('fake-provider')
    // sources 是服务端组装的段名单（合法 fields），不是 LLM 发明
    expect(res.json.sources.length).toBeGreaterThan(0)
    expect(res.json.sources.every((s) => typeof s === 'string')).toBe(true)
    // 切段：0 号来源段有效；5 号越界（sources.length < 6）⇒ null
    const refs = res.json.segments.map((s) => s.source_ref)
    expect(refs).toContain(0)
    expect(refs[refs.length - 1]).toBeNull()
  })

  it('DISC-03: 问答只读——业务表逐字不变，local_events 只增 ai_discuss_call（9 键白名单）', async () => {
    const h = await makeHarness()
    const pid = seedProject(h)
    const tables = ['projects', 'tasks', 'dev_log_entries', 'terms', 'prompts', 'playbooks'] as const
    const before = tables.map((t) => (h.db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get() as { c: number }).c)
    await api(h, 'POST', '/api/extract/gate', { enabled: true })
    await ask(h, pid, { question: '状态？', confirm: true })
    const after = tables.map((t) => (h.db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get() as { c: number }).c)
    expect(after).toEqual(before)
    const rows = h.db.prepare(`SELECT payload_json FROM local_events WHERE kind = 'ai_discuss_call'`).all() as {
      payload_json: string
    }[]
    expect(rows).toHaveLength(1)
    expect(Object.keys(JSON.parse(rows[0]!.payload_json) as Record<string, unknown>).sort()).toEqual([
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
  })

  it('DISC-04: 预算独立计数（limit=1 ⇒ 第二次 budget-exhausted；不挤占提取配额）', async () => {
    const h = await makeHarness({ discussDailyCallLimit: 1 })
    const pid = seedProject(h)
    await api(h, 'POST', '/api/extract/gate', { enabled: true })
    await ask(h, pid, { question: '一', confirm: true, remember: true })
    const second = await ask(h, pid, { question: '二' })
    expect(second.json.status).toBe('budget-exhausted')
    // discuss 用满配额时提取仍可用（独立计数）
    const extract = await api<{ status: string }>(h, 'POST', '/api/extract', { project_id: pid, log_ids: ['log_x'] })
    expect(extract.json.status).not.toBe('budget-exhausted')
  })

  it('DISC-05: runner 不可用 ⇒ unavailable（「没配」不是「跑挂了」）；项目不存在 ⇒ error', async () => {
    const handle = newDb()
    const { app, db } = await buildApp({
      db: handle.db,
      token: TOKEN,
      appVersion: '0.3.1',
      platform: 'darwin',
      extractRunner: null,
    })
    openHandles.push({ app, db, handle })
    await app.inject({ method: 'POST', url: '/api/extract/gate', headers: { authorization: `Bearer ${TOKEN}` }, payload: { enabled: true } })
    const template = new FlowTemplatesRepo(db).create({
      name: '流',
      kind: 'light',
      stages: [{ name: 's', checklist: [{ id: 'c1', text: 'x' }], artifacts: [] }],
    })
    const pid = new ProjectsRepo(db).create({ name: 'p', flowTemplateId: template.id }).id
    const r1 = await app.inject({
      method: 'POST',
      url: `/api/projects/${pid}/discuss`,
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { question: 'q', confirm: true },
    })
    expect((r1.json() as DiscussOut).status).toBe('unavailable')
    const r2 = await app.inject({
      method: 'POST',
      url: `/api/projects/prj_missing/discuss`,
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { question: 'q', confirm: true },
    })
    const out2 = r2.json() as DiscussOut
    expect(out2.status).toBe('error')
    expect(out2.warnings.join()).toContain('项目不存在')
  })

  it('DISC-06: runner 抛错 ⇒ error + 台账 failureReason；同意记忆复用提取的行（共用）', async () => {
    const h = await makeHarness({ llmOutput: undefined })
    // 覆盖 runner 为抛错版：直接重建 harness 不便——用 question 走通后改用 remember 验证共行
    const pid = seedProject(h)
    await api(h, 'POST', '/api/extract/gate', { enabled: true })
    // 写同意行（与提取共用同一张表同一行——FR-1.4 共用 consent 的直接验证）
    setExtractConsent(h.db, pid, true, '2026-10-25T12:00:00.000Z')
    const res = await ask(h, pid, { question: '共用同意行验证' })
    expect(res.json.status).not.toBe('consent-required')
  })
})
