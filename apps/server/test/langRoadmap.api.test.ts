// `apps/server/test/langRoadmap.api.test.ts` —— M9 v1.6 **P3 的两个读端点**
// （`m9-dev-plan-2026-10.md` §6.9 P3.2 / P3.3 · `m9-dev-language-roadmap.md` §3.5）
//
// ## 它断什么
//
// ① **出参必须过 shared 的 zod 契约**（`RoadmapOut` / `TopicDetailOut`）——
//   web 与 server 只经 HTTP 交互 ⇒ 形状必须先有出处，否则两处各写一份就会漂。
// ② **参数校验**：`lang` 必须是 python/go；`id` 必须是正整数；知识点不存在 ⇒ 404。
// ③ **`?project=` 真的改变状态**（掌握度永远是「某个项目的行为证据」，§2.2）。
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { newDb, type TestDbHandle } from '@openvibe/core/test-support'
import { buildApp } from '../src/app'
import { RoadmapOut, TopicDetailOut } from '@openvibe/shared'

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

function api(h: Harness, url: string) {
  return h.app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${TOKEN}` } })
}

function addProject(db: TestDbHandle['db'], id: string): void {
  db.prepare(
    `INSERT INTO projects (id, name, stages_snapshot, status, created_at, updated_at)
     VALUES (?, ?, '[]', 'active', '2026-10-21T00:00:00.000Z', '2026-10-21T00:00:00.000Z')`,
  ).run(id, `测试项目 ${id}`)
}

function addTopic(
  db: TestDbHandle['db'],
  slug: string,
  title: string,
  stageId: number,
  kind: 'language' | 'library' = 'language',
): number {
  db.prepare(
    `INSERT INTO lang_topics (lang, slug, title, summary, stage_id, kind)
     VALUES ('python', ?, ?, '', ?, ?)`,
  ).run(slug, title, stageId, kind)
  const row = db.prepare('SELECT id FROM lang_topics WHERE slug = ?').get(slug) as { id: number }
  return row.id
}

function addState(
  db: TestDbHandle['db'],
  topicId: number,
  projectId: string,
  state: 'active' | 'mastered',
): void {
  db.prepare(
    `INSERT INTO lang_topic_state (topic_id, project_id, state, evidence_kind, evidence_ref, computed_at)
     VALUES (?, ?, ?, 'task', 'task-1', '2026-10-21T00:00:00.000Z')`,
  ).run(topicId, projectId, state)
}

describe('M9 P3 · GET /api/lang/roadmap', () => {
  it('出参过 shared 的 zod 契约，且库级条目不进路线（DL-12）', async () => {
    const h = await makeHarness()
    addTopic(h.handle.db, 'py-syntax', '基本语法', 0)
    addTopic(h.handle.db, 'py-os', 'os 模块', 0, 'library')

    const res = await api(h, '/api/lang/roadmap?lang=python')

    expect(res.statusCode).toBe(200)
    const parsed = RoadmapOut.safeParse(res.json())
    expect(parsed.success).toBe(true)
    expect(parsed.data?.topic_count).toBe(1)
    expect(parsed.data?.stations[0]?.stage_no).toBe(1)
  })

  it('缺 lang ⇒ 422（不猜语言）', async () => {
    const h = await makeHarness()
    const res = await api(h, '/api/lang/roadmap')
    expect(res.statusCode).toBe(422)
  })

  it('lang 不在闭集里 ⇒ 422', async () => {
    const h = await makeHarness()
    const res = await api(h, '/api/lang/roadmap?lang=rust')
    expect(res.statusCode).toBe(422)
  })

  it('?project= 真的改变状态（掌握度是某个项目的行为证据）', async () => {
    const h = await makeHarness()
    addProject(h.handle.db, 'p1')
    addProject(h.handle.db, 'p2')
    const id = addTopic(h.handle.db, 'py-syntax', '基本语法', 0)
    addState(h.handle.db, id, 'p1', 'active')
    addState(h.handle.db, id, 'p2', 'mastered')

    const all = await api(h, '/api/lang/roadmap?lang=python')
    const p1 = await api(h, '/api/lang/roadmap?lang=python&project=p1')
    const p2 = await api(h, '/api/lang/roadmap?lang=python&project=p2')

    expect(RoadmapOut.parse(all.json()).stations[0]?.topics[0]?.state).toBe('mastered')
    expect(RoadmapOut.parse(p1.json()).stations[0]?.topics[0]?.state).toBe('active')
    expect(RoadmapOut.parse(p2.json()).stations[0]?.topics[0]?.state).toBe('mastered')
  })
})

describe('M9 P3 · GET /api/lang/topics/:id', () => {
  it('出参过 shared 的 zod 契约（三段缺哪段是 null）', async () => {
    const h = await makeHarness()
    const id = addTopic(h.handle.db, 'py-list', '列表', 1)
    h.handle.db
      .prepare(
        `INSERT INTO lang_topic_content (ref_kind, ref_id, kind, body_md, updated_at)
         VALUES ('topic', ?, 'steps', '先建空列表', '2026-10-21T00:00:00.000Z')`,
      )
      .run(id)

    const res = await api(h, `/api/lang/topics/${String(id)}`)

    expect(res.statusCode).toBe(200)
    const parsed = TopicDetailOut.safeParse(res.json())
    expect(parsed.success).toBe(true)
    expect(parsed.data?.content.steps).toBe('先建空列表')
    expect(parsed.data?.content.example).toBeNull()
    expect(parsed.data?.content.principle).toBeNull()
  })

  it('知识点不存在 ⇒ 404', async () => {
    const h = await makeHarness()
    const res = await api(h, '/api/lang/topics/999')
    expect(res.statusCode).toBe(404)
  })

  it('id 不是正整数 ⇒ 422', async () => {
    const h = await makeHarness()
    const res = await api(h, '/api/lang/topics/abc')
    expect(res.statusCode).toBe(422)
  })
})
