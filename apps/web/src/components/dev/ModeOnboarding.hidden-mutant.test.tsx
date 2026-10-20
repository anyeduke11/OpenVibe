import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ModeOnboarding, type ModeRouteSummary } from './ModeOnboarding'

/**
 * M9 v1.6 **P1e.2 · DL-38 的变异腿**（把「折叠」写成「隐藏」）。
 *
 * ## 它为什么单独一个文件
 *
 * ⚠️ `vi.mock` 是**按文件**生效的（会被提升到 import 之前）——
 *   若把它和正支放在同一个文件，整份文件都会跑在变异体上，正支就再也测不到真实现了。
 *   ⇒ 变异体必须独占一份文件。
 *
 * ## 变异的是什么
 *
 * §3.19 第 4 条：「折叠的那一行必须**一直可点** —— 若用户答了速成、半年后想深入，
 * **不能因为「首屏折叠」就找不到精通**。这是答错时的唯一兜底，藏起来等于没有兜底。」
 *
 * ⇒ 变异体把 `modeEntryPlan` 换成「隐藏」变体（`collapsedDeepModes` 恒 `false`），
 *   折叠行整个不渲染 ⇒ **精通/熟悉从首屏消失**。
 *   然后跑**与生产断言逐字相同**的那条检查 ⇒ 它必须红。
 *   **若这里还是绿的，说明正支那条断言根本抓不住「隐藏」这种实现。**
 */
vi.mock('@openvibe/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@openvibe/shared')>()
  return {
    ...actual,
    // ⚠️ 变异：折叠行不再渲染（= 隐藏）
    modeEntryPlan: () => ({ collapsedDeepModes: false, showMasterRoutes: false }),
  }
})

const ROUTES: readonly ModeRouteSummary[] = [
  { lang: 'python', masterStations: 8, familiarStations: 3 },
  { lang: 'go', masterStations: 6, familiarStations: 3 },
]

const VIBE_OPTION = /直接带着 AI 写项目/
const DEEP = '以后要深入再来'

afterEach(cleanup)

describe('M9 P1e.2 · DL-38 变异腿（折叠 ⇒ 隐藏）', () => {
  it('变异体下，生产断言「折叠行必须常驻可点」必须红', () => {
    render(<ModeOnboarding onAnswer={() => {}} masterRoutes={ROUTES} />)
    fireEvent.click(screen.getByRole('button', { name: VIBE_OPTION }))

    // ⚠️ **生产断言（与 `ModeOnboarding.test.tsx` 的 ③ 逐字相同）**：
    //   折叠的那一行必须一直可点。它在变异体下必须**取不到**。
    expect(() => screen.getByRole('button', { name: DEEP })).toThrow()
    expect(screen.queryByRole('button', { name: DEEP })).toBeNull()
  })

  it('变异体下，答完速成后**再也进不去精通视图**（这正是「藏起来等于没有兜底」）', () => {
    render(<ModeOnboarding onAnswer={() => {}} masterRoutes={ROUTES} />)
    fireEvent.click(screen.getByRole('button', { name: VIBE_OPTION }))

    // 精通/熟悉既没有折叠行、也没有独立的按钮 ⇒ 没有任何入口
    expect(screen.queryAllByRole('button', { name: DEEP })).toHaveLength(0)
    expect(screen.queryAllByRole('button', { name: /^精通/ })).toHaveLength(0)
    expect(screen.queryAllByRole('region', { name: '精通路线对比' })).toHaveLength(0)
  })
})
