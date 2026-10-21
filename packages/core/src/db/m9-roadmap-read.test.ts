// `packages/core/src/db/m9-roadmap-read.test.ts` —— M9 v1.6 **P3 的读端**
// （`m9-dev-plan-2026-10.md` §6.9 P3.2 / P3.3 · `m9-dev-language-roadmap.md` §3.5 / §3.7 / §3.12 / §3.15）
//
// ## 它断什么
//
// | 规格条款 | 一句话 | 本文件里对应的那支 |
// |---|---|---|
// | **§3.6 / DL-12** | 库级条目（`kind='library'`）**不进学习路线** | 「DL-12」组 |
// | **§3.5** | 站号对外是 **1 起**（库里 0 起）；站名取自库 | 「站号与站名」组 |
// | **§3.5 / §3.18** | 「你在第 M 站」＝ 已点亮知识点的**最大站号** | 「当前站」组 |
// | **§3.7** | 三段缺哪段就是 **null**，不许填自撰文案 | 「详情三段」组 |
// | **§3.12** | 差异靠概念挂接还原，**还原不出就没有** | 「差异」组 |
// | **§3.15** | 资源挂接按 role 排序 | 「资源」组 |
// | **§3.4** | 术语挂接只读 | 「术语」组 |
//
// ## ⚠️ 每条反向判据都配一条**真改数据**的变异腿
//
// 「库级条目不进路线」「还原不出就没有」这类断言天然没有正向痕迹 ⇒
// 只有专门那条检查会红 ⇒ 变异腿必须**真的插一行**（不是改字符串）。
import { afterEach, describe, expect, it } from 'vitest'
import { newDb } from '../test-support/new-db'
import {
  CONCEPT_MOUNT_PREFIX,
  readRoadmap,
  readStates,
  readTopicDetail,
  type TopicDetailRow,
} from './m9-roadmap-read'
import type { SqliteDatabase } from '../db'

const handles: { close(): void }[] = []

afterEach(() => {
  while (handles.length > 0) handles.pop()?.close()
})

function makeDb(): SqliteDatabase {
  const h = newDb()
  handles.push(h)
  return h.db
}

