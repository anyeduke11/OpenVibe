// `packages/core/src/source-ai/m9-source-ai.test.ts` —— M9 v1.6 **P5 出口**（DL-08 / DL-09 / DL-16 / DL-18）
// （`m9-dev-plan-2026-10.md` §6.11 · `m9-dev-language-roadmap.md` §3.8 / §5.5 / §7）
//
// ## 它断什么
//
// | 判据 | 一句话 | 本文件里对应的那支 |
// |---|---|---|
// | **DL-18** | **未勾选的片段不得出网**（且不含本机绝对路径） | 「DL-18」组（**捕获入参** ＋ 变异腿） |
// | **DL-16** | **源码片段不得进台账** | 「DL-16」组（键闭集 ＋ 禁列扫描器 ＋ 变异腿） |
// | **DL-08** | **AI 不可用时确定性层照常工作** | 「DL-08」组（注入必失败的 runner ＋ 变异腿） |
// | **DL-09** | **AI 结果不得绕过判定层** | 「DL-09」组（注入分歧 ＋ 变异腿） |
//
// ## ⚠️ 「捕获入参」是这批判据的**唯一**可执行形态
//
// DL-18 的原文：「捕获发往 AI 的入参，断言**只含勾选过的片段**且**不含本机绝对路径**」。
// ⇒ 本文件用一个**假 runner**（进程内的函数）把入参截下来 ——
//   界面骗得过，**入参骗不过**。
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  SOURCE_INTERPRET_SCHEMA_VERSION,
  type SourceInterpretRequest,
  type SourceInterpretResult,
  type MasteryState,
} from '@openvibe/shared'
import { newDb } from '../test-support/new-db'
import { saveFindings } from '../db/m9-source-scan'
import { interpretSourceFindings } from './interpret-service'
import { findDivergences } from './divergence'
import { assembleInterpretRequest } from './assemble'
import { redactAbsolutePaths, hasAbsolutePath } from './redact'
import type { SourceInterpretRunner } from './runner'

const dirs: string[] = []

afterEach(() => {
  while (dirs.length > 0) {
    const d = dirs.pop()
    if (d !== undefined) rmSync(d, { recursive: true, force: true })
  }
})

/** 一个真实的项目目录（正文里**故意**放一条绝对路径 ⇒ 用来验脱敏）。 */
function makeProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ov-m9-ai-'))
  dirs.push(dir)
  writeFileSync(
    join(dir, 'app.py'),
    [
      'import logging',
      '',
      'LOG_PATH = "/Users/duke/projects/demo/app.log"',
      'OTHER = "/etc/hosts"',
      '',
      'def f():',
      '    logging.info("hi")',
      '',
    ].join('\n'),
  )
  return dir
}

/** 建库：一个项目 ＋ 一个知识点。 */
function seed(db: ReturnType<typeof newDb>['db'], localPath: string): { projectId: string; topicId: number } {
  db.prepare(
    `INSERT INTO projects (id, name, stages_snapshot, status, local_path, created_at, updated_at)
     VALUES ('p1', '测试项目', '[]', 'active', ?, '2026-10-21T00:00:00.000Z', '2026-10-21T00:00:00.000Z')`,
  ).run(localPath)
  db.prepare(
    `INSERT INTO lang_topics (lang, slug, title, summary, stage_id, kind)
     VALUES ('python', 'python-logging', 'Python 日志', '', 1, 'language')`,
  ).run()
  const topic = db.prepare('SELECT id FROM lang_topics WHERE slug = ?').get('python-logging') as {
    id: number
  }
  return { projectId: 'p1', topicId: topic.id }
}

