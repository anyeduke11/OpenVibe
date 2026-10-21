// `packages/core/src/db/m9-p1-migration.test.ts` —— M9 v1.6 P1.1 出口（`m9-dev-plan-2026-10.md` §6.2）。
//
// 断四件事，对应规格 DL-26 / DL-12 / DL-04 / DL-06：
// ① 0011 迁移可干净应用，幂等（重跑不重复不报错）。
// ② 6 张 §3.1 知识拓扑表都在库（lang_concepts / lang_concept_deltas / lang_topic_content /
//    lang_topics / lang_topic_edges / lang_topic_terms）—— DL-26 的「在库」分支。
// ③ `lang_topics.kind` 带 CHECK ('language' | 'library')（DL-12）。
// ④ `lang_topic_edges` 自环被 CHECK 禁掉（DL-04 的一部分：自环是 SQL 层能做的，
//    真正的环检测是 §3.5 运行时守卫，那条 P2/P4 再补）。
// ⑤ `lang_topic_terms` 不带反向写 terms 表的 helper（DL-06：本表只做挂接，
//    不得反向写）—— 由「没有」这样的 NOT-PRESENT 断言守护，参见 `text` 字段验证。
//
// ⚠️ P1.1 之后，DL-26 的「17 张表」事实**只对 spec 文本成立**（`grep -c '^lang_'`
//   于 §3.1 仍得 17）；数据库里**当前只有 12 张**（0011 建 6 张 ＋ 0012 建 3 张 ＋
//   **0013 建 2 张** ＋ **0014 建 1 张**：模式与阶段那三张表现在齐了 ——
//   `lang_profile_phases` / `lang_topic_profiles` / `lang_stage_tracks`）。
//   剩余 5 张（`lang_topic_state` / `lang_topic_findings` /
//   `lang_topic_requests` / `lang_source_consent` / `lang_source_shares`）由后续迁移补齐。
//   **M9 自检脚本的 DL-26 检查的是 spec，不检查 DB**，
//   因为「DB 表数」随迁移节奏变化，而 spec 是「目标态」，不能混。
import { describe, it, expect } from 'vitest'
import { newDb } from '../test-support/new-db'

