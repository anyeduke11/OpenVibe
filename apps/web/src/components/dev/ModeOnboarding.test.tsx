import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { stripComments } from '@openvibe/shared'
import { btnPrimary } from '../ui/styles'
import { ModeOnboarding, type ModeRouteSummary } from './ModeOnboarding'

/**
 * M9 v1.6 **P1e.2 出口**（`m9-dev-plan-2026-10.md` §6.6 · **DL-38**）。
 *
 * DL-38 断五件事：
 * ① 未作答时首屏**只出现一个主动作**（速成），精通/熟悉**折叠**；
 * ② **跳过与选速成的渲染逐字相同**（同一份快照比对，不是断言几个字段相等）；
 * ③ **反证**：作答题落点不在 `lang_topic_state`、不进 `computeState()` 入参；
 * ④ **反证**：作答前后已点亮状态不变；
 * ⑤ **变异腿**：把「折叠」写成「隐藏」⇒ 红（见 `ModeOnboarding.hidden-mutant.test.tsx`）。
 *
 * ⚠️ **「只出现一个主动作」怎么数**：靠 `btnPrimary` 这个**唯一的样式出处**
 *   （`apps/web/src/components/ui/styles.ts`）—— 数「className 里含 btnPrimary 的按钮」。
 *   不用「按文案找」：文案会改，样式出处不会，而且它是 DESIGN.md 的那一处。
 */
const ROUTES: readonly ModeRouteSummary[] = [
  { lang: 'python', masterStations: 8, familiarStations: 3 },
  { lang: 'go', masterStations: 6, familiarStations: 3 },
]

const VIBE_OPTION = /直接带着 AI 写项目/
const SKIP = '跳过，按默认走'
const DEEP = '以后要深入再来'

afterEach(cleanup)

/** 数「主动作」：className 里含 `btnPrimary` 的按钮 */
function primaryButtons(): HTMLElement[] {
  return [...document.querySelectorAll('button')].filter((b) => b.className.includes(btnPrimary))
}

/**
 * 读组件源码（源码守卫用）。
 *
 * ⚠️ **不要用 `new URL('./X.tsx', import.meta.url)`** ——
 *   jsdom 环境里的 `URL` 是浏览器实现，`fileURLToPath` 认不了它（报「The URL must be of scheme file」）。
 *   ⇒ 直接把 `import.meta.url`（字符串）交给 Node 的 `fileURLToPath`，再按目录拼文件名。
 */
function readComponentSource(): string {
  const here = fileURLToPath(import.meta.url)
  return readFileSync(join(dirname(here), 'ModeOnboarding.tsx'), 'utf8')
}