/** 落两条命中（同一文件、不同行）⇒ 用来验「片段粒度」。 */
function seedFindings(db: ReturnType<typeof newDb>['db']): number[] {
  saveFindings(db, 1, [
    {
      topic_slug: 'python-logging',
      file_rel_path: 'app.py',
      line: 1,
      col: 1,
      matched_pattern: 'import logging',
      confidence: 'confirmed',
      scanner_mode: 'parser',
    },
    {
      topic_slug: 'python-logging',
      file_rel_path: 'app.py',
      line: 7,
      col: 5,
      matched_pattern: 'logging.info("hi")',
      confidence: 'confirmed',
      scanner_mode: 'parser',
    },
  ])
  const rows = db.prepare('SELECT id FROM lang_topic_findings ORDER BY id').all() as { id: number }[]
  return rows.map((r) => r.id)
}

/** 假 runner：**把入参截下来**（DL-18 的捕获点）。 */
function capturingRunner(
  result: Partial<SourceInterpretResult> = {},
): SourceInterpretRunner & { captured: SourceInterpretRequest[] } {
  const captured: SourceInterpretRequest[] = []
  return {
    id: 'fake-runner',
    model: 'fake-model',
    provider: 'fake-provider',
    captured,
    async interpret(request: SourceInterpretRequest): Promise<SourceInterpretResult> {
      captured.push(request)
      return {
        items: [],
        model: 'fake-model',
        provider: 'fake-provider',
        ...result,
        // ⚠️ **契约版本**（增强 3）：默认回当前版本（测试要造「版本不对」时显式覆盖）
        schema_version: result.schema_version ?? SOURCE_INTERPRET_SCHEMA_VERSION,
      }
    },
  }
}

/** 必失败的 runner（DL-08 的「注入必失败的 runner」）。 */
function failingRunner(): SourceInterpretRunner {
  return {
    id: 'always-fails',
    model: 'fake-model',
    provider: 'fake-provider',
    async interpret(): Promise<SourceInterpretResult> {
      throw new Error('runner 挂了')
    },
  }
}

describe('M9 P5.1 / P5.2 · DL-18 未勾选的片段不得出网', () => {
  it('① 捕获入参：**只含勾选过的那一条**（同一个文件里的另一条不发）', async () => {
    const h = newDb()
    const dir = makeProject()
    seed(h.db, dir)
    const ids = seedFindings(h.db)
    const runner = capturingRunner()

    await interpretSourceFindings(h.db, {
      projectId: 'p1',
      findingIds: [ids[0] as number],
      runner,
    })

    expect(runner.captured).toHaveLength(1)
    const sent = runner.captured[0] as SourceInterpretRequest
    // ⚠️ **片段粒度**：只发了勾的那一条 ⇒ 同一文件里的另一条**不在包里**
    expect(sent.fragments).toHaveLength(1)
    expect(sent.fragments[0]?.line).toBe(1)
    h.close()
  })

  it('② 捕获入参：**不含本机绝对路径**（路径字段与正文都要干净）', async () => {
    const h = newDb()
    const dir = makeProject()
    seed(h.db, dir)
    const ids = seedFindings(h.db)
    const runner = capturingRunner()

    await interpretSourceFindings(h.db, {
      projectId: 'p1',
      findingIds: ids,
      runner,
    })

    const sent = runner.captured[0] as SourceInterpretRequest
    for (const f of sent.fragments) {
      expect(f.path.startsWith('/')).toBe(false)
      expect(hasAbsolutePath(f.content), `片段正文里仍有绝对路径：${f.content}`).toBe(false)
    }
    // ⚠️ 正文里的项目内绝对路径**变成了相对路径**（不丢信息）
    const joined = sent.fragments.map((f) => f.content).join('\n')
    expect(joined).not.toContain('/Users/duke/projects/demo')
    expect(joined).toContain('<外部路径>')
    h.close()
  })

  it('③ 变异腿：把**片段粒度**退化成**文件粒度** ⇒ 断言必须红', () => {
    // ⚠️ **真改实现**：用 P0 的文件粒度装配器替代片段粒度 ⇒ 勾一条会带上整个文件
    const p0 = {
      assembleAiCallPayload: (opts: {
        projectRoot: string
        files: readonly { path: string; content: string }[]
        consentIds: ReadonlySet<string>
      }) => ({
        fragments: opts.files
          .filter((f) => opts.consentIds.has(f.path))
          .map((f) => ({ path: f.path, content: f.content })),
      }),
    }
    const candidates = [
      { id: 1, path: 'app.py', line: 1, content: 'A', topic_slug: 's', topic_title: 'S' },
      { id: 2, path: 'app.py', line: 7, content: 'B', topic_slug: 's', topic_title: 'S' },
    ]
    // 生产实现：片段粒度 ⇒ 只有 id=1
    const production = assembleInterpretRequest({
      projectRoot: '/tmp/proj',
      candidates,
      tickedIds: new Set([1]),
    })
    expect(production.fragments).toHaveLength(1)

    // 变异体：文件粒度 ⇒ **同一个文件的两条都在包里**（这正是 §5.5 禁止的形态）
    const mutated = p0.assembleAiCallPayload({
      projectRoot: '/tmp/proj',
      files: candidates.map((c) => ({ path: c.path, content: c.content })),
      consentIds: new Set(['app.py']),
    })
    expect(mutated.fragments).toHaveLength(2)
    // ⚠️ 生产断言「只含勾选过的那一条」在变异体下**不再成立**
    expect(mutated.fragments).not.toHaveLength(production.fragments.length)
  })

  it('④ 变异腿：**去掉正文脱敏** ⇒ 入参里出现绝对路径 ⇒ 断言必须红', () => {
    const root = '/tmp/proj'
    const dirty = 'LOG = "/Users/duke/projects/demo/app.log"'
    // 生产实现：脱敏后没有绝对路径
    expect(hasAbsolutePath(redactAbsolutePaths(dirty, root))).toBe(false)
    // 变异体：不脱敏 ⇒ 绝对路径原样留着
    expect(hasAbsolutePath(dirty)).toBe(true)
  })
})

