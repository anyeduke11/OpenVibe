import { describe, expect, it, afterEach, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FolderFilterBar } from './FolderFilterBar'
import { zh } from '../../i18n/zh'

/**
 * `/library` 文件夹筛选横排化（owner 2026-10-17 裁定）的验收用例。
 *
 * 判据口径：每条都必须是「改错了就红」的那种。凡是结构性恒真的（读一个常量、
 * 比一个自己写死的字面量）一律不写进本文件。
 */

const WEB_LIB = join(process.cwd(), 'apps/web/src/components/library')

describe('LIB-FOLDER-01 · 竖排树已退场，横排筛选条已接线', () => {
  afterEach(cleanup)

  it('FolderTree.tsx 已从磁盘移除（不是「留着没人引用」）', () => {
    // 判据量的是**文件系统态**。若哪天有人把文件加回来，这条会红 ——
    // 那正是要抓的：留着一份 166 行、含 DnD 落点的死组件，下一个人会误以为它是现行实现。
    expect(existsSync(join(WEB_LIB, 'FolderTree.tsx'))).toBe(false)
  })

  it('LibraryPage 不再 import FolderTree，且确实渲染了横排条', () => {
    const src = readFileSync(join(process.cwd(), 'apps/web/src/pages/LibraryPage.tsx'), 'utf8')
    expect(src).not.toMatch(/from '\.\.\/components\/library\/FolderTree'/)
    expect(src).toContain('FolderFilterBar')
    // 左侧 aside 整块删干净：不留一个空壳容器
    expect(src).not.toMatch(/<aside/)
    // 筛选条的位置断言：横排条必须落在 AssetFilterBar 的轨道**内**，
    // 而不是被塞回页头之外（塞回页头之外 = 又变成竖排/独立一块）
    const filtersIdx = src.indexOf('filters={')
    const barIdx = src.indexOf('<FolderFilterBar')
    expect(barIdx).toBeGreaterThan(filtersIdx)
  })
})

describe('LIB-FOLDER-02 · 筛选语义与改造前一致（精确匹配，非前缀）', () => {
  afterEach(cleanup)

  it('点某个 chip 上报的是它自己的完整路径，含前导斜杠', () => {
    const onToggle = vi.fn()
    render(
      <FolderFilterBar
        paths={['/投研']}
        selected={undefined}
        onToggle={onToggle}
        onDropPrompt={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '投研' }))
    expect(onToggle).toHaveBeenCalledWith('/投研')
  })

  it('点已选中的 chip 上报 undefined（即「取消这个筛选」），不是再报一次原值', () => {
    const onToggle = vi.fn()
    render(
      <FolderFilterBar
        paths={['/投研']}
        selected="/投研"
        onToggle={onToggle}
        onDropPrompt={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '投研' }))
    expect(onToggle).toHaveBeenCalledWith(undefined)
  })

  it('「全部」chip 恒可点，且它的选中态与 folder 筛选无关（folder 为 undefined 时按下）', () => {
    const onToggle = vi.fn()
    render(
      <FolderFilterBar
        paths={['/a']}
        selected={undefined}
        onToggle={onToggle}
        onDropPrompt={vi.fn()}
      />,
    )
    const all = screen.getByRole('button', { name: '全部' })
    expect(all.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(all)
    expect(onToggle).toHaveBeenCalledWith(undefined)
  })

  it('文件夹有选中项时，「全部」不再按下（两个态互斥，不许同时亮）', () => {
    render(
      <FolderFilterBar paths={['/a']} selected="/a" onToggle={vi.fn()} onDropPrompt={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: '全部' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: 'a' }).getAttribute('aria-pressed')).toBe('true')
  })
})

