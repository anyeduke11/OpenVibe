import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { RESOURCE_MODE_LABELS, type LangProfile, type TopicProfileLite } from '@openvibe/shared'
import { ResourceModeChip } from './ResourceModeChip'

/**
 * M9 v1.6 **P1e.3 出口**（`m9-dev-plan-2026-10.md` §6.6 · **DL-39**）。
 *
 * DL-39 断四件事：
 * ① 资源的模式标记必须等于「必学集合反查」的结果；
 * ② **变异腿**：把某资源的挂接清空 ⇒ 标记必须从「本模式必学」翻成「仅扩展阅读」**并判红**；
 * ③ **反证**：断言**不存在「熟悉用」这第三档**；
 * ④ 标记**随模式切换即时重算**，不许要求刷新。
 *
 * ⚠️ **oracle 在本文件里独立重算**（不调 `resourceModeLabel`）——
 *   组件内部用的就是那个函数，拿它当期望值等于自己验自己。
 */
interface TopicRow {
  id: number
  slug: string
  title: string
}

/** 真实 slug（取自仓内 `lang_topics` 种子，2026-10-20 实测） */
const TOPICS: TopicRow[] = [
  { id: 101, slug: 'python3-basic-syntax', title: 'Python 基本语法' },
  { id: 102, slug: 'python3-data-type', title: 'Python 数据类型' },
  { id: 103, slug: 'python3-iterator-generator', title: 'Python 迭代器与生成器' },
  { id: 104, slug: 'python3-class', title: 'Python 类与面向对象' },
  { id: 201, slug: 'go-program-structure', title: 'Go 程序结构' },
  { id: 202, slug: 'go-data-types', title: 'Go 数据类型' },
]

const PROFILES: TopicProfileLite[] = [
  // 精通：全部必学
  ...TOPICS.map((t, i) => ({
    topic_id: t.id,
    profile: 'master' as const,
    required: 1 as const,
    rank: i + 1,
    est_minutes: null,
  })),
  // 熟悉：除 python3-class 外都必学（那一条是「熟悉可跳过」的冷门底层）
  ...TOPICS.filter((t) => t.slug !== 'python3-class').map((t, i) => ({
    topic_id: t.id,
    profile: 'familiar' as const,
    required: 1 as const,
    rank: i + 1,
    est_minutes: null,
  })),
  // 速成：只有前三条
  ...TOPICS.slice(0, 3).map((t, i) => ({
    topic_id: t.id,
    profile: 'vibe' as const,
    required: 1 as const,
    rank: i + 1,
    est_minutes: 8,
  })),
]

const TITLES = TOPICS.map((t) => ({ id: t.id, title: t.title }))

/** **独立重算**的 oracle：这条资源在当前模式下是不是「本模式必学」 */
function oracleLabel(profile: LangProfile, topicIds: readonly number[]): string {
  const hit = topicIds.some((id) =>
    PROFILES.some((r) => r.topic_id === id && r.profile === profile && r.required === 1),
  )
  return hit ? '本模式必学' : '仅扩展阅读'
}

/** 挂接了一批知识点的资源（对应库里那条 awesome-python-cn 清单） */
const ATTACHED = [101, 102, 103, 104]
/** 只挂了一条「非必学」的资源的挂接 */
const ATTACHED_EXT = [104]

afterEach(cleanup)