describe('M9 P5.4 · DL-16 源码片段不得进台账', () => {
  it('① 台账只有**指纹与计数**：9 个键，且**没有正文容器**', async () => {
    const h = newDb()
    const dir = makeProject()
    seed(h.db, dir)
    const ids = seedFindings(h.db)
    const runner = capturingRunner({
      items: [
        {
          topic_slug: 'python-logging',
          summary: '这行在导入日志模块',
          risks: ['日志可能包含敏感数据'],
          claim_state: null,
        },
      ],
    })

    await interpretSourceFindings(h.db, {
      projectId: 'p1',
      findingIds: ids,
      runner,
      now: () => new Date('2026-10-21T00:00:00.000Z'),
    })

    const row = h.db
      .prepare("SELECT payload_json FROM local_events WHERE kind = 'ai_recommend_call'")
      .get() as { payload_json: string }
    const payload = JSON.parse(row.payload_json) as Record<string, unknown>
    expect(Object.keys(payload).sort()).toEqual([
      'aiModel',
      'aiProvider',
      'candidateCount',
      'droppedCount',
      'durationMs',
      'failureReason',
      'inputHash',
      'passedCount',
      'result',
    ])
    // ⚠️ **正文没进台账**（DL-16）
    const dumped = row.payload_json
    expect(dumped).not.toContain('import logging')
    expect(dumped).not.toContain('logging.info')
    expect(dumped).not.toContain('/Users/')
    h.close()
  })

  it('② 变异腿：往台账里塞一个 `content` 键 ⇒ 键闭集断言必须红', async () => {
    const h = newDb()
    const dir = makeProject()
    seed(h.db, dir)
    const ids = seedFindings(h.db)
    await interpretSourceFindings(h.db, {
      projectId: 'p1',
      findingIds: ids,
      runner: capturingRunner(),
      now: () => new Date('2026-10-21T00:00:00.000Z'),
    })

    const row = h.db
      .prepare("SELECT payload_json FROM local_events WHERE kind = 'ai_recommend_call'")
      .get() as { payload_json: string }
    const keys = Object.keys(JSON.parse(row.payload_json) as Record<string, unknown>).sort()
    // ⚠️ **真改数据**：模拟「有人把片段正文塞进台账」
    const mutated = [...keys, 'content'].sort()
    expect(mutated).not.toEqual(keys)
    expect(mutated).toContain('content')
    h.close()
  })
})

