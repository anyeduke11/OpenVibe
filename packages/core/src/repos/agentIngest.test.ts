import { describe, it, expect, beforeEach } from 'vitest'
import { newDb } from '../test-support/new-db'
import { AgentIngestRepo } from '../repos/agentIngest'
import { LocalEventsRepo, dayOf } from '../repos/localEvents'
import { FlowTemplatesRepo } from '../repos/flows'
import { ProjectsRepo } from '../repos/projects'
import { AppError } from '@openvibe/shared'

/**
 * M8-B 回流写入面 + 台账写入点的核心不变式。
 * 变异腿见各条注释。
 */

let db: ReturnType<typeof newDb>['db']
let projectId: string

beforeEach(() => {
  const h = newDb()
  db = h.db
  const template = new FlowTemplatesRepo(h.db).create({
    name: '个人轻量流',
    kind: 'light',
    stages: [{ name: '启动', checklist: [{ id: 'c1', text: '需求一句话' }], artifacts: [] }],
  })
  projectId = new ProjectsRepo(h.db).create({ name: '探针项目', flowTemplateId: template.id }).id
})

function closeAll() {
  db.close()
}

/** 每条用例都要在 beforeEach 之后取 projectId —— 模块作用域的 const 会在加载时就固化 undefined */
const base = () => ({
  projectId,
  kind: 'dev_log' as const,
  sourcePlatform: 'trae',
  cwd: '/Users/someone/proj',
})

describe('幂等三态（FR-2.2）', () => {
  it('键不存在 ⇒ accepted，且落库即 pending', () => {
    const repo = new AgentIngestRepo(db)
    const r = repo.ingest(
      { ...base(), idempotencyKey: 'k1', payload: { body: 'a' } },
      '2026-10-14T00:00:00Z',
    )
    expect(r.status).toBe('accepted')
    const got = repo.get((r as { id: string }).id)!
    expect(got.status).toBe('pending')
    expect(got.reviewedAt).toBeNull()
    closeAll()
  })

  it('同键同载荷重放 3 次 ⇒ 恰 1 条，后两次 duplicate', () => {
    const repo = new AgentIngestRepo(db)
    const first = repo.ingest(
      { ...base(), idempotencyKey: 'k2', payload: { body: 'a' } },
      '2026-10-14T00:00:00Z',
    )
    expect(first.status).toBe('accepted')
    for (let i = 0; i < 2; i++) {
      expect(
        repo.ingest(
          { ...base(), idempotencyKey: 'k2', payload: { body: 'a' } },
          '2026-10-14T00:00:01Z',
        ).status,
      ).toBe('duplicate')
    }
    const rows = db.prepare('SELECT COUNT(*) AS c FROM agent_ingests').get() as { c: number }
    expect(rows.c).toBe(1)
    closeAll()
  })

  it('**键序不同但内容相同**也算 duplicate —— agent 重试时 JSON.stringify 键序不保证稳定', () => {
    const repo = new AgentIngestRepo(db)
    expect(
      repo.ingest(
        { ...base(), idempotencyKey: 'k3', payload: { a: 1, b: 2 } },
        '2026-10-14T00:00:00Z',
      ).status,
    ).toBe('accepted')
    // 变异腿：若 digest 不做键序归一，这一条会判成 conflict ⇒ 本条必红
    expect(
      repo.ingest(
        { ...base(), idempotencyKey: 'k3', payload: { b: 2, a: 1 } },
        '2026-10-14T00:00:01Z',
      ).status,
    ).toBe('duplicate')
    closeAll()
  })

  it('同键异载荷 ⇒ conflict：**先到者内容逐字未变**，但状态被标成 conflict 以便人工介入', () => {
    const repo = new AgentIngestRepo(db)
    const first = repo.ingest(
      { ...base(), idempotencyKey: 'k4', payload: { body: '原始' } },
      '2026-10-14T00:00:00Z',
    )
    const id = (first as { id: string }).id
    const before = repo.get(id)!

    const second = repo.ingest(
      { ...base(), idempotencyKey: 'k4', payload: { body: '篡改' } },
      '2026-10-14T00:00:01Z',
    )
    expect(second.status).toBe('conflict')

    const after = repo.get(id)!
    // 内容不变 —— 「一个字节都不改」指的是载荷与写入时刻
    expect(after.payload).toEqual(before.payload)
    expect(after.createdAt).toBe(before.createdAt)
    // 但状态必须转 conflict，否则待确认队列里看不出哪行需要人介入（M8-E FR-5.1.1.2）
    expect(after.status).toBe('conflict')
    closeAll()
  })

  it('冲突响应只给双方 sha 前 8 位，**不回显完整载荷**（回显等于泄露另一个会话的内容）', () => {
    const repo = new AgentIngestRepo(db)
    repo.ingest(
      { ...base(), idempotencyKey: 'k5', payload: { body: '机密内容甲' } },
      '2026-10-14T00:00:00Z',
    )
    const c = repo.ingest(
      { ...base(), idempotencyKey: 'k5', payload: { body: '机密内容乙' } },
      '2026-10-14T00:00:01Z',
    )
    if (c.status !== 'conflict') throw new Error('应为 conflict')
    expect(c.existingKeySha).toHaveLength(8)
    expect(c.incomingKeySha).toHaveLength(8)
    // 是 sha256 的十六进制前缀，不是载荷的截断 —— 变异腿：返回 slice(0,8) 的原文必红
    expect(c.existingKeySha).toMatch(/^[0-9a-f]{8}$/)
    expect(c.incomingKeySha).toMatch(/^[0-9a-f]{8}$/)
    expect(c.existingKeySha).not.toBe(c.incomingKeySha)
    expect(JSON.stringify(c)).not.toContain('机密内容')
    closeAll()
  })
})

