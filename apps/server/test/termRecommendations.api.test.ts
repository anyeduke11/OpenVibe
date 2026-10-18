import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { newDb, type TestDbHandle } from '@openvibe/core/test-support'
import { TermsRepo, nowIso } from '@openvibe/core'
import type { TermRecommendationsResponse } from '@openvibe/shared'
import { buildApp } from '../src/app'

/**
 * `GET /api/projects/:id/term-recommendations` 的 HTTP 层凭据（m3 FR-6 · P3）。
 *
 * 服务层 10 支在 `packages/core/src/services/termRecommendService.test.ts`，
 * **这一层单独立是因为实质都在「端点那一跳」上**：
 * ① 出参必须真的过 `TermRecommendationsResponse` 的 schema（字段漏了/名字错了只在响应体里暴露）；
 * ② 项目不存在要变成 404 而不是 500；
 * ③ 未授权请求不得读到推荐 —— 推荐内容是项目业务信息，不该在无闸时泄露。
 */

const TOKEN = 'test-token'
const FIXED_NOW = '2026-10-18T12:00:00.000Z'

interface Harness {
  app: FastifyInstance
  handle: TestDbHandle
  projectId: string
}

const open: Harness[] = []

let seq = 0

async function makeHarness(stageName = '复盘', checklist = '任务拆分有依赖序'): Promise<Harness> {
  const handle = newDb()
  const { app } = await buildApp({
    db: handle.db,
    token: TOKEN,
    appVersion: '0.3.1',
    now: () => new Date(FIXED_NOW),
  })
  const terms = new TermsRepo(handle.db)
  terms.create({ zh: '复盘', definition: '定义', status: 'active', domain: '产品' as never, starter: false })
  terms.create({
    zh: '分而治之',
    aliases: ['任务拆分'],
    definition: '定义',
    status: 'active',
    domain: '产品' as never,
    starter: true,
  })
  seq += 1
  const projectId = `prj_api_${String(seq)}`
  const ts = nowIso()
  handle.db
    .prepare(
      `INSERT INTO projects (id, name, local_path, flow_template_id, stages_snapshot,
         current_stage, status, standard_pack_id, standard_pack_version, created_at, updated_at)
       VALUES (?, '接口夹具', NULL, NULL, ?, NULL, 'active', NULL, NULL, ?, ?)`,
    )
    .run(
      projectId,
      JSON.stringify([{ name: stageName, checklist: [{ id: 'it_0', text: checklist }], artifacts: [] }]),
      ts,
      ts,
    )
  const h: Harness = { app, handle, projectId }
  open.push(h)
  return h
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((h) => h.app.close()))
})

describe('API-M3T · 术语推荐端点（FR-6 · P3）', () => {
  it('返回体过 schema，且 source 恒为 baseline', async () => {
    const { app, projectId } = await makeHarness()
    const res = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/term-recommendations`,
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as TermRecommendationsResponse
    expect(body.source).toBe('baseline')
    expect(body.projectId).toBe(projectId)
    expect(body.threshold).toBeGreaterThan(0)
    expect(Array.isArray(body.projectDomains)).toBe(true)
    // 自证：这份夹具确实产出了推荐，否则后面「每条都有理由」是查空数组
    expect(body.items.length).toBeGreaterThan(0)
    for (const item of body.items) {
      expect(item.reasons.length).toBeGreaterThan(0)
      expect(item.termId).not.toBe('')
    }
  })

  it('⚠️ 项目不存在 ⇒ 404（不是 500，也不是空推荐假装算过了）', async () => {
    const { app } = await makeHarness()
    const res = await app.inject({
      method: 'GET',
      url: '/api/projects/prj_查无此项/term-recommendations',
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    expect(res.statusCode).toBe(404)
  })

  it('⚠️ 无授权不得读到推荐内容', async () => {
    const { app, projectId } = await makeHarness()
    const res = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/term-recommendations`,
    })
    expect(res.statusCode).toBe(401)
    expect(res.body).not.toContain('分而治之')
  })

  it('⚠️ 阶段名一改，响应里的推荐就少一条（端点没有缓存住服务层算错的东西）', async () => {
    const { app, projectId } = await makeHarness('复盘')
    const before = (
      await app.inject({
        method: 'GET',
        url: `/api/projects/${projectId}/term-recommendations`,
        headers: { authorization: `Bearer ${TOKEN}` },
      })
    ).json() as TermRecommendationsResponse
    expect(before.items.some((i) => i.zh === '分而治之')).toBe(true)

    // 把阶段名换成推不出项目领域的串 ⇒ 1.5 消失 ⇒ 该条掉到门槛下
    const { app: app2, handle, projectId: pid2 } = await makeHarness('无关阶段')
    const after = (
      await app2.inject({
        method: 'GET',
        url: `/api/projects/${pid2}/term-recommendations`,
        headers: { authorization: `Bearer ${TOKEN}` },
      })
    ).json() as TermRecommendationsResponse
    expect(after.projectDomains).toEqual([])
    expect(after.items.some((i) => i.zh === '分而治之')).toBe(false)
    expect(handle).toBeDefined()
  })
})
