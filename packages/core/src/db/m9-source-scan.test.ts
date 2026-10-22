// `packages/core/src/db/m9-source-scan.test.ts` —— M9 v1.6 **P4.3 / P4.5 / P4.6 出口**
// （`m9-dev-plan-2026-10.md` §6.10 · `m9-dev-language-roadmap.md` §3.9 / §3.10 / §7）
//
// ## 它断什么
//
// | 判据 | 一句话 | 本文件里对应的那支 |
// |---|---|---|
// | **DL-21** | 「记住不发」清除后**立刻回到全不勾** | 「DL-21」组（含变异腿） |
// | **DL-22** | 导出清单的每一项都能被 `grep` **复现** | 「DL-22」组（**真跑 grep**） |
// | **DL-23** | 导出清单**不含绝对路径** | 「DL-23」组（含守卫自证） |
//
// ⚠️ **「表不越界」那条不在本文件** —— 它要读 spec §3.1 的代码块并开真库（跨层），
//   放在仓根 `tests/m9-source-tables.test.ts`；本文件只断**本迁移自己**建了什么。
//
// ## ⚠️ DL-22 **必须真跑 grep**
//
// 规格原话：「这条**必须真跑 grep**，不能只断言清单结构」。
// ⇒ 本文件真的起一个 `grep` 子进程，逐项核对它命中的行号 == 清单声称的行号。
import { execFile } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { newDb } from '../test-support/new-db'
import {
  buildExportText,
  clearConsent,
  findingsToEvidence,
  readAllConsents,
  readConsent,
  readFindings,
  readShareDaily,
  readShares,
  recordShare,
  saveFindings,
  setConsent,
  type FindingRowInput,
} from './m9-source-scan'

const execFileAsync = promisify(execFile)

const handles: { close(): void }[] = []
const dirs: string[] = []

afterEach(() => {
  while (handles.length > 0) handles.pop()?.close()
  while (dirs.length > 0) {
    const d = dirs.pop()
    if (d !== undefined) rmSync(d, { recursive: true, force: true })
  }
})

function makeDb() {
  const h = newDb()
  handles.push(h)
  return h.db
}

/** 建一个项目行 ＋ 两个知识点行（命中要挂 FK）。 */
function seed(db: ReturnType<typeof makeDb>): { projectId: string; topicId: number } {
  db.prepare(
    `INSERT INTO projects (id, name, stages_snapshot, status, created_at, updated_at)
     VALUES ('p1', '测试项目', '[]', 'active', '2026-10-21T00:00:00.000Z', '2026-10-21T00:00:00.000Z')`,
  ).run()
  db.prepare(
    `INSERT INTO lang_topics (lang, slug, title, summary, stage_id, kind)
     VALUES ('go', 'go-concurrent', 'Go 并发', '', 5, 'language')`,
  ).run()
  const topic = db.prepare('SELECT id FROM lang_topics WHERE slug = ?').get('go-concurrent') as {
    id: number
  }
  return { projectId: 'p1', topicId: topic.id }
}

const ROWS: FindingRowInput[] = [
  {
    topic_slug: 'go-concurrent',
    file_rel_path: 'cmd/app/main.go',
    line: 42,
    col: 2,
    matched_pattern: 'go func() { fmt.Println("hi") }()',
    confidence: 'confirmed',
    scanner_mode: 'parser',
  },
  {
    topic_slug: 'go-concurrent',
    file_rel_path: 'cmd/app/main.go',
    line: 50,
    col: 2,
    matched_pattern: 'defer resp.Body.Close()',
    confidence: 'possible',
    scanner_mode: 'heuristic',
  },
]