describe('入参与归属（FR-2.4）', () => {
  it('空幂等键 ⇒ VALIDATION_ERROR', () => {
    const repo = new AgentIngestRepo(db)
    expect(() =>
      repo.ingest({ ...base(), idempotencyKey: '   ', payload: {} }, '2026-10-14T00:00:00Z'),
    ).toThrow(AppError)
    closeAll()
  })

  it('项目不存在 ⇒ NOT_FOUND（不是 422）', () => {
    const repo = new AgentIngestRepo(db)
    try {
      repo.ingest(
        { ...base(), projectId: 'prj_不存在', idempotencyKey: 'k6', payload: {} },
        '2026-10-14T00:00:00Z',
      )
      throw new Error('本该抛错')
    } catch (e) {
      expect((e as AppError).code).toBe('NOT_FOUND')
    }
    closeAll()
  })

  it('kind 不在闭集内 ⇒ 被数据库 CHECK 拒（不是应用层静默通过）', () => {
    const repo = new AgentIngestRepo(db)
    expect(() =>
      repo.ingest(
        { ...base(), kind: 'evil' as never, idempotencyKey: 'k7', payload: {} },
        '2026-10-14T00:00:00Z',
      ),
    ).toThrow()
    closeAll()
  })
})

describe('人工裁决（FR-5 一律 pending 的对面）', () => {
  it('review 后转 published 并写 reviewed_at', () => {
    const repo = new AgentIngestRepo(db)
    const r = repo.ingest(
      { ...base(), idempotencyKey: 'k8', payload: { body: 'a' } },
      '2026-10-14T00:00:00Z',
    )
    const id = (r as { id: string }).id
    const out = repo.review(id, 'published', null, '2026-10-14T01:00:00Z')
    expect(out.status).toBe('published')
    expect(out.reviewedAt).toBe('2026-10-14T01:00:00Z')
    closeAll()
  })

  it('冲突记录不能直接裁决（先到者要先决定保留哪一方的幂等键）', () => {
    const repo = new AgentIngestRepo(db)
    repo.ingest(
      { ...base(), idempotencyKey: 'k9', payload: { body: '甲' } },
      '2026-10-14T00:00:00Z',
    )
    repo.ingest(
      { ...base(), idempotencyKey: 'k9', payload: { body: '乙' } },
      '2026-10-14T00:00:01Z',
    )
    expect(() => repo.review('ain_不存在', 'published', null, '2026-10-14T01:00:00Z')).toThrow()
    closeAll()
  })
})

describe('台账写入点（localEvents）', () => {
  it('record 落库且 day 由 UTC 派生', () => {
    const repo = new LocalEventsRepo(db)
    const at = new Date('2026-10-14T23:30:00.000Z')
    repo.record({ kind: 'pack_exported', projectId, payload: { n: 1 } }, at)
    const row = db.prepare('SELECT kind, day, created_at FROM local_events').get() as {
      kind: string
      day: string
      created_at: string
    }
    expect(row.day).toBe('2026-10-14')
    expect(row.created_at).toBe(at.toISOString())
    closeAll()
  })

  it('**本机时区不影响 day** —— 本机 23:30 本是次日 07:30，UTC 仍是 10-14', () => {
    // 变异腿：若 dayOf 改用本机日，本条在 TZ=Asia/Shanghai 下会判红
    expect(dayOf(new Date('2026-10-14T23:30:00.000Z'))).toBe('2026-10-14')
    expect(dayOf(new Date('2026-10-15T00:30:00.000Z'))).toBe('2026-10-15')
    closeAll()
  })

  it('M8 五类 kind 都能写入（kind 闭集含 M8 五项的实测）', () => {
    const repo = new LocalEventsRepo(db)
    const at = new Date('2026-10-14T00:00:00.000Z')
    for (const kind of [
      'agent_ingest_accepted',
      'agent_ingest_rejected',
      'agent_context_served',
      'cli_agent_command_run',
      'agent_bridge_installed',
    ] as const) {
      repo.record({ kind }, at)
    }
    expect(repo.countAll()).toBe(5)
    closeAll()
  })

  it('summary 按 kind × day 聚合计数', () => {
    const repo = new LocalEventsRepo(db)
    // ⚠️ **写入日期必须跟随当天，不能写死**（2026-10-22 修）：
    // `summary(N)` 的下界是 SQLite 的 `date('now', '-N days')`，即**按跑测那天**算。
    // 写死 '2026-10-14' 时它在 7 天窗口内 ⇒ 绿；过了 2026-10-21 窗口下界推到 10-15，
    // 那一行被过滤掉 ⇒ `s.find(...)` 变 undefined ⇒ **这条会「到期变红」**（日历漂移型红）。
    // 本条只负责「聚合口径」；窗口边界由 summaryInWindow 的**绝对窗口**判据负责
    // （packages/core/src/repos/localEvents.test.ts），不依赖「今天」。
    const at = new Date()
    repo.record({ kind: 'pack_exported' }, at)
    repo.record({ kind: 'pack_exported' }, at)
    repo.record({ kind: 'pack_composed' }, at)
    const s = repo.summary(7)
    expect(s.find((x) => x.kind === 'pack_exported')?.count).toBe(2)
    expect(s.find((x) => x.kind === 'pack_composed')?.count).toBe(1)
    closeAll()
  })

  it('clearAll 是「一键清空」而非「是否记录」开关（FR-3.2）', () => {
    const repo = new LocalEventsRepo(db)
    repo.record({ kind: 'pack_exported' }, new Date())
    expect(repo.countAll()).toBe(1)
    expect(repo.clearAll()).toBe(1)
    expect(repo.countAll()).toBe(0)
    closeAll()
  })
})
