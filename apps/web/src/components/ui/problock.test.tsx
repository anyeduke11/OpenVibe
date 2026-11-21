import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProBlock } from './layout'
import { applyExpert } from '../../hooks/useExpertMode'

/**
 * `apps/web/src/components/ui/problock.test.tsx` —— 专家视图闸的判据。
 *
 * ## 它挡什么
 *
 * 原型「渐进披露红线 4」：高级块默认隐藏，顶栏开关打开后才显示。
 *
 * ## 为什么断言分三段，而不是直接断「渲染后不可见」
 *
 * ⚠️ **vitest 的 jsdom 环境不加载 `index.css`**（实测：`getComputedStyle(div).display`
 *   恒为默认 `block`，加不加 `body.expert` 都一样）⇒ 在 jsdom 里断言 CSS 规则**不可能成立**。
 *   故本文件断的是**显隐链路的三段契约**，每段各自可证伪：
 *
 * | 段 | 判据 | 失效表现 |
 * |---|---|---|
 * | ① 结构 | `ProBlock` 渲染出 `[data-problock]` | 属性没了 ⇒ CSS 规则匹配不到 ⇒ 显隐全失效 |
 * | ② 规则 | `index.css` 里两条规则都在（默认 none / expert block） | 规则删了或选择器写错 ⇒ 点了没反应 |
 * | ③ 开关 | `applyExpert` 双向切换 `body.expert` | 已在 `useExpertMode.test.ts` 覆盖 |
 *
 * **真实浏览器的端到端核验**（两段规则是否真的生效）用 headless Chrome 做，
 * 记在 DEV_LOG，不进 `pnpm test` —— 那是环境依赖，不该让 CI 为此装浏览器。
 */

describe('ProBlock · 显隐链路契约', () => {
  it('① 渲染出 [data-problock]（CSS 规则靠它匹配）', () => {
    const html = renderToStaticMarkup(
      <ProBlock>
        <p>越级内容</p>
      </ProBlock>,
    )
    expect(html).toContain('data-problock')
    expect(html).toContain('越级内容')
  })

  it('② index.css 里两条规则都在（默认 none / expert 下 block）', () => {
    const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf8')
    expect(css).toMatch(/\[data-problock\]\s*\{\s*display:\s*none/)
    expect(css).toMatch(/body\.expert \[data-problock\]\s*\{\s*display:\s*block/)
  })

  it('③ display 变体也带 data-display（栅格/弹性块不能一律 block）', () => {
    const html = renderToStaticMarkup(
      <ProBlock display="grid">
        <p>栅格块</p>
      </ProBlock>,
    )
    expect(html).toContain('data-display="grid"')
  })
})

describe('ProBlock · 开关落点（与 useExpertMode 同口径）', () => {
  it('applyExpert 切换的是 body.classList.expert（规则的选择器依赖它）', () => {
    applyExpert(true)
    expect(document.body.classList.contains('expert')).toBe(true)
    applyExpert(false)
    expect(document.body.classList.contains('expert')).toBe(false)
  })
})
