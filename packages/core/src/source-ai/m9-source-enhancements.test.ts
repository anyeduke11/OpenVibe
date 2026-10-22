// `packages/core/src/source-ai/m9-source-enhancements.test.ts` —— M9 v1.6 **六项增强的判据**
// （dev-plan §6.11 之后的增强批次）
//
// ## 它断什么
//
// | 增强 | 一句话 | 本文件里对应的那支 |
// |---|---|---|
// | **增强 1** | 出网计数**要能读到**（设置页显示「出网过几次」） | 「增强 1」组 |
// | **增强 2** | 片段读不到时**要说清为什么** | 「增强 2」组（**六种原因各归对**） |
// | **增强 3** | runner 契约**带版本号**，不兼容单独归一 | 「增强 3」组（**真起子进程**） |
// | **增强 4** | 解读结果可导出，**产物里没有绝对路径、没有源码正文** | 「增强 4」组 |
// | **增强 5** | 「记住全发」记的是**范围**不是快照 | 「增强 5」组 |
//
// ## ⚠️ 否定式判据必须**自证**
//
// 增强 4 的断言是「产物里没有绝对路径」—— 这种断言天然可能**恒真**
// （脱敏函数根本没被调用时，产物里当然也没有绝对路径）。
// ⇒ 本文件**先断言脏值确实含绝对路径**，再断言产物里没有 ⇒ 断言不是摆设。
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  SOURCE_INTERPRET_SCHEMA_VERSION,
  type SourceInterpretResult,
  type SourceInterpretSummary,
} from '@openvibe/shared'
import { newDb } from '../test-support/new-db'
import type { SqliteDatabase } from '../db'
import {
  recordShare,
  readShareByProvider,
  readShareSummary,
  saveFindings,
  setConsent,
  clearConsent,
} from '../db/m9-source-scan'
import { deriveConsentDetail, consentSourceFromDetail, interpretSourceFindings } from './interpret-service'
import { readSnippet, readSnippets, SNIPPET_MAX_FILES } from './snippet'
import { formatInterpretMarkdown } from './export'
import { CommandInterpretRunner, InterpretRunnerError, type SourceInterpretRunner } from './runner'

const dirs: string[] = []

afterEach(() => {
  while (dirs.length > 0) {
    const d = dirs.pop()
    if (d !== undefined) rmSync(d, { recursive: true, force: true })
  }
})

/** 一个真实目录（带一个小文件）。 */
function makeProject(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'ov-m9-enh-'))
  dirs.push(dir)
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content)
  }
  return dir
}

// ───────────────────────── 增强 1：出网计数要能读到 ─────────────────────────

describe('M9 增强 1 · 出网汇总可读（`lang_source_shares` 的聚合）', () => {
  it('① 多次出网 ⇒ 次数、片段累计、两种授权来源分开计数', () => {
    const h = newDb()
    // ⚠️ `lang_source_shares.project_id` 有外键 ⇒ 得先有项目行
    for (const id of ['p1', 'p2']) {
      h.db.prepare(
        `INSERT INTO projects (id, name, stages_snapshot, status, local_path, created_at, updated_at)
         VALUES (?, '测试项目', '[]', 'active', '/tmp/x', '2026-10-21T00:00:00.000Z', '2026-10-21T00:00:00.000Z')`,
      ).run(id)
    }
    recordShare(h.db, {
      project_id: 'p1',
      topic_id_count: 2,
      snippet_count: 5,
      created_at: '2026-10-21T01:00:00.000Z',
      consent_source: 'explicit_tick',
      consent_detail: 'no_memory',
    })
    recordShare(h.db, {
      project_id: 'p1',
      topic_id_count: 1,
      snippet_count: 3,
      created_at: '2026-10-21T02:00:00.000Z',
      consent_source: 'remembered',
      consent_detail: 'memory_applied',
    })
    recordShare(h.db, {
      project_id: 'p2',
      topic_id_count: 1,
      snippet_count: 1,
      created_at: '2026-10-21T03:00:00.000Z',
      consent_source: 'explicit_tick',
      consent_detail: 'no_memory',
    })

    const rows = readShareSummary(h.db)
    expect(rows).toHaveLength(2)
    const p1 = rows.find((r) => r.project_id === 'p1')
    expect(p1).toBeDefined()
    expect(p1?.share_count).toBe(2)
    expect(p1?.snippet_total).toBe(8)
    expect(p1?.explicit_tick_count).toBe(1)
    expect(p1?.remembered_count).toBe(1)
    // ⚠️ 最近一次 = **最晚**的那笔（不是插入顺序的假设）
    expect(p1?.last_shared_at).toBe('2026-10-21T02:00:00.000Z')
  })

  it('② 没有任何出网 ⇒ 空数组（不是空对象、不是 0）', () => {
    const h = newDb()
    expect(readShareSummary(h.db)).toEqual([])
  })

  it('③ **清除记忆不改变**出网计数（两者语义不同：记忆管「下次」，这里记「已发生」）', () => {
    const h = newDb()
    h.db.prepare(
      `INSERT INTO projects (id, name, stages_snapshot, status, local_path, created_at, updated_at)
       VALUES ('p1', '测试项目', '[]', 'active', '/tmp/p1', '2026-10-21T00:00:00.000Z', '2026-10-21T00:00:00.000Z')`,
    ).run()
    setConsent(h.db, 'p1', true, '2026-10-21T00:30:00.000Z')
    recordShare(h.db, {
      project_id: 'p1',
      topic_id_count: 1,
      snippet_count: 4,
      created_at: '2026-10-21T01:00:00.000Z',
      consent_source: 'remembered',
      consent_detail: 'memory_applied',
    })

    clearConsent(h.db, 'p1')

    const rows = readShareSummary(h.db)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.share_count).toBe(1)
    expect(rows[0]?.snippet_total).toBe(4)
  })
})

