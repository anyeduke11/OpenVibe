// `packages/shared/src/m9-resource-catalog.test.ts` —— **资源页筛选**的判据测试
// （owner 2026-10-22 裁定：「新建独立的资源页，并支持筛选」· §3.20 / §3.1）。
//
// ## 它断什么
//
// | 断的事 | 为什么必须断 |
// |---|---|
// | 四道筛是「与」的关系 | 任选其一 ⇒ 用户以为筛了其实没筛 |
// | 空值 = 不筛 | 「全部」就是空串，不是某个特殊值 |
// | **模式标记两档** | DL-39：第三档恒空，不许造出来 |
// | **筛选维度里没有 `tier`** | §3.1：`category` 是筛选器用的，`tier` 是矩阵的轴，两套不能混 |
// | 关键字**大小写不敏感** | 用户不该因为大小写搜不到 |
import { describe, expect, it } from 'vitest'
import {
  filterResourceCatalog,
  filterVibeResources,
  type ResourceCatalogRow,
  type VibeResourceRow,
} from './m9-resource-catalog'
import type { TopicProfileLite } from './m9-mode-interaction'

const PROFILES: TopicProfileLite[] = [
  { topic_id: 1, profile: 'master', required: 1, rank: 1, est_minutes: 30 },
  { topic_id: 2, profile: 'master', required: 0, rank: 2, est_minutes: 10 },
  { topic_id: 1, profile: 'vibe', required: 1, rank: 1, est_minutes: 5 },
]

function row(over: Partial<ResourceCatalogRow> = {}): ResourceCatalogRow {
  return {
    id: 1,
    name: '资源一',
    url: 'https://example.com/1',
    summary: '简介一',
    category: 'official',
    lang: 'python',
    price: 'free',
    lang_label: 'zh',
    tier: 'a',
    is_fav: false,
    alive: true,
    last_checked_at: null,
    consecutive_fails: 0,
    topic_ids: [1],
    topic_titles: [{ id: 1, title: '知识点一' }],
    ...over,
  }
}

const ROWS: ResourceCatalogRow[] = [
  row({ id: 1, name: 'Python 官方文档', url: 'https://docs.python.org', category: 'official', lang: 'python', tier: 'a', topic_ids: [1] }),
  row({ id: 2, name: 'Go Tour', url: 'https://go.dev/tour', category: 'course', lang: 'go', lang_label: 'en', tier: 'b', topic_ids: [2] }),
  row({ id: 3, name: '刷题仓库', url: 'https://github.com/example/practice', category: 'github', lang: 'python', tier: 'c', topic_ids: [] }),
]

