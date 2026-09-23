import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { APP_META_KEYS, AppMetaRepo, TelemetryRepo, type SqliteDatabase } from '@openvibe/core'
import { newDb, type TestDbHandle } from '@openvibe/core/test-support'
import { TELEMETRY_FLUSH_INTERVAL_MS, TelemetryBatch, type TelemetryEvent } from '@openvibe/shared'
import { bootstrap, type BootstrapResult } from '../src/bootstrap'
import { flushTelemetryOnce, startTelemetryFlush } from '../src/lib/telemetry-flush'

/**
 * 匿名遥测的出队腿（T8d，design §11.5 / dev-plan §4.6）：
 * 「关闭即零外联」必须能被证伪，所以每个用例都盯两件事——fetch 被叫了几次、
 * 队列里的 sent_at 有没有被盖章。端点回 2xx 之前绝不盖章，失败的一律留队等下一轮。
 *
 * 两道闸门叠起来才叫结构性：① 没配 endpoint 连定时器都不建；② 开关关着每轮读 app_meta 后空转。
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..', '..', '..')
const SEED_DIR = join(REPO, 'content', 'seed')
const ADAPTER = join(REPO, 'deploy', 'telemetry', 'adapter-node.mjs')
const EP = 'http://127.0.0.1:9999/collect/test-token'
const REAL_HOME = process.env.OPENVIBE_HOME

interface Harness {
  db: SqliteDatabase
  handle: TestDbHandle
  home: string
  /** 真送进 fetchImpl 的请求，断言线格式与「打了几次」的唯一出处 */
  calls: { url: string; raw: string }[]
}

const opens: (() => void)[] = []
const roots: string[] = []

function harness(): Harness {
  // 预置包导出落在 <home>/packs/ 且含条目 id：每用例一个新沙箱，否则第二次撞 VERSION_IMMUTABLE
  const home = mkdtempSync(join(tmpdir(), 'ov-tel-home-'))
  process.env.OPENVIBE_HOME = home
  const handle = newDb()
  opens.push(() => handle.close())
  roots.push(home)
  return { db: handle.db, handle, home, calls: [] }
}

afterAll(() => {
  while (opens.length) opens.pop()?.()
  while (roots.length) rmSync(roots.pop() ?? '', { recursive: true, force: true })
  if (REAL_HOME === undefined) delete process.env.OPENVIBE_HOME
  else process.env.OPENVIBE_HOME = REAL_HOME
})

/** 一次入队 = 生产路径 POST /api/telemetry/events 落库后的样子 */
function enqueue(h: Harness, n: number, event: TelemetryEvent = 'pack_injected'): void {
  const repo = new TelemetryRepo(h.db)
  for (let i = 0; i < n; i += 1) {
    repo.enqueue({
      event,
      value: `pack-${String(i)}`,
      day: '2026-09-22',
      os: 'mac',
      appVersion: '0.4.0',
      queuedAt: new Date(Date.UTC(2026, 8, 22, 1, 0, i)).toISOString(),
    })
  }
}

function enable(h: Harness): void {
  new AppMetaRepo(h.db).write(APP_META_KEYS.telemetryEnabled, true)
}

function allRows(db: SqliteDatabase): { id: number; sentAt: string | null; day: string }[] {
  return db
    .prepare('SELECT id, sent_at AS sentAt, day FROM telemetry_events ORDER BY id ASC')
    .all() as { id: number; sentAt: string | null; day: string }[]
}

/** 替掉真网络：status 决定端点是否「确认收下」 */
function fetchStub(h: Harness, status = 200): typeof fetch {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    h.calls.push({ url: String(input), raw: String(init?.body ?? '') })
    return new Response(JSON.stringify({ ok: status < 400 }), { status })
  }) as unknown as typeof fetch
}

function flush(h: Harness, over: { endpoint?: string; fetchImpl?: typeof fetch } = {}) {
  return flushTelemetryOnce({
    db: h.db,
    endpoint: over.endpoint ?? EP,
    fetchImpl: over.fetchImpl ?? fetchStub(h),
  })
}

