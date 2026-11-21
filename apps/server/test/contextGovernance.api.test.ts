import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { newDb, type TestDbHandle } from '@openvibe/core/test-support'
import { buildApp } from '../src/app'
import {
  summarizeContextGovernance,
  summarizeHistory,
  summarizeMerges,
  summarizeMergesBySource,
} from '../src/routes/contextGovernance'

/**
 * 上下文治理面板端点的测试。
 *
 * ## 值在哪
 *
 * 端点读的是**本机文件**（`test-results/context-check.json` 被 gitignore、每轮覆盖）
 * ⇒ 直接断言「本机此刻的文件内容」会让测试随机器状态飘。故：
 * ① 判据全部压在**纯函数**上（合成文本，两态各测）；
 * ② API 冒烟只断言「不炸、形状合法、available 是布尔」——
 *    文件在不在都成立，把「文件缺失」和「端点坏了」区分开。
 */

const TOKEN = 'test-token'

interface Harness {
  app: FastifyInstance
  handle: TestDbHandle
}

const openHandles: Harness[] = []

async function makeHarness(): Promise<Harness> {
  const handle = newDb()
  const { app } = await buildApp({ db: handle.db, token: TOKEN })
  const h: Harness = { app, handle }
  openHandles.push(h)
  return h
}

afterEach(() => {
  while (openHandles.length > 0) {
    const h = openHandles.pop()
    void h?.app.close()
    h?.handle.close()
  }
})

const REPORT = JSON.stringify({
  at: '2026-11-05T00:00:00.000Z',
  errors: 2,
  c5: 24,
  c5UpperBound: 23,
  c5OverBy: 1,
  coAnchors: 3,
  coAnchorItems: [],
})

const BASELINE = JSON.stringify({ c5UpperBound: 23 })

describe('context-governance · summarize（纯函数）', () => {
  it('⚠️ 本轮结论缺失 ⇒ available:false（不假装全绿）', () => {
    expect(summarizeContextGovernance(null, BASELINE)).toEqual({ available: false })
  })

  it('本轮结论非法 JSON ⇒ available:false（不猜）', () => {
    expect(summarizeContextGovernance('{', BASELINE)).toEqual({ available: false })
  })

  it('合法结论 ⇒ 透传四个计数（含棘轮超出量）', () => {
    const out = summarizeContextGovernance(REPORT, BASELINE)
    expect(out).toMatchObject({
      available: true,
      at: '2026-11-05T00:00:00.000Z',
      errors: 2,
      c5: 24,
      c5UpperBound: 23,
      c5OverBy: 1,
      coAnchors: 3,
    })
  })

  it('结论里没有上界 ⇒ 退回基线的上界（兼容旧版落盘）', () => {
    const out = summarizeContextGovernance(
      JSON.stringify({ at: 't', errors: 0, c5: 10, coAnchors: 0 }),
      BASELINE,
    )
    expect(out.c5UpperBound).toBe(23)
    // 超出量 = 10 - 23 < 0 ⇒ 0
    expect(out.c5OverBy).toBe(0)
  })

  it('基线也缺失 ⇒ 上界留空（显示「未知」，不猜 0）', () => {
    const out = summarizeContextGovernance(
      JSON.stringify({ at: 't', errors: 0, c5: 10, coAnchors: 0 }),
      null,
    )
    expect(out.c5UpperBound).toBeUndefined()
    expect(out.c5OverBy).toBeUndefined()
  })

  it('字段缺失 ⇒ 不填 0（0 是有效值，填了会把「没采到」读成「是 0」）', () => {
    const out = summarizeContextGovernance(JSON.stringify({ at: 't' }), null)
    expect(out.available).toBe(true)
    expect(out.errors).toBeUndefined()
    expect(out.c5).toBeUndefined()
    expect(out.coAnchors).toBeUndefined()
  })

  it('⚠️ 下调建议为数字 ⇒ 透传（面板据此提示「建议下调到 N」）', () => {
    const out = summarizeContextGovernance(
      JSON.stringify({ at: 't', c5: 20, c5UpperBound: 23, c5OverBy: 0, c5SuggestLowerBound: 20 }),
      BASELINE,
    )
    expect(out.c5SuggestLowerBound).toBe(20)
  })

  it('⚠️ 下调建议为 null ⇒ **保留 null**（「无须下调」与「旧产物没写」必须区分）', () => {
    const withNull = summarizeContextGovernance(
      JSON.stringify({ at: 't', c5SuggestLowerBound: null }),
      null,
    )
    expect(withNull.c5SuggestLowerBound).toBeNull()

    const absent = summarizeContextGovernance(JSON.stringify({ at: 't' }), null)
    expect(absent.c5SuggestLowerBound).toBeUndefined()
  })

  it('历史 ⇒ 透传（最旧→最新），缺省时不出现在出参里', () => {
    const run = {
      at: '2026-11-05T00:00:00.000Z',
      errors: 0,
      c5: 23,
      c5UpperBound: 23,
      c5OverBy: 0,
      c5SuggestLowerBound: null,
      coAnchors: 0,
    }
    const out = summarizeContextGovernance(
      REPORT,
      BASELINE,
      JSON.stringify({ schema: 1, runs: [run] }),
    )
    expect(out.history).toHaveLength(1)
    expect(out.history?.[0]?.c5).toBe(23)

    const noHistory = summarizeContextGovernance(REPORT, BASELINE)
    expect(noHistory.history).toBeUndefined()
  })
})

