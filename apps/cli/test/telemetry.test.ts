import { describe, expect, it, vi } from 'vitest'
import type { TelemetrySettingsOut } from '@openvibe/shared'
import { ApiError } from '../src/client'
import {
  askTelemetryOnce,
  clackConfirm,
  reportEvent,
  TELEMETRY_ASK_MESSAGE,
  type ConfirmAnswer,
} from '../src/telemetry'
import { fakeClient } from './helpers/fake-client'

/**
 * 匿名遥测的唯一出口（design §11.5 / dev-plan §6.5 / C-41）。
 * 断言重心是「请求条数」而不是返回值：默认关闭态必须一个事件请求都不发，
 * 这样 §11.5 的零外联承诺才不是靠一句文案糊过去的。
 */

const confirmQueue: (boolean | string)[] = []
vi.mock('@clack/prompts', () => ({
  confirm: vi.fn(async () => confirmQueue.shift() ?? true),
  isCancel: vi.fn((value: unknown) => value === '__cancel__'),
}))

const off: TelemetrySettingsOut = {
  enabled: false,
  askState: 'unset',
  whitelist: ['pack_injected'],
}
const on: TelemetrySettingsOut = {
  enabled: true,
  askState: 'accepted',
  whitelist: ['pack_injected'],
}

const settingsRoute = (settings: TelemetrySettingsOut) => ({
  get: { '/api/settings/telemetry': settings },
})

describe('reportEvent：先读开关，再决定是否入队', () => {
  it('UT-TELEMETRY-01: 开关关闭 → 恰好一次 GET、零事件 POST，reason=disabled', async () => {
    const { client, calls, paths } = fakeClient({
      ...settingsRoute(off),
      post: { '/api/telemetry/events': { queued: true, reason: 'enabled' } },
    })
    const report = await reportEvent(client, 'pack_injected', 'fixture@1.0.0')
    expect(report).toMatchObject({ sent: false, reason: 'disabled' })
    expect(report.settings).toEqual(off)
    expect(paths()).toEqual(['GET /api/settings/telemetry'])
    expect(calls.filter((c) => c.method === 'POST')).toEqual([])
  })

  it('UT-TELEMETRY-02: 开关打开 → GET 后一次 POST，请求体只有 event/value 两段', async () => {
    const { client, calls, paths } = fakeClient({
      ...settingsRoute(on),
      post: { '/api/telemetry/events': { queued: true, reason: 'enabled' } },
    })
    const report = await reportEvent(client, 'pack_injected', 'fixture@1.0.0')
    expect(report).toMatchObject({ sent: true, reason: 'queued' })
    expect(paths()).toEqual(['GET /api/settings/telemetry', 'POST /api/telemetry/events'])
    expect(calls[1]?.body).toEqual({ event: 'pack_injected', value: 'fixture@1.0.0' })
  })

  it('UT-TELEMETRY-03: 无客户端（离线注入）→ 零请求、reason=offline', async () => {
    const report = await reportEvent(undefined, 'pack_injected', 'fixture@1.0.0')
    expect(report).toEqual({ sent: false, reason: 'offline' })
  })

  it('UT-TELEMETRY-04: 读开关失败或入队失败都收敛成 error，绝不抛出打断注入', async () => {
    const broken = fakeClient({
      get: { '/api/settings/telemetry': new ApiError(500, 'BOOM', '开关读不到') },
    })
    expect(await reportEvent(broken.client, 'pack_injected', 'v')).toMatchObject({
      sent: false,
      reason: 'error',
      detail: '开关读不到',
    })
    expect(broken.paths()).toEqual(['GET /api/settings/telemetry'])

    const half = fakeClient({
      ...settingsRoute(on),
      post: { '/api/telemetry/events': new ApiError(500, 'BOOM', '队列写不进') },
    })
    const report = await reportEvent(half.client, 'pack_injected', 'v')
    expect(report).toMatchObject({ sent: false, reason: 'error', detail: '队列写不进' })
    expect(report.settings).toEqual(on)
  })

  it('UT-TELEMETRY-05: 打错端点（/api/settings 而非 /api/settings/telemetry）收敛成 error，不静默通过', async () => {
    const naive = fakeClient({ get: { '/api/settings': { telemetryEnabled: false } } })
    const report = await reportEvent(naive.client, 'pack_injected', 'v')
    expect(report.reason).toBe('error')
    expect(report.detail).toContain('/api/settings/telemetry')
    expect(naive.paths()).toEqual(['GET /api/settings/telemetry'])
  })
})