describe('LIB-FOLDER-03 · 层级在横排里读得出来（父先子后 + 全路径文案）', () => {
  afterEach(cleanup)

  it('深层 chip 的文案带完整路径，不靠缩进表达归属', () => {
    render(
      <FolderFilterBar
        paths={['/投研/尽调']}
        selected={undefined}
        onToggle={vi.fn()}
        onDropPrompt={vi.fn()}
      />,
    )
    // 有 `投研` 与 `投研/尽调` 两个 chip 时，靠缩进在横排轨道里不可读，
    // 所以文案必须自带路径
    expect(screen.getByRole('button', { name: '投研/尽调' })).toBeTruthy()
  })

  it('同层文件夹在横向轨道里连片（长短交替会让「这一段是第几层」读不出来）', () => {
    // 这组夹具是**实测搜出来的**。首版断言写的是「父先子后」，实测 `localeCompare`
    // 对每一对父子路径都返回正数 ⇒ 那条判据恒真，跑绿也测不出东西，已作废。
    // 深度比较真正买到的是同层连片，下面这组输入下两种排序结果确实不同。
    const paths = ['/b', '/审查', '/b/审查', '/b/尽调/审查', '/尽调/b', '/审查/尽调/审查', '/尽调']
    // 前置自证：纯 localeCompare 在这组输入下会打散层级（深度序列非单调）
    const localeOnly = [...paths].sort((a, b) => a.localeCompare(b, 'zh-CN'))
    const depthOf = (p: string): number => p.split('/').length
    const monotone = (xs: string[]): boolean =>
      xs.every((x, i) => i === 0 || depthOf(xs[i - 1] as string) <= depthOf(x))
    expect(monotone(localeOnly)).toBe(false)

    render(
      <FolderFilterBar
        paths={paths}
        selected={undefined}
        onToggle={vi.fn()}
        onDropPrompt={vi.fn()}
      />,
    )
    const titles = screen
      .getAllByRole('button')
      .map((b) => b.getAttribute('title') ?? '')
      .filter((t) => t.startsWith('/'))
    expect(monotone(titles)).toBe(true)
    // 同层内仍按名序，不因比深度而丢掉组内排序
    const topLevel = titles.filter((t) => depthOf(t) === 2)
    expect(topLevel).toEqual([...topLevel].sort((a, b) => a.localeCompare(b, 'zh-CN')))
  })

  it('根目录 chip 恒在，且与真实文件夹 chip 并存时排在其前', () => {
    render(
      <FolderFilterBar
        paths={['/a']}
        selected={undefined}
        onToggle={vi.fn()}
        onDropPrompt={vi.fn()}
      />,
    )
    const titles = screen
      .getAllByRole('button')
      .map((b) => b.getAttribute('title') ?? '')
      .filter((t) => t.startsWith('/'))
    expect(titles[0]).toBe('/')
    expect(titles).toContain('/a')
  })
})