describe('context-governance · summarizeHistory（历史解析）', () => {
  const run = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    at: '2026-11-05T00:00:00.000Z',
    errors: 0,
    c5: 23,
    c5UpperBound: 23,
    c5OverBy: 0,
    c5SuggestLowerBound: null,
    coAnchors: 0,
    ...over,
  })

  it('缺失／非法 JSON ⇒ undefined（不画趋势，不猜）', () => {
    expect(summarizeHistory(null)).toBeUndefined()
    expect(summarizeHistory('{')).toBeUndefined()
    expect(summarizeHistory(JSON.stringify({ runs: 'x' }))).toBeUndefined()
  })

  it('⚠️ 只保留字段齐全的项（宁可少画一轮，不画半轮）', () => {
    const mixed = JSON.stringify({ schema: 1, runs: [run(), { at: 't' }, run({ c5: 24 })] })
    expect(summarizeHistory(mixed)).toHaveLength(2)
  })

  it('超过窗口 ⇒ 只留最近 N 轮（最旧→最新）', () => {
    const runs = Array.from({ length: 12 }, (_, i) => run({ c5: i }))
    const out = summarizeHistory(JSON.stringify({ schema: 1, runs }), 10)
    expect(out).toHaveLength(10)
    expect(out?.[0]?.c5).toBe(2)
    expect(out?.[9]?.c5).toBe(11)
  })

  it('全部不合格 ⇒ undefined（不返回空数组冒充「有历史」）', () => {
    expect(summarizeHistory(JSON.stringify({ schema: 1, runs: [{ at: 't' }] }))).toBeUndefined()
  })
})

describe('context-governance · summarizeMerges（合并清单）', () => {
  const merge = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    at: '2026-11-05T06:00:00.000Z',
    from: 'ci-history.json',
    accepted: 1,
    dropped: 0,
    added: 1,
    ...over,
  })

  it('缺失／非法 JSON／没有 merges 字段 ⇒ undefined（面板不展示折叠区）', () => {
    expect(summarizeMerges(null)).toBeUndefined()
    expect(summarizeMerges('{')).toBeUndefined()
    expect(summarizeMerges(JSON.stringify({ schema: 1, runs: [] }))).toBeUndefined()
  })

  it('合法清单 ⇒ 透传（含来源文件名与净增数）', () => {
    const out = summarizeMerges(JSON.stringify({ schema: 1, runs: [], merges: [merge()] }))
    expect(out).toHaveLength(1)
    expect(out?.[0]).toMatchObject({ from: 'ci-history.json', added: 1 })
  })

  it('⚠️ 坏记录逐条丢弃（一条坏不吞掉整块清单）', () => {
    const mixed = JSON.stringify({
      schema: 1,
      runs: [],
      merges: [merge(), { at: 't' }, merge({ from: 'macos.json', added: 2 })],
    })
    expect(summarizeMerges(mixed)).toHaveLength(2)
  })

  it('超过窗口 ⇒ 只留最近 N 条（最旧被截）', () => {
    const merges = Array.from({ length: 12 }, (_, i) =>
      merge({
        at: `2026-11-05T00:${String(i).padStart(2, '0')}:00.000Z`,
        from: `f-${String(i)}.json`,
      }),
    )
    const out = summarizeMerges(JSON.stringify({ schema: 1, runs: [], merges }), 10)
    expect(out).toHaveLength(10)
    expect(out?.[0]?.from).toBe('f-2.json')
    expect(out?.[9]?.from).toBe('f-11.json')
  })

  it('⚠️ 给了来源名 ⇒ 只取该来源，且**跨窗口**（窗口外的明细也能看到）', () => {
    // 12 条记录，其中 a.json 出现在第 1、2 条（落在最近 10 条窗口之外）
    const merges = Array.from({ length: 12 }, (_, i) =>
      merge({
        at: `2026-11-05T00:${String(i).padStart(2, '0')}:00.000Z`,
        from: i < 2 ? 'a.json' : 'b.json',
      }),
    )
    const text = JSON.stringify({ merges })
    // 不给来源 ⇒ 只有窗口内 10 条
    expect(summarizeMerges(text, 10)).toHaveLength(10)
    // 给了来源 ⇒ 该来源的全部记录（2 条，含窗口外的）
    const bySource = summarizeMerges(text, 10, 'a.json')
    expect(bySource).toHaveLength(2)
    expect(bySource?.every((m) => m.from === 'a.json')).toBe(true)
    expect(bySource?.[0]?.at).toBe('2026-11-05T00:00:00.000Z')
    expect(bySource?.[1]?.at).toBe('2026-11-05T00:01:00.000Z')
  })

  it('给了来源名但该来源无记录 ⇒ undefined（不返回空数组冒充「有记录」）', () => {
    const text = JSON.stringify({ merges: [merge()] })
    expect(summarizeMerges(text, 10, 'zzz.json')).toBeUndefined()
  })
})

