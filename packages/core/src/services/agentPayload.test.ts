import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { newDb, payloadKeys, scanForbidden, selfProofRows } from '../test-support'
import { FlowTemplatesRepo } from '../repos/flows'
import { ProjectsRepo } from '../repos/projects'
import { createAgentService } from './agentService'
import { createContextService } from './contextService'
import { createCommandRunService } from './commandRunService'
import { AGENT_PAYLOAD_KEYS, AGENT_EVENT_KINDS } from '@openvibe/shared'

/**
 * M8 台账 payload 的**统一守卫**（`m8-agent-bridge.md` FR-5.1.1 键闭集 ＋ FR-5.1.2 禁列）。
 *
 * ## 为什么要新立这个文件（2026-10-17）
 *
 * `m8-agent-bridge.md` §7 条 `u` 的**判据原文是「扫描五类事件」**，而 2026-10-17 实测：
 * - `cli_agent_command_run` —— 有键闭集断言 ＋ 禁列扫描（覆盖）
 * - `agent_ingest_accepted` —— 键断言存在但**硬编码字面量**，禁列只有两个 `not.toContain` 点断言
 * - `agent_ingest_rejected` —— **键断言与禁列都零覆盖**
 * - `agent_context_served` —— 键断言存在但**硬编码**，无禁列
 * - `agent_bridge_installed` —— 声明态，写入点属 M8-A（Phase 2）
 *
 * 即「规格写五类、代码只验一类」。且那两处硬编码意味着：**改规格不会红、改表也不会红**。
 * 故本文件把四类**已写入** kind 拉齐到同一条判据上，并让判据引用**单一出处**。
 *
 * ## 两条判据都是否定式的，必须自证
 *
 * 「键集合相等」「禁列零命中」写对了永远绿。故下面各有一条变异腿：
 * 往 payload 多塞一个键 ⇒ 键断言必红；把脏值灌进去 ⇒ 扫描器必报。
 */

// 本文件在 `packages/core/src/services/` ⇒ 退 4 级到仓根（services → src → core → packages → 根）
const SPEC_PATH = join(import.meta.dirname, '..', '..', '..', '..', 'docs', 'specs', 'm8-agent-bridge.md')

/** 四类**已有生产写入点**的 kind（第五类属 Phase 2，见文首） */
const WRITTEN = ['agent_ingest_accepted', 'agent_ingest_rejected', 'agent_context_served', 'cli_agent_command_run'] as const

function fixture() {
  const h = newDb()
  const template = new FlowTemplatesRepo(h.db).create({
    name: '统一守卫流',
    kind: 'light',
    stages: [{ name: '启动', checklist: [{ id: 'c1', text: '需求一句话' }], artifacts: [] }],
  })
  const projectId = new ProjectsRepo(h.db).create({ name: '统一守卫演示', flowTemplateId: template.id }).id
  let tick = 0
  const now = () => new Date(Date.UTC(2026, 9, 17, 0, 0, tick++))
  return {
    h,
    projectId,
    agent: createAgentService({ db: h.db, now }),
    context: createContextService({ db: h.db, readLock: () => null }),
    run: createCommandRunService({ db: h.db, now }),
  }
}

function oneRow(h: ReturnType<typeof newDb>, kind: string): { payload_json: string } {
  const row = h.db.prepare('SELECT payload_json FROM local_events WHERE kind = ?').get(kind) as
    | { payload_json: string }
    | undefined
  expect(row, `没有 ${kind} 的台账行 —— 写入点没跑起来，先修实现再谈判据`).toBeDefined()
  return row!
}

/** 把四类都真跑一遍，让库里四种行都在 */
function allRowsWritten(h: ReturnType<typeof newDb>, f: ReturnType<typeof fixture>) {
  f.agent.ingestBatch({
    projectId: f.projectId,
    items: [{ kind: 'dev_log', idempotencyKey: 'g1', payload: { body: '正常内容' }, sourcePlatform: 'trae' }],
  })
  // 超单条上限 ⇒ 走拒收分支，落 agent_ingest_rejected
  f.agent.ingestBatch({
    projectId: f.projectId,
    items: [{ kind: 'dev_log', idempotencyKey: 'g2', payload: { body: 'x'.repeat(600_000) }, sourcePlatform: 'trae' }],
  })
  f.context.build(f.projectId, [])
  f.run.recordCommandRun({ command: 'ask', exitCode: 0, agent: 'trae' })
  return WRITTEN.map((k) => ({ kind: k, row: oneRow(h, k) }))
}

