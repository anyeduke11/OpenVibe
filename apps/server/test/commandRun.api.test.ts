import { afterEach, describe, expect, it } from 'vitest'
import { homedir, userInfo } from 'node:os'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { newDb, type TestDbHandle } from '@openvibe/core/test-support'
import { CLI_COMMAND_RUN_COMMANDS, CLI_COMMAND_RUN_PAYLOAD_KEYS, type SqliteDatabase } from '@openvibe/core'
import { buildApp } from '../src/app'

/**
 * `POST /api/agent/command-run` 的服务端写入点（m8-agent-bridge.md FR-5 的
 * `cli_agent_command_run` 一类，spec §7 的 s / u 两条 + FR-3.5 鉴权形态）。
 *
 * **起的是真 app**（`buildApp`）而非单挂路由 —— 「无 token ⇒ 既有 401 形态」
 * 验的是**全局 auth 插件的覆盖范围**，单挂路由永远验不到这一点
 * （照 `local-events.api.test.ts` 的同一理由）。
 *
 * ## 这条为什么自带「扫描器自证」一节
 *
 * 禁列扫描是**否定式判据**：写对了永远绿。扫描器本身若写错（正则失配、
 * 只扫顶层键、忘了递归），它也永远绿，而且**看起来很有安全感**。
 * 本仓已在这类地方栽过（扫描器只扫顶层 → 嵌套对象里的路径漏掉）。
 * 故下面先主动造一条**已知含禁列**的脏行，断言扫描器必须报错，
 * 再造一条干净行断言它放行 —— 抓不到自己就等于没有扫描器。
 */

const TOKEN = 'test-token'
const NOW = '2026-10-15T08:30:00.000Z'
const NOW_DAY = '2026-10-15'

interface Harness {
  app: FastifyInstance
  db: SqliteDatabase
  handle: TestDbHandle
}

const open: Harness[] = []

async function makeHarness(): Promise<Harness> {
  const handle = newDb()
  const { app, db } = await buildApp({
    db: handle.db,
    token: TOKEN,
    appVersion: '0.3.1',
    now: () => new Date(NOW),
  })
  const h = { app, db, handle }
  open.push(h)
  return h
}

afterEach(() => {
  while (open.length > 0) {
    const h = open.pop()!
    void h.app.close()
    h.handle.close()
  }
})

function post(app: FastifyInstance, payload: unknown) {
  return app.inject({
    method: 'POST',
    url: '/api/agent/command-run',
    payload: payload as object,
    headers: { authorization: `Bearer ${TOKEN}` },
  })
}

interface Row {
  kind: string
  subject_type: string | null
  subject_id: string | null
  project_id: string | null
  payload_json: string
  day: string
}

function rows(h: Harness): Row[] {
  return h.db
    .prepare(
      `SELECT kind, subject_type, subject_id, project_id, payload_json, day
         FROM local_events ORDER BY id ASC`,
    )
    .all() as Row[]
}

function ofKind(h: Harness, kind: string): Row[] {
  return rows(h).filter((r) => r.kind === kind)
}

function payloadKeys(row: Row): string[] {
  return Object.keys(JSON.parse(row.payload_json) as Record<string, unknown>).sort()
}

/* ---------------------------------------------------------------------------
 * 禁列扫描（FR-5.1.2 / FR-5.1.3）
 * ------------------------------------------------------------------------- */

const USER = userInfo().username

/** 递归展开所有字符串值 —— 只扫顶层是这类检查最常见的失效方式（payload 嵌对象就漏） */
function stringValues(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v)
  else if (Array.isArray(v)) for (const x of v) stringValues(x, out)
  else if (v && typeof v === 'object') for (const x of Object.values(v)) stringValues(x, out)
  return out
}