describe('context-governance · summarizeMergesBySource（全量来源计数）', () => {
  const merge = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    at: '2026-11-05T06:00:00.000Z',
    from: 'ci-history.json',
    accepted: 1,
    dropped: 0,
    added: 1,
    ...over,
  })

  it('缺失／非法 JSON／没有 merges 字段 ⇒ undefined（不假装有清单）', () => {
    expect(summarizeMergesBySource(null)).toBeUndefined()
    expect(summarizeMergesBySource('{')).toBeUndefined()
    expect(summarizeMergesBySource(JSON.stringify({ schema: 1, runs: [] }))).toBeUndefined()
  })

  it('⚠️ 计数跨窗口（不只数最近 N 条）——面板据此说清「窗口外还有多少」', () => {
    const merges = Array.from({ length: 12 }, (_, i) =>
      merge({
        at: `2026-11-05T00:${String(i).padStart(2, '0')}:00.000Z`,
        from: 'ci-history.json',
      }),
    )
    // 窗口只给 10 条，但全量计数是 12
    expect(summarizeMerges(JSON.stringify({ merges }), 10)).toHaveLength(10)
    expect(summarizeMergesBySource(JSON.stringify({ merges }))?.['ci-history.json']?.count).toBe(12)
  })

  it('⚠️ 全量统计带**时间维度**（lastAt 取该来源最近一次合并）', () => {
    const merges = [
      merge({ at: '2026-11-05T06:00:00.000Z', from: 'a.json' }),
      merge({ at: '2026-11-05T09:00:00.000Z', from: 'a.json' }),
      merge({ at: '2026-11-05T07:00:00.000Z', from: 'b.json' }),
    ]
    const out = summarizeMergesBySource(JSON.stringify({ merges }))
    expect(out?.['a.json']?.lastAt).toBe('2026-11-05T09:00:00.000Z')
    expect(out?.['b.json']?.lastAt).toBe('2026-11-05T07:00:00.000Z')
  })

  it('全量统计含各项累计（与窗口内口径一致）', () => {
    const merges = [
      merge({ from: 'ci.json', accepted: 1, added: 1, dropped: 0 }),
      merge({ from: 'ci.json', accepted: 3, added: 2, dropped: 1 }),
    ]
    expect(summarizeMergesBySource(JSON.stringify({ merges }))?.['ci.json']).toMatchObject({
      count: 2,
      accepted: 4,
      added: 3,
      dropped: 1,
    })
  })

  it('多来源 ⇒ 各自计数（键 = 来源文件名）', () => {
    const merges = [merge(), merge({ from: 'macos.json' }), merge({ from: 'macos.json' })]
    const out = summarizeMergesBySource(JSON.stringify({ merges }))
    expect(out?.['ci-history.json']?.count).toBe(1)
    expect(out?.['macos.json']?.count).toBe(2)
  })

  it('⚠️ 坏记录不计入（口径与 summarizeMerges 一致）', () => {
    const merges = [merge(), { at: 't' }, merge({ from: 'macos.json' })]
    const out = summarizeMergesBySource(JSON.stringify({ merges }))
    expect(out?.['ci-history.json']?.count).toBe(1)
    expect(out?.['macos.json']?.count).toBe(1)
  })

  it('全部不合格 ⇒ undefined（不返回空对象冒充「没合并过」）', () => {
    expect(summarizeMergesBySource(JSON.stringify({ merges: [{ at: 't' }] }))).toBeUndefined()
  })
})

