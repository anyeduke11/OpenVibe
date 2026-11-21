import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyExpert, readStoredExpert } from './useExpertMode'

/**
 * `apps/web/src/hooks/useExpertMode.test.ts` —— 专家视图的判据。
 *
 * ## 它挡什么
 *
 * 两条：① 默认**关**（渐进披露是红线，默认开就等于没有闸）；
 * ② 落点必须是 `body.classList` —— 显示规则 `body.expert [data-problock]` 写在 `index.css`，
 *    落点漂了（比如改成 html）会让开关**点了没反应**，而那种缺陷靠肉眼看很容易漏。
 *
 * ⚠️ 本文件的 `localStorage` 是**手写的最小实现**：vitest 的 jsdom 环境在本仓未挂上
 *   `localStorage`（既有 `useTheme` / `useRoadmapOrder` 也一样直接读，只是它们没有测试）。
 *   不引 `jest-localstorage-mock` 之类的包 —— 一个 6 行的 Map 就够了。
 */

const store = new Map<string, string>()

beforeEach(() => {
  store.clear()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    },
  })
})

afterEach(() => {
  document.body.classList.remove('expert')
})

describe('useExpertMode · 默认与落点', () => {
  it('默认关（渐进披露是红线：默认开就等于没有闸）', () => {
    expect(readStoredExpert()).toBe(false)
  })

  it('applyExpert 落在 body.classList 上（与 index.css 的显示规则同口径）', () => {
    applyExpert(true)
    expect(document.body.classList.contains('expert')).toBe(true)
    applyExpert(false)
    expect(document.body.classList.contains('expert')).toBe(false)
  })

  it('localStorage 的键位与 index.html 预涂脚本一致', () => {
    // ⚠️ 这条同时钉住三处：本文件、index.html 的预涂脚本、CSS 的显示规则。
    //   三处任一处改了键名，首启会「先闪一屏高级块再消失」。
    localStorage.setItem('openvibe:expert', '1')
    expect(readStoredExpert()).toBe(true)
  })

  it('localStorage 不可用时静默回落到关（不抛错）', () => {
    // 直接把 localStorage 定义成 undefined —— 模拟无痕模式 / 隐私上下文
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: undefined })
    expect(readStoredExpert()).toBe(false)
  })
})
