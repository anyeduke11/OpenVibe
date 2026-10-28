// `packages/core/src/db/m9-p2-state.test.ts` —— M9 v1.6 **P2 出口**
// （`m9-dev-plan-2026-10.md` §6.8 ＋ `m9-dev-language-roadmap.md` §3.1 / §3.3 / §3.13
//   · **DL-05 / DL-07 / DL-25 / DL-28 / DL-34**）
//
// ## 它断什么
//
// | 判据 | 一句话 | 本文件里对应的那支 |
// |---|---|---|
// | **DL-25** | 源码证据永远推不到「掌握」 | 「DL-25」组（含 P0 四支夹具） |
// | **DL-28** | 资源层不得参与掌握度推导 | 「DL-28 / DL-34」组 |
// | **DL-34** | 模式不得影响掌握度判定 | 「DL-28 / DL-34」组 |
// | **DL-05** | 判定文案不得出现「你已掌握」 | 「DL-05 / DL-07」组 |
// | **DL-07** | 冷门知识点显示「本项目未涉及」而非空白 | 「DL-05 / DL-07」组 |
//
// ## ⚠️ 每条判据都配一条**真改数据 / 真改代码**的变异腿
//
// 反向判据（"不得存在 X"）天然没有正向痕迹 ⇒ 只有专门那条检查会红。
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { newDb } from '../test-support/new-db'
import { seedLangTopics } from './m9-p1-seed-lang-topics'
import { seedTopicEdges } from './m9-p1-7-topic-stages'
import {
  deriveTopicStates,
  expandEvidence,
  loadPersistedEvidence,
  loadTopicGraph,
  readTopicStateMap,
  readTopicStates,
  saveTopicStates,
} from './m9-p2-state'
import {
  findForbiddenDerivationTables,
  findForbiddenMasteryCopy,
  findForbiddenMasteryCopyInRepo,
  findMissingDerivationTables,
} from './m9-p2-guards'
import { M9_FIXTURES, M9_FIXTURE_NAMES } from '../fixtures/m9'
import { MASTERY_THRESHOLD_N, type TopicEvidence } from '@openvibe/shared'

const SEEDS_DIR = fileURLToPath(new URL('./seeds', import.meta.url))
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const SERVICE_SOURCE = fileURLToPath(new URL('./m9-p2-state.ts', import.meta.url))
const SHARED_SOURCE = fileURLToPath(new URL('../../../shared/src/m9-state.ts', import.meta.url))

/** 夹具的**仓库相对路径**（⚠️ 零本机路径 —— 绝对路径不进库）。 */
const FIXTURE_REFS: Record<string, string> = {
  pyRepeat: 'packages/core/src/fixtures/m9/py_repeat.py',
  pySolo: 'packages/core/src/fixtures/m9/py_solo.py',
  goRepeat: 'packages/core/src/fixtures/m9/go_repeat.go',
  goSolo: 'packages/core/src/fixtures/m9/go_solo.go',
}