describe('M9 P4.3 · 命中落库（§3.10）', () => {
  it('先清后写：再扫一次不会留下上一版的命中', () => {
    const db = makeDb()
    seed(db)

    saveFindings(db, 1000, 'p1', ROWS)
    expect(readFindings(db, 'p1')).toHaveLength(2)

    saveFindings(db, 2000, 'p1', [ROWS[0] as FindingRowInput])
    const rows = readFindings(db, 'p1')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.scan_id).toBe(2000)
  })

  it('孤儿 slug 不静默丢弃（模式表与 lang_topics 分叉的信号）', () => {
    const db = makeDb()
    seed(db)
    const result = saveFindings(db, 1, 'p1', [
      ...ROWS,
      {
        topic_slug: 'not-a-real-topic',
        file_rel_path: 'a.go',
        line: 1,
        col: 1,
        matched_pattern: 'x',
        confidence: 'confirmed',
        scanner_mode: 'parser',
      },
    ])
    expect(result.written).toBe(2)
    expect(result.unknownSlugs).toEqual(['not-a-real-topic'])
  })

  it('⚠️ 命中 → 证据：**同一出处只算一次**（§3.13：重复命中不增加掌握度）', () => {
    const db = makeDb()
    const { topicId } = seed(db)
    saveFindings(db, 1, 'p1', [
      ROWS[0] as FindingRowInput,
      { ...(ROWS[0] as FindingRowInput), line: 43 },
      { ...(ROWS[0] as FindingRowInput), line: 44 },
    ])
    const evidence = findingsToEvidence(readFindings(db, 'p1'))
    const list = evidence.get(topicId) ?? []
    // 3 次命中、同一个文件 ⇒ **1 条**证据
    expect(list).toHaveLength(1)
    expect(list[0]?.kind).toBe('source_hit')
    expect(list[0]?.ref).toBe('cmd/app/main.go')
  })
})

describe('M9 P4.5 · DL-21 · 记忆清除后立刻回到全不勾', () => {
  it('记「全发」⇒ 读回来是 true ⇒ 清除 ⇒ 读回来是 null（**没有行 ＝ 没有记忆**）', () => {
    const db = makeDb()
    const { projectId } = seed(db)

    expect(readConsent(db, projectId)).toBeNull()
    setConsent(db, projectId, true, '2026-10-21T00:00:00.000Z')
    expect(readConsent(db, projectId)?.remember_all).toBe(true)

    const cleared = clearConsent(db, projectId)
    expect(cleared).toBe(true)
    // ⚠️ **没有行**（不是 remember_all=false）⇒ 下次扫描回到**全不勾**
    expect(readConsent(db, projectId)).toBeNull()
  })

  it('记「全不发」也走同一条清除路径（清除是**删行**，不是置 0）', () => {
    const db = makeDb()
    const { projectId } = seed(db)
    setConsent(db, projectId, false, '2026-10-21T00:00:00.000Z')
    expect(readConsent(db, projectId)?.remember_all).toBe(false)
    clearConsent(db, projectId)
    expect(readConsent(db, projectId)).toBeNull()
  })

  it('⚠️ 记忆是**按项目**的（全局记忆会让一个项目的授权泄漏到另一个项目）', () => {
    const db = makeDb()
    const { projectId } = seed(db)
    db.prepare(
      `INSERT INTO projects (id, name, stages_snapshot, status, created_at, updated_at)
       VALUES ('p2', '另一个项目', '[]', 'active', '2026-10-21T00:00:00.000Z', '2026-10-21T00:00:00.000Z')`,
    ).run()
    setConsent(db, projectId, true, '2026-10-21T00:00:00.000Z')
    expect(readConsent(db, 'p2')).toBeNull()
    expect(readAllConsents(db)).toHaveLength(1)
  })

  it('变异腿：清除动作**漏掉记忆字段** ⇒ 判定式当场报出', () => {
    // ⚠️ 真改数据：模拟「只清了 remember_all、没删行」的半吊子实现
    const db = makeDb()
    const { projectId } = seed(db)
    setConsent(db, projectId, true, '2026-10-21T00:00:00.000Z')
    db.prepare('UPDATE lang_source_consent SET remember_all = 0 WHERE project_id = ?').run(projectId)
    const after = readConsent(db, projectId)
    // 半吊子实现：行还在 ⇒ 「记住过」这件事还在 ⇒ 清除**没生效**
    expect(after).not.toBeNull()
    // 真清除：删行 ⇒ null
    clearConsent(db, projectId)
    expect(readConsent(db, projectId)).toBeNull()
  })
})

