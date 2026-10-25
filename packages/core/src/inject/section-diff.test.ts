import { describe, expect, it } from 'vitest'
import { diffSections } from './section-diff'

/**
 * v0.2.3 批次 C RQ4：段级差异纯函数。
 * 判据（spec FR-7）：1000 行文件改 1 行 ⇒ 报文给出段名与行数；五状态判定与写入行为
 * 不在本函数职责内（planner/golden 不动）；段外自由区显式标注。
 */

const BEGIN = '<!-- openvibe:pack=default@1.0.0 begin (regenerate: npx openvibe-cli sync) -->'
const END = '<!-- openvibe:end -->'

const rendered = (managed: string[], before: string[] = [], after: string[] = []): string =>
  [...before, BEGIN, ...managed, END, ...after].join('\n')

describe('diffSections（RQ4 段级差异）', () => {
  it('1000 行受管块改 1 行 ⇒ 受管块 changed 且行数可见，块外 same', () => {
    const managed = Array.from({ length: 1000 }, (_, i) => `第 ${i + 1} 行`)
    const actual = [...managed.slice(0, 500), '被改的一行', ...managed.slice(501)]
    const r = diffSections(rendered(managed), rendered(actual))
    expect(r.regions).toHaveLength(2)
    const managedRegion = r.regions.find((x) => x.region === '受管块')
    expect(managedRegion?.status).toBe('changed')
    expect(managedRegion?.expectedLines).toBe(1002) // 1000 行 + begin + end
    expect(managedRegion?.actualLines).toBe(1002)
    expect(r.managedChanged).toBe(true)
    expect(r.freeChanged).toBe(false)
  })

  it('用户只改块外自由区 ⇒ freeChanged 且受管块 same（同步建议倒向保留本地的依据）', () => {
    const managed = ['规则一', '规则二']
    const r = diffSections(rendered(managed, ['前言']), rendered(managed, ['前言', '用户加的一行']))
    expect(r.managedChanged).toBe(false)
    expect(r.freeChanged).toBe(true)
    expect(r.regions.find((x) => x.region === '块外自由区')?.status).toBe('changed')
  })

  it('磁盘文件被去壳（缺标记）⇒ 受管块 missing，全部行按块外对待', () => {
    const r = diffSections(rendered(['规则一'], ['前言']), '前言\n用户去壳后的内容')
    const managed = r.regions.find((x) => x.region === '受管块')
    expect(managed?.missing).toBe(true)
    expect(managed?.status).toBe('changed')
    expect(r.managedChanged).toBe(true)
  })

  it('完全一致 ⇒ 两段 same，双 false', () => {
    const text = rendered(['a', 'b'], ['前言'], ['尾注'])
    const r = diffSections(text, text)
    expect(r.regions.every((x) => x.status === 'same')).toBe(true)
    expect(r.managedChanged).toBe(false)
    expect(r.freeChanged).toBe(false)
  })
})