/** 各夹具的「特征出现次数」（用来复现夹具的字面事实）。 */
function fixtureHitCount(name: string): number {
  const src = readFileSync(M9_FIXTURES[name as keyof typeof M9_FIXTURES], 'utf8')
  if (name === 'pyRepeat') return (src.match(/^import logging\s*$/gm) ?? []).length
  if (name === 'pySolo') return (src.match(/^@\w+/gm) ?? []).length
  return (src.match(/^\s*go func\(\) \{/gm) ?? []).length
}

/** 建一个项目行（`projects` 的必填列）。 */
function makeProject(db: Parameters<typeof readTopicStates>[0], id: string): void {
  db.prepare(
    `INSERT INTO projects (id, name, stages_snapshot, status, created_at, updated_at)
     VALUES (?, ?, '[]', 'active', '2026-10-21T00:00:00.000Z', '2026-10-21T00:00:00.000Z')`,
  ).run(id, `测试项目 ${id}`)
}

/** 建一个知识点行（只填必填列）。 */
function makeTopic(
  db: Parameters<typeof readTopicStates>[0],
  id: number,
  slug: string,
  lang: 'python' | 'go' = 'python',
): void {
  db.prepare(
    `INSERT INTO lang_topics (id, lang, slug, title, summary, stage_id, source_kind, kind)
     VALUES (?, ?, ?, ?, '', 0, 'runoob', 'language')`,
  ).run(id, lang, slug, slug)
}

describe('M9 P2 · 迁移 0015 · lang_topic_state', () => {
  it('表存在，且列**逐字**是 §3.1 的六列（规格没列出的字段不主动加）', () => {
    const h = newDb()
    try {
      const cols = (
        h.db.prepare('PRAGMA table_info(lang_topic_state)').all() as { name: string }[]
      ).map((c) => c.name)
      expect(cols).toEqual([
        'topic_id',
        'project_id',
        'state',
        'evidence_kind',
        'evidence_ref',
        'computed_at',
      ])
    } finally {
      h.close()
    }
  })

  it('state 的 CHECK 拒绝三态之外的值', () => {
    const h = newDb()
    try {
      makeProject(h.db, 'p1')
      makeTopic(h.db, 1, 't1')
      expect(() =>
        h.db
          .prepare(
            `INSERT INTO lang_topic_state
               (topic_id, project_id, state, evidence_kind, evidence_ref, computed_at)
             VALUES (1, 'p1', 'unknown', 'task', 'r', '2026-10-21')`,
          )
          .run(),
      ).toThrow()
    } finally {
      h.close()
    }
  })

  it('evidence_kind 的 CHECK 只认四个（§3.1 的取值域）', () => {
    const h = newDb()
    try {
      makeProject(h.db, 'p1')
      makeTopic(h.db, 1, 't1')
      expect(() =>
        h.db
          .prepare(
            `INSERT INTO lang_topic_state
               (topic_id, project_id, state, evidence_kind, evidence_ref, computed_at)
             VALUES (1, 'p1', 'active', 'stage_done', 'r', '2026-10-21')`,
          )
          .run(),
      ).toThrow()
      for (const kind of ['checklist', 'skill', 'task', 'source_hit']) {
        expect(() =>
          h.db
            .prepare(
              `INSERT INTO lang_topic_state
                 (topic_id, project_id, state, evidence_kind, evidence_ref, computed_at)
               VALUES (1, 'p1', 'active', ?, ?, '2026-10-21')`,
            )
            .run(kind, `ref-${kind}`),
        ).not.toThrow()
      }
    } finally {
      h.close()
    }
  })

  it('外键：知识点与项目不存在时插不进', () => {
    const h = newDb()
    try {
      expect(() =>
        h.db
          .prepare(
            `INSERT INTO lang_topic_state
               (topic_id, project_id, state, evidence_kind, evidence_ref, computed_at)
             VALUES (999, 'nope', 'active', 'task', 'r', '2026-10-21')`,
          )
          .run(),
      ).toThrow()
    } finally {
      h.close()
    }
  })

  it('复合主键：同一个 (topic, project, kind, ref) 插不进第二行', () => {
    const h = newDb()
    try {
      makeProject(h.db, 'p1')
      makeTopic(h.db, 1, 't1')
      const sql = `INSERT INTO lang_topic_state
             (topic_id, project_id, state, evidence_kind, evidence_ref, computed_at)
           VALUES (1, 'p1', 'active', 'task', 'r', '2026-10-21')`
      expect(() => h.db.prepare(sql).run()).not.toThrow()
      expect(() => h.db.prepare(sql).run()).toThrow()
    } finally {
      h.close()
    }
  })
})

describe('M9 P2 · 推导服务（落库与读回）', () => {
  it('零证据的知识点 ⇒ 未涉及，且状态图**覆盖全部知识点**（DL-07 正支：不是空白）', () => {
    const h = newDb()
    try {
      makeProject(h.db, 'p1')
      makeTopic(h.db, 1, 't1')
      makeTopic(h.db, 2, 't2')
      const states = deriveTopicStates(h.db, new Map())
      expect(states.get(1)).toBe('unused')
      expect(states.get(2)).toBe('unused')
      const map = readTopicStateMap(h.db, 'p1')
      expect(map.size).toBe(2)
      expect(map.get(1)).toBe('unused')
    } finally {
      h.close()
    }
  })

  it('落库后读回的状态与推导结果逐字相同', () => {
    const h = newDb()
    try {
      makeProject(h.db, 'p1')
      makeTopic(h.db, 1, 't1')
      const evidence = new Map<number, readonly TopicEvidence[]>([
        [1, [{ kind: 'task', ref: 'task-1', count: 1 }]],
      ])
      const states = deriveTopicStates(h.db, evidence)
      expect(states.get(1)).toBe('active')
      saveTopicStates(h.db, 'p1', states, evidence, '2026-10-21T00:00:00.000Z')
      const map = readTopicStateMap(h.db, 'p1')
      expect(map.get(1)).toBe('active')
      const rows = readTopicStates(h.db, 'p1')
      expect(rows).toHaveLength(1)
      expect(rows[0]!.computed_at).toBe('2026-10-21T00:00:00.000Z')
    } finally {
      h.close()
    }
  })

  it('重算即清掉上一版（§3.1「可重算、可丢弃」）', () => {
    const h = newDb()
    try {
      makeProject(h.db, 'p1')
      makeTopic(h.db, 1, 't1')
      const first = new Map<number, readonly TopicEvidence[]>([
        [1, [{ kind: 'task', ref: 'task-1', count: 1 }]],
      ])
      saveTopicStates(h.db, 'p1', deriveTopicStates(h.db, first), first, '2026-10-21T00:00:00.000Z')
      expect(readTopicStates(h.db, 'p1')).toHaveLength(1)
      const second = new Map<number, readonly TopicEvidence[]>()
      saveTopicStates(
        h.db,
        'p1',
        deriveTopicStates(h.db, second),
        second,
        '2026-10-21T01:00:00.000Z',
      )
      expect(readTopicStates(h.db, 'p1')).toHaveLength(0)
    } finally {
      h.close()
    }
  })

  it('⚠️ 次数活得下来：count=3 的非源码证据落 3 行，读回总数不变 ⇒ 可重算', () => {
    const h = newDb()
    try {
      makeProject(h.db, 'p1')
      makeTopic(h.db, 1, 't1')
      const evidence = new Map<number, readonly TopicEvidence[]>([
        [1, [{ kind: 'task', ref: 'task-1', count: MASTERY_THRESHOLD_N }]],
      ])
      const states = deriveTopicStates(h.db, evidence)
      expect(states.get(1)).toBe('mastered')
      saveTopicStates(h.db, 'p1', states, evidence, '2026-10-21T00:00:00.000Z')
      const rows = readTopicStates(h.db, 'p1')
      expect(rows).toHaveLength(MASTERY_THRESHOLD_N)
      // ⚠️ **读回来的证据重算一遍，状态必须还是原来那个** ⇒ 「换算法后可重算」是真的通的
      const back = loadPersistedEvidence(h.db, 'p1')
      const again = deriveTopicStates(h.db, back)
      expect(again.get(1)).toBe('mastered')
    } finally {
      h.close()
    }
  })

  it('源码证据的同一出处**只落一行**（§3.13：重复命中不增加掌握度）', () => {
    const occ = expandEvidence([
      { kind: 'source_hit', ref: 'pkg/mod.go', count: 20 },
      { kind: 'source_hit', ref: 'pkg/mod.go', count: 20 },
    ])
    expect(occ).toEqual([{ kind: 'source_hit', ref: 'pkg/mod.go' }])
  })

  it('非源码证据的多次出现 ⇒ 多行（第 2 行起加后缀）', () => {
    const occ = expandEvidence([{ kind: 'skill', ref: 'skill-a', count: 3 }])
    expect(occ).toHaveLength(3)
    expect(occ[0]!.ref).toBe('skill-a')
    expect(occ[1]!.ref).toBe('skill-a#2')
    expect(occ[2]!.ref).toBe('skill-a#3')
    expect(occ.every((o) => o.kind === 'skill')).toBe(true)
  })
})

describe('M9 P2 · DL-25 源码夹具腿（P0 四支夹具）', () => {
  it('py_repeat.py（20 次同一段）⇒ 封顶「在用」', () => {
    const h = newDb()
    try {
      makeProject(h.db, 'p1')
      makeTopic(h.db, 1, 'py-logging')
      const hits = fixtureHitCount('pyRepeat')
      expect(hits).toBe(20)
      const evidence = new Map<number, readonly TopicEvidence[]>([
        [1, [{ kind: 'source_hit', ref: FIXTURE_REFS.pyRepeat!, count: hits }]],
      ])
      const states = deriveTopicStates(h.db, evidence)
      expect(states.get(1)).toBe('active')
      expect(states.get(1)).not.toBe('mastered')
    } finally {
      h.close()
    }
  })

  it('go_solo.go（单独一个 goroutine）⇒ 封顶「在用」', () => {
    const h = newDb()
    try {
      makeProject(h.db, 'p1')
      makeTopic(h.db, 1, 'go-goroutine')
      const hits = fixtureHitCount('goSolo')
      expect(hits).toBe(1)
      const evidence = new Map<number, readonly TopicEvidence[]>([
        [1, [{ kind: 'source_hit', ref: FIXTURE_REFS.goSolo!, count: hits }]],
      ])
      const states = deriveTopicStates(h.db, evidence)
      expect(states.get(1)).toBe('active')
    } finally {
      h.close()
    }
  })

  it('py_solo.py（单独一个装饰器）⇒ 封顶「在用」', () => {
    const h = newDb()
    try {
      makeProject(h.db, 'p1')
      makeTopic(h.db, 1, 'py-decorator')
      const evidence = new Map<number, readonly TopicEvidence[]>([
        [1, [{ kind: 'source_hit', ref: FIXTURE_REFS.pySolo!, count: fixtureHitCount('pySolo') }]],
      ])
      expect(deriveTopicStates(h.db, evidence).get(1)).toBe('active')
    } finally {
      h.close()
    }
  })

  it('go_repeat.go（20 次同一段）⇒ 封顶「在用」', () => {
    const h = newDb()
    try {
      makeProject(h.db, 'p1')
      makeTopic(h.db, 1, 'go-goroutine')
      const evidence = new Map<number, readonly TopicEvidence[]>([
        [
          1,
          [{ kind: 'source_hit', ref: FIXTURE_REFS.goRepeat!, count: fixtureHitCount('goRepeat') }],
        ],
      ])
      expect(deriveTopicStates(h.db, evidence).get(1)).toBe('active')
    } finally {
      h.close()
    }
  })

  it('⚠️ P2 出口：**真实 DAG 上全套夹具跑过，一个都到不了「掌握」**', () => {
    const h = newDb()
    try {
      makeProject(h.db, 'p1')
      seedLangTopics(h.db, SEEDS_DIR)
      seedTopicEdges(h.db, SEEDS_DIR)
      const nodes = loadTopicGraph(h.db)
      expect(nodes.size).toBeGreaterThan(50)
      // ⚠️ **最狠的一腿**：给**每一个**知识点都喂上源码证据 ⇒ 若封顶失效，
      //   它们会一路推到「掌握」⇒ 这条腿比「只喂一个知识点」更能暴露封顶被删
      const evidence = new Map<number, readonly TopicEvidence[]>()
      for (const name of M9_FIXTURE_NAMES) {
        const ref = FIXTURE_REFS[name]!
        for (const id of nodes.keys()) {
          const list: TopicEvidence[] = [...(evidence.get(id) ?? [])]
          list.push({ kind: 'source_hit', ref, count: fixtureHitCount(name) })
          evidence.set(id, list)
        }
      }
      const states = deriveTopicStates(h.db, evidence)
      let mastered = 0
      for (const state of states.values()) if (state === 'mastered') mastered += 1
      expect(mastered, '源码证据永远推不到掌握（DL-25）').toBe(0)
    } finally {
      h.close()
    }
  })
})

describe('M9 P2 · DL-28 / DL-34 推导路径守卫', () => {
  it('推导源码**不碰**资源三表与模式三表', () => {
    const service = readFileSync(SERVICE_SOURCE, 'utf8')
    const shared = readFileSync(SHARED_SOURCE, 'utf8')
    expect(findForbiddenDerivationTables(service)).toEqual([])
    expect(findForbiddenDerivationTables(shared)).toEqual([])
  })

  it('⚠️ 反证：该读的拓扑两张表确实读了（否则上一支是空转）', () => {
    const service = readFileSync(SERVICE_SOURCE, 'utf8')
    expect(findMissingDerivationTables(service)).toEqual([])
  })

  it('变异腿：把资源表塞进推导源码 ⇒ 闸当场红', () => {
    const mutated = readFileSync(SERVICE_SOURCE, 'utf8').replace(
      'SELECT id FROM lang_topics',
      'SELECT id FROM lang_topics JOIN lang_resources',
    )
    expect(mutated).not.toBe(readFileSync(SERVICE_SOURCE, 'utf8'))
    expect(findForbiddenDerivationTables(mutated)).toContain('lang_resources')
  })

  it('变异腿：把模式表塞进推导源码 ⇒ 闸当场红', () => {
    const mutated = readFileSync(SERVICE_SOURCE, 'utf8').replace(
      'SELECT id FROM lang_topics',
      'SELECT id FROM lang_topics JOIN lang_topic_profiles',
    )
    expect(findForbiddenDerivationTables(mutated)).toContain('lang_topic_profiles')
  })

  it('变异腿：把模式表塞进**共享计算层** ⇒ 闸当场红', () => {
    // ⚠️ 注入到**代码**里（一个字符串常量）—— 注入到注释里不算违规：
    //   注释会被剔掉，而规则说明里本来就得写清「不许碰哪几张表」
    const source = readFileSync(SHARED_SOURCE, 'utf8')
    const mutated = source.replace(
      'export const MASTERY_THRESHOLD_N = 3',
      "export const MASTERY_THRESHOLD_N = 3\nconst READ_TABLE = 'lang_topic_profiles'",
    )
    expect(mutated).not.toBe(source)
    expect(findForbiddenDerivationTables(mutated)).toContain('lang_topic_profiles')
  })

  it('同一个知识点在库里**换档**（切模式）不改状态 ⇒ 推导路径根本不读模式', () => {
    const h = newDb()
    try {
      makeProject(h.db, 'p1')
      makeTopic(h.db, 1, 't1')
      const evidence = new Map<number, readonly TopicEvidence[]>([
        [1, [{ kind: 'task', ref: 'task-1', count: 1 }]],
      ])
      const before = deriveTopicStates(h.db, evidence).get(1)
      // ⚠️ 切模式 = 往模式表写一行（真实存在的表，真实写入）
      seedLangTopics(h.db, SEEDS_DIR)
      const after = deriveTopicStates(h.db, evidence).get(1)
      expect(after).toBe(before)
    } finally {
      h.close()
    }
  })
})

describe('M9 P2 · DL-05 / DL-07 文案守卫', () => {
  it('全仓 0 命中（界面不得出现「你已掌握」/「未触及」）', () => {
    const hits = findForbiddenMasteryCopyInRepo(REPO_ROOT)
    expect(
      hits,
      hits.map((h) => `${h.file}:${h.line} ${h.pattern} — ${h.text}`).join('\n'),
    ).toEqual([])
  })

  it('守卫自证：注入一条必被报出（DL-05 的反证腿）', () => {
    const hits = findForbiddenMasteryCopy('<p>你已掌握这个知识点</p>')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0]!.pattern).toContain('你已掌握')
  })

  it('守卫自证：「未触及」三个字也必被报出', () => {
    expect(findForbiddenMasteryCopy('这个知识点未触及。').length).toBeGreaterThan(0)
  })

  it('反证：**规则说明里**引用这些词不算命中（注释被剔掉）', () => {
    expect(findForbiddenMasteryCopy('// DL-05：判定文案不得出现「你已掌握」这类表述')).toEqual([])
    expect(
      findForbiddenMasteryCopy('/* 规则：界面不得出现「未触及」三个字 */ const x = 1'),
    ).toEqual([])
  })

  it('反证：正常的三态文案不算命中', () => {
    expect(findForbiddenMasteryCopy('<p>本项目用到过</p>')).toEqual([])
    expect(findForbiddenMasteryCopy('<p>本项目未涉及</p>')).toEqual([])
    expect(findForbiddenMasteryCopy('<p>掌握</p>')).toEqual([])
  })
})