describe('M9 P1e.2 · DL-38 首次进入的一次性提问', () => {
  it('① 未作答时首屏只有一个主动作（速成），精通/熟悉折叠成一行', () => {
    render(<ModeOnboarding onAnswer={() => {}} masterRoutes={ROUTES} />)

    const primary = primaryButtons()
    expect(primary).toHaveLength(1)
    expect(primary[0]!.textContent).toMatch(VIBE_OPTION)

    // 精通/熟悉**折叠成一行**（可点），而不是各占一张卡
    const deep = screen.getByRole('button', { name: DEEP })
    expect(deep).toBeTruthy()
    // ⚠️ 折叠 ≠ 隐藏 ⇒ 精通/熟悉不得作为**独立按钮**出现在首屏
    expect(screen.queryAllByRole('button', { name: /^精通/ })).toHaveLength(0)
    expect(screen.queryAllByRole('button', { name: /^熟悉/ })).toHaveLength(0)
  })

  it('② 跳过与选速成的渲染**逐字相同**（同一份快照比对）', () => {
    const renderAndClick = (name: string | RegExp): string => {
      const { container } = render(<ModeOnboarding onAnswer={() => {}} masterRoutes={ROUTES} />)
      fireEvent.click(screen.getByRole('button', { name }))
      return container.innerHTML
    }

    const skipHtml = renderAndClick(SKIP)
    cleanup()
    const vibeHtml = renderAndClick(VIBE_OPTION)

    // ⚠️ **整份 DOM 逐字比** —— 不是「几个字段相等」。
    //   断言「折叠行都在、标题都在」这种局部相等，抓不到「跳过多了一句提示」这种偏差。
    expect(vibeHtml).toBe(skipHtml)
    expect(vibeHtml.length).toBeGreaterThan(0)
  })

  it('② 附：两条路径走的**是同一个出口**，回调实参完全一致', () => {
    const calls: string[] = []
    const spy = (c: string): void => {
      calls.push(c)
    }
    const { unmount } = render(<ModeOnboarding onAnswer={spy} masterRoutes={ROUTES} />)
    fireEvent.click(screen.getByRole('button', { name: SKIP }))
    unmount()
    cleanup()
    render(<ModeOnboarding onAnswer={spy} masterRoutes={ROUTES} />)
    fireEvent.click(screen.getByRole('button', { name: VIBE_OPTION }))
    expect(calls).toEqual(['vibe', 'vibe'])
  })

  it('③ 折叠的那一行**一直可点**：答了速成之后仍在，点它进精通对比（两门语言都列出，不折叠）', () => {
    render(<ModeOnboarding onAnswer={() => {}} masterRoutes={ROUTES} />)
    fireEvent.click(screen.getByRole('button', { name: VIBE_OPTION }))

    // 速成落点屏上折叠行仍在
    const deep = screen.getByRole('button', { name: DEEP })
    expect(deep).toBeTruthy()

    fireEvent.click(deep)
    const master = screen.getByRole('region', { name: '精通路线对比' })
    expect(within(master).getByText('Python · 精通 8 站 · 熟悉 3 站')).toBeTruthy()
    expect(within(master).getByText('Go · 精通 6 站 · 熟悉 3 站')).toBeTruthy()
    // 展开后**不再**有折叠行（那正是「不折叠」）
    expect(screen.queryAllByRole('button', { name: DEEP })).toHaveLength(0)
  })

  it('④ 反证：作答落点不进 `lang_topic_state`、不进 `computeState()` 入参', () => {
    const calls: unknown[] = []
    render(
      <ModeOnboarding
        onAnswer={(c) => {
          calls.push(c)
        }}
        masterRoutes={ROUTES}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: SKIP }))

    // 载荷只有模式字符串，**没有任何知识点 id**
    expect(calls).toEqual(['vibe'])
    for (const c of calls) {
      expect(typeof c).toBe('string')
      expect(['vibe', 'master']).toContain(c)
    }
  })

  it('④ 附：组件的代码里不得出现 `lang_topic_state` / `computeState` / `topic_id`（源码守卫）', () => {
    // ⚠️ 判据扫的是**去掉注释后的代码**，但**保留字符串** ——
    //   一句 `db.prepare('INSERT INTO lang_topic_state')` 里的表名必须被看见。
    const src = stripComments(readComponentSource())
    expect(src).not.toContain('lang_topic_state')
    expect(src).not.toContain('computeState')
    expect(src).not.toContain('topic_id')

    // ⚠️ **变异腿**：往源码副本里塞一处落点写入 ⇒ 这条闸必须报出
    const mutated = `${src}\nconst bad = db.prepare('INSERT INTO lang_topic_state')\n`
    expect(stripComments(mutated)).toContain('lang_topic_state')
  })

  it('⑤ 反证：作答前后已点亮状态不变（组件不接收也不改动点亮集合）', () => {
    // ⚠️ 组件的 props 与代码里**没有**「点亮集合」这个东西 ⇒ 结构上碰不到它
    const src = stripComments(readComponentSource())
    expect(src).not.toContain('litTopicIds')
    expect(src).not.toContain('litState')
    expect(src).not.toContain('setLit')

    const lit = new Set([101, 102, 103])
    const before = [...lit]
    const { container } = render(<ModeOnboarding onAnswer={() => {}} masterRoutes={ROUTES} />)
    fireEvent.click(screen.getByRole('button', { name: VIBE_OPTION }))

    expect([...lit]).toEqual(before)
    // 作答后的渲染里也没有知识点 id（101/102/103）
    expect(container.innerHTML).not.toContain('101')
  })
})
