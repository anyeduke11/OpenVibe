import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FORBIDDEN, FORBIDDEN_COVERAGE, newDb, payloadKeys, scanForbidden, selfProofRows } from '../test-support'
import { FlowTemplatesRepo } from '../repos/flows'
import { ProjectsRepo } from '../repos/projects'
import { createAgentService } from './agentService'
import { createContextService } from './contextService'
import { createCommandRunService } from './commandRunService'
import { AGENT_PAYLOAD_KEYS, AGENT_PAYLOAD_TYPES, AGENT_EVENT_KINDS } from '@openvibe/shared'

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
const SPECS_DIR = join(import.meta.dirname, '..', '..', '..', '..', 'docs', 'specs')
const SPEC_PATH = join(SPECS_DIR, 'm8-agent-bridge.md')
const LEDGER_SPEC_PATH = join(SPECS_DIR, 'local-event-ledger.md')

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

/**
 * 从规格 FR-5.1.1 那一行里抽出**规格声明的 payload 键集合**。
 *
 * ⚠️ **靠 `→` 切分而不是靠正则猜**：那行的形状是
 * `\`事件名\` → \`键1\` / \`键2\``，箭头**左侧是事件名、右侧才是 payload 键**。
 * 先试过「把所有反引号词收进来再排除 kind 名」，结果把列名 `payload_json`
 * 也当成键收了进来 —— 靠排除法维护这个集合，每多一个同形的词就得再补一条排除，
 * 而漏补的那一条会静默变成假红或假绿。结构化切分没有这个问题。
 */
