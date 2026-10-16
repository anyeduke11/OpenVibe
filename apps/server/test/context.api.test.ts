import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { newDb, type TestDbHandle } from '@openvibe/core/test-support'
import { CONTEXT_FIELDS, type ProjectContextOut } from '@openvibe/shared'
import { buildApp } from '../src/app'

/**
 * `GET /api/projects/:id/context` 的**HTTP 层**凭据
 * （m8-agent-bridge.md §7 的 l / n 两条）。
 *
 * ## 为什么补这一份
 *
 * 两条判据的服务层凭据都在（`contextService.test.ts` 的「非法值 ⇒ 错误消息里列出全部合法值」
 * 与「读不到 pack.lock.json ⇒ 三字段全 null 且进 truncated」），
 * **但 HTTP 层一支都没有** —— 实测 `apps/server/test/` 下没有任何文件打这个端点。
 *
 * 而这两条判据的实质都在**端点那一跳**上：
 * ① 非法 `?fields=` 必须在**路由**就 422，不能拖到服务层才炸成 500；
 * ② 无 lock 的形状要真的出现在**响应体**里，不是只存在于服务层的返回值。
 * 只测服务层恰好把这两跳漏掉了。
 */

const TOKEN = 'test-token'
const FIXED_NOW = '2026-10-15T12:00:00.000Z'

interface Harness {
  app: FastifyInstance
  handle: TestDbHandle
  projectId: string
}

const open: Harness[] = []

async function makeHarness(): Promise<Harness> {
  const handle = newDb()
  const { app } = await buildApp({
    db: handle.db,
    token: TOKEN,
    appVersion: '0.3.1',
    now: () => new Date(FIXED_NOW),
  })
  const tpl = await app.inject({
    method: 'POST',
    url: '/api/flow-templates',
    headers: { authorization: `Bearer ${TOKEN}` },
    payload: {
      name: '两阶段流',
      kind: 'custom',
      stages: [
        {
          name: '开发',
          checklist: [
            { id: '开发-c1', text: '先跑通主干' },
            { id: '开发-c2', text: '补测试' },
          ],
          artifacts: [],
          prompt: '',
        },
      ],
    },
  })
  const tplBody = (await tpl.json()) as { id: string }
  const project = await app.inject({
    method: 'POST',
    url: '/api/projects',
    headers: { authorization: `Bearer ${TOKEN}` },
    payload: { name: '上下文夹具', flowTemplateId: tplBody.id },
  })
  const projectBody = (await project.json()) as { id: string }
  const h = { app, handle, projectId: projectBody.id }
  open.push(h)
  return h
}

afterEach(() => {
  while (open.length > 0) {
    const h = open.pop()!
    void h.app.close()
    h.handle.close()
  }
})

function ctx(h: Harness, query = '') {
  return h.app.inject({
    method: 'GET',
    url: `/api/projects/${h.projectId}/context${query}`,
    headers: { authorization: `Bearer ${TOKEN}` },
  })
}

describe('§7-l · FR-3.3：`?fields=` 非法值在**路由这一跳**就 422，且列出全部合法段名', () => {
  it('非法值 ⇒ 422 VALIDATION_ERROR，不是 500、也不是静默忽略', async () => {
    const h = await makeHarness()
    const res = await ctx(h, '?fields=logs,not_a_field')
    expect(res.statusCode).toBe(422)
    expect(res.json()).toMatchObject({ code: 'VALIDATION_ERROR' })
  })

  it('**错误消息列出全部六个合法段名**（不静默忽略的关键）', async () => {
    const h = await makeHarness()
    const res = await ctx(h, '?fields=not_a_field')
    const text = res.body
    for (const f of CONTEXT_FIELDS) {
      expect(text, `合法段名 ${f} 未出现在错误消息里`).toContain(f)
    }
    // 六段一个不少也不许多
    expect(CONTEXT_FIELDS).toHaveLength(6)
  })

  it('**空串是非法值而不是「全选」** —— 拼错字段名却拿到全量会让人无从察觉', async () => {
    const h = await makeHarness()
    expect((await ctx(h, '?fields=')).statusCode).toBe(422)
  })

  it('合法子集 ⇒ 200 且只回所选段（非法那条的对照：闸必须只拦非法，不误伤合法）', async () => {
    const h = await makeHarness()
    const res = await ctx(h, '?fields=stage,tasks')
    expect(res.statusCode).toBe(200)
    const out = res.json() as ProjectContextOut
    expect(out.fields).toEqual(['stage', 'tasks'])
  })

  it('项目不存在 ⇒ 既有 NOT_FOUND（不是 422，也不是 500）', async () => {
    const h = await makeHarness()
    const res = await h.app.inject({
      method: 'GET',
      url: '/api/projects/prj_not_exist/context',
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toMatchObject({ code: 'NOT_FOUND' })
  })

  it('无 token ⇒ 既有 401（读面同样受双闸保护）', async () => {
    const h = await makeHarness()
    const res = await h.app.inject({
      method: 'GET',
      url: `/api/projects/${h.projectId}/context`,
    })
    expect(res.statusCode).toBe(401)
  })
})

describe('§7-n · FR-3.2.1：读不到 pack.lock.json 时形状对', () => {
  it('**drifted / outdated / pack 段为 null，且进 `truncated`** ——「不可判定」不是「没漂移」', async () => {
    const h = await makeHarness() // 夹具项目刻意**不登记** localPath ⇒ 没有 lock
    const res = await ctx(h)
    expect(res.statusCode).toBe(200)
    const out = res.json() as ProjectContextOut
    expect(out.pack.drifted).toBeNull()
    expect(out.pack.outdated).toBeNull()
    // 无 lock 必须**留痕**，否则 agent 会把「读不到」读成「一切正常」
    expect(JSON.stringify(out.truncated)).toContain('pack')
  })

})
