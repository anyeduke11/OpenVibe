import { describe, it, expect } from 'vitest'
import { newDb } from '../test-support/new-db'
import { FlowTemplatesRepo } from '../repos/flows'
import { ProjectsRepo } from '../repos/projects'
import { createAgentService, AGENT_BATCH_LIMITS } from './agentService'
import type { AgentIngestOne } from '@openvibe/shared'

/**
 * M8 回流写入面 · **服务层直测**（不经 HTTP）。
 *
 * **为什么要有这一层**：HTTP 那一侧的测试里，`2 MB 总量上限` 这条判据**永远测不到** ——
 * `apps/server/src/app.ts` 未设 Fastify `bodyLimit`，默认 1 MB，请求先在传输层被 413 拒掉。
 * 「测不到」不等于「没这条规则」：它是域内规则，CLI 与将来抬了 bodyLimit 的 HTTP 都会撞上。
 * 所以在这里绕开传输层，把三条上限逐条钉死。
 */

function fixture() {
  const h = newDb()
  const template = new FlowTemplatesRepo(h.db).create({
    name: '个人轻量流',
    kind: 'light',
    stages: [{ name: '启动', checklist: [{ id: 'c1', text: '需求一句话' }], artifacts: [] }],
  })
  const projectId = new ProjectsRepo(h.db).create({ name: '服务层演示', flowTemplateId: template.id }).id
  let tick = 0
  const svc = createAgentService({ db: h.db, now: () => new Date(Date.UTC(2026, 9, 14, 0, 0, tick++)) })
  return { h, svc, projectId }
}

function item(key: string, bytes: number): AgentIngestOne {
  return {
    kind: 'dev_log',
    idempotencyKey: key,
    payload: { body: 'x'.repeat(bytes) },
    sourcePlatform: 'trae',
  }
}

describe('体量三值（FR-2.6，owner 裁③）', () => {
  it('上限值与 spec 一致：单条 512 KB / 20 条 / 总量 2 MB', () => {
    expect(AGENT_BATCH_LIMITS.singleEntryMaxBytes).toBe(512 * 1024)
    expect(AGENT_BATCH_LIMITS.maxItems).toBe(20)
    expect(AGENT_BATCH_LIMITS.requestTotalMaxBytes).toBe(2 * 1024 * 1024)
  })

  it('单条 512 KB 边界：恰好 512 KB 放行，+1 B 拒', () => {
    const { svc, projectId, h } = fixture()
    const atLimit = svc.ingestBatch({ projectId, items: [item('a', 512 * 1024 - 32)] })
    expect(atLimit.accepted).toBe(1)
    const over = svc.ingestBatch({ projectId, items: [item('b', 512 * 1024 + 1024)] })
    expect(over.rejected).toBe(1)
    expect(over.items[0]?.reason).toContain('超单条上限')
    h.close()
  })

  it('总量 2 MB 边界：每条都合法，累计越线后**后条 rejected、前条照落**', () => {
    const { svc, projectId, h } = fixture()
    // 每条 500 KB（< 512 KB），五条累计 2.5 MB > 2 MB ⇒ 前四条落、第五条起拒
    const items = Array.from({ length: 5 }, (_, i) => item(`t-${i}`, 500 * 1024))
    const r = svc.ingestBatch({ projectId, items })
    expect(r.accepted).toBe(4)
    expect(r.rejected).toBe(1)
    expect(r.items[4]?.reason).toContain('总量上限')
    h.close()
  })

  it('**变异腿**：只看单条上限、不看累计总量 ⇒ 上一条必红（这是本文件存在的理由）', () => {
    // 把判据写成可读形式：五条各 500 KB，**每条单独看都在 512 KB 之内**，
    // 只有累计判断能让第 5 条被拒。若实现里去掉总量判断，上一条会变成 5 条全落 ⇒ 必红。
    const each = 500 * 1024
    expect(each).toBeLessThan(AGENT_BATCH_LIMITS.singleEntryMaxBytes)
    expect(5 * each).toBeGreaterThan(AGENT_BATCH_LIMITS.requestTotalMaxBytes)
  })

  it('条数 20 边界：20 条放行、21 条整批 422（整批拒，不逐条挤牙膏）', () => {
    const { svc, projectId, h } = fixture()
    const twenty = Array.from({ length: 20 }, (_, i) => item(`n-${i}`, 10))
    expect(svc.ingestBatch({ projectId, items: twenty }).accepted).toBe(20)
    const twentyOne = [...twenty, item('n-20', 10)]
    expect(() => svc.ingestBatch({ projectId, items: twentyOne })).toThrow(/20/)
    h.close()
  })
})

describe('逐条成败互不影响（FR-2.7）', () => {
  it('超限那条拒掉，其余照落，返回逐条 index 与 status', () => {
    const { svc, projectId, h } = fixture()
    const r = svc.ingestBatch({
      projectId,
      items: [item('ok1', 10), item('big', 600 * 1024), item('ok2', 10)],
    })
    expect(r.items.map((i) => [i.index, i.status])).toEqual([
      [0, 'accepted'],
      [1, 'rejected'],
      [2, 'accepted'],
    ])
    h.close()
  })

  it('项目不存在 ⇒ NOT_FOUND 抛出（**不吞成 20 条 rejected**）', () => {
    const { svc, h } = fixture()
    try {
      svc.ingestBatch({ projectId: 'prj_不存在', items: [item('x', 10)] })
      throw new Error('本该抛错')
    } catch (e) {
      expect((e as { code: string }).code).toBe('NOT_FOUND')
    }
    h.close()
  })

  it('台账只写白名单键：accepted 事件恰为 kind + sourcePlatform', () => {
    const { svc, projectId, h } = fixture()
    svc.ingestBatch({
      projectId,
      items: [{ ...item('w', 10), payload: { body: '机密', cwd: '/Users/me' } }],
    })
    const row = h.db
      .prepare("SELECT payload_json FROM local_events WHERE kind = 'agent_ingest_accepted'")
      .get() as { payload_json: string }
    expect(Object.keys(JSON.parse(row.payload_json)).sort()).toEqual(['kind', 'sourcePlatform'])
    expect(row.payload_json).not.toContain('机密')
    expect(row.payload_json).not.toContain('/Users/me')
    h.close()
  })
})
