import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MasteryChip } from './MasteryChip'
import { CompletenessMark } from './CompletenessMark'
import { StageColumn } from './StageColumn'
import { TopicLayer } from './TopicLayer'
import { TopicDetail } from './TopicDetail'
import type { RoadmapStation, TopicDetailOut } from '@openvibe/shared'

/**
 * M9 v1.6 **P3.2 / P3.3 出口**（`m9-dev-plan-2026-10.md` §6.9 · `m9-dev-language-roadmap.md` §3.5）。
 *
 * 断四件事：
 * ① 三态 chip 的**文案逐字**取自 P2 的常量（口径只留一处），且**不出现**「你已掌握」/「未触及」；
 * ② 站列的站号**从 1 起**（库里是 0 起），当前站有标记；
 * ③ 完整度标记的「点亮」口径 ＝ 不是「未涉及」（**在用与掌握都算点亮**），空站不写 0；
 * ④ 详情页：**缺的那一段不渲染**、零证据时显示冷门说明、外链与术语挂接都能点到。
 */
afterEach(cleanup)

const STATIONS: RoadmapStation[] = [
  {
    stage_id: 0,
    stage_no: 1,
    name: '语法基础',
    topics: [
      { id: 1, slug: 'py-syntax', title: '基本语法', summary: '变量与表达式', stage_id: 0, state: 'active' },
      { id: 2, slug: 'py-string', title: '字符串', summary: '', stage_id: 0, state: 'unused' },
    ],
  },
  {
    stage_id: 1,
    stage_no: 2,
    name: '数据结构',
    topics: [
      { id: 3, slug: 'py-list', title: '列表', summary: '', stage_id: 1, state: 'mastered' },
      { id: 4, slug: 'py-dict', title: '字典', summary: '', stage_id: 1, state: 'active' },
    ],
  },
]

const DETAIL: TopicDetailOut = {
  id: 3,
  slug: 'py-list',
  title: '列表',
  summary: '一组有序可变元素',
  lang: 'python',
  stage_id: 1,
  stage_no: 2,
  state: 'mastered',
  content: { steps: '先建空列表，再逐个 append', example: 'xs = [1, 2]', principle: null },
  deltas: [{ aspect: '并发模型', summary: '列表是线程安全的引用', since_version: '3.0', until_version: null }],
  resources: [{ name: '官方教程', url: 'https://docs.python.org/3/', role: 'primary', tier: 'a' }],
  terms: [{ term_id: 't1', zh: '列表', en: 'list' }],
}

describe('M9 P3.2 · 三态 chip（DL-05 / DL-07）', () => {
  it('三条文案逐字取自 P2 的常量', () => {
    render(
      <>
        <MasteryChip state="unused" />
        <MasteryChip state="active" />
        <MasteryChip state="mastered" />
      </>,
    )
    expect(screen.getByText('本项目未涉及')).toBeTruthy()
    expect(screen.getByText('本项目用到过')).toBeTruthy()
    expect(screen.getByText('掌握')).toBeTruthy()
  })

  it('⚠️ 不得出现「你已掌握」与「未触及」三个字', () => {
    const { container } = render(<MasteryChip state="mastered" />)
    expect(container.textContent).not.toContain('你已掌握')
    expect(container.textContent).not.toContain('未触及')
  })
})

describe('M9 P3.2 · 完整度标记', () => {
  it('「点亮」＝ 不是「未涉及」：在用与掌握都算点亮', () => {
    render(<CompletenessMark station={STATIONS[0]!} />)
    expect(screen.getByText('已点亮 1 / 2')).toBeTruthy()
  })

  it('空站不写 0（空白与 0 会被读成「功能坏了」）', () => {
    render(<CompletenessMark station={{ stage_id: 9, stage_no: 10, name: '空站', topics: [] }} />)
    expect(screen.queryByText('已点亮 0 / 0')).toBeNull()
    expect(screen.getByText('这一站还没有条目')).toBeTruthy()
  })
})