describe('flushTelemetryOnce 的两道闸门（§11.5 / §4.6）', () => {
  it('TF-01: 未配端点 → no-endpoint，fetch 零次，事件留在队列', async () => {
    const h = harness()
    enable(h)
    enqueue(h, 3)
    const spy = fetchStub(h)
    expect(await flush(h, { endpoint: '', fetchImpl: spy })).toEqual({
      sent: 0,
      reason: 'no-endpoint',
      kept: 3,
    })
    expect(spy).not.toHaveBeenCalled()
    expect(new TelemetryRepo(h.db).pendingCount()).toBe(3)
  })

  it('TF-02: 开关关闭 → disabled，fetch 零次；打开后同一条队列照常发出（延迟而非丢弃）', async () => {
    const h = harness()
    enqueue(h, 5)
    const spy = fetchStub(h)
    expect(await flush(h, { fetchImpl: spy })).toEqual({ sent: 0, reason: 'disabled', kept: 5 })
    expect(spy).not.toHaveBeenCalled()
    enable(h)
    expect(await flush(h, { fetchImpl: spy })).toEqual({ sent: 5, reason: 'ok', kept: 0 })
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('TF-03: 开启且有端点 → ok，一次 POST，四行全盖 sent_at', async () => {
    const h = harness()
    enable(h)
    enqueue(h, 4)
    expect(await flush(h)).toEqual({ sent: 4, reason: 'ok', kept: 0 })
    expect(h.calls).toHaveLength(1)
    expect(new TelemetryRepo(h.db).pendingCount()).toBe(0)
    expect(allRows(h.db).filter((r) => r.sentAt === null)).toHaveLength(0)
  })

  it('TF-04: 空队列 → empty，不发请求', async () => {
    const h = harness()
    enable(h)
    expect(await flush(h)).toEqual({ sent: 0, reason: 'empty', kept: 0 })
    expect(h.calls).toHaveLength(0)
  })

  it('TF-05: 上报体恰为 events × 五段，且不含本机路径（§11.5 隐私红线）', async () => {
    const h = harness()
    enable(h)
    enqueue(h, 2)
    await flush(h)
    const raw = h.calls[0]?.raw ?? ''
    const parsed = JSON.parse(raw) as { events: Record<string, unknown>[] }
    expect(() => TelemetryBatch.parse(parsed)).not.toThrow()
    expect(parsed.events).toHaveLength(2)
    for (const e of parsed.events) {
      expect(Object.keys(e).sort()).toEqual(['appVersion', 'day', 'event', 'os', 'value'])
    }
    expect(raw).not.toContain(h.home)
    expect(raw).not.toContain(h.handle.dir)
    expect(raw).not.toContain('.openvibe')
    expect(raw).not.toContain('.db')
  })

  it('TF-06: 105 条 → 首批 100（按入队序），次轮 5', async () => {
    const h = harness()
    enable(h)
    enqueue(h, 105)
    expect(await flush(h)).toMatchObject({ sent: 100, reason: 'ok', kept: 5 })
    const first = JSON.parse(h.calls[0]?.raw ?? '{}') as { events: { value: string }[] }
    expect(first.events).toHaveLength(100)
    expect(first.events[0]?.value).toBe('pack-0')
    expect(first.events[99]?.value).toBe('pack-99')
    expect(await flush(h)).toMatchObject({ sent: 5, reason: 'ok', kept: 0 })
  })

  it('TF-07: 端点回 500 → error 且不盖 sent_at；恢复后同一批重试成功', async () => {
    const h = harness()
    enable(h)
    enqueue(h, 3)
    const bad = await flush(h, { fetchImpl: fetchStub(h, 500) })
    expect(bad).toMatchObject({ sent: 0, reason: 'error', kept: 3 })
    expect(bad.detail).toContain('500')
    expect(allRows(h.db).every((r) => r.sentAt === null)).toBe(true)
    expect(await flush(h)).toMatchObject({ sent: 3, reason: 'ok', kept: 0 })
    expect(new TelemetryRepo(h.db).pendingCount()).toBe(0)
  })

  it('TF-08: 网络抛错 → error 带原因，队列完好', async () => {
    const h = harness()
    enable(h)
    enqueue(h, 2)
    const boom = vi.fn(async () => {
      throw new Error('ECONNREFUSED')
    }) as unknown as typeof fetch
    const r = await flush(h, { fetchImpl: boom })
    expect(r).toMatchObject({ sent: 0, reason: 'error', kept: 2 })
    expect(r.detail).toContain('ECONNREFUSED')
    expect(new TelemetryRepo(h.db).pendingCount()).toBe(2)
  })
})

describe('startTelemetryFlush 定时器（零外联的结构性保证）', () => {
  it('TF-09: 未配端点时连定时器都不创建，stop 可安全调用', () => {
    const h = harness()
    enable(h)
    enqueue(h, 2)
    const spy = vi.spyOn(globalThis, 'setInterval')
    const stop = startTelemetryFlush({ db: h.db, endpoint: '', fetchImpl: fetchStub(h) })
    expect(spy).not.toHaveBeenCalled()
    expect(() => stop()).not.toThrow()
    expect(new TelemetryRepo(h.db).pendingCount()).toBe(2)
    spy.mockRestore()
  })

  it('TF-10: 配了端点按 60s 建循环，stop 清掉，且不抢跑', () => {
    const h = harness()
    enable(h)
    enqueue(h, 1)
    const set = vi.spyOn(globalThis, 'setInterval')
    const clear = vi.spyOn(globalThis, 'clearInterval')
    const stub = fetchStub(h)
    const stop = startTelemetryFlush({ db: h.db, endpoint: EP, fetchImpl: stub })
    expect(set).toHaveBeenCalledWith(expect.any(Function), TELEMETRY_FLUSH_INTERVAL_MS)
    stop()
    expect(clear).toHaveBeenCalled()
    expect(stub).not.toHaveBeenCalled()
    set.mockRestore()
    clear.mockRestore()
  })
})

describe('bootstrap 接线 + 真接收端端到端', () => {
  interface Summary {
    day: string
    listed: boolean
    total: number
    counts?: { event: string; value: string; os: string; count: number }[]
  }

  /** 真起 deploy/telemetry/adapter-node.mjs（port 0 = 内核分配），据其回显解析真实端口 */
  function startAdapter(): Promise<{
    origin: string
    summary(day: string): Promise<Summary>
    stop(): void
  }> {
    return new Promise((resolve, reject) => {
      const proc = spawn(process.execPath, [ADAPTER, '0'], { stdio: ['ignore', 'pipe', 'pipe'] })
      let settled = false
      const fail = (why: string): void => {
        if (settled) return
        settled = true
        reject(new Error(why))
      }
      const timer = setTimeout(() => fail('接收端 10s 内未报出端口'), 10_000)
      // stderr 只攒不作断言：Node 的告警行不该判死一次正常启动
      let err = ''
      proc.stderr?.setEncoding('utf8')
      proc.stderr?.on('data', (c: string) => {
        err += c
      })
      proc.stdout?.setEncoding('utf8')
      proc.stdout?.on('data', (chunk: string) => {
        const m = /http:\/\/127\.0\.0\.1:\d+/.exec(chunk)
        if (!m) return
        settled = true
        clearTimeout(timer)
        const origin = m[0]
        resolve({
          origin,
          stop: () => proc.kill(),
          summary: async (day: string) => {
            const res = await fetch(`${origin}/summary?day=${day}`)
            return (await res.json()) as Summary
          },
        })
      })
      proc.on('exit', (code) => fail(`接收端提前退出（code=${String(code)}）${err}`))
    })
  }

  const cleanup: (() => Promise<void> | void)[] = []
  afterEach(async () => {
    while (cleanup.length) await cleanup.pop()?.()
  })

  const post = async (r: BootstrapResult, path: string, body: unknown) => {
    const res = await fetch(`${r.url}${path}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${r.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    return (await res.json()) as Record<string, unknown>
  }

  function tempHome(): string {
    const home = mkdtempSync(join(tmpdir(), 'ov-tel-boot-'))
    roots.push(home)
    process.env.OPENVIBE_HOME = home
    return home
  }

  it('TF-11: 未配 telemetryEndpoint → telemetry 回显空串，事件停在队列且零外发', async () => {
    const home = tempHome()
    const r = await bootstrap({
      dbPath: join(home, 'data', 'openvibe.db'),
      dataDir: home,
      seedDir: SEED_DIR,
      port: 0,
      token: 'a'.repeat(64),
      appVersion: '0.4.0',
    })
    cleanup.push(() => r.close())
    expect(r.telemetry).toEqual({ endpoint: '', intervalMs: TELEMETRY_FLUSH_INTERVAL_MS })
    // 开关打开、事件入队；端点没配就永远停在队列里（TF-01 的 bootstrap 版）
    await post(r, '/api/settings/telemetry', { enabled: true })
    expect(
      await post(r, '/api/telemetry/events', { event: 'pack_injected', value: 'p-1' }),
    ).toEqual({ queued: true, reason: 'enabled' })
    expect(new TelemetryRepo(r.db).pendingCount()).toBe(1)
    expect(r.warnings.filter((w) => w.includes('遥测'))).toEqual([])
  })

  it('TF-12: 入队 → 出队腿打到真接收端 → /summary 计数与 sent_at 对得上', async () => {
    const home = tempHome()
    const adapter = await startAdapter()
    cleanup.push(() => adapter.stop())
    const endpoint = `${adapter.origin}/collect/test-token`

    const r = await bootstrap({
      dbPath: join(home, 'data', 'openvibe.db'),
      dataDir: home,
      seedDir: SEED_DIR,
      port: 0,
      token: 'a'.repeat(64),
      appVersion: '0.4.0',
      telemetryEndpoint: endpoint,
    })
    cleanup.push(() => r.close())
    expect(r.telemetry.endpoint).toBe(endpoint)

    // 默认关闭：路由里还有第三道闸门，关着连队列都不写
    expect(await post(r, '/api/telemetry/events', { event: 'pack_injected', value: 'p-1' })).toEqual(
      { queued: false, reason: 'disabled' },
    )
    expect(new TelemetryRepo(r.db).pendingCount()).toBe(0)

    expect(await post(r, '/api/settings/telemetry', { enabled: true })).toMatchObject({
      enabled: true,
      askState: 'accepted',
    })
    for (const value of ['p-1', 'p-2', 'p-3']) {
      expect(
        await post(r, '/api/telemetry/events', { event: 'pack_injected', value }),
      ).toMatchObject({ queued: true })
    }
    const telemetry = new TelemetryRepo(r.db)
    expect(telemetry.pendingCount()).toBe(3)
    const day = telemetry.pending(1)[0]?.day ?? ''
    expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    // 60s 定时器不在用例里等；打同一条腿的函数体，走真网络到真接收端
    const out = await flushTelemetryOnce({ db: r.db, endpoint })
    expect(out.detail ?? '').toBe('') // 失败时先把网络原因摊开，免得只剩一个 'error'
    expect(out).toMatchObject({ sent: 3, reason: 'ok', kept: 0 })
    const rows = allRows(r.db)
    expect(rows).toHaveLength(3)
    expect(rows.every((x) => x.sentAt !== null && x.day === day)).toBe(true)

    const summary = await adapter.summary(day)
    expect(summary.total).toBe(3)
    expect(summary.counts?.map((c) => [c.event, c.value, c.count]).sort()).toEqual(
      [
        ['pack_injected', 'p-1', 1],
        ['pack_injected', 'p-2', 1],
        ['pack_injected', 'p-3', 1],
      ].sort(),
    )
    // 再跑一轮：队列空了就不该再打端点（计数不会翻倍）
    expect(await flushTelemetryOnce({ db: r.db, endpoint })).toMatchObject({ reason: 'empty' })
    expect((await adapter.summary(day)).total).toBe(3)
  })

  /**
   * 接收端半边（D12 自部署的 worker.js）：走真 HTTP 打真 worker，不 import 源码。
   * 两类断言分开——事件白名单/os/day/批量是 fail closed（宁可不计数也不计错），
   * §11.5 的隐私红线则是「带外字段进不了聚合」：计数键只由五段构成，多余字段无处可存。
   */
  it('TF-13: 接收端拒收越界载荷，且带外字段不落进任何聚合', async () => {
    const adapter = await startAdapter()
    cleanup.push(() => adapter.stop())
    const collect = `${adapter.origin}/collect/test-token`
    const send = async (body: string) => {
      const res = await fetch(collect, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      })
      return res.status
    }

    const okEvent = {
      event: 'pack_injected',
      value: 'pack-1',
      day: '2026-09-22',
      os: 'mac',
      appVersion: '0.4.0',
    }
    const batch = (e: object) => JSON.stringify({ events: [e] })
    expect(await send(batch(okEvent))).toBe(200)
    // 白名单外的事件名 / 未定义的 os / 非 YYYY-MM-DD 的 day / 空批 / 超 100 / 坏 JSON / 超长值
    expect(await send(batch({ ...okEvent, event: 'ssh_key_read' }))).toBe(400)
    expect(await send(batch({ ...okEvent, os: 'freebsd' }))).toBe(400)
    expect(await send(batch({ ...okEvent, day: '22-09-2026' }))).toBe(400)
    expect(await send(JSON.stringify({ events: [] }))).toBe(400)
    expect(await send(JSON.stringify({ events: Array.from({ length: 101 }, () => okEvent) }))).toBe(
      400,
    )
    expect(await send(JSON.stringify({ nope: 1 }))).toBe(400)
    expect(await send('{oops')).toBe(400)
    expect(await send(batch({ ...okEvent, value: 'x'.repeat(201) }))).toBe(400)

    // 带外字段：批收下，但聚合键只由 day/event/value/os 组成——路径与机器标识无处可存
    expect(await send(batch({ ...okEvent, path: '/Users/duke/.ssh/id_ed25519' }))).toBe(200)

    const summary = await adapter.summary('2026-09-22')
    expect(summary.total).toBe(2)
    expect(summary.counts).toEqual([{ event: 'pack_injected', value: 'pack-1', os: 'mac', count: 2 }])
    expect(JSON.stringify(summary)).not.toContain('id_ed25519')
    // 换日不串键：计数按天分
    expect((await adapter.summary('2026-09-21')).total).toBe(0)
    // day 缺失/格式错 → 422 而不是 500：聚合查询不该把接收端打崩
    expect((await fetch(`${adapter.origin}/summary?day=2026%2F09%2F22`)).status).toBe(422)
    expect((await fetch(`${adapter.origin}/summary`)).status).toBe(422)
    // 服务自述：人肉确认部署对不对，并回显白名单
    const self = (await (await fetch(`${adapter.origin}/`)).json()) as {
      service: string
      events: string[]
    }
    expect(self.service).toBe('openvibe-telemetry')
    expect(self.events).toEqual(['pack_injected', 'flow_template_used', 'project_active'])
  })
})
