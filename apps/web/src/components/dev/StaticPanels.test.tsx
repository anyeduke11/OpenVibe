import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { cleanup, render } from '@testing-library/react'
import { DualPlanTimeline } from './DualPlanTimeline'
import { LanguageCompare } from './LanguageCompare'
import { PracticePrinciples } from './PracticePrinciples'
import {
  DUAL_PLAN,
  DUAL_PLAN_HEADINGS,
  DUAL_PLAN_NOTES,
  LANGUAGE_ASPECTS,
  LEARNING_ORDER,
  PRACTICE_PRINCIPLES,
} from '@openvibe/shared'

/**
 * M9 v1.6 **P3.4 / P3.5 / P3.6 出口**（`m9-dev-plan-2026-10.md` §6.9 ·
 *   `m9-dev-language-roadmap.md` §3.22）
 *
 * 断四件事：
 * ① **段数/维数/条数**逐格对得上（双修 9 段 · 对照 8 维 · 选学 3 条 · 原则 6 条）；
 * ② **逐字**：内容一字不改地渲染出来（内容本身由 `m9-panels.test.ts` 对账规格）；
 * ③ **练习原则不是可勾选清单**（§3.22.4 末段）—— 没有 checkbox、没有「已完成 n/6」；
 * ④ **双修规划不由分期路线推导**（§3.22.1：一个段对两个段 ⇒ 照抄不推导）。
 *
 * ## ⚠️ 第 ③ 条为什么要在**渲染层与源码层各断一次**
 *
 * 只断渲染层：有人把 checkbox 加进一个**当前测试没渲染到的分支**，就绕过去了。
 * 只断源码层：注释里写「checkbox」也会被算进去。
 * ⇒ 两层都断，源码层用**精确的字面量**匹配（`'checkbox'` / `type="checkbox"`）。
 */
afterEach(cleanup)

function sourceOf(file: string): string {
  return readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8')
}

/**
 * **去掉注释**再扫。
 *
 * ⚠️ 为什么必须去：规则说明里**必须能引用**被禁形态（组件的文档注释写着
 *   「没有 checkbox」「没有「已完成 n/6」」）⇒ 扫原文会把规则自己判红
 *   （与 `findForbiddenMasteryCopy` 同一款纪律）。
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

describe('M9 P3.4 · 双修规划时间线（§3.22.1）', () => {
  it('两套模式：精通 5 段 ＋ 熟悉 4 段 ＝ 9 段', () => {
    const { container } = render(<DualPlanTimeline />)
    expect(container.querySelectorAll('ol li')).toHaveLength(9)
    expect(DUAL_PLAN.filter((s) => s.profile === 'master')).toHaveLength(5)
    expect(DUAL_PLAN.filter((s) => s.profile === 'familiar')).toHaveLength(4)
  })

  it('段序各自从 1 起（两套不是连号）', () => {
    const { container } = render(<DualPlanTimeline />)
    const marks = [...container.querySelectorAll('ol li')].map(
      (li) => li.querySelector('span')?.textContent ?? '',
    )
    expect(marks).toEqual([
      '第 1 段',
      '第 2 段',
      '第 3 段',
      '第 4 段',
      '第 5 段',
      '第 1 段',
      '第 2 段',
      '第 3 段',
      '第 4 段',
    ])
  })

  it('抬头与说明逐字取自常量', () => {
    const { container } = render(<DualPlanTimeline />)
    const text = container.textContent ?? ''
    expect(text).toContain(DUAL_PLAN_HEADINGS.master)
    expect(text).toContain(DUAL_PLAN_HEADINGS.familiar)
    expect(text).toContain(DUAL_PLAN_NOTES.master)
    expect(text).toContain(DUAL_PLAN_NOTES.familiar)
  })

  it('每段的标题与内容逐字渲染', () => {
    const { container } = render(<DualPlanTimeline />)
    const text = container.textContent ?? ''
    for (const seg of DUAL_PLAN) {
      expect(text).toContain(seg.title)
      expect(text).toContain(seg.detail)
    }
  })

  it('⚠️ 组件**不由分期路线推导**（源码里不出现分期路线）', () => {
    const src = stripComments(sourceOf('./DualPlanTimeline.tsx'))
    expect(src).not.toMatch(/lang_profile_phases/)
    expect(src).not.toMatch(/\bPHASES\b/)
    expect(src).not.toMatch(/profile_phases/)
  })
})

describe('M9 P3.5 · 语言对照表（§3.22.2）＋ 选学顺序（§3.22.3）', () => {
  it('8 个维度，每行三格逐字', () => {
    const { container } = render(<LanguageCompare />)
    const rows = container.querySelectorAll('tbody tr')
    expect(rows).toHaveLength(8)
    expect(LANGUAGE_ASPECTS).toHaveLength(8)
    for (const [i, aspect] of LANGUAGE_ASPECTS.entries()) {
      const cells = rows[i]?.querySelectorAll('th, td') ?? []
      expect(cells).toHaveLength(3)
      expect(cells[0]?.textContent).toBe(aspect.aspect)
      expect(cells[1]?.textContent).toBe(aspect.python)
      expect(cells[2]?.textContent).toBe(aspect.go)
    }
  })

  it('表头是 Python 与 Go 两列', () => {
    const { container } = render(<LanguageCompare />)
    const heads = [...container.querySelectorAll('thead th')].map((th) => th.textContent)
    expect(heads).toEqual(['维度', 'Python', 'Go（Golang）'])
  })

  it('选学顺序 3 条逐字', () => {
    const { container } = render(<LanguageCompare />)
    const items = container.querySelectorAll('[aria-label="选学顺序"] ol li')
    expect(items).toHaveLength(3)
    expect(LEARNING_ORDER).toHaveLength(3)
    const text = container.textContent ?? ''
    for (const o of LEARNING_ORDER) {
      expect(text).toContain(o.route)
      expect(text).toContain(o.detail)
    }
  })
})

describe('M9 P3.6 · 练习原则常驻提示条（§3.22.4）', () => {
  it('6 条逐字渲染', () => {
    const { container } = render(<PracticePrinciples />)
    const items = container.querySelectorAll('ul li')
    expect(items).toHaveLength(6)
    expect(PRACTICE_PRINCIPLES).toHaveLength(6)
    const text = container.textContent ?? ''
    for (const p of PRACTICE_PRINCIPLES) {
      expect(text).toContain(p.principle)
      expect(text).toContain(p.detail)
    }
  })

  it('⚠️ **不是可勾选清单**：渲染层没有 checkbox', () => {
    const { container } = render(<PracticePrinciples />)
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(0)
    expect(container.querySelectorAll('[role="checkbox"]')).toHaveLength(0)
    expect(container.querySelectorAll('input')).toHaveLength(0)
  })

  it('⚠️ **没有「已完成 n/6」这类假进度**', () => {
    const { container } = render(<PracticePrinciples />)
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/已完成/)
    expect(text).not.toMatch(/\d\s*\/\s*6/)
  })

  it('⚠️ 源码层同样没有 checkbox（防止后来在别的分支里加）', () => {
    for (const file of ['./PracticePrinciples.tsx', './DualPlanTimeline.tsx', './LanguageCompare.tsx']) {
      const src = stripComments(sourceOf(file))
      expect(src).not.toContain('checkbox')
      expect(src).not.toContain('type="checkbox"')
      expect(src).not.toContain('已完成')
    }
  })
})
