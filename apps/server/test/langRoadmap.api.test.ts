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

describe('M9 · GET /api/lang/resources（owner 2026-10-22：独立资源页 ＋ 支持筛选）', () => {
  /** 资源页要的数据：知识点 · 模式行 · 资源 · 挂接。 */
  function seedResources(db: TestDbHandle['db']): void {
    db.prepare(
      `INSERT INTO lang_topics (id, lang, slug, title, summary, stage_id, kind)
       VALUES (1, 'python', 'py-a', '知识点 A', '', 0, 'language'),
              (2, 'python', 'py-b', '知识点 B', '', 1, 'language')`,
    ).run()
    db.prepare(
      `INSERT INTO lang_topic_profiles (topic_id, profile, depth, required, rank, est_minutes)
       VALUES (1, 'master', 'full', 1, 1, 60),
              (1, 'vibe', 'headline', 1, 1, 10),
              (2, 'master', 'concept', 0, 2, NULL)`,
    ).run()
    db.prepare(
      `INSERT INTO lang_resources (id, lang, name, url, category, tier, level_label, price, lang_label, summary)
       VALUES (1, 'python', '官方文档', 'https://docs.python.org', 'official', 'a', '0', 'free', 'zh', 'Python 官方手册'),
              (2, 'go', 'Go 入门课', 'https://go.dev/tour', 'course', 'b', '1', 'free', 'en', 'Go 官方入门'),
              (3, 'python', '刷题仓库', 'https://github.com/example/practice', 'github', 'c', '1', 'free', 'zh', '练习题')`,
    ).run()
    db.prepare(
      `INSERT INTO lang_topic_resources (topic_id, resource_id, role)
       VALUES (1, 1, 'primary'),
              (2, 3, 'practice')`,
    ).run()
  }

  it('返回**全量**资源 ＋ 每条的**模式标记**（两档）', async () => {
    const h = await makeHarness()
    seedResources(h.handle.db)
    const res = await api(h, '/api/lang/resources')
    expect(res.statusCode).toBe(200)
    const body = res.json() as {
      total: number
      profile: string
      resources: { id: number; mode_label: string; topic_ids: number[] }[]
    }
    expect(body.total).toBe(3)
    expect(body.profile).toBe('master')
    expect(body.resources).toHaveLength(3)
    // 知识点 1 在精通里是必学 ⇒ 资源 1 是「本模式必学」
    expect(body.resources.find((r) => r.id === 1)?.mode_label).toBe('本模式必学')
    // 资源 2 没挂知识点 ⇒ 仅扩展阅读
    expect(body.resources.find((r) => r.id === 2)?.mode_label).toBe('仅扩展阅读')
  })

  it('**分类筛选** ⇒ 只留该分类（`total` 仍是筛选前的数）', async () => {
    const h = await makeHarness()
    seedResources(h.handle.db)
    const res = await api(h, '/api/lang/resources?category=github')
    const body = res.json() as { total: number; resources: { id: number }[] }
    expect(body.resources.map((r) => r.id)).toEqual([3])
    expect(body.total).toBe(3)
  })

  it('**关键字筛选**（大小写不敏感）', async () => {
    const h = await makeHarness()
    seedResources(h.handle.db)
    const res = await api(h, '/api/lang/resources?q=GO')
    const body = res.json() as { resources: { id: number }[] }
    expect(body.resources.map((r) => r.id)).toEqual([2])
  })

  it('**模式标记筛选** ⇒ 只留该档', async () => {
    const h = await makeHarness()
    seedResources(h.handle.db)
    const res = await api(h, `/api/lang/resources?mode=${encodeURIComponent('本模式必学')}`)
    const body = res.json() as { resources: { id: number }[] }
    expect(body.resources.map((r) => r.id)).toEqual([1])
  })

  it('⚠️ **模式缺省 ⇒ 用用户的选择**（选了速成就不能被悄悄换成精通）', async () => {
    const h = await makeHarness()
    seedResources(h.handle.db)
    const chosen = await h.app.inject({
      method: 'POST',
      url: '/api/lang/modes/choice',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { choice: 'vibe' },
    })
    expect(chosen.statusCode).toBe(200)
    const res = await api(h, '/api/lang/resources')
    const body = res.json() as { mode_choice: string | null; profile: string }
    expect(body.mode_choice).toBe('vibe')
    expect(body.profile).toBe('vibe')
  })

  it('筛选参数非法（如 mode 不在闭集）⇒ **422**（不静默忽略）', async () => {
    const h = await makeHarness()
    const res = await api(h, '/api/lang/resources?mode=%E4%B8%8D%E5%AD%98%E5%9C%A8')
    expect(res.statusCode).toBe(422)
  })
})