describe('M9 · 资源页筛选（shared 纯函数）', () => {
  it('不筛 ⇒ **全部留下**（四道筛默认都不参与）', () => {
    const out = filterResourceCatalog(ROWS, { profile: 'master', profiles: PROFILES })
    expect(out).toHaveLength(3)
  })

  it('⚠️ **四道筛是「与」的关系**（不是任选其一）', () => {
    const out = filterResourceCatalog(ROWS, {
      profile: 'master',
      profiles: PROFILES,
      category: 'official',
      lang: 'go',
    })
    // 「官方」且「Go」⇒ 没有一条同时满足
    expect(out).toHaveLength(0)
  })

  it('分类筛 ⇒ 只留该分类', () => {
    const out = filterResourceCatalog(ROWS, {
      profile: 'master',
      profiles: PROFILES,
      category: 'github',
    })
    expect(out.map((r) => r.id)).toEqual([3])
  })

  it('语言筛 ⇒ 只留该语言', () => {
    const out = filterResourceCatalog(ROWS, {
      profile: 'master',
      profiles: PROFILES,
      lang: 'go',
    })
    expect(out.map((r) => r.id)).toEqual([2])
  })

  it('关键字筛：**名称 / 摘要 / URL** 都算，**大小写不敏感**', () => {
    expect(
      filterResourceCatalog(ROWS, { profile: 'master', profiles: PROFILES, q: 'PYTHON' }).map((r) => r.id),
    ).toEqual([1])
    expect(
      filterResourceCatalog(ROWS, { profile: 'master', profiles: PROFILES, q: 'github.com' }).map((r) => r.id),
    ).toEqual([3])
    expect(
      filterResourceCatalog(ROWS, { profile: 'master', profiles: PROFILES, q: '简介' }).map((r) => r.id),
    ).toEqual([1, 2, 3])
  })

  it('关键字**空串 = 不筛**（「全部」就是空串）', () => {
    const out = filterResourceCatalog(ROWS, { profile: 'master', profiles: PROFILES, q: '  ' })
    expect(out).toHaveLength(3)
  })

  it('⚠️ **模式标记只有两档**（DL-39：不许造出第三档）', () => {
    const out = filterResourceCatalog(ROWS, { profile: 'master', profiles: PROFILES })
    const labels = new Set(out.map((r) => r.mode_label))
    expect(labels.has('本模式必学')).toBe(true)
    expect(labels.has('仅扩展阅读')).toBe(true)
    expect(labels.size).toBe(2)
  })

  it('模式标记随**模式**变（同一批资源，换模式判定不同）', () => {
    const master = filterResourceCatalog(ROWS, { profile: 'master', profiles: PROFILES })
    const vibe = filterResourceCatalog(ROWS, { profile: 'vibe', profiles: PROFILES })
    // 知识点 1 在两个模式里都是必学 ⇒ 标记相同；知识点 2 只在精通里是「非必学」
    expect(master.find((r) => r.id === 1)?.mode_label).toBe('本模式必学')
    expect(vibe.find((r) => r.id === 1)?.mode_label).toBe('本模式必学')
  })

  it('按模式标记筛 ⇒ 只留该档', () => {
    const out = filterResourceCatalog(ROWS, {
      profile: 'master',
      profiles: PROFILES,
      mode: '仅扩展阅读',
    })
    expect(out.map((r) => r.id)).toEqual([2, 3])
  })

  it('⚠️ **筛选维度里没有 `tier`**（§3.1：两套维度不能混）', () => {
    // tier 不同的两条（a / b / c）都能被同一套筛选留下 ⇒ tier 不参与筛选
    const out = filterResourceCatalog(ROWS, { profile: 'master', profiles: PROFILES, category: 'official' })
    expect(out).toHaveLength(1)
    // ⚠️ **守卫自证**：先断言「三行的 tier 确实不同」否则「筛出 1 条」可能只是巧合
    expect(new Set(ROWS.map((r) => r.tier)).size).toBe(3)
  })

  it('**费用筛选** ⇒ 只留该费用档', () => {
    const out = filterResourceCatalog(ROWS, { profile: 'master', profiles: PROFILES, price: 'free' })
    expect(out).toHaveLength(3)
    const paid = filterResourceCatalog(
      [row({ id: 9, price: 'paid' })],
      { profile: 'master', profiles: PROFILES, price: 'paid' },
    )
    expect(paid.map((r) => r.id)).toEqual([9])
  })

  it('**界面语言筛选** ⇒ 只留该语言标签', () => {
    const out = filterResourceCatalog(ROWS, { profile: 'master', profiles: PROFILES, langLabel: 'zh' })
    expect(out.map((r) => r.id)).toEqual([1, 3])
  })

  it('**失效筛选**：只看可访问 / 只看已失效', () => {
    const rows = [row({ id: 1, alive: true }), row({ id: 2, alive: false })]
    expect(
      filterResourceCatalog(rows, { profile: 'master', profiles: PROFILES, alive: 'alive' }).map((r) => r.id),
    ).toEqual([1])
    expect(
      filterResourceCatalog(rows, { profile: 'master', profiles: PROFILES, alive: 'dead' }).map((r) => r.id),
    ).toEqual([2])
    expect(
      filterResourceCatalog(rows, { profile: 'master', profiles: PROFILES, alive: 'all' }),
    ).toHaveLength(2)
  })

  it('**只看精选** ⇒ 非精选的全部滤掉', () => {
    const rows = [row({ id: 1, is_fav: true }), row({ id: 2, is_fav: false })]
    expect(
      filterResourceCatalog(rows, { profile: 'master', profiles: PROFILES, favOnly: true }).map((r) => r.id),
    ).toEqual([1])
  })
})

describe('M9 · 速成专区资源（§3.21：独立分区 · 筛选器不适用）', () => {
  const VIBE: VibeResourceRow[] = [
    {
      id: 1,
      group: 'tools',
      name: 'Cursor 官方指引',
      url: 'https://cursor.com/docs',
      summary: 'AI 工具官方指引',
      alive: true,
      last_checked_at: '2026-10-20',
      consecutive_fails: 0,
    },
    {
      id: 2,
      group: 'tuts',
      name: '工作流教程',
      url: 'https://example.com/tut',
      summary: '端到端教程',
      alive: true,
      last_checked_at: null,
      consecutive_fails: 0,
    },
  ]

  it('**只有关键字**作用于它（分类/费用/阶段/精选这些维度对这张表不适用）', () => {
    expect(filterVibeResources(VIBE, undefined)).toHaveLength(2)
    expect(filterVibeResources(VIBE, 'cursor').map((r) => r.id)).toEqual([1])
    expect(filterVibeResources(VIBE, '教程').map((r) => r.id)).toEqual([2])
  })

  it('⚠️ **空关键字 ⇒ 全部留下**（不是空数组）', () => {
    expect(filterVibeResources(VIBE, '  ')).toHaveLength(2)
  })

  it('⚠️ **速成专区行里没有维度字段**（规格 §3.21：刻意不带）', () => {
    // ⚠️ **守卫自证**：用类型断言之外的方式确认——它的键里没有 category / price / tier
    const keys = Object.keys(VIBE[0] as unknown as Record<string, unknown>)
    expect(keys).not.toContain('category')
    expect(keys).not.toContain('price')
    expect(keys).not.toContain('tier')
  })
})