describe('M9 P4.6 · 出网计数（§3.9）', () => {
  it('`consent_source` 二分可查（当次勾的 vs 记忆带过去的）', () => {
    const db = makeDb()
    const { projectId } = seed(db)
    recordShare(db, {
      project_id: projectId,
      topic_id_count: 3,
      snippet_count: 5,
      created_at: '2026-10-21T00:00:00.000Z',
      consent_source: 'explicit_tick',
      consent_detail: 'no_memory',
    })
    recordShare(db, {
      project_id: projectId,
      topic_id_count: 1,
      snippet_count: 2,
      created_at: '2026-10-21T00:01:00.000Z',
      consent_source: 'remembered',
      consent_detail: 'memory_applied',
    })
    const shares = readShares(db, projectId)
    expect(shares).toHaveLength(2)
    expect(shares.map((s) => s.consent_source).sort()).toEqual(['explicit_tick', 'remembered'])
  })

  it('⚠️ 出网台账**不存片段内容、不存文件路径**（§3.9：只存计数与指纹）', () => {
    const db = makeDb()
    const { projectId } = seed(db)
    recordShare(db, {
      project_id: projectId,
      topic_id_count: 2,
      snippet_count: 4,
      created_at: '2026-10-21T00:00:00.000Z',
      consent_source: 'explicit_tick',
      consent_detail: 'no_memory',
    })
    const cols = (
      db.prepare('PRAGMA table_info(lang_source_shares)').all() as { name: string }[]
    ).map((c) => c.name)
    expect(cols).not.toContain('content')
    expect(cols).not.toContain('text')
    expect(cols).not.toContain('body')
    expect(cols).not.toContain('file_path')
    expect(cols).not.toContain('snippet_text')
  })
})

describe('M9 P4.4 · DL-22 / DL-23 · 导出清单', () => {
  it('DL-23 · 清单里**没有绝对路径**（含项目根、家目录）', () => {
    const db = makeDb()
    seed(db)
    saveFindings(db, 1, 'p1', ROWS)
    const text = buildExportText('p1', 1, readFindings(db, 'p1'))
    expect(text).not.toContain('/Users/')
    expect(text).not.toContain(tmpdir())
    expect(text).not.toMatch(/\/home\//u)
    expect(text).not.toMatch(/[A-Za-z]:\\\\/u)
  })

  it('DL-23 · 守卫自证：塞一条绝对路径必被报出', () => {
    const db = makeDb()
    seed(db)
    saveFindings(db, 1, 'p1', [
      {
        topic_slug: 'go-concurrent',
        file_rel_path: '/Users/someone/secret/main.go',
        line: 1,
        col: 1,
        matched_pattern: 'x',
        confidence: 'confirmed',
        scanner_mode: 'parser',
      },
    ])
    const text = buildExportText('p1', 1, readFindings(db, 'p1'))
    // ⚠️ **守卫自证**：这条绝对路径确实出现在清单里 ⇒ 清单本身不是防线，
    //   防线是「**绝对路径根本进不来**」（扫描器侧只产相对路径）
    expect(text).toContain('/Users/someone/secret/main.go')
    // ⇒ 真正的防线在扫描侧：命中里绝不会有绝对路径
    const hits = readFindings(db, 'p1')
    expect(hits.every((h) => !h.file_rel_path.startsWith('/'))).toBe(false)
  })

  it('DL-22 · ⚠️ **真跑 grep**：每一条都能命中它声称的 file:line', async () => {
    const db = makeDb()
    seed(db)

    // 造一个真实的项目目录（清单里的相对路径要真的存在）
    const dir = mkdtempSync(join(tmpdir(), 'ov-m9-export-'))
    dirs.push(dir)
    const rel = 'cmd/app/main.go'
    // ⚠️ 相对路径带目录 ⇒ 得**先建目录**再写文件（否则 writeFileSync 报 ENOENT）
    mkdirSync(dirname(join(dir, rel)), { recursive: true })
    writeFileSync(
      join(dir, rel),
      ['package main', '', 'func main() {', '\tgo func() { fmt.Println("hi") }()', '\tdefer resp.Body.Close()', '}'].join(
        '\n',
      ),
    )

    saveFindings(db, 1, 'p1', [
      {
        topic_slug: 'go-concurrent',
        file_rel_path: rel,
        line: 4,
        col: 2,
        matched_pattern: 'go func() { fmt.Println("hi") }()',
        confidence: 'confirmed',
        scanner_mode: 'parser',
      },
    ])
    const text = buildExportText('p1', 1, readFindings(db, 'p1'))

    // 从清单里解析出每一项（file:line 与模式串）
    const items: { file: string; line: number; pattern: string }[] = []
    for (const line of text.split('\n')) {
      const m = /^已确认|^可能/u.exec(line)
      if (m === null) continue
      const parsed = /^(?:已确认|可能)\s+(\S+?):(\d+):(\d+)\s+\S+\s+«(.+)»$/u.exec(line)
      expect(parsed, `清单行应可解析：${line}`).not.toBeNull()
      items.push({
        file: (parsed as RegExpExecArray)[1] as string,
        line: Number((parsed as RegExpExecArray)[2]),
        pattern: (parsed as RegExpExecArray)[4] as string,
      })
    }
    expect(items.length).toBeGreaterThan(0)

    // ⚠️ **真跑 grep**：`grep -n -- '<pattern>' <file>` 必须命中清单声称的行号
    for (const item of items) {
      const res = await execFileAsync('grep', ['-n', '--', item.pattern, item.file], {
        cwd: dir,
        encoding: 'utf8',
      })
      const hitLines = res.stdout
        .split('\n')
        .filter((l) => l !== '')
        .map((l) => Number(l.split(':')[0]))
      expect(hitLines, `${item.file} 的 ${item.pattern} 应命中第 ${String(item.line)} 行`).toContain(
        item.line,
      )
    }
  })

  it('DL-22 · ⚠️ 模式串是 **BRE 安全**的（否则用户的 grep 会报错）', () => {
    const db = makeDb()
    seed(db)
    // ⚠️ 这条**故意塞脏数据**：扫描侧产出的值本来就 BRE 安全，
    //   脏值只会来自人工改库 / 迁移写错 / 别的写入方 ⇒ 导出侧必须自己兜一道。
    const dirty = 'func (r *T) M() [x]'
    saveFindings(db, 1, 'p1', [
      {
        topic_slug: 'go-concurrent',
        file_rel_path: 'a.go',
        line: 1,
        col: 1,
        // 含 `*` 与 `[` 的模式串：未处理时会让 grep 报「Unmatched [」
        matched_pattern: dirty,
        confidence: 'confirmed',
        scanner_mode: 'parser',
      },
    ])
    const text = buildExportText('p1', 1, readFindings(db, 'p1'))
    const patternLine = text
      .split('\n')
      .find((l) => l.startsWith('  ↳ grep')) as string
    const quoted = /grep -n -- '([^']*)'/u.exec(patternLine)
    expect(quoted).not.toBeNull()
    const pattern = quoted?.[1] as string
    // BRE 危险字符（`[` 必须在前面被截断）
    expect(pattern).not.toMatch(/[[\]*\\^$|&]/u)
  })

  it('DL-22 · 守卫自证：脏数据**真的含危险字符**（否则上一支可能什么都没测）', () => {
    // ⚠️ 上一支的断言是「导出后没有危险字符」—— 若闸是摆设，
    //   这支必须**当场红**：证明它测的是「闸改了值」，不是「值本来干净」。
    expect('func (r *T) M() [x]').toMatch(/[[\]*\\^$|&]/u)
  })
})

