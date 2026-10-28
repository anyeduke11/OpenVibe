import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { newDb, type TestDbHandle } from '@openvibe/core/test-support'
import { APP_META_KEYS, type SqliteDatabase } from '@openvibe/core'
import type { TelemetryEnqueueOut, TelemetrySettingsOut } from '@openvibe/shared'
import { TelemetryLedgerOut } from '@openvibe/shared'
import { buildApp } from '../src/app'

/**
 * 遥测设置与入队端点（dev-plan §3.10 + §4.6 的 C-3 两端点，C-41 的入队端点）。
 * 核心不变量：默认关闭时**连本地队列都不写**（design §11.5），因此这里既断言响应，
 * 也直接数 telemetry_events 的行数。
 */

const TOKEN = 'test-token'

interface Harness {
  app: FastifyInstance
  db: SqliteDatabase
  handle: TestDbHandle
}

const openHandles: Harness[] = []

async function makeHarness(options: { platform?: string; at?: string } = {}): Promise<Harness> {
  const handle = newDb()
  const { app, db } = await buildApp({
    db: handle.db,
    token: TOKEN,
    appVersion: '0.3.1',
    platform: options.platform ?? 'darwin',
    now: () => new Date(options.at ?? '2026-09-21T23:40:00.000Z'),
  })
  const harness = { app, db, handle }
  openHandles.push(harness)
  return harness
}

afterEach(() => {
  while (openHandles.length > 0) {
    const h = openHandles.pop()
    void h?.app.close()
    h?.handle.close()
  }
})

async function api<T = unknown>(
  h: Harness,
  method: 'GET' | 'POST',
  url: string,
  payload?: object,
  auth = true,
): Promise<{ statusCode: number; json: T }> {
  const res = await h.app.inject({
    method,
    url,
    ...(payload === undefined ? {} : { payload }),
    ...(auth ? { headers: { authorization: `Bearer ${TOKEN}` } } : {}),
  })
  return { statusCode: res.statusCode, json: res.json() as T }
}

const eventCount = (h: Harness): number =>
  (h.db.prepare('SELECT COUNT(*) AS n FROM telemetry_events').get() as { n: number }).n

const metaRow = (h: Harness, key: string): string | undefined =>
  (
    h.db.prepare('SELECT value FROM app_meta WHERE key = ?').get(key) as
      { value: string } | undefined
  )?.value

describe('GET /api/settings/telemetry（默认关闭）', () => {
  it('IT-SETTINGS-01: 空库即 off/unset，白名单是固定三类；缺令牌 401', async () => {
    const h = await makeHarness()
    const res = await api<TelemetrySettingsOut>(h, 'GET', '/api/settings/telemetry')
    expect(res.statusCode).toBe(200)
    expect(res.json).toEqual({
      enabled: false,
      askState: 'unset',
      whitelist: ['pack_injected', 'flow_template_used', 'project_active'],
    })
    // app_meta 里没有行也不报错：缺省值就是关闭态
    expect(metaRow(h, APP_META_KEYS.telemetryEnabled)).toBeUndefined()

    const anon = await api(h, 'GET', '/api/settings/telemetry', undefined, false)
    expect(anon.statusCode).toBe(401)
  })
})

describe('POST /api/settings/telemetry（D13 一次询问的落点）', () => {
  it('IT-SETTINGS-02: 打开→accepted，关闭→declined；两个 app_meta 键同源写回', async () => {
    const h = await makeHarness()
    const on = await api<TelemetrySettingsOut>(h, 'POST', '/api/settings/telemetry', {
      enabled: true,
    })
    expect(on.json).toEqual({
      enabled: true,
      askState: 'accepted',
      whitelist: ['pack_injected', 'flow_template_used', 'project_active'],
    })
    expect(metaRow(h, APP_META_KEYS.telemetryEnabled)).toBe('true')
    expect(metaRow(h, APP_META_KEYS.telemetryAskState)).toBe('"accepted"')

    const off = await api<TelemetrySettingsOut>(h, 'POST', '/api/settings/telemetry', {
      enabled: false,
    })
    expect(off.json.askState).toBe('declined')
    expect(metaRow(h, APP_META_KEYS.telemetryEnabled)).toBe('false')

    // 重复表态只覆盖同一行，不留脏数据
    await api(h, 'POST', '/api/settings/telemetry', { enabled: true })
    expect(
      (
        h.db
          .prepare('SELECT COUNT(*) AS n FROM app_meta WHERE key = ?')
          .get(APP_META_KEYS.telemetryEnabled) as { n: number }
      ).n,
    ).toBe(1)
  })

  it('IT-SETTINGS-03: enabled 非布尔 / 缺字段 → 422 且带 fieldErrors，开关纹丝不动', async () => {
    const h = await makeHarness()
    const bad = await api<{ code: string; details?: { fieldErrors?: Record<string, string[]> } }>(
      h,
      'POST',
      '/api/settings/telemetry',
      { enabled: 'yes' },
    )
    expect(bad.statusCode).toBe(422)
    expect(bad.json.code).toBe('VALIDATION_ERROR')
    expect(bad.json.details?.fieldErrors?.enabled).toBeTruthy()
    expect(
      (await api<TelemetrySettingsOut>(h, 'GET', '/api/settings/telemetry')).json.enabled,
    ).toBe(false)
  })
})