describe('M9 P1e.3 · DL-39 资源页两档模式标记', () => {
  it('① 标记 == 「必学集合反查」的结果（逐条比对，两档各有实例）', () => {
    const cases: { profile: LangProfile; topicIds: number[] }[] = [
      { profile: 'master', topicIds: ATTACHED },
      { profile: 'familiar', topicIds: ATTACHED },
      { profile: 'vibe', topicIds: ATTACHED },
      { profile: 'master', topicIds: ATTACHED_EXT },
      { profile: 'vibe', topicIds: ATTACHED_EXT },
      { profile: 'vibe', topicIds: [] },
    ]
    for (const c of cases) {
      const { unmount } = render(
        <ResourceModeChip
          profile={c.profile}
          topicIds={c.topicIds}
          profiles={PROFILES}
          topicTitles={TITLES}
        />,
      )
      const chip = screen.getByRole('button')
      expect(chip.textContent, `${c.profile} / ${c.topicIds.join(',')}`).toBe(
        oracleLabel(c.profile, c.topicIds),
      )
      unmount()
      cleanup()
    }
  })

  it('② 反证：不存在「熟悉用」这第三档（两档常量恰两条，chip 文本只能是它们之一）', () => {
    expect(RESOURCE_MODE_LABELS).toEqual(['本模式必学', '仅扩展阅读'])
    for (const profile of ['master', 'familiar', 'vibe'] as LangProfile[]) {
      const { unmount } = render(
        <ResourceModeChip profile={profile} topicIds={ATTACHED} profiles={PROFILES} />,
      )
      const text = screen.getByRole('button').textContent
      expect(RESOURCE_MODE_LABELS).toContain(text)
      expect(text).not.toBe('熟悉用')
      unmount()
      cleanup()
    }
  })

  it('③ chip 恒是「图标 + 文字」（DESIGN.md 的 chip 纪律，不靠颜色单义承载语义）', () => {
    render(<ResourceModeChip profile="master" topicIds={ATTACHED} profiles={PROFILES} />)
    const chip = screen.getByRole('button')
    expect(chip.querySelector('svg')).toBeTruthy()
    expect(chip.textContent?.trim()).toBe('本模式必学')
  })

  it('④ 点开标记展开「这条覆盖了本模式必学里的哪几条」（复用既有挂接，不另存清单）', () => {
    render(
      <ResourceModeChip
        profile="master"
        topicIds={ATTACHED}
        profiles={PROFILES}
        topicTitles={TITLES}
      />,
    )
    fireEvent.click(screen.getByRole('button'))
    for (const t of TOPICS) {
      if (!ATTACHED.includes(t.id)) continue
      expect(screen.getByText(t.title)).toBeTruthy()
    }
  })

  it('⑤ 变异腿（真动数据）：清空挂接 ⇒ 标记必须翻成「仅扩展阅读」，且对变更前的期望判红', () => {
    // 变更前：这条资源覆盖了精通必学 ⇒ 「本模式必学」
    const before = render(
      <ResourceModeChip
        profile="master"
        topicIds={ATTACHED}
        profiles={PROFILES}
        topicTitles={TITLES}
      />,
    )
    expect(within(before.container).getByRole('button').textContent).toBe('本模式必学')
    const expectedBefore = oracleLabel('master', ATTACHED)
    before.unmount()
    cleanup()

    // ⚠️ **真动数据**：挂接被清空（等价于库里那条 `lang_topic_resources` 行被删）
    const after = render(
      <ResourceModeChip profile="master" topicIds={[]} profiles={PROFILES} topicTitles={TITLES} />,
    )
    const got = within(after.container).getByRole('button').textContent
    expect(got).toBe('仅扩展阅读')

    // 生产断言是「显示 == 期望」；在变更前的期望下，它**必须红**
    expect(got).not.toBe(expectedBefore)
  })

  it('⑥ 标记随模式切换即时重算（换 profile 即变，不要求刷新、不残留上一次的结果）', () => {
    const { rerender, container } = render(
      <ResourceModeChip
        profile="master"
        topicIds={ATTACHED_EXT}
        profiles={PROFILES}
        topicTitles={TITLES}
      />,
    )
    expect(within(container).getByRole('button').textContent).toBe('本模式必学')

    // 同一批挂接，切到速成（python3-class 不在速成必学里）⇒ 标记必须立刻翻
    rerender(
      <ResourceModeChip
        profile="vibe"
        topicIds={ATTACHED_EXT}
        profiles={PROFILES}
        topicTitles={TITLES}
      />,
    )
    expect(within(container).getByRole('button').textContent).toBe('仅扩展阅读')
  })
})
