import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import type { TermRecommendationsResponse } from '@openvibe/shared'
import { TermRecommendationPanel } from './TermRecommendationPanel'

/**
 * P3 · FR-6 呈现层验收。
 *
 * WEB-M3T-05（可解释）／ WEB-M3T-07（不含本机路径）／ 以及 FR-6.3.3 最后一行
 * 的**前置**形态：基线层界面上不得出现任何 AI 字样。
 */

const base = (over: Partial<TermRecommendationsResponse> = {}): TermRecommendationsResponse => ({
  projectId: 'prj_1',
  source: 'baseline',
  threshold: 3,
  limit: 12,
  projectDomains: ['产品'],
  items: [
    {
      termId: 'trm_1',
      zh: '分而治之',
      en: 'divide and conquer',
      level: 'L2',
      starter: true,
      domain: '产品',
      score: 4,
      reasons: [{ kind: 'checklist', text: '任务拆分有依赖序' }],
    },
  ],
  ...over,
})

afterEach(cleanup)

describe('WEB-M3T · 术语推荐面板', () => {
  it('⚠️ 每条推荐都显示「为什么推给你」，且引的是命中原文（FR-6.4）', () => {
    render(<TermRecommendationPanel data={base()} loading={false} error={null} />)
    const panel = screen.getByRole('region', { name: '本项目该掌握的术语' })
    // 自证：这份夹具真的有推荐，否则下面只是查了个空面板
    expect(within(panel).getByText('分而治之')).toBeTruthy()
    expect(panel.textContent).toContain('任务拆分有依赖序')
    expect(panel.textContent).toContain('清单命中')
  })

  it('⚠️ 基线层界面上没有任何 AI 字样（FR-6.3.3 最后一行的前置形态）', () => {
    render(<TermRecommendationPanel data={base()} loading={false} error={null} />)
    const panel = screen.getByRole('region', { name: '本项目该掌握的术语' })
    // 变异腿：给 source 加 'ai' 取值后，这条必须能红 —— 但 P3 的 schema 里没有那个取值，
    // 所以这里断的是「渲染文本不含 AI 标记」，而不是「数据里没有 ai」。
    expect(panel.textContent).not.toMatch(/AI|智能|模型|Pi/)
  })

  it('⚠️ 领域重合不得被标成「阶段名」（理由来源标错比不给理由更坏）', () => {
    render(
      <TermRecommendationPanel
        data={base({
          items: [
            {
              ...base().items[0]!,
              reasons: [{ kind: 'domain', text: '产品' }],
            },
          ],
        })}
        loading={false}
        error={null}
      />,
    )
    // 断言必须收窄到**这一条推荐**上：面板头部那句「项目领域由阶段名与绑定 Skill 反推」
    // 里本来就该有「阶段名」三字，全文断言会误伤正当文案。
    const item = screen.getByText('分而治之').closest('li')
    expect(item).toBeTruthy()
    expect(item?.textContent).toContain('领域重合')
    expect(item?.textContent).not.toContain('阶段名')
  })

  it('⚠️ 推不出领域时，空态要说明「为什么推不出」，而不是干留一句「暂无」', () => {
    render(
      <TermRecommendationPanel
        data={base({ projectDomains: [], items: [] })}
        loading={false}
        error={null}
      />,
    )
    const panel = screen.getByRole('region', { name: '本项目该掌握的术语' })
    expect(panel.textContent).toContain('阶段名')
  })

  it('有领域但没够门槛的词条 ⇒ 空态说的是另一回事', () => {
    render(<TermRecommendationPanel data={base({ items: [] })} loading={false} error={null} />)
    const panel = screen.getByRole('region', { name: '本项目该掌握的术语' })
    expect(panel.textContent).toContain('门槛')
  })

  it('回显门槛与上限（让用户知道「没推」是被规则挡的）', () => {
    render(<TermRecommendationPanel data={base()} loading={false} error={null} />)
    const panel = screen.getByRole('region', { name: '本项目该掌握的术语' })
    expect(panel.textContent).toContain('门槛 3')
    expect(panel.textContent).toContain('上限 12')
  })

  it('读取失败要明说失败，不渲染成「没有推荐」', () => {
    render(<TermRecommendationPanel data={undefined} loading={false} error={new Error('boom')} />)
    expect(screen.getByText(/术语推荐读取失败/)).toBeTruthy()
  })

  it('加载中给骨架屏而不是空面板', () => {
    const { container } = render(<TermRecommendationPanel data={undefined} loading error={null} />)
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy()
  })

  it('⚠️ 得分按一位小数显示（0.0 分与 12 条整分都读得出来）', () => {
    render(
      <TermRecommendationPanel
        data={base({
          items: [{ ...base().items[0]!, score: 3 }],
        })}
        loading={false}
        error={null}
      />,
    )
    const panel = screen.getByRole('region', { name: '本项目该掌握的术语' })
    expect(panel.textContent).toContain('3.0 分')
  })
})