describe('LIB-FOLDER-04 · 超量折叠：选中的那个不许被折叠藏起来', () => {
  afterEach(cleanup)

  it('超过 limit 时只露 limit 个 + 根目录，并给出「更多」入口', () => {
    const paths = Array.from({ length: 12 }, (_, i) => `/d${String(i)}`)
    render(
      <FolderFilterBar
        paths={paths}
        selected={undefined}
        onToggle={vi.fn()}
        onDropPrompt={vi.fn()}
      />,
    )
    // limit 默认 8：8 个文件夹 chip + 根目录 = 9 个 title 以 / 开头的按钮
    const chips = screen
      .getAllByRole('button')
      .map((b) => b.getAttribute('title') ?? '')
      .filter((t) => t.startsWith('/'))
    expect(chips).toHaveLength(9)
    expect(screen.getByRole('button', { name: /更多/ })).toBeTruthy()
  })

  it('选中的文件夹排在折叠线之外时，仍出现在可见集合里', () => {
    // 夹具必须选**真落在折叠线外**的那一项：12 个 `/dN` 按名序排下来是
    // d0 d1 d10 d11 d2 … d9，`/d9` 在下标 11（limit 默认 8 ⇒ 在折叠线外）；
    // 而 `/d11` 实际落在下标 3 —— 首版误选了它，它本就在可见的前 8 个里，
    // 于是「删掉补位逻辑」的变异照样绿，判据等于没写。
    const paths = Array.from({ length: 12 }, (_, i) => `/d${String(i)}`)
    const rank = [...paths].sort((a, b) => a.localeCompare(b, 'zh-CN')).indexOf('/d9')
    expect(rank).toBeGreaterThanOrEqual(8) // 前置自证：这一项确实在折叠线之外

    render(
      <FolderFilterBar paths={paths} selected="/d9" onToggle={vi.fn()} onDropPrompt={vi.fn()} />,
    )
    // 这条是 TagFilterBar 那边同款判据：筛完之后被折叠隐藏，用户只会觉得「筛没了」
    expect(screen.getByRole('button', { name: 'd9' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'd9' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('未超量时不出现折叠入口', () => {
    render(
      <FolderFilterBar
        paths={['/a', '/b']}
        selected={undefined}
        onToggle={vi.fn()}
        onDropPrompt={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: /更多/ })).toBeNull()
  })
})

describe('LIB-FOLDER-05 · 拖拽落点仍在（原生 HTML5 DnD，不引拖拽库）', () => {
  afterEach(cleanup)

  it('拖到某个 chip 上落，会把该 chip 的路径作为目标文件夹上报', () => {
    const onDropPrompt = vi.fn()
    render(
      <FolderFilterBar
        paths={['/投研']}
        selected={undefined}
        onToggle={vi.fn()}
        onDropPrompt={onDropPrompt}
      />,
    )
    const target = screen.getByRole('button', { name: '投研' })
    const dataTransfer = { getData: () => 'prt_abc123' }
    fireEvent.dragOver(target, { dataTransfer })
    fireEvent.drop(target, { dataTransfer })
    expect(onDropPrompt).toHaveBeenCalledWith('prt_abc123', '/投研')
  })

  it('拖到根目录 chip 上落，目标文件夹是「/」', () => {
    const onDropPrompt = vi.fn()
    render(
      <FolderFilterBar
        paths={['/投研']}
        selected={undefined}
        onToggle={vi.fn()}
        onDropPrompt={onDropPrompt}
      />,
    )
    fireEvent.drop(screen.getByRole('button', { name: zh.folderTree.root }), {
      dataTransfer: { getData: () => 'prt_abc123' },
    })
    expect(onDropPrompt).toHaveBeenCalledWith('prt_abc123', '/')
  })

  it('载荷为空串时不发移动请求（拖了个空的东西进来不许打服务端）', () => {
    const onDropPrompt = vi.fn()
    render(
      <FolderFilterBar
        paths={['/投研']}
        selected={undefined}
        onToggle={vi.fn()}
        onDropPrompt={onDropPrompt}
      />,
    )
    fireEvent.drop(screen.getByRole('button', { name: '投研' }), {
      dataTransfer: { getData: () => '' },
    })
    expect(onDropPrompt).not.toHaveBeenCalled()
  })
})

describe('LIB-FOLDER-06 · 无障碍：分组有名字，chip 有按压态', () => {
  afterEach(cleanup)

  it('外层 role=group 且带 aria-label（读屏能报出「文件夹」这一组）', () => {
    render(
      <FolderFilterBar
        paths={['/a']}
        selected={undefined}
        onToggle={vi.fn()}
        onDropPrompt={vi.fn()}
      />,
    )
    const group = screen.getByRole('group', { name: zh.folderTree.title })
    expect(within(group).getAllByRole('button').length).toBeGreaterThan(0)
  })

  it('拖拽提示文案可见（横排后没有侧栏可放说明行，必须在这一行里说清）', () => {
    render(
      <FolderFilterBar
        paths={['/a']}
        selected={undefined}
        onToggle={vi.fn()}
        onDropPrompt={vi.fn()}
      />,
    )
    expect(screen.getByText(zh.folderTree.dropHint)).toBeTruthy()
  })
})