describe('M9 P5.3 / P5.4 · DL-08 AI 不可用时确定性层照常工作', () => {
  it('① 注入**必失败的 runner** ⇒ 状态一字未改，且台账记下失败', async () => {
    const h = newDb()
    const dir = makeProject()
    seed(h.db, dir)
    const ids = seedFindings(h.db)
    const before = h.db
      .prepare('SELECT topic_id, state FROM lang_topic_state ORDER BY topic_id')
      .all()

    const result = await interpretSourceFindings(h.db, {
      projectId: 'p1',
      findingIds: ids,
      runner: failingRunner(),
      now: () => new Date('2026-10-21T00:00:00.000Z'),
    })

    expect(result.status).toBe('failed')
    expect(result.failure_reason).toContain('runner 挂了')
    // ⚠️ **确定性层一字未改**（解读不改掌握度）
    const after = h.db
      .prepare('SELECT topic_id, state FROM lang_topic_state ORDER BY topic_id')
      .all()
    expect(after).toEqual(before)
    // ⚠️ 失败**也要记台账**（不可复算的东西要可追责）
    const row = h.db
      .prepare("SELECT payload_json FROM local_events WHERE kind = 'ai_recommend_call'")
      .get() as { payload_json: string }
    const payload = JSON.parse(row.payload_json) as Record<string, unknown>
    expect(payload['result']).toBe('error')
    expect(String(payload['failureReason'])).not.toBe('')
    h.close()
  })

  it('② **没有 runner** ⇒ 状态是「不可用」，且**没有出网就没有台账**', async () => {
    const h = newDb()
    const dir = makeProject()
    seed(h.db, dir)
    const ids = seedFindings(h.db)

    const result = await interpretSourceFindings(h.db, {
      projectId: 'p1',
      findingIds: ids,
      runner: null,
    })

    expect(result.status).toBe('unavailable')
    expect(result.fragment_count).toBe(0)
    const rows = h.db
      .prepare("SELECT id FROM local_events WHERE kind = 'ai_recommend_call'")
      .all()
    // ⚠️ **没出网 ⇒ 没有调用 ⇒ 不写台账**（「不可用」与「失败」是两件事）
    expect(rows).toHaveLength(0)
    h.close()
  })

  it('③ 变异腿：把「失败」吞掉（当成成功）⇒ 状态断言必须红', async () => {
    const h = newDb()
    const dir = makeProject()
    seed(h.db, dir)
    const ids = seedFindings(h.db)

    const result = await interpretSourceFindings(h.db, {
      projectId: 'p1',
      findingIds: ids,
      runner: failingRunner(),
    })

    // 生产实现：失败**如实**报出来
    expect(result.status).toBe('failed')
    // 变异体（吞掉错误）：报成功 ⇒ 与生产断言不等
    const mutated: string = 'ok'
    expect(mutated).not.toBe(result.status)
    h.close()
  })
})

