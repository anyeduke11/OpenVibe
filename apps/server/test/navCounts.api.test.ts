import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { newDb, type TestDbHandle } from '@openvibe/core/test-support'
import { NavCountsOut } from '@openvibe/shared'
import { buildApp } from '../src/app'

/**
 * GET /api/nav-counts：侧栏七项角标（M4 技巧库上线后由六项扩到七项）。
 * 重点钉两件事——① 七格齐全且与各列表端点同口径；② projects 只数非归档（与
 * GET /api/projects 的默认返回同数），因为角标报一个点进去看不到的数字比报错更糟。
 */

const TOKEN = 'test-token'

interface Harness {
  app: FastifyInstance
  handle: TestDbHandle
}

const openHandles: Harness[] = []

async function makeHarness(): Promise<Harness> {
  const handle = newDb()
  const { app } = await buildApp({ db: handle.db, token: TOKEN })
  const harness = { app, handle }
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

const api = async (h: Harness, url: string): Promise<{ statusCode: number; json: unknown }> => {
  const res = await h.app.inject({
    method: 'GET',
    url,
    headers: { authorization: `Bearer ${TOKEN}` },
  })
  return { statusCode: res.statusCode, json: res.json() }
}

const NAV_KEYS = ['flows', 'packs', 'playbooks', 'projects', 'prompts', 'skills', 'terms']

/** 直接写行，绕开各资源的建档校验：角标端点只该认 COUNT(*)，不关心入库路径 */
function seedRows(h: Harness): void {
  const db = h.handle.db
  const ts = '2026-10-13T00:00:00.000Z'
  for (const id of ['prm_a', 'prm_b'])
    db.prepare(
      `INSERT INTO prompts (id, title, content, content_hash, created_at, updated_at)
       VALUES (?, 't', 'c', 'h', ?, ?)`,
    ).run(id, ts, ts)
  db.prepare(
    `INSERT INTO terms (id, zh, definition, related_term_ids, created_at, updated_at)
     VALUES ('trm_a', '规则漂移', '定义', '[]', ?, ?)`,
  ).run(ts, ts)
  db.prepare(
    `INSERT INTO playbooks (id, scenario, problem, practice, created_at, updated_at)
     VALUES ('pbx_a', '场景', '问题', '做法', ?, ?)`,
  ).run(ts, ts)
  db.prepare(
    `INSERT INTO skills (id, name, description, source, created_at, updated_at)
     VALUES ('skl_a', 's', 'd', 'manual', ?, ?)`,
  ).run(ts, ts)
  db.prepare(
    `INSERT INTO flow_templates (id, name, kind, stages, builtin, created_at, updated_at)
     VALUES ('flt_a', 'f', 'light', '[]', 0, ?, ?)`,
  ).run(ts, ts)
  db.prepare(
    `INSERT INTO standard_packs (id, name, description, selection, targets, created_at, updated_at)
     VALUES ('pk_a', 'p', '', ?, '["claude-code"]', ?, ?)`,
  ).run(
    JSON.stringify({ promptIds: [], termIds: [], skillIds: [], playbookIds: [], flowTemplateId: null }),
    ts,
    ts,
  )
  // 两个在办（active + paused）+ 一个归档：角标应为 2
  for (const [id, status] of [
    ['prj_active', 'active'],
    ['prj_paused', 'paused'],
    ['prj_archived', 'archived'],
  ] as const)
    db.prepare(
      `INSERT INTO projects (id, name, stages_snapshot, status, created_at, updated_at)
       VALUES (?, ?, '[]', ?, ?, ?)`,
    ).run(id, id, status, ts, ts)
}

describe('GET /api/nav-counts（侧栏角标）', () => {
  it('IT-NAV-01: 空库七格全 0；200 + 字段名与契约逐一相符', async () => {
    const h = await makeHarness()
    const res = await api(h, '/api/nav-counts')
    expect(res.statusCode).toBe(200)
    expect(res.json).toEqual({
      prompts: 0,
      terms: 0,
      playbooks: 0,
      skills: 0,
      flows: 0,
      projects: 0,
      packs: 0,
    })
    expect(Object.keys(res.json as object).sort()).toEqual(NAV_KEYS)
    expect(NavCountsOut.safeParse(res.json).success).toBe(true)
  })

  it('IT-NAV-02: 有数据时逐格命中，且与各列表端点的 total 对齐', async () => {
    const h = await makeHarness()
    seedRows(h)

    const res = await api(h, '/api/nav-counts')
    expect(res.statusCode).toBe(200)
    expect(res.json).toEqual({
      prompts: 2,
      terms: 1,
      playbooks: 1,
      skills: 1,
      flows: 1,
      projects: 2, // 归档那 1 个不进角标
      packs: 1,
    })

    // 与列表端点逐项对账（projects 走默认口径：不含归档）
    const totalOf = async (url: string): Promise<number> => {
      const r = await api(h, url)
      return (r.json as { total: number }).total
    }
    expect((res.json as NavCountsOut).prompts).toBe(await totalOf('/api/prompts'))
    expect((res.json as NavCountsOut).terms).toBe(await totalOf('/api/terms'))
    expect((res.json as NavCountsOut).playbooks).toBe(await totalOf('/api/playbooks'))
    expect((res.json as NavCountsOut).skills).toBe(await totalOf('/api/skills'))
    expect((res.json as NavCountsOut).flows).toBe(await totalOf('/api/flow-templates'))
    expect((res.json as NavCountsOut).projects).toBe(await totalOf('/api/projects'))
    expect((res.json as NavCountsOut).packs).toBe(await totalOf('/api/packs'))

    // 归档项确实存在，只是两侧都看不见。注意既有事实：`?status=all` 只是「不再额外筛选」，
    // 它并不把归档项目放回来（projects.ts:51-61 里 items 源自 list()，默认已滤掉归档），
    // 所以这里断言 2 而不是 3——角标与列表默认值同口径，正是本端点要守的。
    const archived = await api(h, '/api/projects?status=archived')
    expect((archived.json as { total: number }).total).toBe(1)
    const all = await api(h, '/api/projects?status=all')
    expect((all.json as { total: number }).total).toBe(2)
    const inDb = (
      h.handle.db.prepare("SELECT COUNT(*) AS c FROM projects WHERE status = 'archived'").get() as {
        c: number
      }
    ).c
    expect(inDb).toBe(1)
  })

  it('IT-NAV-03: 缺令牌 401', async () => {
    const h = await makeHarness()
    const anon = await h.app.inject({ method: 'GET', url: '/api/nav-counts' })
    expect(anon.statusCode).toBe(401)
  })
})