describe('askTelemetryOnce：D13 一次性询问的门与落点', () => {
  const yesClient = () =>
    fakeClient({
      post: { '/api/settings/telemetry': { enabled: true, askState: 'accepted', whitelist: [] } },
    })

  it('UT-TELEMETRY-06: unset + TTY + 非 --json 才问；答“开启”则 POST enabled:true', async () => {
    const { client, calls, paths } = yesClient()
    const answers: ConfirmAnswer[] = []
    const confirmFn = vi.fn(async () => answers.shift() ?? 'yes')
    const r = await askTelemetryOnce(client, off, {
      isTTY: true,
      json: false,
      confirmFn,
    })
    expect(r).toEqual({ asked: true, reason: 'accepted' })
    expect(confirmFn).toHaveBeenCalledWith(TELEMETRY_ASK_MESSAGE)
    expect(paths()).toEqual(['POST /api/settings/telemetry'])
    expect(calls[0]?.body).toEqual({ enabled: true })
  })

  it('UT-TELEMETRY-07: 答“不开启”→ declined 且 POST enabled:false（落 askState=declined，不再打扰）', async () => {
    const { client, calls } = yesClient()
    const r = await askTelemetryOnce(client, off, {
      isTTY: true,
      json: false,
      confirmFn: async () => 'no',
    })
    expect(r).toEqual({ asked: true, reason: 'declined' })
    expect(calls[0]?.body).toEqual({ enabled: false })
  })

  it('UT-TELEMETRY-08: 四道门各自拦住打扰——已表态 / --json / 非 TTY / 离线', async () => {
    const { client, paths } = yesClient()
    expect(
      await askTelemetryOnce(
        client,
        { ...off, askState: 'declined' },
        {
          isTTY: true,
          json: false,
          confirmFn: async () => 'yes',
        },
      ),
    ).toEqual({ asked: false, reason: 'asked' })
    expect(
      await askTelemetryOnce(client, off, {
        isTTY: true,
        json: true,
        confirmFn: async () => 'yes',
      }),
    ).toEqual({ asked: false, reason: 'json' })
    expect(
      await askTelemetryOnce(client, off, {
        isTTY: false,
        json: false,
        confirmFn: async () => 'yes',
      }),
    ).toEqual({ asked: false, reason: 'non-tty' })
    expect(
      await askTelemetryOnce(undefined, off, {
        isTTY: true,
        json: false,
        confirmFn: async () => 'yes',
      }),
    ).toEqual({ asked: false, reason: 'offline' })
    expect(
      await askTelemetryOnce(client, undefined, {
        isTTY: true,
        json: false,
        confirmFn: async () => 'yes',
      }),
    ).toEqual({ asked: false, reason: 'offline' })
    expect(paths()).toEqual([])
  })

  it('UT-TELEMETRY-09: Ctrl-C 取消 = 零请求；落库失败只是 error，不打断注入', async () => {
    const { client, paths } = fakeClient({
      post: { '/api/settings/telemetry': new ApiError(500, 'BOOM', '写不进') },
    })
    expect(
      await askTelemetryOnce(client, off, {
        isTTY: true,
        json: false,
        confirmFn: async () => 'cancel',
      }),
    ).toEqual({ asked: true, reason: 'cancelled' })
    expect(paths()).toEqual([])

    expect(
      await askTelemetryOnce(client, off, {
        isTTY: true,
        json: false,
        confirmFn: async () => 'yes',
      }),
    ).toEqual({ asked: true, reason: 'error' })
    expect(paths()).toEqual(['POST /api/settings/telemetry'])
  })
})

describe('clackConfirm：@clack 的三态归一', () => {
  it('UT-TELEMETRY-10: 是→yes，否→no，isCancel→cancel（取消不等于默认同意）', async () => {
    confirmQueue.push(true)
    expect(await clackConfirm('q')).toBe('yes')
    confirmQueue.push(false)
    expect(await clackConfirm('q')).toBe('no')
    confirmQueue.push('__cancel__')
    expect(await clackConfirm('q')).toBe('cancel')
  })
})
