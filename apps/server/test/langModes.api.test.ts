import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { newDb, type TestDbHandle } from '@openvibe/core/test-support'
import { buildApp } from '../src/app'

/**
 * M9 **增强 6** · 模式层的端点（`GET /api/lang/modes` ＋ `POST /api/lang/modes/choice`）
 * （`m9-dev-language-roadmap.md` §3.18 / §3.19 / §3.20 / §3.21）
 *
 * ## 它断什么
 *
 * | 判据 | 一句话 | 对应的那支 |
 * |---|---|---|
 * | **§3.19** | 模式选择**只问一次**（落点**不进 `lang_*`**） | 「模式选择」组 |
 * | **§3.18/20/21** | 模式层的行**读得到**（P1e/P1f 四个界面件靠它挂载） | 「模式数据」组 |
 */
const TOKEN = 'test-token'

interface Harness {
  app: FastifyInstance
  handle: TestDbHandle
}

const openHandles: Harness[] = []

afterEach(() => {
  while (openHandles.length > 0) {
    const h = openHandles.pop()
    void h?.app.close()
    h?.handle.close()
  }
})

async function makeHarness(): Promise<Harness> {
  const handle = newDb()
  const { app } = await buildApp({ db: handle.db, token: TOKEN })
  const harness = { app, handle }
  openHandles.push(harness)
  return harness
}

function seed(h: TestDbHandle): void {
  h.db.prepare(
    `INSERT INTO projects (id, name, stages_snapshot, status, local_path, created_at, updated_at)
     VALUES ('p1', '测试项目', '[]', 'active', '/tmp/p1', '2026-10-21T00:00:00.000Z', '2026-10-21T00:00:00.000Z')`,
  ).run()
  h.db.prepare(
    `INSERT INTO lang_topics (id, lang, slug, title, summary, stage_id, kind)
     VALUES (1, 'python', 'py-a', 'A', '', 0, 'language')`,
  ).run()
  h.db.prepare(
    `INSERT INTO lang_topic_profiles (topic_id, profile, depth, required, rank, est_minutes)
     VALUES (1, 'master', 'full', 1, 1, 60),
            (1, 'vibe', 'headline', 1, 1, 10)`,
  ).run()
  h.db.prepare(
    `INSERT INTO lang_resources (id, lang, name, url, category, tier, level_label, price, lang_label)
     VALUES (1, 'python', '资源一', 'https://example.com/1', 'official', 'a', '0', 'free', 'zh')`,
  ).run()
  h.db.prepare(
    `INSERT INTO lang_topic_resources (topic_id, resource_id, role) VALUES (1, 1, 'primary')`,
  ).run()
}

describe('M9 增强 6 · GET /api/lang/modes', () => {
  it('① 一次给全量：模式行 · 知识点 · 资源挂接 · 已点亮', async () => {
    const h = await makeHarness()
    seed(h.handle)

    const res = await h.app.inject({
      method: 'GET',
      url: '/api/lang/modes?project=p1',
      headers: { authorization: `Bearer ${TOKEN}` },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json() as {
      mode_choice: string | null
      profiles: { topic_id: number; profile: string }[]
      topics: { slug: string }[]
      resources: { id: number; topic_ids: number[] }[]
      lit_topic_ids: number[]
    }
    expect(body.mode_choice).toBeNull()
    // ⚠️ 复合主键 ⇒ 同一知识点两个模式各一行
    expect(body.profiles).toHaveLength(2)
    expect(body.topics).toHaveLength(1)
    // ⚠️ 资源挂接是**反着查**的
    expect(body.resources[0]?.topic_ids).toEqual([1])
    expect(body.lit_topic_ids).toEqual([])
  })

  it('② 没给项目 ⇒ 没有「已点亮」那批（**空数组**，不是 null）', async () => {
    const h = await makeHarness()
    seed(h.handle)

    const res = await h.app.inject({
      method: 'GET',
      url: '/api/lang/modes',
      headers: { authorization: `Bearer ${TOKEN}` },
    })

    const body = res.json() as { lit_topic_ids: number[] }
    expect(body.lit_topic_ids).toEqual([])
  })
})

describe('M9 增强 6 · POST /api/lang/modes/choice（§3.19 只问一次）', () => {
  it('① 记一次 ⇒ 读回来是同一个值（**持久化**，不是组件本地 state）', async () => {
    const h = await makeHarness()
    seed(h.handle)

    const post = await h.app.inject({
      method: 'POST',
      url: '/api/lang/modes/choice',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { choice: 'master' },
    })
    expect(post.statusCode).toBe(200)

    const res = await h.app.inject({
      method: 'GET',
      url: '/api/lang/modes',
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    expect((res.json() as { mode_choice: string | null }).mode_choice).toBe('master')
  })

  it('② ⚠️ 选择**不进 `lang_*`**（§3.19 第 3 条：模式不得影响掌握度）', async () => {
    const h = await makeHarness()
    seed(h.handle)

    const before = h.handle.db.prepare('SELECT COUNT(*) AS n FROM lang_topic_state').get() as {
      n: number
    }
    await h.app.inject({
      method: 'POST',
      url: '/api/lang/modes/choice',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { choice: 'vibe' },
    })
    const after = h.handle.db.prepare('SELECT COUNT(*) AS n FROM lang_topic_state').get() as {
      n: number
    }
    expect(after.n).toBe(before.n)
    // ⚠️ 落点是 `app_meta`（跨进程 KV 的归口），**不是**任何 `lang_` 表
    const meta = h.handle.db
      .prepare("SELECT value FROM app_meta WHERE key = 'langModeChoice'")
      .get() as { value: string } | undefined
    expect(meta?.value).toBe('"vibe"')
  })

  it('③ 非法取值 ⇒ 422', async () => {
    const h = await makeHarness()
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/lang/modes/choice',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { choice: '随便' },
    })
    expect(res.statusCode).toBe(422)
  })
})