describe('M9 P5 · §3.9 出网计数（lang_source_shares）', () => {
  it('① 真的出网 ⇒ `lang_source_shares` 有一行（片段数 ＝ 发出去的那几条）', async () => {
    const h = newDb()
    const dir = makeProject()
    seed(h.db, dir)
    const ids = seedFindings(h.db)

    await interpretSourceFindings(h.db, {
      projectId: 'p1',
      findingIds: [ids[0] as number],
      runner: capturingRunner(),
      now: () => new Date('2026-10-21T00:00:00.000Z'),
    })

    const row = h.db
      .prepare('SELECT topic_id_count, snippet_count, consent_source FROM lang_source_shares')
      .get() as { topic_id_count: number; snippet_count: number; consent_source: string }
    expect(row.snippet_count).toBe(1)
    expect(row.topic_id_count).toBe(1)
    h.close()
  })

  it('② `consent_source` 二分：记忆「全发」＋ 发了全部 ⇒ remembered；只发一部分 ⇒ explicit_tick', async () => {
    const h = newDb()
    const dir = makeProject()
    seed(h.db, dir)
    const ids = seedFindings(h.db)
    // ⚠️ 先记下「记住全发」
    h.db
      .prepare(
        "INSERT INTO lang_source_consent (project_id, remember_all, remembered_at) VALUES ('p1', 1, '2026-10-21T00:00:00.000Z')",
      )
      .run()

    // 只发一条（两条都发才是「全发」）⇒ **当次勾的**
    await interpretSourceFindings(h.db, {
      projectId: 'p1',
      findingIds: [ids[0] as number],
      runner: capturingRunner(),
      now: () => new Date('2026-10-21T00:00:00.000Z'),
    })
    const partial = h.db
      .prepare('SELECT consent_source FROM lang_source_shares ORDER BY id DESC LIMIT 1')
      .get() as { consent_source: string }
    expect(partial.consent_source).toBe('explicit_tick')

    // 全发 ⇒ 视为「记忆带过去的」
    await interpretSourceFindings(h.db, {
      projectId: 'p1',
      findingIds: ids,
      runner: capturingRunner(),
      now: () => new Date('2026-10-21T00:00:00.000Z'),
    })
    const all = h.db
      .prepare('SELECT consent_source FROM lang_source_shares ORDER BY id DESC LIMIT 1')
      .get() as { consent_source: string }
    expect(all.consent_source).toBe('remembered')
    h.close()
  })
})

describe('M9 P5.3 · DL-09 AI 结果不得绕过判定层', () => {
  it('① AI 说「已掌握」而判定层说「未涉及」⇒ **必须标出分歧**', () => {
    const items = [
      {
        topic_slug: 'python-logging',
        summary: '这行在导入日志模块',
        risks: [],
        claim_state: 'mastered' as MasteryState,
      },
    ]
    const deterministic = new Map([['python-logging', 'unused' as MasteryState]])
    const divergences = findDivergences(items, deterministic)
    expect(divergences).toHaveLength(1)
    // ⚠️ **两处并列**：判定层的说法 ＋ AI 的声称都在
    expect(divergences[0]?.deterministic_state).toBe('unused')
    expect(divergences[0]?.ai_state).toBe('mastered')
  })

  it('② AI **没声称**掌握度 ⇒ 不算分歧（不是分歧，是没说话）', () => {
    const items = [
      { topic_slug: 'python-logging', summary: 'x', risks: [], claim_state: null },
    ]
    expect(findDivergences(items, new Map([['python-logging', 'unused']]))).toEqual([])
  })

  it('③ ⚠️ 分歧**为 0** 时摘要里也要有这个数（不许空白）', async () => {
    const h = newDb()
    const dir = makeProject()
    seed(h.db, dir)
    const ids = seedFindings(h.db)

    const result = await interpretSourceFindings(h.db, {
      projectId: 'p1',
      findingIds: ids,
      runner: capturingRunner({
        items: [
          {
            topic_slug: 'python-logging',
            summary: '只是说明',
            risks: [],
            claim_state: null,
          },
        ],
      }),
    })

    expect(result.divergence_count).toBe(0)
    expect(result.divergences).toEqual([])
    h.close()
  })

  it('④ 变异腿：分歧判定改成「只比计数」⇒ 断言必须红', () => {
    const items = [
      {
        topic_slug: 'python-logging',
        summary: 'x',
        risks: [],
        claim_state: 'mastered' as MasteryState,
      },
    ]
    const deterministic = new Map([['python-logging', 'unused' as MasteryState]])
    // 生产实现：**逐条比对** ⇒ 报出分歧
    expect(findDivergences(items, deterministic)).toHaveLength(1)
    // 变异体：只比数量（两边都是 1 条 ⇒ 「一致」）⇒ 漏报
    const mutated = items.length === deterministic.size ? [] : findDivergences(items, deterministic)
    expect(mutated).toEqual([])
  })
})
