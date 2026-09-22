import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { newDb, type TestDbHandle } from '@openvibe/core/test-support'
import { APP_META_KEYS, type SqliteDatabase } from '@openvibe/core'
import type { TelemetryEnqueueOut, TelemetrySettingsOut } from '@openvibe/shared'
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