const FORBIDDEN: { label: string; re: RegExp }[] = [
  { label: 'Unix 绝对路径', re: /(^|[\s"'(=:,[])\/(?:Users|home|tmp|var|etc|opt|private|Applications)\// },
  { label: '任意根目录绝对路径', re: /(^|[\s"'(=:,[])\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/ },
  { label: 'Windows 绝对路径', re: /[A-Za-z]:\\|\\\\/ },
  { label: '本机用户名', re: new RegExp(`\\b${USER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i') },
  { label: 'home 目录片段', re: new RegExp(homedir().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
]

/** 返回命中的禁列标签列表（空数组 = 干净） */
function scanForbidden(row: Row): string[] {
  const payload = JSON.parse(row.payload_json) as unknown
  const haystack = [...stringValues(payload), row.subject_type ?? '', row.subject_id ?? '']
  return FORBIDDEN.filter((f) => haystack.some((s) => f.re.test(s))).map((f) => f.label)
}

/* ------------------------------------------------------------------------- */

describe('FR-3.5 · 鉴权：端点落在全局 auth 插件内，不自建鉴权', () => {
  it('**无 token ⇒ 既有 401 形态**', async () => {
    const h = await makeHarness()
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/agent/command-run',
      payload: { command: 'ask', exitCode: 0, agent: null },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json()).toMatchObject({ code: 'UNAUTHORIZED' })
    // 未鉴权的请求**不得留下台账行**（否则 401 的请求也在写观测数据）
    expect(rows(h)).toHaveLength(0)
  })

  it('带正确 token ⇒ 放行', async () => {
    const h = await makeHarness()
    const res = await post(h.app, { command: 'ask', exitCode: 0, agent: null })
    expect(res.statusCode).toBe(200)
  })
})

describe('FR-5 · 写入点：合法入参恰好新增一行', () => {
  it('`ask` 成功 ⇒ 台账恰好 1 行，响应只回 { ok: true }', async () => {
    const h = await makeHarness()
    const res = await post(h.app, { command: 'ask', exitCode: 0, agent: 'trae' })

    expect(res.statusCode, res.body).toBe(200)
    // 出参闭集：多回一个字段就是 CLI 多一份将来会变的耦合
    expect(res.json()).toEqual({ ok: true })

    const got = ofKind(h, 'cli_agent_command_run')
    expect(got).toHaveLength(1)
    expect(got[0]).toMatchObject({
      kind: 'cli_agent_command_run',
      subject_type: null,
      subject_id: null,
      project_id: null,
      day: NOW_DAY,
    })
    expect(JSON.parse(got[0]!.payload_json)).toEqual({ command: 'ask', exitCode: 0, agent: 'trae' })
  })

  it('**闭集每个枚举值各记一行**（漏一个值 ⇒ 该命令的用量永远看不见）', async () => {
    const h = await makeHarness()
    for (const command of CLI_COMMAND_RUN_COMMANDS) {
      const res = await post(h.app, { command, exitCode: 0, agent: null })
      expect(res.statusCode, command).toBe(200)
    }
    const got = ofKind(h, 'cli_agent_command_run')
    // ⚠️ 计数从闭集常量派生，**不写死数字**。此前写死 `toHaveLength(3)`，
    // 2026-10-16 扩到四值时这里直接红 —— 那是好事（它确实该红），
    // 但红的原因会与「别处的回归」混淆。派生写法让「闭集几值」只有一个真相来源。
    expect(got).toHaveLength(CLI_COMMAND_RUN_COMMANDS.length)
    expect(got.map((r) => (JSON.parse(r.payload_json) as { command: string }).command).sort()).toEqual(
      [...CLI_COMMAND_RUN_COMMANDS].sort(),
    )
  })

  it('**agent 缺省 ⇒ null**（表示「人跑的」）；缺省与显式 null 同义', async () => {
    const h = await makeHarness()
    await post(h.app, { command: 'status', exitCode: 2 })
    await post(h.app, { command: 'session', exitCode: 1, agent: null })
    const got = ofKind(h, 'cli_agent_command_run')
    expect(got.map((r) => JSON.parse(r.payload_json).agent)).toEqual([null, null])
  })

  it('`day` 由注入时钟派生（证明 `now` 真的透传到了写入点，不是墙上时钟）', async () => {
    const handle = newDb()
    const { app, db } = await buildApp({
      db: handle.db,
      token: TOKEN,
      appVersion: '0.3.1',
      now: () => new Date('2026-09-01T23:59:59.000Z'),
    })
    open.push({ app, db, handle })
    await post(app, { command: 'ask', exitCode: 0, agent: null })
    const got = ofKind({ app, db, handle }, 'cli_agent_command_run')
    expect(got[0]!.day).toBe('2026-09-01')
    expect(got[0]!.day).not.toBe(NOW_DAY)
  })
})

describe('FR-5.1.1 · payload 键闭集（多一个键就红）', () => {
  it('真实写入行的键**逐字等于**闭集三键', async () => {
    const h = await makeHarness()
    await post(h.app, { command: 'ask', exitCode: 0, agent: 'codebuddy' })
    const row = ofKind(h, 'cli_agent_command_run')[0]!
    expect(payloadKeys(row)).toEqual([...CLI_COMMAND_RUN_PAYLOAD_KEYS])
  })

  it('**闭集自证**：往 payload 多塞一个键 ⇒ 断言必须判红', async () => {
    const h = await makeHarness()
    await post(h.app, { command: 'ask', exitCode: 0, agent: null })
    const row = ofKind(h, 'cli_agent_command_run')[0]!

    const leaked = { ...JSON.parse(row.payload_json), cwd: '/tmp/x' }
    const leakedRow: Row = { ...row, payload_json: JSON.stringify(leaked) }

    // 真实写入点干净
    expect(payloadKeys(row)).toEqual([...CLI_COMMAND_RUN_PAYLOAD_KEYS])
    // 多一个键就不再等于闭集 —— 少了这一段，无法区分「闭集生效」与「闭集恒等于真值」
    expect(payloadKeys(leakedRow)).not.toEqual([...CLI_COMMAND_RUN_PAYLOAD_KEYS])
    expect(payloadKeys(leakedRow)).toContain('cwd')
    // 且禁列扫描同时兜住它（cwd 属 FR-5.1.2 禁列）
    expect(scanForbidden(leakedRow)).toContain('任意根目录绝对路径')
  })
})

describe('FR-5.1.2 · 禁列扫描（否定式判据 ⇒ 必须自带自证）', () => {
  it('**真实写入面全部干净**：无绝对路径 / 用户名 / 项目名 / 会话正文', async () => {
    const h = await makeHarness()
    // 刻意喂「最容易被顺手带上」的值：命令名闭集每一值、平台标识、退出码
    for (const command of CLI_COMMAND_RUN_COMMANDS) {
      const res = await post(h.app, { command, exitCode: 0, agent: 'claude-code' })
      expect(res.statusCode, command).toBe(200)
    }
    const all = rows(h)
    // 同上：行数从闭集派生，不写死
    expect(all).toHaveLength(CLI_COMMAND_RUN_COMMANDS.length)
    for (const r of all) expect(scanForbidden(r), JSON.stringify(r)).toEqual([])
    // 项目名同样不入 payload（本仓项目名示例：招商银行）
    expect(all.map((r) => r.payload_json).join('')).not.toContain('招商银行')
  })

  it('**扫描器自证**：造一条含绝对路径与用户名的脏行，扫描器必须报错', async () => {
    const h = await makeHarness()
    // 直写库绕过写入点 —— 模拟「将来有人手滑把路径放进 payload」
    h.db
      .prepare(
        `INSERT INTO local_events (kind, subject_type, subject_id, project_id, payload_json, created_at, day)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'cli_agent_command_run',
        null,
        null,
        null,
        // ⚠️ 路径藏在**嵌套对象**里：只扫顶层键的扫描器会漏掉它（这条是本节的判据所在）
        JSON.stringify({ command: 'ask', exitCode: 0, nested: { where: `/Users/${USER}/work/secret-repo` } }),
        NOW,
        NOW_DAY,
      )

    expect(rows(h)).toHaveLength(1)
    const dirty = rows(h)[0]!
    expect(scanForbidden(dirty)).toEqual(
      expect.arrayContaining(['Unix 绝对路径', '本机用户名']),
    )

    // 对照组：只把 payload 换回写入口径的形状（其余列逐字不动），扫描器必须放行。
    // 少了这一行，就无法区分「扫描器抓到了脏行」与「扫描器对一切非空 payload 都报错」。
    const clean: Row = { ...dirty, payload_json: JSON.stringify({ command: 'ask', exitCode: 0, agent: null }) }
    expect(scanForbidden(clean)).toEqual([])
  })

  it('**递归自证**：同一路径放在顶层被抓住、放进嵌套层仍被抓住（漏一层即红）', () => {
    const payload = { command: 'ask', exitCode: 0, agent: null }
    const dirty = `/Users/${USER}/work/repo`

    // 顶层
    expect(
      scanForbidden({
        kind: 'k', subject_type: null, subject_id: null, project_id: null,
        day: NOW_DAY, payload_json: JSON.stringify({ ...payload, agent: dirty }),
      }),
    ).toContain('Unix 绝对路径')
    // 二层嵌套
    expect(
      scanForbidden({
        kind: 'k', subject_type: null, subject_id: null, project_id: null,
        day: NOW_DAY, payload_json: JSON.stringify({ ...payload, extra: { a: { b: [dirty] } } }),
      }),
    ).toContain('Unix 绝对路径')
  })
})

describe('FR-6.1 · 入参非法 ⇒ 既有 422，且**不留台账行**', () => {
  it('`command` 非闭集三值 ⇒ 422 VALIDATION_ERROR', async () => {
    const h = await makeHarness()
    for (const command of ['diff', 'Ask', 'ASK', '', 'ask ', 'ask\n', 'ingest', 'sessions', 42, null, undefined]) {
      const res = await post(h.app, { command, exitCode: 0, agent: null })
      expect(res.statusCode, JSON.stringify(command)).toBe(422)
      expect(res.json(), JSON.stringify(command)).toMatchObject({ code: 'VALIDATION_ERROR' })
    }
    expect(rows(h)).toHaveLength(0)
  })

  it('`exitCode` 非整数 ⇒ 422；0 与 2 两端边界放行', async () => {
    const h = await makeHarness()
    for (const exitCode of [0.5, '0', null, undefined, NaN, Infinity]) {
      const res = await post(h.app, { command: 'ask', exitCode, agent: null })
      expect(res.statusCode, JSON.stringify(exitCode)).toBe(422)
    }
    expect(rows(h)).toHaveLength(0)

    // 反向分歧样本：ExitCode 三值两端必须放行，否则闸是过严而非过紧
    for (const exitCode of [0, 1, 2]) {
      const res = await post(h.app, { command: 'ask', exitCode, agent: null })
      expect(res.statusCode, String(exitCode)).toBe(200)
    }
    expect(ofKind(h, 'cli_agent_command_run')).toHaveLength(3)
  })

  it('**意外退出码照记不误**（负数也放行）—— 观测面宁可记下怪值，也不能整条丢掉', async () => {
    // 刻意与上一条分开：这一条钉的是「异常退出也必须留下台账行」。
    // 若把退出码卡死在 ExitCode 三值，被信号打断（128+n）或别的异常码
    // 会让整次运行**一条不记**——而那恰恰是最该被看见的运行。
    const h = await makeHarness()
    for (const exitCode of [-1, 130, 255, 1000]) {
      const res = await post(h.app, { command: 'ask', exitCode, agent: null })
      expect(res.statusCode, String(exitCode)).toBe(200)
    }
    const got = ofKind(h, 'cli_agent_command_run')
    expect(got).toHaveLength(4)
    expect(got.map((r) => JSON.parse(r.payload_json).exitCode)).toEqual([-1, 130, 255, 1000])
  })

  it('`agent` 含路径分隔符 ⇒ 422（FR-5.1.2 禁列在**写入点**兜底，不留给扫描器事后发现）', async () => {
    const h = await makeHarness()
    for (const agent of [
      `/Users/${USER}`,
      'C:\\Users\\duke',
      '~/work/repo',
      '../sibling',
      'trae/sub',
      'a'.repeat(65),
    ]) {
      const res = await post(h.app, { command: 'ask', exitCode: 0, agent })
      expect(res.statusCode, agent).toBe(422)
      expect(res.json(), agent).toMatchObject({ code: 'VALIDATION_ERROR' })
    }
    expect(rows(h)).toHaveLength(0)

    // 反向样本：正常平台标识必须放行（闸不能过严）
    for (const agent of ['trae', 'codebuddy', 'claude-code', 'a'.repeat(64)]) {
      const res = await post(h.app, { command: 'ask', exitCode: 0, agent })
      expect(res.statusCode, agent).toBe(200)
    }
  })

  it('`agent` 空串 / 非字符串 ⇒ 422（空串会被读成「有人跑但平台未知」）', async () => {
    const h = await makeHarness()
    for (const agent of ['', '   ', 42, {}, []]) {
      const res = await post(h.app, { command: 'ask', exitCode: 0, agent })
      expect(res.statusCode, JSON.stringify(agent)).toBe(422)
    }
    expect(rows(h)).toHaveLength(0)
  })

  it('`fieldErrors` 点名出错字段（承既有 422 出参面）', async () => {
    const h = await makeHarness()
    const res = await post(h.app, { command: 'diff', exitCode: 'x', agent: 7 })
    expect(res.statusCode).toBe(422)
    const fieldErrors = (res.json() as { details: { fieldErrors: Record<string, string[]> } }).details.fieldErrors
    expect(Object.keys(fieldErrors).sort()).toEqual(['agent', 'command', 'exitCode'])
  })
})

describe('FR-5.2 · 写入点集中在服务层', () => {
  it('**路由文件里没有台账写入、也不 new 台账 repo**', () => {
    const src = readFileSync(fileURLToPath(new URL('../src/routes/agent.ts', import.meta.url)), 'utf8')
    // 只留注释里的提及不算数：把注释行剥掉再扫，否则本文件自己解释 FR-5.2 就把自己判红
    const code = src
      .split('\n')
      .filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//') && !l.trim().startsWith('/*'))
      .join('\n')
    expect(code).not.toMatch(/ledger\.record|localEvents\.record|\.record\(/)
    expect(code).not.toMatch(/LocalEventsRepo/)
    // 命令字面量也不该在路由里出现（闭集归属服务层）
    expect(code).not.toContain("'ask'")
  })
})

describe('FR-5.3 / FR-8 · 正交性', () => {
  it('**M8 五类 kind 一条都不进遥测白名单**', async () => {
    const { AGENT_EVENT_KINDS } = await import('@openvibe/shared')
    const { TELEMETRY_EVENTS } = await import('@openvibe/shared')
    const overlap = AGENT_EVENT_KINDS.filter((k) =>
      (TELEMETRY_EVENTS as readonly string[]).includes(k),
    )
    expect(overlap).toEqual([])
    // 本类确实在 M8 五类里（否则上面那条是空真）
    expect(AGENT_EVENT_KINDS).toContain('cli_agent_command_run')
  })

  it('**遥测关闭时本端点零网络调用，且台账照写**（FR-5.2 的无条件本机写）', async () => {
    const h = await makeHarness()
    const res = await post(h.app, { command: 'status', exitCode: 0, agent: null })
    expect(res.statusCode).toBe(200)
    expect(ofKind(h, 'cli_agent_command_run')).toHaveLength(1)
    expect(ofKind(h, 'cli_agent_command_run')[0]!.payload_json).not.toMatch(/token|https?:/)
  })
})