function specPayloadKeys(line: string): Set<string> {
  const out = new Set<string>()
  // 先按分号切成「一个事件一组」，再在组内取箭头右侧。
  // ⚠️ 只按 `→` 切是不够的：那行用 `；` 连接，形态是
  // `事件A` → `键`；`事件B` → `键` ⇒ 直接切 `→` 会把**下一个事件名**留在同一段里。
  for (const group of line.split(/[；;]/)) {
    if (!group.includes('→')) continue
    const rhs = group.split('→').slice(1).join('→')
    for (const m of rhs.matchAll(/`([A-Za-z][A-Za-z0-9_]*)`/g)) out.add(m[1]!)
  }
  return out
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

  it('⚠️ 单一出处的键集必须与规格 FR-5.1.1 原文**逐字一致**（双向，防规格漂移）', () => {
    // 没有这一条，改规格不改表（或反之）不会有任何东西变红 —— 两边可以静默分叉。
    //
    // ⚠️ **必须是双向**，不能只断「实现 ⊆ 规格」：只断单向的话，规格里**多写**一个键、
    // 或者改回 snake_case（旧称），测试照样绿 —— 而那正是「规格漂移」未被真正堵住的地方。
    const spec = readFileSync(SPEC_PATH, 'utf8')
    const line = spec.split('\n').find((l) => l.includes('FR-5.1.1') && l.includes('允许键'))
    expect(line, '规格里找不到 FR-5.1.1 允许键那一行 —— 规格被改写了，本判据需同步').toBeDefined()

    // 正向：实现的每个键都要在规格那行出现
    for (const kind of Object.keys(AGENT_PAYLOAD_KEYS)) {
      for (const key of AGENT_PAYLOAD_KEYS[kind as keyof typeof AGENT_PAYLOAD_KEYS]) {
        expect(line!, `规格 FR-5.1.1 未提及 ${kind} 的键 ${key}`).toContain(key)
      }
    }
    // 反向：规格那行声明的每个键都必须在形状表里 —— 抓「规格多写 / 改回 snake_case」
    const specKeys = specPayloadKeys(line!)
    const implKeys = new Set(Object.values(AGENT_PAYLOAD_TYPES).flatMap((v) => Object.keys(v!)))
    const orphans = [...specKeys].filter((k) => !implKeys.has(k))
    expect(orphans, `规格 FR-5.1.1 出现但形状表没有的键：${orphans.join(', ')}`).toEqual([])
    // 正向与反向必须**同时**成立：集合相等，不是包含
    expect([...implKeys].filter((k) => !specKeys.has(k))).toEqual([])
  })

  it('⚠️ 变异腿：规格多写一个键 ⇒ 双向判据必须判红（否则反向那一半可能恒真）', () => {
    const specLine =
      '`agent_ingest_accepted` → `kind` / `sourcePlatform`；`agent_ingest_rejected` → `kind` / `reasonCode`；`agent_context_served` → `fieldsCount` / `truncated` / `platform`；`cli_agent_command_run` → `command` / `exitCode` / `agent`；`agent_bridge_installed` → `adapter` / `packVersion` / `legacyFlag`'
    const specKeys = specPayloadKeys(specLine)
    const implKeys = new Set(Object.values(AGENT_PAYLOAD_TYPES).flatMap((v) => Object.keys(v!)))
    // 规格多出的 legacyFlag ⇒ 必须被抓
    expect([...specKeys].filter((k) => !implKeys.has(k))).toContain('legacyFlag')
    // 反证：去掉它就抓不到，说明这条腿不是恒真
    expect([...specKeys].filter((k) => !implKeys.has(k) && k !== 'legacyFlag')).toEqual([])
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

describe('FR-5.1.1 · 值类型（键判据看不见的那一半）', () => {
  it('四类已写入 kind 的每个键，其值 `typeof` **逐键等于**形状表', () => {
    // 为什么单独立一组：键闭集只比**键名**。键名一致时，值类型分歧对所有键判据隐形 ——
    // `agent_context_served.truncated` 就这么潜伏过（规格写 bool、实现写数字）。
    const f = fixture()
    for (const { kind, row } of allRowsWritten(f.h, f)) {
      const actual = JSON.parse(row.payload_json) as Record<string, unknown>
      // 索引在 noUncheckedIndexedAccess 下是 `| undefined`；kind 来自形状表的键集，非空是构造保证
      const expected = AGENT_PAYLOAD_TYPES[kind]!
      for (const [key, want] of Object.entries(expected)) {
        expect(typeof actual[key], `${kind}.${key}`).toBe(want)
      }
    }
    f.h.close()
  })

  it('⚠️ 变异腿：把 `truncated` 写成布尔值 ⇒ 类型断言当场红（否则它可能恒真）', () => {
    // 这是本轮那条分歧的**反向复现**：规格当初写的就是 bool，
    // 若判据只看键名，改成 bool 不会有任何东西变红。
    const wrong = { fieldsCount: 3, truncated: true, platform: 'server' }
    const expected = AGENT_PAYLOAD_TYPES.agent_context_served!
    expect(typeof wrong.fieldsCount).toBe(expected.fieldsCount)
    expect(typeof wrong.truncated).not.toBe(expected.truncated)
  })

  it('⚠️ 形状表与键表必须同源 —— 键集恰是形状表的键集（防两张表分叉）', () => {
    for (const kind of Object.keys(AGENT_PAYLOAD_TYPES)) {
      expect([...AGENT_PAYLOAD_KEYS[kind as keyof typeof AGENT_PAYLOAD_KEYS]].sort()).toEqual(
        Object.keys(AGENT_PAYLOAD_TYPES[kind]!).sort(),
      )
    }
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

describe('FR-6.3 覆盖差 · 禁列清单每一项都得能指认守卫', () => {
  it('每个禁列项都必须有机制，且 scanner 项在 FORBIDDEN 里真有对应规则', () => {
    for (const c of FORBIDDEN_COVERAGE) {
      expect(['scanner', 'writepoint'], c.item).toContain(c.mechanism)
      expect(c.guard.length, c.item).toBeGreaterThan(0)
      if (c.mechanism === 'scanner') {
        expect(FORBIDDEN.map((f) => f.label), c.item).toContain(c.guard)
      } else {
        // 靠写入点的项必须**写明为什么正则兜不住**，否则等于默默放弃
        expect(c.whyNotRegex?.length ?? 0, c.item).toBeGreaterThan(5)
      }
    }
  })

  it('⚠️ 规格禁列清单的每一项都已在对照表里 —— 不许出现「只靠人记得」的项', () => {
    const spec = readFileSync(LEDGER_SPEC_PATH, 'utf8')
    const line = spec.split('\n').find((l) => l.includes('FR-6.3') && l.includes('payload_json'))
    expect(line, '规格里找不到 FR-6.3 那行').toBeDefined()
    // 规格原文四项：绝对路径 / 项目名 / 用户名 / 资产正文
    for (const word of ['绝对路径', '项目名', '用户名', '资产正文']) {
      expect(line, `规格 FR-6.3 提到「${word}」，对照表里却没有`).toContain(word)
      expect(
        FORBIDDEN_COVERAGE.some((c) => c.item.includes(word) || (c.item.includes('绝对路径') && word === '绝对路径')),
        `对照表缺「${word}」`,
      ).toBe(true)
    }
  })

  it('⚠️ 变异腿：写入点若改成 spread 入参（去掉白名单构造），两条判据都必须抓到', () => {
    // 「项目名」「正文」靠的正是白名单构造。这条腿证明那个保证是**真的**，
    // 而不是一句「我们记得不 spread」。入参形状照 `AgentIngestOne` 的真实字段造。
    const spread = {
      kind: 'dev_log',
      sourcePlatform: 'trae',
      body: '客户名：招商银行股份有限公司 · 会议正文',
      cwd: `${process.env.HOME ?? '/tmp'}/work`,
    }
    // ① 键闭集抓到多出来的键
    expect(Object.keys(spread).sort()).not.toEqual([...AGENT_PAYLOAD_KEYS.agent_ingest_accepted].sort())
    // ② 禁列扫到路径与 home 片段
    const labels = scanForbidden({ payload_json: JSON.stringify(spread) })
    expect(labels.length).toBeGreaterThan(0)
    // ③ **但项目名与正文扫不出来** —— 这正是它们只能靠写入点的原因，
    //    故对照表里必须写明 whyNotRegex，而不能假装扫描器管得了。
    expect(labels).not.toContain('项目名')
  })
})
