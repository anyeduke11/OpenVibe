import { describe, expect, it } from 'vitest'
import { newDb, type TestDbHandle } from '../test-support/new-db'
import {
  readLitTopicIds,
  readResourcesWithTopics,
  readTopicProfiles,
  readTopicStages,
} from './m9-mode-read'

/**
 * M9 **增强 6** · P1e / P1f 的读端（`m9-mode-read.ts`）
 *
 * ## 它断什么
 *
 * P1e/P1f 的四个界面件一直**没挂载**，根因是读端**没有「模式相关的行」这一层**。
 * ⇒ 本文件断的是这一层真的取得到、且**取的是该取的**：
 * - 模式表**复合主键**（`topic_id` + `profile`）⇒ 行不能塌；
 * - 资源挂接是「知识点 → 资源」⇒ 读端**反着查**；
 * - 「已点亮」= **不是 `unused`**（`active` 与 `mastered` 都算）。
 */
function seed(h: TestDbHandle): void {
  h.db.prepare(
    `INSERT INTO projects (id, name, stages_snapshot, status, local_path, created_at, updated_at)
     VALUES ('p1', '测试项目', '[]', 'active', '/tmp/p1', '2026-10-21T00:00:00.000Z', '2026-10-21T00:00:00.000Z')`,
  ).run()
  h.db.prepare(
    `INSERT INTO lang_topics (id, lang, slug, title, summary, stage_id, kind)
     VALUES (1, 'python', 'py-a', 'A', '', 0, 'language'),
            (2, 'python', 'py-b', 'B', '', 1, 'language'),
            (3, 'go', 'go-a', 'G', '', 0, 'library')`,
  ).run()
  h.db.prepare(
    `INSERT INTO lang_topic_profiles (topic_id, profile, depth, required, rank, est_minutes)
     VALUES (1, 'master', 'full', 1, 1, 60),
            (1, 'vibe', 'headline', 1, 1, 10),
            (2, 'master', 'concept', 0, 2, NULL),
            (2, 'vibe', 'headline', 0, 2, NULL)`,
  ).run()
  h.db.prepare(
    `INSERT INTO lang_resources (id, lang, name, url, category, tier, level_label, price, lang_label)
     VALUES (1, 'python', '资源一', 'https://example.com/1', 'official', 'a', '0', 'free', 'zh'),
            (2, 'go', '资源二', 'https://example.com/2', 'official', 'b', '1', 'free', 'zh')`,
  ).run()
  h.db.prepare(
    `INSERT INTO lang_topic_resources (topic_id, resource_id, role)
     VALUES (1, 1, 'primary'),
            (2, 1, 'backup')`,
  ).run()
}

describe('M9 增强 6 · 模式层读端', () => {
  it('① 「知识点 × 模式」的行**一条不少**（复合主键 ⇒ 同一知识点有三个模式就有三行）', () => {
    const h = newDb()
    seed(h)
    const rows = readTopicProfiles(h.db)
    expect(rows).toHaveLength(4)
    // ⚠️ 同一个知识点在两个模式下**各有一行**（不是一行被覆盖）
    const forTopic1 = rows.filter((r) => r.topic_id === 1)
    expect(forTopic1.map((r) => r.profile).sort()).toEqual(['master', 'vibe'])
    expect(forTopic1.find((r) => r.profile === 'master')?.required).toBe(1)
    expect(forTopic1.find((r) => r.profile === 'vibe')?.required).toBe(1)
  })

  it('② 知识点行带 `kind`（库级条目**不进路线** —— DL-12）', () => {
    const h = newDb()
    seed(h)
    const rows = readTopicStages(h.db)
    expect(rows).toHaveLength(3)
    expect(rows.find((t) => t.slug === 'go-a')?.kind).toBe('library')
    expect(rows.find((t) => t.slug === 'py-a')?.kind).toBe('language')
  })

  it('③ 资源挂接是**反着查**的（资源 ⇒ 它挂接了哪些知识点）', () => {
    const h = newDb()
    seed(h)
    const rows = readResourcesWithTopics(h.db)
    const r1 = rows.find((r) => r.id === 1)
    expect(r1?.topic_ids).toEqual([1, 2])
    // ⚠️ 标题也带出来（界面点开资源时要逐条列出）
    expect(r1?.topic_titles.map((t) => t.title)).toEqual(['A', 'B'])
    // ⚠️ 没有挂接的资源 ⇒ 空数组（不是 null）
    const r2 = rows.find((r) => r.id === 2)
    expect(r2?.topic_ids).toEqual([])
  })

  it('④ 「已点亮」= **不是 `unused`**（`active` 与 `mastered` 都算）', () => {
    const h = newDb()
    seed(h)
    h.db.prepare(
      `INSERT INTO lang_topic_state
         (topic_id, project_id, state, evidence_kind, evidence_ref, computed_at)
       VALUES (1, 'p1', 'active', 'checklist', 'c1', '2026-10-21T00:00:00.000Z'),
              (2, 'p1', 'mastered', 'skill', 's1', '2026-10-21T00:00:00.000Z')`,
    ).run()
    const lit = readLitTopicIds(h.db, 'p1')
    expect(lit).toEqual([1, 2])
  })

  it('⑤ 没有任何状态 ⇒ 「已点亮」是空数组（不是 null）', () => {
    const h = newDb()
    seed(h)
    expect(readLitTopicIds(h.db, 'p1')).toEqual([])
  })
})