describe('POST /api/telemetry/events（C-41：CLI 的入队通道）', () => {
  it('IT-SETTINGS-04: 关闭态 queued:false 且零入队；打开后才落库，day/os/app_version 由服务端补齐', async () => {
    const h = await makeHarness()
    const off = await api<TelemetryEnqueueOut>(h, 'POST', '/api/telemetry/events', {
      event: 'pack_injected',
      value: 'fixture@1.0.0',
    })
    expect(off.json).toEqual({ queued: false, reason: 'disabled' })
    expect(eventCount(h)).toBe(0)

    await api(h, 'POST', '/api/settings/telemetry', { enabled: true })
    const on = await api<TelemetryEnqueueOut>(h, 'POST', '/api/telemetry/events', {
      event: 'pack_injected',
      value: 'fixture@1.0.0',
    })
    expect(on.json).toEqual({ queued: true, reason: 'enabled' })

    const row = h.db
      .prepare(
        'SELECT event, value, day, os, app_version, queued_at, sent_at FROM telemetry_events',
      )
      .get() as Record<string, string | null>
    // 注入的时钟与平台别名生效：UTC 日历日 + darwin→mac 归一，sent_at 留空等远端通道
    expect(row).toMatchObject({
      event: 'pack_injected',
      value: 'fixture@1.0.0',
      day: '2026-09-21',
      os: 'mac',
      app_version: '0.3.1',
      queued_at: '2026-09-21T23:40:00.000Z',
    })
    expect(row.sent_at).toBeNull()
  })

  it('IT-SETTINGS-05: 白名单外的 event、超长 value、缺 value 一律 422（越界值进不了队列）', async () => {
    const h = await makeHarness()
    await api(h, 'POST', '/api/settings/telemetry', { enabled: true })

    const unknownEvent = await api(h, 'POST', '/api/telemetry/events', {
      event: 'prompt_content',
      value: 'x',
    })
    expect(unknownEvent.statusCode).toBe(422)

    const tooLong = await api(h, 'POST', '/api/telemetry/events', {
      event: 'pack_injected',
      value: 'v'.repeat(201),
    })
    expect(tooLong.statusCode).toBe(422)

    const bodyless = await api<TelemetryEnqueueOut>(h, 'POST', '/api/telemetry/events', {})
    // value 有 default('')：只有 event 是必填
    expect(bodyless.statusCode).toBe(422)

    const onlyEvent = await api<TelemetryEnqueueOut>(h, 'POST', '/api/telemetry/events', {
      event: 'project_active',
    })
    expect(onlyEvent.json.queued).toBe(true)
    expect(eventCount(h)).toBe(1)
    expect(
      (h.db.prepare('SELECT value FROM telemetry_events').get() as { value: string }).value,
    ).toBe('')
  })

  it('IT-SETTINGS-06: 平台别名归一（win32→win、其余→linux），关态闸门先于 os 计算', async () => {
    const win = await makeHarness({ platform: 'win32' })
    await api(win, 'POST', '/api/settings/telemetry', { enabled: true })
    await api(win, 'POST', '/api/telemetry/events', {
      event: 'flow_template_used',
      value: 'spec_driven',
    })
    expect((win.db.prepare('SELECT os FROM telemetry_events').get() as { os: string }).os).toBe(
      'win',
    )

    const linux = await makeHarness({ platform: 'freebsd' })
    await api(linux, 'POST', '/api/settings/telemetry', { enabled: true })
    await api(linux, 'POST', '/api/telemetry/events', { event: 'project_active', value: '' })
    expect((linux.db.prepare('SELECT os FROM telemetry_events').get() as { os: string }).os).toBe(
      'linux',
    )
  })
})