/** 插一条知识点。 */
function addTopic(
  db: SqliteDatabase,
  opts: {
    slug: string
    title: string
    stageId: number
    lang?: 'python' | 'go'
    kind?: 'language' | 'library'
    summary?: string
  },
): number {
  db.prepare(
    `INSERT INTO lang_topics (lang, slug, title, summary, stage_id, kind)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    opts.lang ?? 'python',
    opts.slug,
    opts.title,
    opts.summary ?? '',
    opts.stageId,
    opts.kind ?? 'language',
  )
  const row = db
    .prepare('SELECT id FROM lang_topics WHERE lang = ? AND slug = ?')
    .get(opts.lang ?? 'python', opts.slug) as { id: number }
  return row.id
}

/** 插一个项目行（`lang_topic_state` 的外键）。 */
function addProject(db: SqliteDatabase, id: string): void {
  db.prepare(
    `INSERT INTO projects (id, name, stages_snapshot, status, created_at, updated_at)
     VALUES (?, ?, '[]', 'active', '2026-10-21T00:00:00.000Z', '2026-10-21T00:00:00.000Z')`,
  ).run(id, `测试项目 ${id}`)
}

/** 插一条掌握度证据行。 */
function addState(
  db: SqliteDatabase,
  topicId: number,
  projectId: string,
  state: 'active' | 'mastered',
  ref: string,
): void {
  db.prepare(
    `INSERT INTO lang_topic_state (topic_id, project_id, state, evidence_kind, evidence_ref, computed_at)
     VALUES (?, ?, ?, 'task', ?, '2026-10-21T00:00:00.000Z')`,
  ).run(topicId, projectId, state, ref)
}

/** 插一段三段内容。 */
function addContent(
  db: SqliteDatabase,
  refId: number,
  kind: 'steps' | 'example' | 'principle',
  body: string,
): void {
  db.prepare(
    `INSERT INTO lang_topic_content (ref_kind, ref_id, kind, body_md, updated_at)
     VALUES ('topic', ?, ?, ?, '2026-10-21T00:00:00.000Z')`,
  ).run(refId, kind, body)
}

describe('M9 P3.2 · 路线读端（§3.5 / §3.6 · DL-12）', () => {
  it('站列只收 kind=\'language\'（库级条目不进路线）', () => {
    const db = makeDb()
    addTopic(db, { slug: 'py-syntax', title: '基本语法', stageId: 0 })
    addTopic(db, { slug: 'py-os', title: 'os 模块', stageId: 0, kind: 'library' })

    const view = readRoadmap(db, 'python')

    expect(view.topic_count).toBe(1)
    expect(view.stations.flatMap((s) => s.topics).map((t) => t.slug)).toEqual(['py-syntax'])
  })

  it('变异腿：把库级条目改成 language ⇒ 计数变 2（证明上一支真的读了 kind 列）', () => {
    const db = makeDb()
    addTopic(db, { slug: 'py-syntax', title: '基本语法', stageId: 0 })
    addTopic(db, { slug: 'py-os', title: 'os 模块', stageId: 0, kind: 'library' })
    expect(readRoadmap(db, 'python').topic_count).toBe(1)

    db.prepare("UPDATE lang_topics SET kind = 'language' WHERE slug = 'py-os'").run()

    expect(readRoadmap(db, 'python').topic_count).toBe(2)
  })

  it('站号对外从 1 起，站名取自库（不在读端写死第二份站名表）', () => {
    const db = makeDb()
    addTopic(db, { slug: 'py-syntax', title: '基本语法', stageId: 0 })
    addTopic(db, { slug: 'py-list', title: '列表', stageId: 1 })

    const view = readRoadmap(db, 'python')

    expect(view.stations.map((s) => s.stage_no)).toEqual([1, 2])
    expect(view.stations.map((s) => s.stage_id)).toEqual([0, 1])
    expect(view.stations.map((s) => s.name)).toEqual(['语法基础', '数据结构'])
    expect(view.station_count).toBe(2)
  })

  it('当前站 ＝ 已点亮知识点的最大站号（1 起）；一个都没点亮 ⇒ 1', () => {
    const db = makeDb()
    addProject(db, 'p1')
    const t0 = addTopic(db, { slug: 'a', title: 'A', stageId: 0 })
    addTopic(db, { slug: 'b', title: 'B', stageId: 1 })
    const t3 = addTopic(db, { slug: 'c', title: 'C', stageId: 3 })
    addState(db, t0, 'p1', 'active', 'task-1')
    addState(db, t3, 'p1', 'mastered', 'task-2')

    const view = readRoadmap(db, 'python', 'p1')

    // 第 2 站（stage_id=1）没点亮 ⇒ 不该把当前站拉到 2；
    // 已点亮的最大 stage_id 是 3 ⇒ 对外第 4 站。
    expect(view.current_stage).toBe(4)
  })

  it('一个知识点都没点亮时当前站是 1（不是 0）', () => {
    const db = makeDb()
    addTopic(db, { slug: 'a', title: 'A', stageId: 0 })
    addTopic(db, { slug: 'b', title: 'B', stageId: 3 })

    const view = readRoadmap(db, 'python')

    expect(view.current_stage).toBe(1)
  })

  it('没落库的知识点是「未涉及」，不是「未知」', () => {
    const db = makeDb()
    addProject(db, 'p1')
    const t0 = addTopic(db, { slug: 'a', title: 'A', stageId: 0 })
    addState(db, t0, 'p1', 'active', 'task-1')
    addTopic(db, { slug: 'b', title: 'B', stageId: 0 })

    const view = readRoadmap(db, 'python', 'p1')

    expect(view.stations[0]?.topics.map((t) => t.state)).toEqual(['active', 'unused'])
  })

  it('不传项目时按全库汇总，同一知识点取最高档（mastered > active）', () => {
    const db = makeDb()
    addProject(db, 'p1')
    addProject(db, 'p2')
    const t0 = addTopic(db, { slug: 'a', title: 'A', stageId: 0 })
    addState(db, t0, 'p1', 'active', 'task-1')
    addState(db, t0, 'p2', 'mastered', 'task-2')

    const all = readStates(db, 'python')
    expect(all.get(t0)).toBe('mastered')

    const onlyP1 = readStates(db, 'python', 'p1')
    expect(onlyP1.get(t0)).toBe('active')
  })

  it('Go 与 Python 的路线互不串（lang 是过滤条件）', () => {
    const db = makeDb()
    addTopic(db, { slug: 'py-a', title: 'A', stageId: 0 })
    addTopic(db, { slug: 'go-a', title: 'A', stageId: 0, lang: 'go' })

    expect(readRoadmap(db, 'python').topic_count).toBe(1)
    expect(readRoadmap(db, 'go').topic_count).toBe(1)
  })
})

describe('M9 P3.3 · 详情读端（§3.7 / §3.12 / §3.15 / §3.4）', () => {
  it('三段缺哪段就是 null（不填自撰文案）', () => {
    const db = makeDb()
    const id = addTopic(db, { slug: 'py-list', title: '列表', stageId: 1 })
    addContent(db, id, 'steps', '先建空列表')
    addContent(db, id, 'example', 'xs = [1, 2]')

    const detail = readTopicDetail(db, id) as TopicDetailRow

    expect(detail.content.steps).toBe('先建空列表')
    expect(detail.content.example).toBe('xs = [1, 2]')
    expect(detail.content.principle).toBeNull()
  })

  it('变异腿：补一段 principle ⇒ 不再是 null（证明上一支真的读了三段）', () => {
    const db = makeDb()
    const id = addTopic(db, { slug: 'py-list', title: '列表', stageId: 1 })
    expect((readTopicDetail(db, id) as TopicDetailRow).content.principle).toBeNull()

    addContent(db, id, 'principle', '列表是可变序列')

    expect((readTopicDetail(db, id) as TopicDetailRow).content.principle).toBe('列表是可变序列')
  })

  it('概念挂接的前缀能还原语言差异；前缀没了就没有差异（不编）', () => {
    const db = makeDb()
    db.prepare(
      `INSERT INTO lang_concepts (slug, title, summary, updated_at)
       VALUES ('c-list', '列表', '一组有序可变元素', '2026-10-21T00:00:00.000Z')`,
    ).run()
    const concept = db.prepare('SELECT id FROM lang_concepts WHERE slug = ?').get('c-list') as {
      id: number
    }
    db.prepare(
      `INSERT INTO lang_concept_deltas (concept_id, lang, aspect, summary, since_version)
       VALUES (?, 'python', '并发模型', '列表是线程安全的引用', '3.0')`,
    ).run(concept.id)

    const mounted = addTopic(db, {
      slug: 'py-list',
      title: '列表',
      stageId: 1,
      summary: `${CONCEPT_MOUNT_PREFIX}列表：一组有序可变元素`,
    })
    const unmounted = addTopic(db, { slug: 'py-tuple', title: '元组', stageId: 1 })

    const a = readTopicDetail(db, mounted) as TopicDetailRow
    expect(a.deltas.map((d) => d.aspect)).toEqual(['并发模型'])
    expect(a.deltas[0]?.since_version).toBe('3.0')
    expect(a.deltas[0]?.until_version).toBeNull()

    const b = readTopicDetail(db, unmounted) as TopicDetailRow
    expect(b.deltas).toEqual([])
  })

  it('差异按 aspect 升序（同一概念多条差异有稳定序）', () => {
    const db = makeDb()
    db.prepare(
      `INSERT INTO lang_concepts (slug, title, summary, updated_at)
       VALUES ('c-list', '列表', '', '2026-10-21T00:00:00.000Z')`,
    ).run()
    const concept = db.prepare('SELECT id FROM lang_concepts WHERE slug = ?').get('c-list') as {
      id: number
    }
    for (const aspect of ['语法', '并发模型', '错误模型']) {
      db.prepare(
        `INSERT INTO lang_concept_deltas (concept_id, lang, aspect, summary, since_version)
         VALUES (?, 'python', ?, '摘要', '3.0')`,
      ).run(concept.id, aspect)
    }
    const id = addTopic(db, {
      slug: 'py-list',
      title: '列表',
      stageId: 1,
      summary: `${CONCEPT_MOUNT_PREFIX}列表：`,
    })

    const detail = readTopicDetail(db, id) as TopicDetailRow

    // ⚠️ **不写死中文排序结果** —— localeCompare 的排序随 ICU  collation 变
    //   （拼音序与码位序给出不同答案）⇒ 只断「输出与同一个比较器自洽」。
    const aspects = detail.deltas.map((d) => d.aspect)
    expect(aspects).toHaveLength(3)
    expect([...aspects].sort((a, b) => a.localeCompare(b))).toEqual(aspects)
  })

  it('资源挂接按 role 排序（primary → backup → practice）', () => {
    const db = makeDb()
    const id = addTopic(db, { slug: 'py-list', title: '列表', stageId: 1 })
    const resourceIds: Record<string, number> = {}
    for (const [name, tier] of [
      ['练习站', 'c'],
      ['官方教程', 'a'],
      ['进阶博客', 'b'],
    ] as const) {
      db.prepare(
        `INSERT INTO lang_resources (lang, name, url, category, tier, level_label, price, lang_label)
         VALUES ('python', ?, ?, 'practice', ?, '1', 'free', 'bi')`,
      ).run(name, `https://example.invalid/${name}`, tier)
      const row = db.prepare('SELECT id FROM lang_resources WHERE name = ?').get(name) as {
        id: number
      }
      resourceIds[name] = row.id
    }
    for (const [name, role] of [
      ['练习站', 'practice'],
      ['官方教程', 'primary'],
      ['进阶博客', 'backup'],
    ] as const) {
      db.prepare(
        `INSERT INTO lang_topic_resources (topic_id, resource_id, role) VALUES (?, ?, ?)`,
      ).run(id, resourceIds[name], role)
    }

    const detail = readTopicDetail(db, id) as TopicDetailRow

    expect(detail.resources.map((r) => r.role)).toEqual(['primary', 'backup', 'practice'])
    expect(detail.resources[0]?.name).toBe('官方教程')
  })

  it('术语挂接只读：能读到挂上的术语，且不往 terms 表写任何东西', () => {
    const db = makeDb()
    db.prepare(
      `INSERT INTO terms (id, zh, en, definition, created_at, updated_at)
       VALUES ('t-list', '列表', 'list', '一组有序可变元素', '2026-10-21T00:00:00.000Z',
               '2026-10-21T00:00:00.000Z')`,
    ).run()
    const id = addTopic(db, { slug: 'py-list', title: '列表', stageId: 1 })
    db.prepare('INSERT INTO lang_topic_terms (topic_id, term_id) VALUES (?, ?)').run(id, 't-list')

    const detail = readTopicDetail(db, id) as TopicDetailRow

    expect(detail.terms).toEqual([{ term_id: 't-list', zh: '列表', en: 'list' }])
    const term = db.prepare('SELECT updated_at FROM terms WHERE id = ?').get('t-list') as {
      updated_at: string
    }
    expect(term.updated_at).toBe('2026-10-21T00:00:00.000Z')
  })

  it('不存在的知识点返回 null（不是空对象）', () => {
    const db = makeDb()
    expect(readTopicDetail(db, 999)).toBeNull()
  })

  it('详情里的站号是 1 起', () => {
    const db = makeDb()
    const id = addTopic(db, { slug: 'py-list', title: '列表', stageId: 2 })
    const detail = readTopicDetail(db, id) as TopicDetailRow
    expect(detail.stage_id).toBe(2)
    expect(detail.stage_no).toBe(3)
  })
})
