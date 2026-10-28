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
  h.db
    .prepare(
      `INSERT INTO projects (id, name, stages_snapshot, status, local_path, created_at, updated_at)
     VALUES ('p1', '测试项目', '[]', 'active', '/tmp/p1', '2026-10-21T00:00:00.000Z', '2026-10-21T00:00:00.000Z')`,
    )
    .run()
  h.db
    .prepare(
      `INSERT INTO lang_topics (id, lang, slug, title, summary, stage_id, kind)
     VALUES (1, 'python', 'py-a', 'A', '', 0, 'language')`,
    )
    .run()
  h.db
    .prepare(
      `INSERT INTO lang_topic_profiles (topic_id, profile, depth, required, rank, est_minutes)
     VALUES (1, 'master', 'full', 1, 1, 60),
            (1, 'vibe', 'headline', 1, 1, 10)`,
    )
    .run()
  h.db
    .prepare(
      `INSERT INTO lang_resources (id, lang, name, url, category, tier, level_label, price, lang_label)
     VALUES (1, 'python', '资源一', 'https://example.com/1', 'official', 'a', '0', 'free', 'zh')`,
    )
    .run()
  h.db
    .prepare(
      `INSERT INTO lang_topic_resources (topic_id, resource_id, role) VALUES (1, 1, 'primary')`,
    )
    .run()
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

// ---------------------------------------------------------------------------
// P1g · §3.21 阶段 → 推荐模式（阶段选择的落点 ＋ 生效模式的优先级）
// ---------------------------------------------------------------------------

/** 阶段 1 的 Python 轨道（推荐档＝「熟悉」）＋ 阶段 3 的 Python 轨道（推荐档＝「精通」）。 */
function seedTracks(h: TestDbHandle): void {
  h.db
    .prepare(
      `INSERT INTO lang_stage_tracks
         (stage_id, lang, source_mode, mode_name, profile, stage_name, period, goals, required, is_default, note)
       VALUES (1, 'python', 'fam', '熟悉', 'familiar', '阶段 1 · 评测基本功', '第 4–9 个月', '[]', 1, 1, NULL)`,
    )
    .run()
  h.db
    .prepare(
      `INSERT INTO lang_stage_tracks
         (stage_id, lang, source_mode, mode_name, profile, stage_name, period, goals, required, is_default, note)
       VALUES (3, 'python', 'mas', '精通', 'master', '阶段 3 · 专家化', '第 16–24 个月', '[]', 1, 1, NULL)`,
    )
    .run()
}

describe('M9 P1g · POST /api/lang/modes/stage（§3.21 阶段选择的落点）', () => {
  it('① 记一次阶段 ⇒ 读回来是同一个值（**持久化**，落 app_meta）', async () => {
    const h = await makeHarness()
    seedTracks(h.handle)

    const post = await h.app.inject({
      method: 'POST',
      url: '/api/lang/modes/stage',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { stage: 1 },
    })
    expect(post.statusCode).toBe(200)

    const res = await h.app.inject({
      method: 'GET',
      url: '/api/lang/modes',
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    const body = res.json() as { stage_choice: number | null }
    expect(body.stage_choice).toBe(1)
  })

  it('② ⚠️ 阶段选择**不进 `lang_*`**（§3.19 第 3 条的同款纪律）', async () => {
    const h = await makeHarness()
    seedTracks(h.handle)

    const before = h.handle.db.prepare('SELECT COUNT(*) AS n FROM lang_topic_state').get() as {
      n: number
    }
    await h.app.inject({
      method: 'POST',
      url: '/api/lang/modes/stage',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { stage: 1 },
    })
    const after = h.handle.db.prepare('SELECT COUNT(*) AS n FROM lang_topic_state').get() as {
      n: number
    }
    expect(after.n).toBe(before.n)
    const meta = h.handle.db
      .prepare("SELECT value FROM app_meta WHERE key = 'langStageChoice'")
      .get() as { value: string } | undefined
    expect(meta?.value).toBe('1')
  })

  it('③ 越界阶段 ⇒ 422（不是静默忽略）', async () => {
    const h = await makeHarness()
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/lang/modes/stage',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { stage: 9 },
    })
    expect(res.statusCode).toBe(422)
  })

  it('④ ⚠️ 选阶段**不会**改掉用户已自选的模式（自选优先，§3.21）', async () => {
    const h = await makeHarness()
    seedTracks(h.handle)
    await h.app.inject({
      method: 'POST',
      url: '/api/lang/modes/choice',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { choice: 'vibe' },
    })
    await h.app.inject({
      method: 'POST',
      url: '/api/lang/modes/stage',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { stage: 3 },
    })

    const res = await h.app.inject({
      method: 'GET',
      url: '/api/lang/modes',
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    const body = res.json() as {
      effective_profile: { profile: string; source: string; differs_from_recommendation: boolean }
    }
    expect(body.effective_profile.profile).toBe('vibe')
    expect(body.effective_profile.source).toBe('user')
    // ⚠️ 推荐仍然是「精通」⇒ 界面据此提示「你覆盖了推荐」
    expect(body.effective_profile.differs_from_recommendation).toBe(true)
  })
})

describe('M9 P1g · 生效模式（阶段推荐 ⇒ 用户可改）', () => {
  it('① 没有自选 ⇒ 生效档来自阶段推荐（阶段 1 ⇒ 熟悉）', async () => {
    const h = await makeHarness()
    seedTracks(h.handle)
    await h.app.inject({
      method: 'POST',
      url: '/api/lang/modes/stage',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { stage: 1 },
    })

    const res = await h.app.inject({
      method: 'GET',
      url: '/api/lang/modes',
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    const body = res.json() as {
      effective_profile: { profile: string; source: string }
    }
    expect(body.effective_profile.profile).toBe('familiar')
    expect(body.effective_profile.source).toBe('stage')
  })

  it('② ⚠️ 「熟悉」这一档**能落库**（阶段推荐可能落在它身上）', async () => {
    const h = await makeHarness()
    const post = await h.app.inject({
      method: 'POST',
      url: '/api/lang/modes/choice',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { choice: 'familiar' },
    })
    expect(post.statusCode).toBe(200)
    const meta = h.handle.db
      .prepare("SELECT value FROM app_meta WHERE key = 'langModeChoice'")
      .get() as { value: string } | undefined
    expect(meta?.value).toBe('"familiar"')
  })

  it('③ 既没自选也没进阶段 ⇒ 尚未选定（**不是**默默按精通算）', async () => {
    const h = await makeHarness()
    const res = await h.app.inject({
      method: 'GET',
      url: '/api/lang/modes',
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    const body = res.json() as {
      effective_profile: { profile: string | null; source: string }
    }
    expect(body.effective_profile.profile).toBeNull()
    expect(body.effective_profile.source).toBe('unset')
  })
})