// ───────────────────── 增强 2：读不到要说清为什么 ─────────────────────

describe('M9 增强 2 · 片段读取的失败原因（**六种，各自归对**）', () => {
  it('① 文件不在了 ⇒ `file_missing`', () => {
    const dir = makeProject({ 'app.py': 'a\nb\n' })
    const r = readSnippet(dir, 'nope.py', 1)
    expect(r.window).toBeNull()
    expect(r.failure).toBe('file_missing')
  })

  it('② 路径越出项目根 ⇒ `out_of_project`（`..` 与绝对路径都拒）', () => {
    const dir = makeProject({ 'app.py': 'a\n' })
    expect(readSnippet(dir, '../secret.py', 1).failure).toBe('out_of_project')
    expect(readSnippet(dir, '/etc/hosts', 1).failure).toBe('out_of_project')
  })

  it('③ 命中行号超出文件现在的行数 ⇒ `line_out_of_range`（**不夹逼**）', () => {
    const dir = makeProject({ 'app.py': 'a\nb\nc\n' })
    const r = readSnippet(dir, 'app.py', 999)
    expect(r.window).toBeNull()
    expect(r.failure).toBe('line_out_of_range')
  })

  it('④ 文件超过读取上限 ⇒ `too_large`', () => {
    const dir = makeProject({ 'big.py': 'x'.repeat(600 * 1024) })
    const r = readSnippet(dir, 'big.py', 1)
    expect(r.window).toBeNull()
    expect(r.failure).toBe('too_large')
  })

  it('⑤ 读不了（权限）⇒ `unreadable`', () => {
    // ⚠️ **root 读不出权限错误** ⇒ 该分支在 root 下没有意义（跳过并说明）
    if (typeof process.getuid === 'function' && process.getuid() === 0) return
    const dir = makeProject({ 'locked.py': 'secret\n' })
    const path = join(dir, 'locked.py')
    chmodSync(path, 0o000)
    try {
      const r = readSnippet(dir, 'locked.py', 1)
      expect(r.window).toBeNull()
      expect(r.failure).toBe('unreadable')
    } finally {
      chmodSync(path, 0o600)
    }
  })

  it('⑥ 超过单次批量上限的那几条 ⇒ `not_loaded`（如实说，不静默截断）', () => {
    const dir = makeProject({ 'app.py': 'a\n' })
    const rows = Array.from({ length: SNIPPET_MAX_FILES + 1 }, (_, i) => ({
      id: i + 1,
      file_rel_path: 'app.py',
      line: 1,
    }))
    const map = readSnippets(dir, rows)
    expect(map.get(1)?.failure).toBeNull()
    expect(map.get(SNIPPET_MAX_FILES)?.failure).toBeNull()
    expect(map.get(SNIPPET_MAX_FILES + 1)?.failure).toBe('not_loaded')
  })

  it('⑦ 读得到时 **`failure` 必为 `null`**（窗口与原因互斥）', () => {
    const dir = makeProject({ 'app.py': 'a\nb\nc\n' })
    const r = readSnippet(dir, 'app.py', 2)
    expect(r.failure).toBeNull()
    expect(r.window).not.toBeNull()
  })
})

