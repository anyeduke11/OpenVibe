import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  FORBIDDEN,
  FORBIDDEN_COVERAGE,
  newDb,
  payloadKeys,
  scanForbidden,
  selfProofRows,
} from '../test-support'
import { FlowTemplatesRepo } from '../repos/flows'
import { APP_META_KEYS, AppMetaRepo } from '../repos/appMeta'
import { ProjectsRepo } from '../repos/projects'
import { createAgentService } from './agentService'
import { createContextService } from './contextService'
import { createCommandRunService } from './commandRunService'
import {
  AGENT_PAYLOAD_KEYS,
  AGENT_PAYLOAD_TYPES,
  AGENT_EVENT_KINDS,
  AgentIngestOne,
} from '@openvibe/shared'

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
 * - `agent_bridge_installed` —— **半落地态**（2026-10-17 更新）：服务层写入点已存在
 *   （`bridgeInstallService`，含 §6.4 去重键），但触发条件卡在探针 Q3/Q4，**生产上零写入**
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
const M3_SPEC_PATH = join(SPECS_DIR, 'm3-terms-learning.md')
const D_SPEC_PATH = join(SPECS_DIR, 'v023-d-ai-extract.md')

/**
 * ⚠️ **每个 kind 绑各自的规格**（2026-10-18 · P5 落地时加）。
 *
 * 原先所有 Agent kind 都拿去比 M8 那份规格的 FR-5.1.1 那一行。P5 新增
 * `ai_recommend_call` 之后那会立刻红 —— 但**红得对**：它的键闭集是
 * **m3 FR-9.1-b** 定义的，不是 M8 FR-5.1.1。
 *
 * ⚠️ **不能靠把键补进 M8 规格来消这条红**：那是把「M3 定义的契约」伪装成
 * 「M8 定义的契约」，两份规格会就此分叉，而 M8 自己那份 FR-5.1.1 的判据
 * 反而没人守了。⇒ 正确做法是**各自绑各自的规格**，并让一条守卫断「每个 kind
 * 都被某份规格认领」—— 漏绑一个，下面的遍历会让它直接落到兜底分支而红。
 */
const KIND_SPEC: Record<string, { spec: string; marker: string }> = {
  agent_ingest_accepted: { spec: SPEC_PATH, marker: '允许键' },
  agent_ingest_rejected: { spec: SPEC_PATH, marker: '允许键' },
  agent_context_served: { spec: SPEC_PATH, marker: '允许键' },
  cli_agent_command_run: { spec: SPEC_PATH, marker: '允许键' },
  agent_bridge_installed: { spec: SPEC_PATH, marker: '允许键' },
  ai_recommend_call: { spec: M3_SPEC_PATH, marker: 'FR-9.1-b' },
  // M10/D：提取 / 问答出网台账（spec v023-d FR-8 的允许键闭集行）
  ai_extract_call: { spec: D_SPEC_PATH, marker: '允许键' },
  ai_discuss_call: { spec: D_SPEC_PATH, marker: '允许键' },
}

/**
 * 在规格原文里定位「声明这个 kind 的键闭集」那一行。
 *
 * ⚠️ **条件必须是「marker ＋ 箭头 ＋ 本 kind 的名字」三条同时成立**，只按 marker 找会取到**第一条**命中。
 * 本轮实测：m3 规格第 10 行的版本行里同时出现了「新增 FR-9.1-b」「（`payload_json` 允许键闭集 …）」
 * 与「v0.6 → v0.7」，于是只按 marker 找会返回版本行 —— 而版本行不含任何键名，判据遂**恒红**。
 * 这类「锚点词在别处也出现」的坑是判据变成永红的最常见形态，故把 kind 名也写进条件。
 */
export function findSpecRow(spec: string, marker: string, kind: string): string | undefined {
  return spec.split('\n').find((l) => l.includes(marker) && l.includes('→') && l.includes(kind))
}

/** 四类**已有生产写入点**的 kind（第五类属 Phase 2，见文首） */
const WRITTEN = [
  'agent_ingest_accepted',
  'agent_ingest_rejected',
  'agent_context_served',
  'cli_agent_command_run',
] as const