describe('M9 P3.2 · 站列', () => {
  it('站号从 1 起（库里是 0 起），当前站有标记', () => {
    render(
      <StageColumn
        stations={STATIONS}
        currentStage={2}
        selectedStage={1}
        onSelect={() => {}}
      />,
    )
    expect(screen.getByText('第 1 站')).toBeTruthy()
    expect(screen.getByText('第 2 站')).toBeTruthy()
    expect(screen.getByText('当前')).toBeTruthy()
  })

  it('点站会回调（站号是 1 起的那个）', () => {
    const onSelect = vi.fn()
    render(
      <StageColumn stations={STATIONS} currentStage={1} selectedStage={null} onSelect={onSelect} />,
    )
    fireEvent.click(screen.getByText('数据结构'))
    expect(onSelect).toHaveBeenCalledWith(2)
  })
})

describe('M9 P3.2 · 当前层', () => {
  it('每条知识点带三态 chip', () => {
    render(
      <TopicLayer station={STATIONS[1]!} selectedTopicId={null} onSelectTopic={() => {}} />,
    )
    expect(screen.getByText('列表')).toBeTruthy()
    expect(screen.getByText('掌握')).toBeTruthy()
    expect(screen.getByText('本项目用到过')).toBeTruthy()
  })

  it('空层给的是说明而不是空白', () => {
    render(
      <TopicLayer
        station={{ stage_id: 3, stage_no: 4, name: '空站', topics: [] }}
        selectedTopicId={null}
        onSelectTopic={() => {}}
      />,
    )
    expect(screen.getByText('这一站还没有条目——先从上一站学起。')).toBeTruthy()
  })
})

describe('M9 P3.3 · 知识点详情', () => {
  it('三段：有哪段渲染哪段，缺的**不渲染**也不填自撰文案', () => {
    render(
      <MemoryRouter>
        <TopicDetail detail={DETAIL} loading={false} />
      </MemoryRouter>,
    )
    expect(screen.getByText('步骤')).toBeTruthy()
    expect(screen.getByText('先建空列表，再逐个 append')).toBeTruthy()
    expect(screen.getByText('样例')).toBeTruthy()
    // ⚠️ 「原理解析」那行是 null ⇒ **整行不出现**（不许拿别的段顶上）
    expect(screen.queryByText('原理解析')).toBeNull()
  })

  it('差异、外链、术语挂接都在', () => {
    render(
      <MemoryRouter>
        <TopicDetail detail={DETAIL} loading={false} />
      </MemoryRouter>,
    )
    expect(screen.getByText('两门语言的差异')).toBeTruthy()
    expect(screen.getByText('并发模型')).toBeTruthy()
    expect(screen.getByText('去哪儿补这条')).toBeTruthy()
    const link = screen.getByText('官方教程').closest('a')
    expect(link?.getAttribute('href')).toBe('https://docs.python.org/3/')
    expect(screen.getByText('相关术语')).toBeTruthy()
    expect(screen.getAllByText('列表').length).toBeGreaterThan(0)
  })

  it('零证据时写明「本项目永远可能用不到它」（§6.3 第 2 条）', () => {
    render(
      <MemoryRouter>
        <TopicDetail detail={{ ...DETAIL, state: 'unused' }} loading={false} />
      </MemoryRouter>,
    )
    expect(screen.getByText('本项目永远可能用不到它（冷门知识点）')).toBeTruthy()
  })

  it('加载中与未选中都不是空白', () => {
    const { unmount } = render(<TopicDetail detail={null} loading={true} />)
    expect(screen.getByText('正在读这个知识点…')).toBeTruthy()
    unmount()
    render(<TopicDetail detail={null} loading={false} />)
    expect(screen.getByText('选左边一条知识点看详情。')).toBeTruthy()
  })
})
