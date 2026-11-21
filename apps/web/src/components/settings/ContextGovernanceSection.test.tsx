import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ContextGovernanceMergeStat, ContextGovernanceOut } from '@openvibe/shared'
import { ContextGovernanceSection, mergeSourceRows } from './ContextGovernanceSection'

/**
 * 上下文治理面板的测试。
 *
 * ## 值在哪
 *
 * 面板只做一件事：**把端点给的数如实显示**。故测试断的是三态：
 * ① `available: false`（没跑过 context:check）⇒ 必须显示「先运行」，不得渲染成 0/全绿；
 * ② 超上界 ⇒ 判红数与本行都标红（不是只显示数字）；
 * ③ 全绿 ⇒ aside 显示「通过」。
 */

/**
 * 包 MemoryRouter：筛选态持久化走 `mergeFrom` URL query，组件依赖 useSearchParams。
 * ⚠️ 不用 `createMemoryRouter`：data router 的 navigate 会 `new Request(url, { signal })`，
 * jsdom 的 AbortSignal 不是 Node 原生 AbortSignal 实例，undici 校验会抛 TypeError。
 *
 * @param over 端点出参（`merges` 视为**窗口内**那批）
 * @param initialEntry 初始 URL
 * @param bySource 全量按来源统计（跨窗口）
 * @param fullBySource 该来源的**全量明细**（按来源取数时端点返回它，跨窗口）
 */
function renderWith(
  over: Partial<ContextGovernanceOut>,
  initialEntry = '/',
  bySource?: ContextGovernanceOut['mergesBySource'],
  fullBySource?: ContextGovernanceOut['merges'],
): { unmount: () => void } {
  const body: ContextGovernanceOut = {
    available: true,
    ...over,
    ...(bySource === undefined ? {} : { mergesBySource: bySource }),
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      // ⚠️ 复刻服务端分页口径：`mergesFrom` 时按 `mergesOffset` 取该来源对应页
      //    （offset = 从最新往回跳过多少条，页大小 50），并给 `mergesTotal` 与
      //    `mergesOmitted`（当前页之后还有多少条）。mock 与真实口径不一致 ⇒ 测的是假行为。
      const url = String(input)
      const sp = new URL(url, 'http://localhost').searchParams
      const from = sp.get('mergesFrom')
      const rawOffset = sp.get('mergesOffset')
      const offset = rawOffset === null ? 0 : Number(rawOffset)
      if (from !== null && fullBySource !== undefined) {
        const all = fullBySource
        const total = all.length
        const safeOffset = Math.max(0, Math.min(offset, total))
        const start = Math.max(0, total - safeOffset - 50)
        const end = total - safeOffset
        const page = all.slice(start, end)
        const payload: ContextGovernanceOut = {
          ...body,
          merges: page,
          mergesTotal: total,
          ...(total - safeOffset - page.length > 0
            ? { mergesOmitted: total - safeOffset - page.length }
            : {}),
        }
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }),
  )
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <QueryClientProvider client={client}>
        <SearchProbe />
        <ContextGovernanceSection />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

/** 测试探针：把当前 location.search 暴露给断言（MemoryRouter 的 history 拿不到实例） */
function SearchProbe() {
  const { search } = useLocation()
  return <span data-testid="merge-from-search">{search}</span>
}

