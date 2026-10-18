import { describe, expect, it, afterEach, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { TermOut } from '@openvibe/shared'
import { TermFilterBar } from './TermFilterBar'
import { TermCard } from './TermCard'
import { TermCardGrid } from './TermCardGrid'
import { searchByScenario } from './scenarioSearch'

/**
 * P2 呈现层验收（m3-terms-learning FR-4 / FR-5.2）。
 *
 * 口径同 DEV-0119：凡是**结构性恒真**的（读常量、比自己写死的字面量）一律不写进来。
 * 每条都要「改错了就红」，因此夹具特意造了能区分方向的样本，而不是随手拿一个。
 */

const term = (over: Partial<TermOut> & { id: string; zh?: string }): TermOut => ({
  en: undefined,
  aliases: [],
  definition: '定义',
  example: '',
  relatedTermIds: [],
  source: 'openvibe-seed',
  tags: [],
  status: 'active',
  seedHash: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  pinyin: '',
  level: 'L2',
  starter: false,
  domain: null,
  scenario: '',
  ...over,
})

describe('TERMVIEW-01 · 筛选条三段各管各的维度', () => {
  afterEach(cleanup)

  it('全部 chip 报总数，领域 chip 报各自的条数', () => {
    const base = {
      domainCounts: [
        { domain: '前端', count: 140 },
        { domain: '后端', count: 69 },
      ],
      total: 441,
      domain: null,
      level: null,
      starterOnly: false,
      onDomain: vi.fn(),
      onLevel: vi.fn(),
      onStarterOnly: vi.fn(),
    }
    render(<TermFilterBar {...base} />)
    expect(screen.getByRole('button', { name: '全部 441' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '前端 140' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '后端 69' })).toBeTruthy()
  })

  it('再点已选中的领域/难度 ⇒ 回调 null（切回「不限」），而不是重复上报同一个值', () => {
    const onDomain = vi.fn()
    const onLevel = vi.fn()
    render(
      <TermFilterBar
        domainCounts={[{ domain: '前端', count: 3 }]}
        total={3}
        domain="前端"
        level="L2"
        starterOnly
        onDomain={onDomain}
        onLevel={onLevel}
        onStarterOnly={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '前端 3' }))
    expect(onDomain).toHaveBeenCalledWith(null)
    fireEvent.click(screen.getByRole('button', { name: 'L2' }))
    expect(onLevel).toHaveBeenCalledWith(null)
  })

  it('⚠️ 难度三个 chip 来自 TERM_LEVELS 常量，不是手写数组', () => {
    render(
      <TermFilterBar
        domainCounts={[]}
        total={0}
        domain={null}
        level={null}
        starterOnly={false}
        onDomain={vi.fn()}
        onLevel={vi.fn()}
        onStarterOnly={vi.fn()}
      />,
    )
    // 少一个档 ⇒ TERM_LEVELS 减了一档（迁移或改词表时这条会红）
    expect(screen.getAllByRole('button', { name: 'L1' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'L2' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'L3' })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'L4' })).toBeNull()
  })

  it('选中态走 aria-pressed 而非仅靠颜色（色觉障碍与自动化都靠它）', () => {
    render(
      <TermFilterBar
        domainCounts={[{ domain: '前端', count: 1 }]}
        total={1}
        domain="前端"
        level={null}
        starterOnly={false}
        onDomain={vi.fn()}
        onLevel={vi.fn()}
        onStarterOnly={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: '前端 1' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: '全部 1' }).getAttribute('aria-pressed')).toBe('false')
  })
})