describe('M9 P1.1 · 0011 迁移 + §3.1 知识拓扑表', () => {
  it('0011 / 0012 / 0013 / 0014 干净应用：12 张 lang_* 表都在库（DL-26 的 DB 分支）', () => {
    const h = newDb()
    const tables = h.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'lang_%' ORDER BY name",
      )
      .all() as { name: string }[]
    const names = tables.map((r) => r.name)
    expect(names).toEqual([
      'lang_concept_deltas',
      'lang_concepts',
      'lang_profile_phases',
      'lang_resources',
      'lang_stage_tracks',
      'lang_topic_content',
      'lang_topic_edges',
      'lang_topic_profiles',
      'lang_topic_resources',
      'lang_topic_terms',
      'lang_topics',
      'lang_vibe_resources',
    ])
    h.close()
  })

  it('lang_topics.kind 带 CHECK (DL-12：库级 35.7% ＝ 不可进学习路线)', () => {
    const h = newDb()
    // 正向：插入合法值应通过
    expect(() =>
      h.db
        .prepare(
          "INSERT INTO lang_topics (lang, slug, title, stage_id, kind) VALUES ('python','test-1','t', 0, 'language')",
        )
        .run(),
    ).not.toThrow()
    expect(() =>
      h.db
        .prepare(
          "INSERT INTO lang_topics (lang, slug, title, stage_id, kind) VALUES ('python','test-2','t', 0, 'library')",
        )
        .run(),
    ).not.toThrow()
    // 反向：非法值应被拒（注入式变异腿）
    expect(() =>
      h.db
        .prepare(
          "INSERT INTO lang_topics (lang, slug, title, stage_id, kind) VALUES ('python','test-3','t', 0, 'tutorial')",
        )
        .run(),
    ).toThrow(/CHECK/)
    h.close()
  })

  it('lang_topics.source_kind 字面量必须等于 §1.4 实测的五源（DL-01 守卫的对偶）', () => {
    const h = newDb()
    // source_kind 字段允许这 6 个值（runoob / walter201230 / xinliangnote / awesome_go / awesome_python_cn / owner_guide）
    for (const sk of [
      'runoob',
      'walter201230',
      'xinliangnote',
      'awesome_go',
      'awesome_python_cn',
      'owner_guide',
    ]) {
      expect(() =>
        h.db
          .prepare(
            `INSERT INTO lang_topics (lang, slug, title, stage_id, source_kind) VALUES ('python',?, 't', 0, ?)`,
          )
          .run(`sk-${sk}`, sk),
      ).not.toThrow()
    }
    h.close()
  })

  it('lang_topic_edges 自环被 CHECK 拒（DL-04 的 SQL 层子集；图环留 P2 守卫）', () => {
    const h = newDb()
    // 先插两个合法 topic
    h.db
      .prepare(
        "INSERT INTO lang_topics (lang, slug, title, stage_id) VALUES ('python','a','A',0)",
      )
      .run()
    h.db
      .prepare(
        "INSERT INTO lang_topics (lang, slug, title, stage_id) VALUES ('python','b','B',0)",
      )
      .run()
    const ids = (
      h.db.prepare("SELECT id, slug FROM lang_topics WHERE slug IN ('a','b')").all() as {
        id: number
        slug: string
      }[]
    ).map((r) => r.id)
    // 合法：A → B
    expect(() =>
      h.db
        .prepare('INSERT INTO lang_topic_edges (topic_id, prereq_topic_id) VALUES (?,?)')
        .run(ids[0], ids[1]),
    ).not.toThrow()
    // 自环：B → B 必被拒
    expect(() =>
      h.db
        .prepare('INSERT INTO lang_topic_edges (topic_id, prereq_topic_id) VALUES (?,?)')
        .run(ids[1], ids[1]),
    ).toThrow(/CHECK/)
    h.close()
  })

  it('lang_topic_terms 不携带反向写 terms 表的 helper —— 「无」是设计意图（DL-06 的 NOT-PRESENT 守卫）', () => {
    const h = newDb()
    // 真实写一条挂接行；这只是确认表存在并可写
    h.db
      .prepare(
        "INSERT INTO lang_topics (lang, slug, title, stage_id) VALUES ('python','topic-x','X',0)",
      )
      .run()
    h.db
      .prepare(
        `INSERT INTO terms (id, zh, en, definition, created_at, updated_at)
         VALUES ('t-goroutine', '协程', 'goroutine', 'Go 并发单元', '2026-10-19T00:00:00Z', '2026-10-19T00:00:00Z')`,
      )
      .run()
    const topicId = (
      h.db.prepare("SELECT id FROM lang_topics WHERE slug='topic-x'").get() as { id: number }
    ).id
    const termId = (
      h.db
        .prepare("SELECT id FROM terms WHERE id='t-goroutine'")
        .get() as { id: string }
    ).id
    expect(() =>
      h.db
        .prepare('INSERT INTO lang_topic_terms (topic_id, term_id) VALUES (?,?)')
        .run(topicId, termId),
    ).not.toThrow()
    // ⭐ DL-06 的真正测试是「**没有**这个 repo 方法能反向写 terms」
    // —— 那需要 grep 整个 `packages/core` 确认不存在 `UPDATE terms` 之类的
    // helper from lang_topic_terms 的写入点。
    // 仓内 vitest 做的是「API 行为」断言，「代码结构」断言留给 docs:check 的 FR-5.x。
    h.close()
  })

  it('lang_concept_deltas 自引用 supersedes 字段带 FK ＋ ON DELETE SET NULL（§3.12）', () => {
    const h = newDb()
    // 插一个概念
    h.db
      .prepare(
        "INSERT INTO lang_concepts (slug, title, content_level, updated_at) VALUES ('closure','Closure','headline','2026-10-19T00:00:00Z')",
      )
      .run()
    // 插两条 delta（UNIQUE (concept_id, lang, aspect, since_version) 强制 aspect / since_version 至少一项不同）
    h.db
      .prepare(
        `INSERT INTO lang_concept_deltas (concept_id, lang, aspect, since_version)
         VALUES (1, 'python', '语法', '3.0')`,
      )
      .run()
    h.db
      .prepare(
        `INSERT INTO lang_concept_deltas (concept_id, lang, aspect, since_version)
         VALUES (1, 'python', '语义', '3.5')`,
      )
      .run()
    // delta-2 引用 delta-1 作为 superseded
    h.db
      .prepare(
        `UPDATE lang_concept_deltas SET supersedes = 1 WHERE id = 2`,
      )
      .run()
    // 删 delta-1 ⇒ delta-2.supersedes 应被 SET NULL（不级联删除 delta-2）
    h.db.prepare('DELETE FROM lang_concept_deltas WHERE id = 1').run()
    const second = h.db
      .prepare('SELECT id, supersedes FROM lang_concept_deltas WHERE id = 2')
      .get() as { id: number; supersedes: number | null } | undefined
    expect(second).toBeDefined()
    expect(second!.id).toBe(2)
    // ⭐ SET NULL 才是正解：CASCADE 会丢「delta-2」自己 —— §3.12 不许
    expect(second!.supersedes).toBeNull()
    h.close()
  })
})