describe('GET /api/telemetry/events（本机事件台账 · 只读本地）', () => {
  /** 开闸后连灌 n 条（注入固定时钟 ⇒ queued_at 单调可断言） */
  async function fill(h: Harness, n: number): Promise<void> {
    await api(h, 'POST', '/api/settings/telemetry', { enabled: true })
    for (let i = 0; i < n; i++) {
      const res = await api<TelemetryEnqueueOut>(h, 'POST', '/api/telemetry/events', {
        event: 'pack_injected',
        value: `fixture@1.0.${String(i)}`,
      })
      expect(res.json.queued).toBe(true)
    }
  }

  /** noUncheckedIndexedAccess 下取首条：空台账直接炸在测试里，而不是静默滑过断言 */
  const firstOf = (body: TelemetryLedgerOut): TelemetryLedgerOut['items'][number] => {
    const first = body.items[0]
    if (first === undefined) throw new Error('台账应有至少一条')
    return first
  }

  it('IT-LEDGER-01: 200 + 字段齐全；name/ts/props 是表列 event/queued_at/其余列的映射', async () => {
    const h = await makeHarness()
    await fill(h, 2)

    const res = await api<TelemetryLedgerOut>(h, 'GET', '/api/telemetry/events')
    expect(res.statusCode).toBe(200)
    expect(TelemetryLedgerOut.safeParse(res.json).success).toBe(true)
    expect(res.json.total).toBe(2)
    expect(res.json.items).toHaveLength(2)

    // 最新一条在前（id DESC）
    const first = firstOf(res.json)
    expect(first.name).toBe('pack_injected')
    expect(first.ts).toBe('2026-09-21T23:40:00.000Z')
    expect(first.props).toEqual({
      value: 'fixture@1.0.1',
      day: '2026-09-21',
      os: 'mac',
      appVersion: '0.3.1',
      sentAt: null,
    })
    expect(Object.keys(first).sort()).toEqual(['id', 'name', 'props', 'ts'])
    expect(Object.keys(first.props).sort()).toEqual(['appVersion', 'day', 'os', 'sentAt', 'value'])
  })

  it('IT-LEDGER-02: 空台账 200 且 total=0；读端点零副作用（行数与开关都不变）', async () => {
    const h = await makeHarness()
    const empty = await api<TelemetryLedgerOut>(h, 'GET', '/api/telemetry/events')
    expect(empty.statusCode).toBe(200)
    expect(empty.json).toEqual({ items: [], total: 0 })

    await fill(h, 1)
    const rowsBefore = eventCount(h)
    await api(h, 'GET', '/api/telemetry/events')
    expect(eventCount(h)).toBe(rowsBefore)
    // 关闭态读得到历史台账，但不会因此开闸
    await api(h, 'POST', '/api/settings/telemetry', { enabled: false })
    expect((await api<TelemetryLedgerOut>(h, 'GET', '/api/telemetry/events')).json.total).toBe(1)
    expect(
      (await api<TelemetrySettingsOut>(h, 'GET', '/api/settings/telemetry')).json.enabled,
    ).toBe(false)
  })

  it('IT-LEDGER-03: limit 边界 —— 缺省 50、合法值按数取、超 200 夹 200', async () => {
    const h = await makeHarness()
    await fill(h, 60)

    const dflt = await api<TelemetryLedgerOut>(h, 'GET', '/api/telemetry/events')
    expect(dflt.json.items).toHaveLength(50)
    expect(dflt.json.total).toBe(60) // total 是表总行数，与 items 长度无关

    const one = await api<TelemetryLedgerOut>(h, 'GET', '/api/telemetry/events?limit=1')
    expect(one.json.items).toHaveLength(1)
    expect(one.json.total).toBe(60)
    expect(firstOf(one.json).props.value).toBe('fixture@1.0.59') // 取最新那条

    const edge = await api<TelemetryLedgerOut>(h, 'GET', '/api/telemetry/events?limit=200')
    expect(edge.json.items).toHaveLength(60)

    const over = await api<TelemetryLedgerOut>(h, 'GET', '/api/telemetry/events?limit=9999')
    expect(over.json.items).toHaveLength(60) // 夹到 200，本库只有 60 行
    expect(over.json.total).toBe(60)
  })

  it('IT-LEDGER-04: 非法 limit 一律回落默认 50（不是 422）', async () => {
    const h = await makeHarness()
    await fill(h, 60)

    for (const q of ['limit=abc', 'limit=0', 'limit=-3', 'limit=1.5', 'limit=', 'limit=%20']) {
      const res = await api<TelemetryLedgerOut>(h, 'GET', `/api/telemetry/events?${q}`)
      expect(res.statusCode).toBe(200)
      expect(res.json.items, q).toHaveLength(50)
    }
  })

  it('IT-LEDGER-05: 缺令牌 401（台账同样受鉴权插件保护）', async () => {
    const h = await makeHarness()
    await fill(h, 1)
    const anon = await api(h, 'GET', '/api/telemetry/events', undefined, false)
    expect(anon.statusCode).toBe(401)
  })
})