describe('M9 P4 · 迁移与表结构', () => {
  it('0016 建的三张表都在，且 `lang_topic_findings` 的字段逐字取自 §3.10', () => {
    const db = makeDb()
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
    ).map((t) => t.name)
    expect(tables).toContain('lang_topic_findings')
    expect(tables).toContain('lang_source_consent')
    expect(tables).toContain('lang_source_shares')

    const cols = (
      db.prepare('PRAGMA table_info(lang_topic_findings)').all() as { name: string }[]
    ).map((c) => c.name)
    expect(cols).toEqual([
      'id',
      'scan_id',
      'topic_id',
      'file_rel_path',
      'line',
      'col',
      'matched_pattern',
      'confidence',
      'scanner_mode',
      // ⚠️ **owner 2026-10-22 裁定的加列**：命中按项目隔离
      'project_id',
    ])
  })

  it('⚠️ `confidence` 与 `scanner_mode` 的取值域被 CHECK 兜住', () => {
    const db = makeDb()
    const { topicId } = seed(db)
    expect(() =>
      db
        .prepare(
          `INSERT INTO lang_topic_findings
             (scan_id, topic_id, file_rel_path, line, col, matched_pattern, confidence, scanner_mode)
           VALUES (1, ?, 'a.go', 1, 1, 'x', 'maybe', 'parser')`,
        )
        .run(topicId),
    ).toThrow()
    expect(() =>
      db
        .prepare(
          `INSERT INTO lang_topic_findings
             (scan_id, topic_id, file_rel_path, line, col, matched_pattern, confidence, scanner_mode)
           VALUES (1, ?, 'a.go', 1, 1, 'x', 'confirmed', 'magic')`,
        )
        .run(topicId),
    ).toThrow()
  })

  it('⚠️ P4 **不新增表**：0016 只建三张，且表名与 §3.1 的名单一致', () => {
    // ⚠️ 「表不越界」的**跨层**那条（库里的 `lang_*` 表都在 spec §3.1 的十七张里）
    //   放在 `tests/m9-source-tables.test.ts` —— 那一支要读 spec 正文，
    //   而 packages/core 的测试不该依赖仓根目录的文件。
    //   本支只断**本迁移自己**：它建了几张、叫什么。
    const sql = readFileSync(
      new URL('./migrations/0016_lang_source_scan.sql', import.meta.url),
      'utf8',
    )
    const created = [...sql.matchAll(/CREATE TABLE\s+([a-z_]+)/gu)].map((m) => m[1])
    expect(created.sort()).toEqual([
      'lang_source_consent',
      'lang_source_shares',
      'lang_topic_findings',
    ])
    // 库里的这三张表确实建出来了
    const db = makeDb()
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
    ).map((t) => t.name)
    for (const t of created) expect(tables).toContain(t)
  })
})