describe('TERMVIEW-02 · 卡片三段式', () => {
  afterEach(cleanup)

  it('有场景句时：场景句直出，定义默认收起', () => {
    render(
      <TermCard
        term={term({ id: 'a', zh: '按钮', scenario: '鼠标移上去会变色、点下去就有反应的那块小方块。' })}
        relatedTerms={[]}
        selected={false}
        onToggleSelect={vi.fn()}
      />,
    )
    expect(screen.getByText(/鼠标移上去会变色/)).toBeTruthy()
    // 定义只在展开后出现
    expect(screen.queryByText('定义')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '看定义' }))
    expect(screen.getByText('定义')).toBeTruthy()
  })

  it('⚠️ 场景句为空 ⇒ 定义直出（否则卡片只剩一个标题，读起来像残次品）', () => {
    render(
      <TermCard term={term({ id: 'b', zh: '自建词', scenario: '' })} relatedTerms={[]}
        selected={false} onToggleSelect={vi.fn()} />,
    )
    expect(screen.getByText('定义')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '看定义' })).toBeNull()
  })

  it('选中态按钮文案随 selected 变，且回调传的是词条 id', () => {
    const onToggleSelect = vi.fn()
    const { rerender } = render(
      <TermCard term={term({ id: 'c1', zh: 'x' })} relatedTerms={[]} selected={false}
        onToggleSelect={onToggleSelect} />,
    )
    fireEvent.click(screen.getByRole('button', { name: '加入选集' }))
    expect(onToggleSelect).toHaveBeenCalledWith('c1')
    rerender(
      <TermCard term={term({ id: 'c1', zh: 'x' })} relatedTerms={[]} selected
        onToggleSelect={onToggleSelect} />,
    )
    expect(screen.getByRole('button', { name: '已选' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('相关词解析不到就不渲染那一段（不留空标题）', () => {
    render(
      <TermCard term={term({ id: 'd', zh: 'x', relatedTermIds: ['missing'] })} relatedTerms={[]}
        selected={false} onToggleSelect={vi.fn()} />,
    )
    expect(screen.queryByText('相关')).toBeNull()
  })

  it('⚠️ 搜索命中场景句时高亮那一段（FR-5.2）', () => {
    render(
      <TermCard
        term={term({ id: 'e', zh: '弹窗', scenario: '点完之后糊一层挡住底下的那层东西。' })}
        relatedTerms={[]}
        selected={false}
        onToggleSelect={vi.fn()}
        query="糊一层"
      />,
    )
    const mark = document.querySelector('mark')
    expect(mark).not.toBeNull()
    expect(mark!.textContent).toBe('糊一层')
  })
})

describe('TERMVIEW-03 · 分区与区内排序', () => {
  afterEach(cleanup)

  it('⚠️ 未归类区排在最后且不丢弃（用户自建词条会落这里）', () => {
    const terms = [
      term({ id: '1', zh: '甲', domain: '前端' }),
      term({ id: '2', zh: '乙', domain: null }),
      term({ id: '3', zh: '丙', domain: '后端' }),
    ]
    render(
      <TermCardGrid terms={terms} allTerms={terms} selectedIds={new Set()}
        onToggleSelect={vi.fn()} />,
    )
    const heads = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent ?? '')
    expect(heads[0]).toMatch(/^前端/)
    expect(heads[1]).toMatch(/^后端/)
    expect(heads[2]).toMatch(/^未归类/)
  })

  it('⚠️ 区内排序：入门必看先出，其次难度升序（FR-4.1 的核心承诺）', () => {
    const terms = [
      term({ id: '1', zh: '难但必看', level: 'L3', starter: true, domain: 'AI' }),
      term({ id: '2', zh: '简单不必看', level: 'L1', starter: false, domain: 'AI' }),
      term({ id: '3', zh: '中等不必看', level: 'L2', starter: false, domain: 'AI' }),
    ]
    render(
      <TermCardGrid terms={terms} allTerms={terms} selectedIds={new Set()}
        onToggleSelect={vi.fn()} />,
    )
    const order = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent ?? '')
    expect(order).toEqual(['难但必看', '简单不必看', '中等不必看'])
  })

  it('筛选后为空 ⇒ 给「当前筛选没命中」并能一键清除（FR-4.4）', () => {
    const onClearFilters = vi.fn()
    render(
      <TermCardGrid terms={[]} allTerms={[]} selectedIds={new Set()}
        onToggleSelect={vi.fn()} onClearFilters={onClearFilters} />,
    )
    expect(screen.getByText(/当前筛选没命中/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '清除筛选' }))
    expect(onClearFilters).toHaveBeenCalled()
  })

  it('没有 onClearFilters 时不渲染那个按钮（不点不动的死控件）', () => {
    render(
      <TermCardGrid terms={[]} allTerms={[]} selectedIds={new Set()} onToggleSelect={vi.fn()} />,
    )
    expect(screen.queryByRole('button', { name: '清除筛选' })).toBeNull()
  })
})

describe('TERMVIEW-04 · 场景句回退搜索（FR-5.2）', () => {
  const pool = [
    term({ id: '1', zh: '弹窗', scenario: '点完之后糊一层挡住底下的那层东西。' }),
    term({ id: '2', zh: '空场景', scenario: '' }),
    term({ id: '3', zh: '空白', scenario: '   ' }),
    term({ id: '4', zh: '按钮', scenario: '鼠标移上去会变色、点下去就有反应的那块小方块。' }),
  ]

  it('命中含查询词的场景句', () => {
    expect(searchByScenario('糊一层', pool).map((t) => t.id)).toEqual(['1'])
  })

  it('⚠️ 删掉「查询词去空白后为空」的早退 ⇒ 这条必须红（它才是真正吃劲的那句）', () => {
    // 首版这里另有一条「空场景句不匹配」的判据，注释写着防「空串包含一切」。
    // 跑变异腿删掉实现里对应的守卫后 17 支全绿 —— 查清是那条判据本身抓不住任何东西：
    // 空串并不包含任何非空查询，守卫是死代码。本条改成盯真正起作用的那句早退。
    expect(searchByScenario('', pool)).toEqual([])
    expect(searchByScenario('   ', pool)).toEqual([])
    // 自证：把早退去掉后，上面两条会返回什么（空串是 '' 的子串 ⇒ 全库都命中）
    const withoutEarlyReturn = (q: string, terms: TermOut[]) =>
      q.trim() === '' ? [] : terms.filter((t) => t.scenario.toLowerCase().includes(q.trim().toLowerCase()))
    // 断言「早退不是可有可无」：非空查询下二者一致，说明早退唯一的作用就是挡空查询
    expect(searchByScenario('糊一层', pool).map((t) => t.id)).toEqual(
      withoutEarlyReturn('糊一层', pool).map((t) => t.id),
    )
  })

  it('⚠️ 空场景句不会被任何非空查询命中（谓词自证：这里确实存在空串样本）', () => {
    const empty = pool.filter((t) => t.scenario === '')
    const blank = pool.filter((t) => t.scenario.trim() === '' && t.scenario !== '')
    expect(empty.length + blank.length, '夹具里没有空/纯空白场景句，这条判据就是永真的').toBe(2)
    // 逐个证明：对任意非空 q，`''.includes(q)` 恒 false ⇒ 这两条永不因空场景句被捞出来
    for (const q of ['a', '层', '按钮', '　', ' ']) {
      const hit = searchByScenario(q, pool).map((t) => t.id)
      expect(hit).not.toContain('2')
      expect(hit).not.toContain('3')
    }
  })

  it('英文大小写不敏感', () => {
    const en = [term({ id: '9', zh: 'x', scenario: 'CDN 用来把静态文件摊到各地。' })]
    expect(searchByScenario('cdn', en).map((t) => t.id)).toEqual(['9'])
  })
})