// ───────────────── 增强 3：runner 契约带版本号 ─────────────────

describe('M9 增强 3 · 契约版本号（**不兼容要有自己的失败原因**）', () => {
  /** 造一个只输出固定 JSON 的假解释器。 */
  function fakeInterpreter(payload: string): string {
    const dir = mkdtempSync(join(tmpdir(), 'ov-m9-ver-'))
    dirs.push(dir)
    const script = join(dir, 'fake.sh')
    writeFileSync(script, `#!/bin/sh\ncat > /dev/null\nprintf '%s' '${payload}'\n`)
    chmodSync(script, 0o755)
    return script
  }

  it('① 版本号**对得上** ⇒ 正常解析', async () => {
    const script = fakeInterpreter(
      `{"schema_version":${String(SOURCE_INTERPRET_SCHEMA_VERSION)},"items":[],"model":"m","provider":"p"}`,
    )
    const runner = new CommandInterpretRunner({ cmd: script, model: 'm', provider: 'p' })
    const result = await runner.interpret({
      schema_version: SOURCE_INTERPRET_SCHEMA_VERSION,
      fragments: [],
      topics: [],
    })
    expect(result.model).toBe('m')
  })

  it('② 版本号**对不上** ⇒ `runner-version-mismatch`（**不是**泛化的「不合 schema」）', async () => {
    const script = fakeInterpreter('{"schema_version":0,"items":[],"model":"m","provider":"p"}')
    const runner = new CommandInterpretRunner({ cmd: script, model: 'm', provider: 'p' })
    // ⚠️ **归一到自己的原因**（能分清「工具坏了」与「契约变了」）
    let reason: string | undefined
    try {
      await runner.interpret({
        schema_version: SOURCE_INTERPRET_SCHEMA_VERSION,
        fragments: [],
        topics: [],
      })
    } catch (e) {
      reason = (e as InterpretRunnerError).reason
    }
    expect(reason).toBe('runner-version-mismatch')
  })

  it('③ **缺**版本号 ⇒ 同样是 `runner-version-mismatch`（缺也是不兼容）', async () => {
    const script = fakeInterpreter('{"items":[],"model":"m","provider":"p"}')
    const runner = new CommandInterpretRunner({ cmd: script, model: 'm', provider: 'p' })
    let reason: string | undefined
    try {
      await runner.interpret({
        schema_version: SOURCE_INTERPRET_SCHEMA_VERSION,
        fragments: [],
        topics: [],
      })
    } catch (e) {
      reason = (e as InterpretRunnerError).reason
    }
    expect(reason).toBe('runner-version-mismatch')
  })
})

// ───────────── 增强 4：解读结果可导出（产物里没有路径、没有源码） ─────────────

describe('M9 增强 4 · 解读结果的导出（**产物不含绝对路径、不含源码正文**）', () => {
  /** 造一个带**绝对路径**的解读结果。 */
  function summaryWithPath(projectRoot: string): SourceInterpretSummary {
    return {
      status: 'ok',
      project_id: 'p1',
      // ⚠️ **provider 与用量**（增强 1/4 新增的两列）—— 导出产物里也不该有它们
      provider: 'local',
      fragment_count: 1,
      item_count: 1,
      risk_count: 1,
      divergence_count: 1,
      divergences: [
        { topic_slug: 'python-logging', deterministic_state: 'active', ai_state: 'mastered' },
      ],
      items: [
        {
          topic_slug: 'python-logging',
          summary: `这个文件在 ${projectRoot}/app.py 里`,
          risks: [`日志写到了 ${projectRoot}/app.log`],
          claim_state: 'mastered',
        },
      ],
      input_hash: 'abc123',
      usage: null,
      failure_reason: null,
    }
  }

  it('① ⚠️ **先自证**：造出来的解读里**确实有**绝对路径（否则下面两条断言可能是恒真的）', () => {
    const dir = makeProject({ 'app.py': 'a\n' })
    const summary = summaryWithPath(dir)
    expect(summary.items[0]?.risks[0] ?? '').toContain(dir)
  })

  it('② 导出的产物里**没有绝对路径**（项目根被换成相对路径）', () => {
    const dir = makeProject({ 'app.py': 'a\n' })
    const md = formatInterpretMarkdown(summaryWithPath(dir), { projectRoot: dir })
    expect(md).not.toContain(dir)
    expect(md).not.toContain('/app.py')
    expect(md).not.toContain('/app.log')
  })

  it('③ 导出的产物里**没有源码正文**（片段正文压根没进这个形状）', () => {
    const dir = makeProject({ 'app.py': 'MARKER_SECRET_BODY\n' })
    const md = formatInterpretMarkdown(summaryWithPath(dir), { projectRoot: dir })
    expect(md).not.toContain('MARKER_SECRET_BODY')
  })

  it('④ 分歧**为 0 也要写出来**（不许空白 —— P5 出口条件在导出物里同样成立）', () => {
    const dir = makeProject({ 'app.py': 'a\n' })
    const summary = summaryWithPath(dir)
    const md = formatInterpretMarkdown(
      { ...summary, divergence_count: 0, divergences: [] },
      { projectRoot: dir },
    )
    expect(md).toContain('与确定性层的分歧（0）')
    expect(md).toContain('没有分歧')
  })
})