describe('FR-5.1.1 · 五类 payload 键闭集（单一出处 ＋ 逐字对齐规格）', () => {
  it('四类已写入 kind 的实际键**逐字等于**闭集（两侧都排序，比的是集合）', () => {
    const f = fixture()
    for (const { kind, row } of allRowsWritten(f.h, f)) {
      expect(payloadKeys(row), kind).toEqual([...AGENT_PAYLOAD_KEYS[kind]].sort())
    }
    f.h.close()
  })

  it('⚠️ 变异腿：往 payload 多塞一个键 ⇒ 键闭集断言必须判红（否则它可能恒真）', () => {
    const f = fixture()
    const first = allRowsWritten(f.h, f)[0]!
    const leaked = { ...JSON.parse(first.row.payload_json), cwd: '/tmp/x' }
    expect(payloadKeys({ payload_json: JSON.stringify(leaked) })).not.toEqual(
      [...AGENT_PAYLOAD_KEYS[first.kind]].sort(),
    )
    f.h.close()
  })

  it('⚠️ 单一出处必须覆盖全部五个 kind —— 少一类就是「规格说五类、表里只有四类」', () => {
    expect(Object.keys(AGENT_PAYLOAD_KEYS).sort()).toEqual([...AGENT_EVENT_KINDS].sort())
  })

  it('⚠️ 单一出处的键集必须与规格 FR-5.1.1 原文**逐字一致**（防规格漂移）', () => {
    // 没有这一条，改规格不改表（或反之）不会有任何东西变红 —— 两边可以静默分叉。
    const spec = readFileSync(SPEC_PATH, 'utf8')
    const line = spec.split('\n').find((l) => l.includes('FR-5.1.1') && l.includes('允许键'))
    expect(line, '规格里找不到 FR-5.1.1 允许键那一行 —— 规格被改写了，本判据需同步').toBeDefined()
    for (const kind of Object.keys(AGENT_PAYLOAD_KEYS)) {
      for (const key of AGENT_PAYLOAD_KEYS[kind as keyof typeof AGENT_PAYLOAD_KEYS]) {
        expect(line, `规格 FR-5.1.1 未提及 ${kind} 的键 ${key}`).toContain(key)
      }
    }
  })

  it('⚠️ 声明态那一类不得被悄悄写成「已写入」—— 它属 Phase 2', () => {
    expect(AGENT_PAYLOAD_KEYS.agent_bridge_installed).toEqual(['adapter', 'packVersion'])
    const f = fixture()
    allRowsWritten(f.h, f)
    const absent = f.h.db
      .prepare("SELECT COUNT(*) AS c FROM local_events WHERE kind = 'agent_bridge_installed'")
      .get() as { c: number }
    expect(absent.c).toBe(0)
    f.h.close()
  })
})

describe('FR-5.1.2 · 四类 payload 禁列（绝对路径 / 用户名 / 正文）', () => {
  it('四类已写入 kind 的真实行**零禁列命中**', () => {
    const f = fixture()
    for (const { kind, row } of allRowsWritten(f.h, f)) {
      expect(scanForbidden(row), kind).toEqual([])
    }
    f.h.close()
  })

  it('⚠️ 扫描器自证：嵌套两层的脏行**必须**被抓出（只扫顶层会漏，那正是本扫描器存在的理由）', () => {
    const { dirty, expectLabel } = selfProofRows()
    expect(scanForbidden(dirty)).toContain(expectLabel)
  })

  it('⚠️ 扫描器自证：干净行必须**放行**（否则闸严到没有实用价值）', () => {
    expect(scanForbidden({ payload_json: JSON.stringify({ kind: 'dev_log', sourcePlatform: 'trae' }) })).toEqual([])
  })

  it('⚠️ 变异腿：把禁列值灌进真实写入行 ⇒ 必须被抓（证明这条守卫不是恒绿）', () => {
    const f = fixture()
    const first = allRowsWritten(f.h, f)[0]!
    const payload = JSON.parse(first.row.payload_json) as Record<string, unknown>
    payload.sourcePlatform = `${process.env.HOME ?? '/tmp'}/leaked`
    const leaked = { ...first.row, payload_json: JSON.stringify(payload) }
    expect(scanForbidden(leaked).length).toBeGreaterThan(0)
    f.h.close()
  })

  it('⚠️ payload_json 不可解析时按禁列报，不得当成「干净」放行', () => {
    // 解析失败被 `catch` 吞成空数组的话，一行坏数据就能静默过关
    expect(scanForbidden({ payload_json: '{ 坏掉的 JSON' }).length).toBeGreaterThan(0)
  })
})
