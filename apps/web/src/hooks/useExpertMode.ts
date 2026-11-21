import { useCallback, useEffect, useState } from 'react'

/**
 * 专家视图（原型顶栏「专家视图」开关）。
 *
 * ## 它解决什么
 *
 * 原型「渐进披露红线 4」：高级块常埋在世界各处 —— 普通用户被它们淹没，专家找不到。
 * 一个全站开关把两边都接住：默认干净，需要时一键越级。
 *
 * ## 口径（与主题同构，但有三处刻意不同）
 *
 * | | 主题 | 专家视图 |
 * |---|---|---|
 * | 落点 | `documentElement.dataset.theme` | `document.body.classList` |
 * | 默认 | 暖纸（亮） | **关** |
 * | 持久化 | 是 | 是（`openvibe:expert`） |
 *
 * ⚠️ **为什么不跟主题共用一个 hook**：两者语义无关（一个是配色、一个是信息密度），
 *   共用会让「切主题」顺带改「信息密度」，而那两件事的取舍时机不同。
 *
 * ⚠️ **落点是 body 不是 documentElement**：`[data-problock]` 的显示规则写在
 *   `body.expert [data-problock]`（见 `index.css`）。放 html 上会与主题的
 *   `data-theme` 抢同一个元素，而两者生命周期不同（主题要跟系统偏好、专家视图是纯用户选择）。
 */
const STORAGE_KEY = 'openvibe:expert'

export function readStoredExpert(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function applyExpert(on: boolean): void {
  document.body.classList.toggle('expert', on)
}

export function useExpertMode(): { expert: boolean; toggle: () => void } {
  const [expert, setExpert] = useState<boolean>(readStoredExpert)

  useEffect(() => {
    applyExpert(expert)
    try {
      localStorage.setItem(STORAGE_KEY, expert ? '1' : '0')
    } catch {
      // 无痕模式等 localStorage 不可用：仅本次会话生效
    }
  }, [expert])

  const toggle = useCallback(() => setExpert((v) => !v), [])
  return { expert, toggle }
}