// ───────── 增强 5：「记住全发」记的是范围，不是快照 ─────────

describe('M9 增强 5 · 「记住全发」的作用域（**范围，不是快照**）', () => {
  it('① 记忆是「全发」＋ 这次发了**全部**可勾命中 ⇒ 记忆起了作用', () => {
    const sent = new Set([1, 2, 3])
    const all = new Set([1, 2, 3])
    const detail = deriveConsentDetail(true, sent, all, false)
    expect(detail).toBe('memory_applied')
    expect(consentSourceFromDetail(detail)).toBe('remembered')
  })

  it('② 记忆是「全发」但**只发了一部分** ⇒ 用户自己选的（不是记忆带过去的）', () => {
    const sent = new Set([1, 2])
    const all = new Set([1, 2, 3])
    const detail = deriveConsentDetail(true, sent, all, false)
    expect(detail).toBe('user_partial')
    expect(consentSourceFromDetail(detail)).toBe('explicit_tick')
  })

  it('③ **新增了一条命中**、这次只发了旧的 ⇒ 没覆盖全部 ⇒ 不算记忆带过去的', () => {
    const sent = new Set([1, 2])
    const all = new Set([1, 2, 3])
    expect(deriveConsentDetail(true, sent, all, false)).toBe('user_partial')
  })

  it('④ 没有记忆 ⇒ 纯用户主动', () => {
    const detail = deriveConsentDetail(null, new Set([1]), new Set([1, 2]), false)
    expect(detail).toBe('no_memory')
    expect(consentSourceFromDetail(detail)).toBe('explicit_tick')
  })

  it('⑤ ⚠️ **owner 2026-10-22 要的那条区分**：记忆是「全发」＋ 用户**自己又全勾了一遍** ⇒ `user_reticked`', () => {
    const sent = new Set([1, 2, 3])
    const all = new Set([1, 2, 3])
    const detail = deriveConsentDetail(true, sent, all, true)
    // ⚠️ **二分不变**（集合相同 ⇒ 仍是 remembered），**细分**才分得开
    expect(detail).toBe('user_reticked')
    expect(consentSourceFromDetail(detail)).toBe('remembered')
  })

  it('⑥ 「全不发」记忆 ＋ 一条都没发 ⇒ 记忆起了作用', () => {
    const detail = deriveConsentDetail(false, new Set(), new Set([1, 2]), false)
    expect(detail).toBe('memory_applied')
  })
})

// ---------------------------------------------------------------------------
// 增强 1/4 · 解读结果的 **provider ＋ 用量**，以及它们**落进台账**
// ---------------------------------------------------------------------------