function fixture() {
  const h = newDb()
  const template = new FlowTemplatesRepo(h.db).create({
    name: '统一守卫流',
    kind: 'light',
    stages: [{ name: '启动', checklist: [{ id: 'c1', text: '需求一句话' }], artifacts: [] }],
  })
  const projectId = new ProjectsRepo(h.db).create({
    name: '统一守卫演示',
    flowTemplateId: template.id,
  }).id
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
    { payload_json: string } | undefined
  expect(row, `没有 ${kind} 的台账行 —— 写入点没跑起来，先修实现再谈判据`).toBeDefined()
  return row!
}

/** 把四类都真跑一遍，让库里四种行都在 */
function allRowsWritten(h: ReturnType<typeof newDb>, f: ReturnType<typeof fixture>) {
  // M8-E 写侧总闸默认关（FR-5.5.2.1）⇒ 本 helper 必须显式打开，
  // 否则下面两次 ingestBatch 全部先撞 422，**一行都不写**，
  // 于是「四类已写入 kind 的实际键」这条判据会去查一个空集合 —— 红的原因是闸，不是键。
  new AppMetaRepo(h.db).write(APP_META_KEYS.agentWriteEnabled, true)
  f.agent.ingestBatch({
    projectId: f.projectId,
    items: [
      {
        kind: 'dev_log',
        idempotencyKey: 'g1',
        payload: { body: '正常内容' },
        sourcePlatform: 'trae',
      },
    ],
  })
  // 超单条上限 ⇒ 走拒收分支，落 agent_ingest_rejected
  f.agent.ingestBatch({
    projectId: f.projectId,
    items: [
      {
        kind: 'dev_log',
        idempotencyKey: 'g2',
        payload: { body: 'x'.repeat(600_000) },
        sourcePlatform: 'trae',
      },
    ],
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

/**
 * 同上，但**只取某一个 kind 的**键。
 *
 * ⚠️ 为什么必须有这个变体：M8 规格 FR-5.1.1 那一行是「五个 kind 写在一行里」
 * （`A` → `k1` / `k2`；`B` → `k3`；…）。P5 让每个 kind 绑各自的规格后，
 * 若还用「整行的键并集」去跟单个 kind 的形状表比，反向判据会把**别的 kind 的键**
 * 报成「规格多写」—— 那是解析粒度的错，不是规格真的错了。
 *
 * 切法：按 `；` 分组 → 找出**箭头左侧**含该 kind 名的那一组 → 只取该组箭头右侧。
 */
function specPayloadKeysFor(line: string, kind: string): Set<string> {
  for (const group of line.split(/[；;]/)) {
    if (!group.includes('→')) continue
    const [lhs = '', ...rhsParts] = group.split('→')
    if (!lhs.includes('`' + kind + '`')) continue
    const out = new Set<string>()
    for (const m of rhsParts.join('→').matchAll(/`([A-Za-z][A-Za-z0-9_]*)`/g)) out.add(m[1]!)
    return out
  }
  return new Set()
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

  it('⚠️ 单一出处必须覆盖全部 Agent kind —— 少一类就是「规格说 N 类、表里只有 N−1 类」', () => {
    expect(Object.keys(AGENT_PAYLOAD_KEYS).sort()).toEqual([...AGENT_EVENT_KINDS].sort())
  })

  it('⚠️ 每个 kind 都必须被某份规格显式认领（漏绑一个，下面的遍历会让它红）', () => {
    for (const kind of Object.keys(AGENT_PAYLOAD_KEYS)) {
      expect(KIND_SPEC[kind], `kind ${kind} 没有绑任何规格的闭集那一行`).toBeDefined()
    }
  })

  it('⚠️ 单一出处的键集必须与规格 FR-5.1.1 原文**逐字一致**（双向，防规格漂移）', () => {
    // 没有这一条，改规格不改表（或反之）不会有任何东西变红 —— 两边可以静默分叉。
    //
    // ⚠️ **必须是双向**，不能只断「实现 ⊆ 规格」：只断单向的话，规格里**多写**一个键、
    // 或者改回 snake_case（旧称），测试照样绿 —— 而那正是「规格漂移」未被真正堵住的地方。
    // 逐 kind 走**它自己那份**规格（见 KIND_SPEC 的理由）
    for (const kind of Object.keys(AGENT_PAYLOAD_KEYS)) {
      const binding = KIND_SPEC[kind]!
      const spec = readFileSync(binding.spec, 'utf8')
      const line = findSpecRow(spec, binding.marker, kind)
      expect(
        line,
        `${binding.spec} 里找不到 ${kind} 的闭集那一行 —— 规格被改写了，本判据需同步`,
      ).toBeDefined()

      // 正向：实现的每个键都要在规格那行出现
      for (const key of AGENT_PAYLOAD_KEYS[kind as keyof typeof AGENT_PAYLOAD_KEYS]) {
        expect(line!, `${binding.spec} 未提及 ${kind} 的键 ${key}`).toContain(key)
      }
      // 反向：该规格那行声明的每个键都必须属于**这个 kind** ——
      // 抓「规格多写 / 改回 snake_case / 把别的 kind 的键写进来」
      const specKeys = specPayloadKeysFor(line!, kind)
      const implKeys = new Set(AGENT_PAYLOAD_KEYS[kind as keyof typeof AGENT_PAYLOAD_KEYS])
      const orphans = [...specKeys].filter((k) => !implKeys.has(k))
      expect(orphans, `${kind}：规格出现但形状表没有的键：${orphans.join(', ')}`).toEqual([])
      // 正向与反向必须**同时**成立：集合相等，不是包含
      expect([...implKeys].filter((k) => !specKeys.has(k))).toEqual([])
    }
  })

  it('⚠️ 变异腿：规格前文出现同名锚点（版本行里的「新增 FR-9.1-b … 允许键 … v0.6 → v0.7」）⇒ 必须取到真正那一行', () => {
    // 复刻本轮真实踩到的形态：m3 规格第 10 行是版本行，它同时含 marker、含箭头，
    // 只按 marker 找就必然返回它 —— 而版本行里一个键名都没有，守卫遂恒红。
    const decoy =
      '| 版本 | **v0.7**。v0.6 → v0.7：P5 落地 FR-9.2 的 CHECK 扩项 ＋ **新增 FR-9.1-b**（`payload_json` 允许键闭集 …）|'
    const real =
      '- **FR-9.1-b** `payload_json` **允许键**：`ai_recommend_call` → `aiModel` / `aiProvider`。'
    const spec = [decoy, real].join('\n')

    expect(findSpecRow(spec, 'FR-9.1-b', 'ai_recommend_call')).toBe(real)
    // 反证：去掉 kind 条件就会取到那一行 —— 说明这条条件确实在做事，不是摆设
    expect(findSpecRow(spec, 'FR-9.1-b', '不存在的kind')).toBeUndefined()
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

  it('⚠️ 半落地那一类不得被悄悄记成「已写入」—— 触发条件仍卡在探针 Q3/Q4', () => {
    expect(AGENT_PAYLOAD_KEYS.agent_bridge_installed).toEqual(['adapter', 'packVersion'])
    const f = fixture()
    allRowsWritten(f.h, f)
    const absent = f.h.db
      .prepare("SELECT COUNT(*) AS c FROM local_events WHERE kind = 'agent_bridge_installed'")
      .get() as { c: number }
    // ⚠️ 本支断言的是**「跑完四类已写入 kind 后，库里仍为零」**，
    // 即半落地那一类没有被顺带写进去。2026-10-17 起它多了服务层
    // （`bridgeInstallService`，含去重键），但**生产触发点仍不存在**
    // —— skill 目录形态是 M8-A 未闭合三问之一（探针 Q3/Q4），
    // 故此处不得改成「应当 > 0」，那会要求一个写不出来的触发条件。
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
    expect(
      scanForbidden({ payload_json: JSON.stringify({ kind: 'dev_log', sourcePlatform: 'trae' }) }),
    ).toEqual([])
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
        expect(
          FORBIDDEN.map((f) => f.label),
          c.item,
        ).toContain(c.guard)
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
        FORBIDDEN_COVERAGE.some(
          (c) => c.item.includes(word) || (c.item.includes('绝对路径') && word === '绝对路径'),
        ),
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
    expect(Object.keys(spread).sort()).not.toEqual(
      [...AGENT_PAYLOAD_KEYS.agent_ingest_accepted].sort(),
    )
    // ② 禁列扫到路径与 home 片段
    const labels = scanForbidden({ payload_json: JSON.stringify(spread) })
    expect(labels.length).toBeGreaterThan(0)
    // ③ **但项目名与正文扫不出来** —— 这正是它们只能靠写入点的原因，
    //    故对照表里必须写明 whyNotRegex，而不能假装扫描器管得了。
    expect(labels).not.toContain('项目名')
  })
})

describe('FR-2.1 请求体字段名 · 规格与 zod 入参逐字一致', () => {
  /**
   * 为什么单立一组：FR-5.1.1 的守卫只管 `payload_json` 的键，
   * **管不到请求体字段名** —— 而 2026-10-17 实测，规格 §5 那张「入」表原写 snake_case，
   * 实现是 camelCase。zod 剥掉未知键 ⇒ agent 照规格发必得 422。
   *
   * 同一类缺陷的第二个实例，故同一套守卫：规格文本 ↔ 实现，双向。
   */
  it('规格 §5「入 · 回流」那一行的每个字段都必须是 `AgentIngestOne` 的真实键', () => {
    const spec = readFileSync(SPEC_PATH, 'utf8')
    const row = spec.split('\n').find((l) => /^\|\s*入\s*\|/.test(l) && l.includes('POST body'))
    expect(row, '规格 §5 找不到「入 · 回流」那一行').toBeDefined()

    // ⚠️ 只取**内容列**（`split('|')[2]`）：形态列里还有 `parseOrThrow` 这类实现侧的名字，
    // 全行收会把它们当成请求字段。
    const specFields = [...row!.split('|')[2]!.matchAll(/`([A-Za-z][A-Za-z0-9_]*)`/g)].map(
      (m) => m[1]!,
    )
    for (const f of specFields) {
      expect(Object.keys(AgentIngestOne.shape), `规格 §5 写了 ${f}，但 zod 入参没有`).toContain(f)
    }
  })

  it('⚠️ 变异腿：规格若写回 snake_case ⇒ 断言当场判红', () => {
    // 这正是本轮订正前的实况：规格写 `idempotency_key`，zod 没有这个键。
    const specRow =
      '| 入 | 回流：`kind`、`idempotency_key`、`payload`（按 kind 判形）、`source_platform`、`source_session_id`、`cwd` | POST body，zod 经既有 `parseOrThrow` |'
    const specFields = [...specRow.split('|')[2]!.matchAll(/`([A-Za-z][A-Za-z0-9_]*)`/g)].map(
      (m) => m[1]!,
    )
    const shape = Object.keys(AgentIngestOne.shape)
    expect(specFields.filter((f) => !shape.includes(f))).toContain('idempotency_key')
    // 反证：改成 camelCase 后就抓不到 ⇒ 这条腿不是恒真
    const fixed = specFields.map((f) =>
      f === 'idempotency_key'
        ? 'idempotencyKey'
        : f === 'source_platform'
          ? 'sourcePlatform'
          : f === 'source_session_id'
            ? 'sourceSessionId'
            : f,
    )
    expect(fixed.filter((f) => !shape.includes(f))).toEqual([])
  })

  it('规格 §5「入 · 查询」那一行的路径参必须与真实路由一致', () => {
    const spec = readFileSync(SPEC_PATH, 'utf8')
    const row = spec.split('\n').find((l) => /^\|\s*入\s*\|/.test(l) && l.includes('path + query'))
    expect(row).toBeDefined()
    // 实测路由是 `/api/projects/:id/context` —— 规格原写 `project_id`，与真实路径参不同名
    expect(row).toContain('`:id`')
    expect(row).not.toContain('`project_id`')
  })
})
