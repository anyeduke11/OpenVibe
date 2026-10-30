import { describe, expect, it, afterEach } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TagFilterBar } from './TagFilterBar'
import { FolderFilterBar } from './FolderFilterBar'
import { TermFilterBar } from '../terms/TermFilterBar'

/**
 * 筛选条**几何重叠**的回归闸（2026-10-28 真机手测复现）。
 *
 * **缺陷是什么**：`/terms` 的「更多标签 +42」与「L2」「L3」「只看完懂」三者
 * **几何重叠、互相压盖、点不到**（实测视口 1258：更多标签 x=932–1015，
 * L2 x=923–953、L3 x=959–989、只看完懂 x=1002–1064——四者同 y 且区间相交）。
 * `/library` 同病：文件夹条溢出 87px 压住标签条首个 chip。
 *
 * **根因是什么**（为什么判据要落在类名上）：
 * 外层 `AssetFilterBar` 的轨道是**刻意**的 `overflow-x-auto` 横向滚动容器
 * （m3-terms-learning FR-4.1：「筛选条（横排单行，可横向滚动）」）。
 * 轨道里的每一组若根节点是 `min-w-0`（可被压到任意小），而组内 chip 全是
 * `shrink-0`（内容不缩），就会出现**盒子比内容窄** ⇒ 内容溢出盒子并盖住右邻。
 * 此时轨道 `scrollWidth === clientWidth`（看起来"不溢出、不用滚"），
 * 真实后果却是控件互相压盖——正是实测到的形态。
 *
 * **为什么 jsdom 能测**：jsdom 不做布局计算，测不了「实际有没有重叠」；
 * 但**导致重叠的机制**（根节点可压缩 + 内容不可压缩）就写在类名上，
 * 是可断言的。这条断言改错了就红：把 `shrink-0` 改回 `min-w-0` ⇒ 立刻红。
 */

const LIB = join(process.cwd(), 'apps/web/src/components/library')

/** 取组件根节点的类名（组件根 = container 的第一个元素子节点） */
function rootClass(container: HTMLElement): string {
  const el = container.firstElementChild
  return el === null ? '' : el.className
}

describe('FILTERBAR-01 · 筛选组不得被压缩（否则内容溢出盖住右邻）', () => {
  afterEach(cleanup)

  it('TagFilterBar 根节点用 shrink-0（标签条）', () => {
    const { container } = render(
      <TagFilterBar tags={['前端', '后端']} selected={undefined} onToggle={() => undefined} />,
    )
    const cls = rootClass(container)
    // 可压缩 = min-w-0：盒子会被轨道压窄 ⇒ 内容溢出压盖右邻
    expect(cls).not.toMatch(/\bmin-w-0\b/)
    // 不可压缩 = shrink-0：内容原宽，超出部分交给轨道横向滚动
    expect(cls).toMatch(/\bshrink-0\b/)
  })

  it('FolderFilterBar 根节点用 shrink-0（文件夹条）', () => {
    const { container } = render(
      <FolderFilterBar
        paths={['/a']}
        selected={undefined}
        onToggle={() => undefined}
        onDropPrompt={() => undefined}
      />,
    )
    const cls = rootClass(container)
    expect(cls).not.toMatch(/\bmin-w-0\b/)
    expect(cls).toMatch(/\bshrink-0\b/)
  })

  it('TermFilterBar 根节点用 shrink-0（难度组）—— 同一口径，三处一致', () => {
    const { container } = render(
      <TermFilterBar
        domainCounts={[{ domain: '前端', count: 140 }]}
        total={441}
        domain={null}
        level={null}
        starterOnly={false}
        onDomain={() => undefined}
        onLevel={() => undefined}
        onStarterOnly={() => undefined}
      />,
    )
    const cls = rootClass(container)
    expect(cls).not.toMatch(/\bmin-w-0\b/)
    expect(cls).toMatch(/\bshrink-0\b/)
  })

  it('轨道是横向滚动容器（空间不够时滚动，而不是压盖）', () => {
    const src = readFileSync(join(LIB, 'AssetPageHead.tsx'), 'utf8')
    // AssetFilterBar 的轨道：overflow-x-auto + whitespace-nowrap（单行、可横向滚动）
    expect(src).toMatch(/overflow-x-auto/)
    expect(src).toMatch(/whitespace-nowrap/)
  })

  it('源码里不再有「min-w-0 的筛选组」（防复发：新写一组时别再用 min-w-0）', () => {
    // 这条钉的是**机制的一致性**：三处筛选组根节点都改了，若有人新写第四处
    // 又用 min-w-0，这条即红——它比「逐个组件断言」更能挡住复发。
    const files = ['TagFilterBar.tsx', 'FolderFilterBar.tsx']
    for (const f of files) {
      const src = readFileSync(join(LIB, f), 'utf8')
      expect(src).not.toMatch(/className="flex min-w-0 items-center gap-1\.5"/)
    }
    const termSrc = readFileSync(
      join(process.cwd(), 'apps/web/src/components/terms/TermFilterBar.tsx'),
      'utf8',
    )
    expect(termSrc).not.toMatch(/className="flex min-w-0 items-center gap-1\.5"/)
  })
})