describe('M9 增强 1/4 · 摘要带 provider 与用量，台账落三列', () => {
  /** 一个项目 ＋ 一条命中（指向真实存在的文件）。 */
  function seedProject(db: SqliteDatabase, root: string): number {
    db.prepare(
      `INSERT INTO projects (id, name, stages_snapshot, status, local_path, created_at, updated_at)
       VALUES ('p1', '测试项目', '[]', 'active', ?, '2026-10-21T00:00:00.000Z', '2026-10-21T00:00:00.000Z')`,
    ).run(root)
    db.prepare(
      `INSERT INTO lang_topics (lang, slug, title, summary, stage_id, kind)
       VALUES ('go', 'go-concurrent', 'Go 并发', '', 5, 'language')`,
    ).run()
    // ⚠️ 知识点行只是给命中挂 FK（命中要指到一条知识点）
    db.prepare('SELECT id FROM lang_topics WHERE slug = ?').get('go-concurrent')
    saveFindings(db, 1, 'p1', [
      {
        topic_slug: 'go-concurrent',
        file_rel_path: 'main.go',
        line: 1,
        col: 1,
        matched_pattern: 'go func() { fmt.Println("hi") }()',
        confidence: 'confirmed',
        scanner_mode: 'parser',
      },
    ])
    const finding = db
      .prepare('SELECT id FROM lang_topic_findings WHERE project_id = ?')
      .get('p1') as { id: number }
    return finding.id
  }

  /**
   * 一个假 runner。
   *
   * ⚠️ **runner 上的 provider/model 与它返回的结果里的 provider/model 故意不同**
   *   ⇒ 用来证明「台账记的是**配置的那家**（runner 身上的），不是模型自述的」。
   */
  function fakeRunner(usage: SourceInterpretResult['usage']): SourceInterpretRunner {
    return {
      id: 'fake-runner',
      model: 'deepseek-v4-flash',
      provider: 'sensenova',
      interpret: async () => ({
        schema_version: SOURCE_INTERPRET_SCHEMA_VERSION,
        items: [
          {
            topic_slug: 'go-concurrent',
            summary: '这里起了一个 goroutine',
            risks: [],
            claim_state: 'mastered',
          },
        ],
        model: '模型自述的名字',
        provider: '模型自述的厂家',
        ...(usage === undefined ? {} : { usage }),
      }),
    }
  }

  it('① ⚠️ 摘要带 **provider ＋ 用量**（**取 runner 配的那家**，不是模型自述的）', async () => {
    const h = newDb()
    const dir = makeProject({ 'main.go': 'package main\n' })
    const findingId = seedProject(h.db, dir)
    const summary = await interpretSourceFindings(h.db, {
      projectId: 'p1',
      findingIds: [findingId],
      runner: fakeRunner({ prompt_tokens: 1200, completion_tokens: 340, total_tokens: 1540 }),
      now: () => new Date('2026-10-21T00:00:00.000Z'),
    })
    // ⚠️ **provider 是 runner 配的那家**（模型自述的「模型自述的厂家」不算数）
    expect(summary.provider).toBe('sensenova')
    expect(summary.usage?.total_tokens).toBe(1540)
  })

  it('② ⚠️ **台账落三列**（provider / model / 用量）', async () => {
    const h = newDb()
    const dir = makeProject({ 'main.go': 'package main\n' })
    const findingId = seedProject(h.db, dir)
    await interpretSourceFindings(h.db, {
      projectId: 'p1',
      findingIds: [findingId],
      runner: fakeRunner({ prompt_tokens: 1200, completion_tokens: 340, total_tokens: 1540 }),
      now: () => new Date('2026-10-21T00:00:00.000Z'),
    })
    const row = h.db
      .prepare('SELECT provider, model, usage_total_tokens FROM lang_source_shares WHERE project_id = ?')
      .get('p1') as { provider: string; model: string; usage_total_tokens: number | null }
    expect(row.provider).toBe('sensenova')
    expect(row.model).toBe('deepseek-v4-flash')
    expect(row.usage_total_tokens).toBe(1540)
  })

  it('③ ⚠️ **runner 没给用量** ⇒ 台账落 `NULL`（**不是 0** —— 「不知道」与「0 token」是两件事）', async () => {
    const h = newDb()
    const dir = makeProject({ 'main.go': 'package main\n' })
    const findingId = seedProject(h.db, dir)
    const summary = await interpretSourceFindings(h.db, {
      projectId: 'p1',
      findingIds: [findingId],
      runner: fakeRunner(undefined),
      now: () => new Date('2026-10-21T00:00:00.000Z'),
    })
    expect(summary.usage).toBeNull()
    const row = h.db
      .prepare('SELECT usage_total_tokens FROM lang_source_shares WHERE project_id = ?')
      .get('p1') as { usage_total_tokens: number | null }
    expect(row.usage_total_tokens).toBeNull()
  })

  it('④ ⚠️ **按 provider 分组读回来**（增强 1 的分组视图：同一家聚到一行）', async () => {
    const h = newDb()
    const dir = makeProject({ 'main.go': 'package main\n' })
    const findingId = seedProject(h.db, dir)
    await interpretSourceFindings(h.db, {
      projectId: 'p1',
      findingIds: [findingId],
      runner: fakeRunner({ prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }),
      now: () => new Date('2026-10-21T00:00:00.000Z'),
    })
    const rows = readShareByProvider(h.db, '2026-10-01', '2026-10-25')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.provider).toBe('sensenova')
    expect(rows[0]?.model).toBe('deepseek-v4-flash')
    expect(rows[0]?.share_count).toBe(1)
    expect(rows[0]?.usage_total_tokens).toBe(15)
  })
})
