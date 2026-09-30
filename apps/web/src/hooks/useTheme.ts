import { useCallback, useEffect, useState } from 'react'

/**
 * 亮暗主题（DESIGN.md：亮「温纸白」为设计默认，暗「夜账本」为完整对偶）。
 * 客户端本地持久化（localStorage），不进服务端 settings——免动 API 契约。
 * index.html 里有同键位的预涂脚本，首帧前设 data-theme 防闪白。
 */
const STORAGE_KEY = 'openvibe.theme'

export type Theme = 'light' | 'dark'

export function readStoredTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
}

export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(readStoredTheme)

  useEffect(() => {
    applyTheme(theme)
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // 无痕模式等 localStorage 不可用：仅本次会话生效
    }
  }, [theme])

  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), [])
  return { theme, toggle }
}