describe('context-governance · GET /api/context-governance', () => {
  it('带 token ⇒ 200，形状合法（文件在不在都成立）', async () => {
    const h = await makeHarness()
    const res = await h.app.inject({
      method: 'GET',
      url: '/api/context-governance',
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { available: boolean }
    expect(typeof body.available).toBe('boolean')
  })

  it('不带 token ⇒ 401（与其它端点同一道鉴权）', async () => {
    const h = await makeHarness()
    const res = await h.app.inject({ method: 'GET', url: '/api/context-governance' })
    expect(res.statusCode).toBe(401)
  })

  it('⚠️ `mergesFrom` 贯通到出参（按来源取跨窗口明细）', () => {
    const rec = (from: string): Record<string, unknown> => ({
      at: '2026-11-05T06:00:00.000Z',
      from,
      accepted: 1,
      dropped: 0,
      added: 1,
    })
    const merges = [rec('a.json'), rec('b.json')]
    const out = summarizeContextGovernance(REPORT, BASELINE, JSON.stringify({ merges }), 'a.json')
    expect(out.merges).toHaveLength(1)
    expect(out.merges?.[0]?.from).toBe('a.json')
    // ⚠️ 全量统计**不随筛选变**（它回答「全部来源合并过几次」）
    expect(out.mergesBySource?.['b.json']?.count).toBe(1)
    // 未截断（该来源 1 条、返回 1 条）⇒ 不写 mergesOmitted
    expect(out.mergesOmitted).toBeUndefined()
  })

  it('⚠️ 明细被截断 ⇒ 出参 `mergesOmitted`（服务端权威计算，非前端推断）', () => {
    // 该来源 55 条记录，超过单来源明细上限（50）⇒ 只返回 50 条，省略 5 条
    const merges = Array.from({ length: 55 }, (_, i) => ({
      at: `2026-11-05T00:${String(i).padStart(2, '0')}:00.000Z`,
      from: 'a.json',
      accepted: 1,
      dropped: 0,
      added: 1,
    }))
    const out = summarizeContextGovernance(REPORT, BASELINE, JSON.stringify({ merges }), 'a.json')
    expect(out.merges).toHaveLength(50)
    expect(out.mergesOmitted).toBe(5)
    expect(out.mergesTotal).toBe(55)
  })

  it('⚠️ 分页：offset=50 ⇒ 返回最早 5 条（旧→新），已到最早 ⇒ 不写 `mergesOmitted`', () => {
    const merges = Array.from({ length: 55 }, (_, i) => ({
      at: `2026-11-05T00:${String(i).padStart(2, '0')}:00.000Z`,
      from: 'a.json',
      accepted: 1,
      dropped: 0,
      added: 1,
    }))
    const out = summarizeContextGovernance(
      REPORT,
      BASELINE,
      JSON.stringify({ merges }),
      'a.json',
      50,
    )
    // offset=50 = 从最新往回跳过 50 条 ⇒ 剩下最早 5 条（00:00–00:04）
    expect(out.merges).toHaveLength(5)
    expect(out.merges?.[0]?.at).toBe('2026-11-05T00:00:00.000Z')
    expect(out.mergesTotal).toBe(55)
    expect(out.mergesOmitted).toBeUndefined()
  })

  it('⚠️ offset 超界 ⇒ clamp 到总数，返回空页（merges 缺省但 `mergesTotal` 仍在）', () => {
    const merges = Array.from({ length: 55 }, (_, i) => ({
      at: `2026-11-05T00:${String(i).padStart(2, '0')}:00.000Z`,
      from: 'a.json',
      accepted: 1,
      dropped: 0,
      added: 1,
    }))
    const out = summarizeContextGovernance(
      REPORT,
      BASELINE,
      JSON.stringify({ merges }),
      'a.json',
      999,
    )
    expect(out.merges).toBeUndefined()
    expect(out.mergesTotal).toBe(55)
  })

  it('⚠️ 未筛选（不给 mergesFrom）⇒ 不写 `mergesOmitted`', () => {
    const merges = Array.from({ length: 55 }, (_, i) => ({
      at: `2026-11-05T00:${String(i).padStart(2, '0')}:00.000Z`,
      from: 'a.json',
      accepted: 1,
      dropped: 0,
      added: 1,
    }))
    const out = summarizeContextGovernance(REPORT, BASELINE, JSON.stringify({ merges }))
    expect(out.mergesOmitted).toBeUndefined()
  })
})
