import { describe, expect, it } from 'vitest'
import { countAgentRegistry, createAgentRegistryService, openDatabase } from '@openvibe/core'

/**
 * `tests/agent-registry.test.ts` —— v0.3.0 FR-3.0-1 最小只读版的判据。
 *
 * ## 它挡什么
 *
 * 注册表最容易出的三个错都不是「查不到数据」，而是**语义被悄悄改掉**：
 * ① 探测失败的 agent 被删行 ⇒ iFlow 的停服记录永久丢失；
 * ② 探测成功就把归档项复活 ⇒ 停服/改名的产品事实被本机巧合推翻；
 * ③ 用户删光条目后，下次启动被种子全部复活 ⇒ 用户的选择被覆盖。
 *
 * 三条各自有用例。第四条只钉「配额字段可读」，因为 C-19 是并入项、没有独立写端点，
 * 把它写成写接口测试等于提前实现未裁定的能力。
 *
 * 全部用例走内存库 + 注入探测，不依赖本机装了哪个 CLI。
 */

const NOW = '2026-11-19T00:00:00.000Z'
const UNVERIFIED_THEN = '2026-11-19T00:00:00.000Z'

function freshService(probe: (cmd: string) => boolean) {
  const db = openDatabase(':memory:')
  const service = createAgentRegistryService(db, { now: () => NOW, probe })
  return { db, service }
}

describe('agent 注册表 · 播种', () => {
  it('首次读取播种 12 条，其中 iFlow 已归档、全部健康态为 unverified', () => {
    const { service } = freshService(() => false)
    const agents = service.listAgents()

    expect(agents).toHaveLength(12)
    expect(agents.filter((a) => a.archived).map((a) => a.id)).toEqual(['iflow'])
    expect(agents.every((a) => a.health === 'unverified')).toBe(true)
    expect(agents.every((a) => a.lastCheckedAt === null)).toBe(true)
  })

  it('includeArchived=false 时不含归档项', () => {
    const { service } = freshService(() => false)
    const visible = service.listAgents(false)
    expect(visible).toHaveLength(11)
    expect(visible.some((a) => a.id === 'iflow')).toBe(false)
  })

  it('重复读取不重复播种', () => {
    const { service } = freshService(() => false)
    service.listAgents()
    service.listAgents()
    expect(service.listAgents()).toHaveLength(12)
  })
})

describe('agent 注册表 · 健康检查', () => {
  it('探测失败只标 missing + 归档，行数不变', () => {
    const { db, service } = freshService((cmd) => cmd === 'claude')
    service.listAgents()
    const result = service.checkHealth()

    const agents = service.listAgents()
    expect(countAgentRegistry(db)).toBe(12)
    expect(agents.find((a) => a.id === 'claude')!.health).toBe('ok')
    expect(agents.find((a) => a.id === 'codex')).toMatchObject({
      health: 'missing',
      archived: true,
    })
    expect(result.checked).toBe(12)
    expect(result.newlyOk).toContain('claude')
    expect(result.newlyMissing).toContain('codex')
  })

  it('探测成功不复活归档项：iFlow 保持 archived=true', () => {
    const { service } = freshService(() => true)
    service.listAgents()
    service.checkHealth()
    const iflow = service.listAgents().find((a) => a.id === 'iflow')!
    expect(iflow.health).toBe('ok')
    expect(iflow.archived).toBe(true)
  })

  it('未声明 executable 的条目判 unverified，且不因探测被归档', () => {
    const { db, service } = freshService(() => false)
    service.listAgents()
    db.prepare(`UPDATE agent_registry SET executable = NULL WHERE id = 'codex'`).run()
    service.checkHealth()
    const codex = service.listAgents().find((a) => a.id === 'codex')!
    expect(codex.health).toBe('unverified')
    expect(codex.archived).toBe(false)
  })

  it('健康检查会推进 last_checked_at', () => {
    const { service } = freshService(() => true)
    service.listAgents()
    service.checkHealth()
    expect(service.listAgents().every((a) => a.lastCheckedAt === UNVERIFIED_THEN)).toBe(true)
  })
})

describe('agent 注册表 · 用户选择优先', () => {
  it('用户删光条目后不会被种子复活', () => {
    const { db, service } = freshService(() => false)
    service.listAgents()
    db.prepare(`DELETE FROM agent_registry`).run()
    expect(service.listAgents()).toHaveLength(0)
  })
})

describe('agent 注册表 · C-19 配额字段', () => {
  it('默认无限额，可由 DB 设值后读出', () => {
    const { db, service } = freshService(() => false)
    service.listAgents()
    const before = service.listAgents().find((a) => a.id === 'claude')!
    expect(before.quotaLimit).toBeNull()
    expect(before.quotaCost).toBeNull()

    db.prepare(
      `UPDATE agent_registry SET quota_limit = 50, quota_cost = 0.01 WHERE id = 'claude'`,
    ).run()
    const after = service.listAgents().find((a) => a.id === 'claude')!
    expect(after.quotaLimit).toBe(50)
    expect(after.quotaCost).toBe(0.01)
  })
})