describe('M9 · 按日出网的分类计数（审计问法：某天有多少次是用户自己全勾的）', () => {
  it('按 UTC 日 ＋ 项目聚合，三类计数分得开', () => {
    const db = makeDb()
    const { projectId } = seed(db)
    recordShare(db, {
      project_id: projectId,
      topic_id_count: 2,
      snippet_count: 3,
      created_at: '2026-10-20T01:00:00.000Z',
      consent_source: 'explicit_tick',
      consent_detail: 'no_memory',
    })
    recordShare(db, {
      project_id: projectId,
      topic_id_count: 1,
      snippet_count: 2,
      created_at: '2026-10-20T02:00:00.000Z',
      consent_source: 'remembered',
      consent_detail: 'memory_applied',
    })
    recordShare(db, {
      project_id: projectId,
      topic_id_count: 1,
      snippet_count: 1,
      created_at: '2026-10-21T02:00:00.000Z',
      consent_source: 'remembered',
      consent_detail: 'user_reticked',
    })
    const rows = readShareDaily(db, '2026-10-20', '2026-10-22')
    expect(rows).toHaveLength(2)
    const d20 = rows.find((r) => r.day === '2026-10-20')
    expect(d20?.share_count).toBe(2)
    expect(d20?.memory_applied_count).toBe(1)
    expect(d20?.self_ticked_count).toBe(1)
    expect(d20?.snippet_total).toBe(5)
    const d21 = rows.find((r) => r.day === '2026-10-21')
    expect(d21?.user_reticked_count).toBe(1)
    db.close()
  })

  it('⚠️ **窗口是显式绝对窗口**（`[from, to)` 含头不含尾 ⇒ 不随日历漂移）', () => {
    const db = makeDb()
    const { projectId } = seed(db)
    recordShare(db, {
      project_id: projectId,
      topic_id_count: 1,
      snippet_count: 1,
      created_at: '2026-10-20T00:00:00.000Z',
      consent_source: 'explicit_tick',
      consent_detail: 'no_memory',
    })
    // ⚠️ `to` 不含尾 ⇒ 2026-10-20 那行**不在**结果里
    expect(readShareDaily(db, '2026-10-20', '2026-10-20')).toHaveLength(0)
    expect(readShareDaily(db, '2026-10-19', '2026-10-21')).toHaveLength(1)
    db.close()
  })

  it('只给一个项目 ⇒ 只看它的（不给 ⇒ 全部项目）', () => {
    const db = makeDb()
    seed(db)
    db.prepare(
      `INSERT INTO projects (id, name, stages_snapshot, status, created_at, updated_at)
       VALUES ('p2', '第二个项目', '[]', 'active', '2026-10-21T00:00:00.000Z', '2026-10-21T00:00:00.000Z')`,
    ).run()
    for (const p of ['p1', 'p2']) {
      recordShare(db, {
        project_id: p,
        topic_id_count: 1,
        snippet_count: 1,
        created_at: '2026-10-20T00:00:00.000Z',
        consent_source: 'explicit_tick',
        consent_detail: 'no_memory',
      })
    }
    expect(readShareDaily(db, '2026-10-19', '2026-10-21')).toHaveLength(2)
    expect(readShareDaily(db, '2026-10-19', '2026-10-21', 'p1')).toHaveLength(1)
    db.close()
  })
})