/** 读探针：当前 URL 的 query 串（无 query 时是空串） */
const searchNow = (): string => screen.getByTestId('merge-from-search').textContent ?? ''

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('设置页 · 上下文治理面板', () => {
  it('⚠️ available:false ⇒ 显示「先运行」，**不**渲染 0（假绿比不显示更坏）', async () => {
    renderWith({ available: false })
    expect(await screen.findByText(/先运行 pnpm context:check/)).toBeTruthy()
    // 判定 chip 不该出现（没有数据就没资格说「通过」）
    expect(screen.queryByText('通过')).toBeNull()
  })

  it('⚠️ 超上界 ⇒ 判红数与 C-5 行都标红，并显示超出的条数', async () => {
    renderWith({ errors: 1, c5: 24, c5UpperBound: 23, c5OverBy: 1, coAnchors: 0 })
    // 「1 处红」在 aside chip 与表格判定列各出现一次 ⇒ 断「至少有一处」
    expect((await screen.findAllByText('1 处红')).length).toBeGreaterThan(0)
    expect(await screen.findByText('超上界 1 条')).toBeTruthy()
    expect(screen.getByText('24')).toBeTruthy()
    expect(screen.getByText('23')).toBeTruthy()
  })

  it('全绿 ⇒ 面板显示「通过」', async () => {
    renderWith({ errors: 0, c5: 23, c5UpperBound: 23, c5OverBy: 0, coAnchors: 0 })
    expect((await screen.findAllByText('通过')).length).toBeGreaterThan(0)
  })

  it('字段缺失 ⇒ 显示「未知」，不把 undefined 渲染成 0', async () => {
    renderWith({})
    expect(await screen.findByText(/上下文治理/)).toBeTruthy()
    expect(screen.queryByText('0')).toBeNull()
  })

  it('⚠️ 有下调建议 ⇒ 显示「建议把上界下调到 N」并给出改基线的落点', async () => {
    renderWith({ errors: 0, c5: 20, c5UpperBound: 23, c5OverBy: 0, c5SuggestLowerBound: 20 })
    const tip = await screen.findByText(/建议把上界下调到 20/)
    expect(tip).toBeTruthy()
    expect(tip.textContent).toContain('docs/context-check-baseline.json')
  })

  it('下调建议为 null ⇒ **不显示**提示（「无须下调」不该有提示）', async () => {
    renderWith({ errors: 0, c5: 23, c5UpperBound: 23, c5OverBy: 0, c5SuggestLowerBound: null })
    expect(await screen.findByText(/上下文治理/)).toBeTruthy()
    expect(screen.queryByText(/建议把上界下调/)).toBeNull()
  })

  it('⚠️ 有历史 ⇒ 显示最近几轮的时间序列（含来源列：本机与 CI 可区分）', async () => {
    const base = { c5UpperBound: 23, c5OverBy: 0, c5SuggestLowerBound: null }
    renderWith({
      errors: 0,
      c5: 23,
      c5OverBy: 0,
      coAnchors: 2,
      history: [
        {
          ...base,
          at: '2026-11-03T02:00:00.000Z',
          source: 'ci-Linux',
          errors: 0,
          c5: 23,
          coAnchors: 1,
        },
        {
          ...base,
          at: '2026-11-04T02:00:00.000Z',
          source: 'local',
          errors: 0,
          c5: 23,
          coAnchors: 1,
        },
        {
          ...base,
          at: '2026-11-05T02:00:00.000Z',
          source: 'local',
          errors: 0,
          c5: 23,
          coAnchors: 2,
        },
      ],
    })
    expect(await screen.findByText('历史趋势（最近 5 轮，最旧→最新）')).toBeTruthy()
    // 三行历史各出现一次「23」（C-5 列）；表头与主表另有同名数字，故断「至少 3 处」
    expect((await screen.findAllByText('23')).length).toBeGreaterThanOrEqual(3)
    // 来源列：本机与 CI 同时可见（跨机器合并的用途就在这）
    expect(screen.getAllByText('ci-Linux').length).toBeGreaterThan(0)
    expect(screen.getAllByText('local').length).toBeGreaterThan(0)
  })

  it('无历史 ⇒ 显示「多跑几次」提示（不留空白块）', async () => {
    renderWith({ errors: 0, c5: 23, c5UpperBound: 23, c5OverBy: 0, coAnchors: 0 })
    expect(await screen.findByText(/多跑几次 pnpm context:check/)).toBeTruthy()
    expect(screen.queryByText(/历史趋势/)).toBeNull()
  })

  it('⚠️ 有合并清单 ⇒ 出现折叠区（含来源文件名与净增），无清单则不出现', async () => {
    renderWith({
      errors: 0,
      c5: 23,
      c5UpperBound: 23,
      c5OverBy: 0,
      coAnchors: 1,
      history: [
        {
          at: '2026-11-05T02:00:00.000Z',
          source: 'ci-Linux',
          errors: 0,
          c5: 23,
          c5UpperBound: 23,
          c5OverBy: 0,
          c5SuggestLowerBound: null,
          coAnchors: 1,
        },
      ],
      merges: [
        {
          at: '2026-11-05T06:00:00.000Z',
          from: 'ci-history.json',
          accepted: 1,
          dropped: 0,
          added: 1,
        },
      ],
    })
    // 该文案在 summary 与逐条表小标题各出现一次 ⇒ 断「至少一处」
    expect((await screen.findAllByText(/合并来源清单（最近 1 条）/)).length).toBeGreaterThan(0)
    // 来源文件名在聚合表与逐条表各出现一次 ⇒ 断「至少一处」
    expect(screen.getAllByText('ci-history.json').length).toBeGreaterThan(0)
  })

  it('无合并清单 ⇒ 不渲染折叠区（不留空壳）', async () => {
    renderWith({ errors: 0, c5: 23, c5UpperBound: 23, c5OverBy: 0, coAnchors: 0 })
    expect(await screen.findByText(/上下文治理/)).toBeTruthy()
    expect(screen.queryByText(/合并来源清单/)).toBeNull()
  })

  it('⚠️ 同一来源合并 3 次 ⇒ 聚合行显示次数、累计净增与累计丢弃（全量口径）', async () => {
    const merge = (at: string, added: number, accepted: number, dropped: number) => ({
      at,
      from: 'ci-history.json',
      accepted,
      dropped,
      added,
    })
    renderWith(
      {
        errors: 0,
        c5: 23,
        c5UpperBound: 23,
        c5OverBy: 0,
        coAnchors: 1,
        merges: [
          merge('2026-11-05T06:00:00.000Z', 1, 1, 0),
          merge('2026-11-05T07:00:00.000Z', 2, 3, 1),
          merge('2026-11-05T08:00:00.000Z', 3, 4, 1),
        ],
      },
      '/',
      {
        'ci-history.json': {
          count: 3,
          accepted: 8,
          added: 6,
          dropped: 2,
          lastAt: '2026-11-05T08:00:00.000Z',
        },
      },
    )
    expect(await screen.findByText(/来源聚合（全量 3 条合并记录）/)).toBeTruthy()
    // 聚合次数 3 与累计净增 6（1+2+3）各出现一次；逐条清单另有「净增 1/2/3」
    expect(screen.getAllByText('3').length).toBeGreaterThan(0)
    expect(screen.getByText('6')).toBeTruthy()
    expect(screen.getByText('8')).toBeTruthy() // 累计读入 1+3+4
    // ⚠️ 累计丢弃 0+1+1=2：逐条表「净增 2」也显示 2 ⇒ 用 getAllByText 而非 getByText
    expect(screen.getAllByText('2').length).toBeGreaterThan(0)
  })

  it('⚠️ 点聚合行 ⇒ 逐条表只显示该来源（出现筛选提示）；再点取消恢复全部', async () => {
    const merge = (at: string, from: string, added: number) => ({
      at,
      from,
      accepted: 1,
      dropped: 0,
      added,
    })
    renderWith(
      {
        errors: 0,
        c5: 23,
        c5UpperBound: 23,
        c5OverBy: 0,
        coAnchors: 1,
        merges: [
          merge('2026-11-05T06:00:00.000Z', 'a.json', 1),
          merge('2026-11-05T07:00:00.000Z', 'b.json', 2),
        ],
      },
      '/',
      {
        'a.json': {
          count: 1,
          accepted: 1,
          added: 1,
          dropped: 0,
          lastAt: '2026-11-05T06:00:00.000Z',
        },
        'b.json': {
          count: 1,
          accepted: 1,
          added: 2,
          dropped: 0,
          lastAt: '2026-11-05T07:00:00.000Z',
        },
      },
      // 筛 a.json 时端点返回该来源的明细（此例只有 1 条）
      [merge('2026-11-05T06:00:00.000Z', 'a.json', 1)],
    )
    expect(await screen.findByText(/来源聚合（全量 2 条合并记录）/)).toBeTruthy()

    // 点 a.json 聚合行按钮 ⇒ 筛选生效：出现「已按 a.json 筛选」与「取消筛选」入口
    // ⚠️ 聚合行是 button（含 ▸ 前缀），用 role=button + name 正则定位，避免撞上逐条表里的同名文本
    fireEvent.click(screen.getByRole('button', { name: /a\.json/ }))
    expect(await screen.findByText(/已按「a.json」筛选/)).toBeTruthy()
    expect(screen.getByText(/取消筛选：显示全部（当前只看 a.json）/)).toBeTruthy()
    // ⚠️ 时间列经 formatAt 本地化（非原始 ISO）⇒ 用来源名当过滤信号：
    //   端点按来源返回的明细里没有 b.json ⇒ 页面不再有 b.json 文本
    //   （聚合按钮的 ▸ 前缀使其不匹配 b.json）
    expect(screen.queryByText('b.json')).toBeNull()
    // ⚠️ 筛选态写进 URL query（持久化依据）：刷新/重挂后靠它恢复
    expect(searchNow()).toContain('mergeFrom=a.json')

    // 再点「取消筛选」⇒ 恢复全部，URL 清除 mergeFrom
    fireEvent.click(screen.getByRole('button', { name: /取消筛选/ }))
    expect(await screen.findByText('b.json')).toBeTruthy()
    expect(screen.queryByText(/已按「a.json」筛选/)).toBeNull()
    expect(searchNow()).not.toContain('mergeFrom')
  })

  it('⚠️ 筛选态持久化：URL 带 mergeFrom 挂载即筛选（刷新不丢）；取消清除 URL', async () => {
    renderWith(
      {
        errors: 0,
        c5: 23,
        c5UpperBound: 23,
        c5OverBy: 0,
        coAnchors: 1,
        merges: [
          { at: '2026-11-05T06:00:00.000Z', from: 'a.json', accepted: 1, dropped: 0, added: 1 },
          { at: '2026-11-05T07:00:00.000Z', from: 'b.json', accepted: 1, dropped: 0, added: 2 },
        ],
      },
      '/?mergeFrom=a.json',
      {
        'a.json': {
          count: 1,
          accepted: 1,
          added: 1,
          dropped: 0,
          lastAt: '2026-11-05T06:00:00.000Z',
        },
        'b.json': {
          count: 1,
          accepted: 1,
          added: 2,
          dropped: 0,
          lastAt: '2026-11-05T07:00:00.000Z',
        },
      },
      [{ at: '2026-11-05T06:00:00.000Z', from: 'a.json', accepted: 1, dropped: 0, added: 1 }],
    )
    // 挂载即进入筛选态：URL 是唯一来源，刷新/切页后靠它恢复
    expect(await screen.findByText(/已按「a.json」筛选/)).toBeTruthy()
    expect(screen.queryByText('b.json')).toBeNull()
    expect(searchNow()).toContain('mergeFrom=a.json')
    // 取消 ⇒ 清除 URL 里的 mergeFrom，恢复全部
    fireEvent.click(screen.getByRole('button', { name: /取消筛选/ }))
    expect(await screen.findByText('b.json')).toBeTruthy()
    expect(searchNow()).not.toContain('mergeFrom')
  })

  it('⚠️ 筛选态 ⇒ 提示同时给「全量 N 条」与「当前显示 M 条」（不说清会被读成「就这些了」）', async () => {
    renderWith(
      {
        errors: 0,
        c5: 23,
        c5UpperBound: 23,
        c5OverBy: 0,
        coAnchors: 1,
        merges: [
          { at: '2026-11-05T06:00:00.000Z', from: 'a.json', accepted: 1, dropped: 0, added: 1 },
          { at: '2026-11-05T07:00:00.000Z', from: 'b.json', accepted: 1, dropped: 0, added: 2 },
        ],
      },
      '/',
      {
        // a.json 全量 5 次
        'a.json': {
          count: 5,
          accepted: 5,
          added: 5,
          dropped: 0,
          lastAt: '2026-11-05T06:00:00.000Z',
        },
        'b.json': {
          count: 1,
          accepted: 1,
          added: 2,
          dropped: 0,
          lastAt: '2026-11-05T07:00:00.000Z',
        },
      },
      // 端点按来源返回 a.json 的全量明细（5 条，跨窗口）
      Array.from({ length: 5 }, (_, i) => ({
        at: `2026-11-05T0${String(i + 1)}:00:00.000Z`,
        from: 'a.json',
        accepted: 1,
        dropped: 0,
        added: 1,
      })),
    )
    // ⚠️ 聚合行是异步渲染出来的（等数据到位再点，否则按钮还不存在）
    await screen.findByRole('button', { name: /a\.json/ })
    fireEvent.click(screen.getByRole('button', { name: /a\.json/ }))
    expect(await screen.findByText(/已按「a.json」筛选（全量 5 条，当前显示 5 条）/)).toBeTruthy()
    // 全量 = 显示 ⇒ 明细没被截断 ⇒ 不出现「另有 N 条未显示」提示
    expect(screen.queryByText(/另有.*未显示/)).toBeNull()
  })

  it('⚠️ 明细被截断 ⇒ 给「显示更早」入口（把「另有 N 条未显示」变成可操作）', async () => {
    const bySource = (count: number) => ({
      'a.json': {
        count,
        accepted: count,
        added: count,
        dropped: 0,
        lastAt: '2026-11-05T06:00:00.000Z',
      },
    })
    // 55 条同来源记录：页大小 50 ⇒ 第 0 页返回 50 条，更早还有 5 条
    const full = Array.from({ length: 55 }, (_, i) => ({
      at: `2026-11-05T00:${String(i).padStart(2, '0')}:00.000Z`,
      from: 'a.json',
      accepted: 1,
      dropped: 0,
      added: 1,
    }))
    renderWith(
      {
        errors: 0,
        c5: 23,
        c5UpperBound: 23,
        c5OverBy: 0,
        coAnchors: 1,
        merges: full.slice(-2),
      },
      '/',
      bySource(55),
      full,
    )
    await screen.findByRole('button', { name: /a\.json/ })
    fireEvent.click(screen.getByRole('button', { name: /a\.json/ }))
    // ⚠️ 截断差额如实标注为可操作入口：全量 55 条、当前显示 50 条 ⇒ 「显示更早的 5 条」
    expect(await screen.findByRole('button', { name: /显示更早的 5 条/ })).toBeTruthy()
    expect(screen.getByText(/已按「a.json」筛选（全量 55 条，当前显示 50 条）/)).toBeTruthy()
  })

  it('⚠️ 点「显示更早」⇒ 翻到更早一页（offset 进 URL）；「回到最近」⇒ 恢复最新一页', async () => {
    const full = Array.from({ length: 55 }, (_, i) => ({
      at: `2026-11-05T00:${String(i).padStart(2, '0')}:00.000Z`,
      from: 'a.json',
      accepted: 1,
      dropped: 0,
      added: 1,
    }))
    renderWith(
      {
        errors: 0,
        c5: 23,
        c5UpperBound: 23,
        c5OverBy: 0,
        coAnchors: 1,
        merges: full.slice(-2),
      },
      '/',
      {
        'a.json': {
          count: 55,
          accepted: 55,
          added: 55,
          dropped: 0,
          lastAt: '2026-11-05T00:54:00.000Z',
        },
      },
      full,
    )
    await screen.findByRole('button', { name: /a\.json/ })
    fireEvent.click(screen.getByRole('button', { name: /a\.json/ }))
    // 第 0 页：最近 50 条 + 「显示更早的 5 条」
    expect(await screen.findByRole('button', { name: /显示更早的 5 条/ })).toBeTruthy()

    // 翻页：步长 = 当前页条数（50）⇒ offset=50 进 URL；返回最早 5 条，「显示更早」消失、「回到最近」出现
    fireEvent.click(screen.getByRole('button', { name: /显示更早的 5 条/ }))
    expect(await screen.findByRole('button', { name: /回到最近/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /显示更早/ })).toBeNull()
    expect(searchNow()).toContain('mergesOffset=50')
    expect(screen.getByText(/已按「a.json」筛选（全量 55 条，当前显示 5 条）/)).toBeTruthy()

    // 回到最近：offset 清掉，回到 50 条与「显示更早」
    fireEvent.click(screen.getByRole('button', { name: /回到最近/ }))
    expect(await screen.findByRole('button', { name: /显示更早的 5 条/ })).toBeTruthy()
    expect(searchNow()).not.toContain('mergesOffset')
  })

  it('⚠️ 窗口外还有记录 ⇒ 如实标注条数；窗口内全覆盖时不标注', async () => {
    const base = {
      errors: 0,
      c5: 23,
      c5UpperBound: 23,
      c5OverBy: 0,
      coAnchors: 1,
      merges: [
        { at: '2026-11-05T06:00:00.000Z', from: 'a.json', accepted: 1, dropped: 0, added: 1 },
      ],
    }
    // 全量 4 条、窗口内 1 条 ⇒ 窗口外 3 条
    const { unmount } = renderWith({ ...base }, '/', {
      'a.json': {
        count: 4,
        accepted: 4,
        added: 4,
        dropped: 0,
        lastAt: '2026-11-05T06:00:00.000Z',
      },
    })
    expect(await screen.findByText(/另有 3 条更早的合并记录不在本窗口内/)).toBeTruthy()
    unmount()

    // 全量 = 窗口内 ⇒ 无窗口外记录 ⇒ 不出现该提示（不留误导性噪音）
    renderWith({ ...base }, '/', {
      'a.json': {
        count: 1,
        accepted: 1,
        added: 1,
        dropped: 0,
        lastAt: '2026-11-05T06:00:00.000Z',
      },
    })
    expect(await screen.findByText(/来源聚合/)).toBeTruthy()
    expect(screen.queryByText(/更早的合并记录不在本窗口内/)).toBeNull()
  })

  it('⚠️ 筛选后不再提示「窗口外还有」（端点已给该来源全量明细）', async () => {
    renderWith(
      {
        errors: 0,
        c5: 23,
        c5UpperBound: 23,
        c5OverBy: 0,
        coAnchors: 1,
        merges: [
          { at: '2026-11-05T06:00:00.000Z', from: 'a.json', accepted: 1, dropped: 0, added: 1 },
        ],
      },
      '/',
      {
        'a.json': {
          count: 5,
          accepted: 5,
          added: 5,
          dropped: 0,
          lastAt: '2026-11-05T06:00:00.000Z',
        },
      },
      Array.from({ length: 5 }, (_, i) => ({
        at: `2026-11-05T0${String(i + 1)}:00:00.000Z`,
        from: 'a.json',
        accepted: 1,
        dropped: 0,
        added: 1,
      })),
    )
    await screen.findByRole('button', { name: /a\.json/ })
    fireEvent.click(screen.getByRole('button', { name: /a\.json/ }))
    expect(await screen.findByText(/已按「a.json」筛选/)).toBeTruthy()
    // 筛选态下端点已返回全量明细 ⇒ 「窗口外还有」提示不该出现（否则自相矛盾）
    expect(screen.queryByText(/更早的合并记录不在本窗口内/)).toBeNull()
  })

  it('⚠️ 筛选到无记录的来源 ⇒ 折叠区仍在、「取消筛选」仍可点（不能被困住）', async () => {
    renderWith(
      {
        errors: 0,
        c5: 23,
        c5UpperBound: 23,
        c5OverBy: 0,
        coAnchors: 1,
        merges: [
          { at: '2026-11-05T06:00:00.000Z', from: 'a.json', accepted: 1, dropped: 0, added: 1 },
        ],
      },
      '/',
      {
        'a.json': {
          count: 1,
          accepted: 1,
          added: 1,
          dropped: 0,
          lastAt: '2026-11-05T06:00:00.000Z',
        },
      },
      // 端点按来源返回空（该来源已不在合并日志里）
      [],
    )
    await screen.findByRole('button', { name: /a\.json/ })
    fireEvent.click(screen.getByRole('button', { name: /a\.json/ }))
    // 如实说明「该来源没有记录」，而不是渲染一张空表
    expect(await screen.findByText(/来源「a.json」没有合并记录/)).toBeTruthy()
    // ⚠️ 关键：折叠区与「取消筛选」必须还在，否则用户出不来
    expect(screen.getByRole('button', { name: /取消筛选/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /取消筛选/ }))
    expect(await screen.findByText('a.json')).toBeTruthy()
    expect(searchNow()).not.toContain('mergeFrom')
  })
})

describe('mergeSourceRows（全量按来源统计 → 聚合表行）', () => {
  it('无全量数据 ⇒ 空数组（不造假行）', () => {
    expect(mergeSourceRows(undefined)).toEqual([])
  })

  it('⚠️ 保留全量次数与全量最近时间（窗口外的来源也可见）', () => {
    const out = mergeSourceRows({
      'ci.json': {
        count: 12,
        accepted: 30,
        added: 6,
        dropped: 2,
        lastAt: '2026-11-05T08:00:00.000Z',
      },
    })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      from: 'ci.json',
      count: 12,
      added: 6,
      accepted: 30,
      dropped: 2,
      lastAt: '2026-11-05T08:00:00.000Z',
    })
  })

  it('多来源 ⇒ 按累计净增降序（贡献大的在前）', () => {
    const stat = (added: number): ContextGovernanceMergeStat => ({
      count: 1,
      accepted: 1,
      added,
      dropped: 0,
      lastAt: '2026-11-05T06:00:00.000Z',
    })
    const out = mergeSourceRows({
      'a.json': stat(1),
      'b.json': stat(5),
      'c.json': stat(3),
    })
    expect(out.map((s) => s.from)).toEqual(['b.json', 'c.json', 'a.json'])
  })
})
