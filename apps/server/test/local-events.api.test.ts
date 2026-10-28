import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { newDb, type TestDbHandle } from '@openvibe/core/test-support'
import { LocalEventsRepo, type SqliteDatabase } from '@openvibe/core'
import type { LocalEventsClearOut, LocalEventsSummaryOut } from '@openvibe/shared'
import { buildApp } from '../src/app'

/**
 * 本机事件台账的聚合与清空端点（local-event-ledger.md §7 的 g / h / i 三条验收）。
 *
 * **起的是真 app**（`buildApp`）而不是单挂路由 —— 因为 g 条要验的
 * 「无 token ⇒ 既有 401/403 形态」恰恰**不在**路由文件里，而在全局 auth 插件里；
 * 只单挂路由就永远验不到「端点确实落在插件覆盖范围内」这一条。
 */

const TOKEN = 'test-token'

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
    platform: 'darwin',
    now: () => new Date('2026-10-15T12:00:00.000Z'),
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

/** 带 Bearer 的程序请求（CLI 形态） */
function api(app: FastifyInstance, method: 'GET' | 'POST', url: string) {
  return app.inject({ method, url, headers: { authorization: `Bearer ${TOKEN}` } })
}

describe('§7-g · 鉴权与双闸生效', () => {
  it('**无 token ⇒ 既有 401 形态**（证明端点落在全局 auth 插件内，不是绕过它自建鉴权）', async () => {
    const { app } = await makeHarness()
    const res = await app.inject({
      method: 'GET',
      url: '/api/local-events/summary?from=2026-10-01&to=2026-11-01',
    })
    expect(res.statusCode).toBe(401)
    expect(res.json()).toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('**clear 同样受双闸保护** —— 不可逆动作不能比只读端点更松', async () => {
    const { app } = await makeHarness()
    const res = await app.inject({ method: 'POST', url: '/api/local-events/clear' })
    expect(res.statusCode).toBe(401)
  })

  it('带正确 token ⇒ 放行', async () => {
    const { app } = await makeHarness()
    const res = await api(app, 'GET', '/api/local-events/summary?from=2026-10-01&to=2026-11-01')
    expect(res.statusCode).toBe(200)
  })
})

describe('§7-h · 时间窗：`[from, to)` 含头不含尾，且与累计可区分', () => {
  it('边界：from 当天计入、to 当天**不**计入', async () => {
    const { app, db } = await makeHarness()
    const repo = new LocalEventsRepo(db)
    for (const day of ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13']) {
      repo.record(
        { kind: 'stage_view_switched', projectId: 'prj_1' },
        new Date(`${day}T12:00:00.000Z`),
      )
    }
    const res = await api(app, 'GET', '/api/local-events/summary?from=2026-10-11&to=2026-10-12')
    const out = res.json() as LocalEventsSummaryOut
    expect(out.window).toEqual({ from: '2026-10-11', to: '2026-10-12', inclusive: 'start-only' })
    expect(out.windowTotal).toBe(1)
    expect(out.byDay.map((r) => r.day)).toEqual(['2026-10-11'])
  })

  it('**窗内计数与累计计数同时在场且不相等** —— 用户才知道自己看的是一段还是全部', async () => {
    const { app, db } = await makeHarness()
    const repo = new LocalEventsRepo(db)
    repo.record({ kind: 'stage_view_switched' }, new Date('2026-09-01T12:00:00.000Z')) // 窗外
    repo.record({ kind: 'stage_view_switched' }, new Date('2026-10-11T12:00:00.000Z'))
    repo.record({ kind: 'flow_template_run' }, new Date('2026-10-11T12:00:00.000Z'))

    const out = (
      await api(app, 'GET', '/api/local-events/summary?from=2026-10-11&to=2026-10-12')
    ).json() as LocalEventsSummaryOut
    expect(out.windowTotal).toBe(2)
    expect(out.cumulativeTotal).toBe(3)
    expect(out.byKind).toEqual([
      { kind: 'flow_template_run', count: 1 },
      { kind: 'stage_view_switched', count: 1 },
    ])
    expect(out.cumulativeByKind).toEqual([
      { kind: 'flow_template_run', count: 1 },
      { kind: 'stage_view_switched', count: 2 },
    ])
    expect(out.activeDays).toBe(1)
  })

  it('缺参 / 非法日戳 / from 晚于 to ⇒ 422 而不是空数组（静默空会被读成「这段时间没事件」）', async () => {
    const { app } = await makeHarness()
    for (const url of [
      '/api/local-events/summary',
      // 月份越界（13 月 / 00 月）：`new Date` 构造即 Invalid，两条分支都拦得住
      '/api/local-events/summary?from=2026-13-01&to=2026-11-01',
      '/api/local-events/summary?from=2026-10-32&to=2026-11-01',
      // ⚠️ **下面这三条才是日历校验真正的判据**，且它们**专挑分歧输入**：
      // `new Date('2026-04-31T00:00:00Z')` 在 V8 里**不抛 Invalid Date**（它把 4 月 31 日顺延成 5 月 1 日），
      // 只有「构造后读回 `toISOString()` 与原串相等」这一支才拦得住。
      // 用 `2026-10-32` 当唯一非法样例是**弱断言**：它落在两支都拒绝的交集里，
      // 于是把日历校验整条删掉测试照样全绿（已实测）。这类「4 月 31 日 / 11 月 31 日 /
      // 非闰年 2 月 29 日」恰恰也是人手敲出来最像真的那几种错，故单列成条。
      '/api/local-events/summary?from=2026-04-31&to=2026-11-01',
      '/api/local-events/summary?from=2026-11-31&to=2026-12-01',
      '/api/local-events/summary?from=2026-02-29&to=2026-03-01',
      // 反向分歧样本：闰年 2 月 29 日**必须**放行，否则就成过度拒绝
      '/api/local-events/summary?from=2024-02-29&to=2024-03-01',
      // from 晚于 to
      '/api/local-events/summary?from=2026-10-12&to=2026-10-10',
    ]) {
      const res = await api(app, 'GET', url)
      if (url.includes('2024-02-29')) {
        expect(res.statusCode, url).toBe(200)
        expect(res.json(), url).toMatchObject({ window: { from: '2024-02-29', to: '2024-03-01' } })
        continue
      }
      expect(res.statusCode, url).toBe(422)
      expect(res.json(), url).toMatchObject({ code: 'VALIDATION_ERROR' })
    }
  })
})

describe('§7-i · 一键清空', () => {
  it('**回传删掉的条数**（不是只回 200）——「清了 0 条」和「清了 128 条」对用户是两件事', async () => {
    const { app, db } = await makeHarness()
    const repo = new LocalEventsRepo(db)
    repo.record({ kind: 'stage_view_switched' }, new Date('2026-10-10T12:00:00.000Z'))
    repo.record({ kind: 'stage_view_switched' }, new Date('2026-10-11T12:00:00.000Z'))
    repo.record({ kind: 'flow_template_run' }, new Date('2026-10-11T12:00:00.000Z'))

    const out = (await api(app, 'POST', '/api/local-events/clear')).json() as LocalEventsClearOut
    expect(out.cleared).toBe(3)
    expect(out.clearedAt).toBe('2026-10-15T12:00:00.000Z')
    expect(repo.countAll()).toBe(0)
  })

  it('**清空本身不落台账行** —— 否则「归零」自相矛盾', async () => {
    const { app, db } = await makeHarness()
    const repo = new LocalEventsRepo(db)
    repo.record({ kind: 'stage_view_switched' }, new Date('2026-10-10T12:00:00.000Z'))
    await api(app, 'POST', '/api/local-events/clear')
    expect(repo.countAll()).toBe(0)
    const out = (
      await api(app, 'GET', '/api/local-events/summary?from=2020-01-01&to=2030-01-01')
    ).json() as LocalEventsSummaryOut
    expect(out.cumulativeTotal).toBe(0)
  })

  it('对空表清空 ⇒ `cleared: 0`，不是报错', async () => {
    const { app } = await makeHarness()
    const res = await api(app, 'POST', '/api/local-events/clear')
    expect(res.statusCode).toBe(200)
    expect((res.json() as LocalEventsClearOut).cleared).toBe(0)
  })
})