describe('M9 · GET /api/lang/resources · 更多筛选维度 ＋ 速成专区分区', () => {
  function seedExtra(db: TestDbHandle['db']): void {
    db.prepare(
      `INSERT INTO lang_topics (id, lang, slug, title, summary, stage_id, kind)
       VALUES (1, 'python', 'py-a', '知识点 A', '', 0, 'language')`,
    ).run()
    db.prepare(
      `INSERT INTO lang_topic_profiles (topic_id, profile, depth, required, rank, est_minutes)
       VALUES (1, 'master', 'full', 1, 1, 60)`,
    ).run()
    db.prepare(
      `INSERT INTO lang_resources
         (id, lang, name, url, category, tier, level_label, price, lang_label, is_fav, summary,
          last_checked_at, consecutive_fails, alive)
       VALUES (1, 'python', '免费中文课', 'https://example.com/1', 'course', 'a', '0', 'free', 'zh', 1,
               '免费的', '2026-10-20', 0, 1),
              (2, 'python', '付费英文课', 'https://example.com/2', 'course', 'b', '1', 'paid', 'en', 0,
               '付费的', '2026-10-18', 2, 0)`,
    ).run()
    db.prepare(
      `INSERT INTO lang_vibe_resources (id, "group", name, url, summary, last_checked_at)
       VALUES (1, 'tools', 'Cursor 官方指引', 'https://cursor.com/docs', 'AI 工具指引', '2026-10-19')`,
    ).run()
  }

  it('**费用 / 界面语言 / 失效 / 精选**四个维度都能筛', async () => {
    const h = await makeHarness()
    seedExtra(h.handle.db)
    const price = await api(h, '/api/lang/resources?price=free')
    expect((price.json() as { resources: { id: number }[] }).resources.map((r) => r.id)).toEqual([1])
    const label = await api(h, '/api/lang/resources?lang_label=en')
    expect((label.json() as { resources: { id: number }[] }).resources.map((r) => r.id)).toEqual([2])
    const dead = await api(h, '/api/lang/resources?alive=dead')
    expect((dead.json() as { resources: { id: number }[] }).resources.map((r) => r.id)).toEqual([2])
    const fav = await api(h, '/api/lang/resources?fav=1')
    expect((fav.json() as { resources: { id: number }[] }).resources.map((r) => r.id)).toEqual([1])
  })

  it('每条带**巡检信息**（巡检日 ＋ 连续失败次数）', async () => {
    const h = await makeHarness()
    seedExtra(h.handle.db)
    const res = await api(h, '/api/lang/resources')
    const body = res.json() as {
      resources: { id: number; last_checked_at: string | null; consecutive_fails: number }[]
    }
    const dead = body.resources.find((r) => r.id === 2)
    expect(dead?.last_checked_at).toBe('2026-10-18')
    expect(dead?.consecutive_fails).toBe(2)
  })

  it('⚠️ **速成专区是独立分区**：只受关键字影响，**维度筛选不作用**（§3.21）', async () => {
    const h = await makeHarness()
    seedExtra(h.handle.db)
    // ⚠️ **用「分类 = course」筛**：主清单被筛掉，但**速成专区那 11 条不该被编造维度**
    const res = await api(h, '/api/lang/resources?category=course')
    const body = res.json() as { resources: { id: number }[]; vibe_resources: { id: number }[] }
    expect(body.resources.map((r) => r.id)).toEqual([1, 2])
    // 速成专区**不受**分类筛选影响（它没有分类这个维度）
    expect(body.vibe_resources.map((r) => r.id)).toEqual([1])
  })

  it('速成专区**受关键字影响**（关键字是搜索，不是维度）', async () => {
    const h = await makeHarness()
    seedExtra(h.handle.db)
    const res = await api(h, '/api/lang/resources?q=cursor')
    const body = res.json() as { resources: { id: number }[]; vibe_resources: { id: number }[] }
    expect(body.resources).toHaveLength(0)
    expect(body.vibe_resources.map((r) => r.id)).toEqual([1])
  })
})
