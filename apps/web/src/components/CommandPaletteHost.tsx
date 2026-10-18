import { useCallback, useEffect, useState, type ComponentType } from 'react'

/**
 * ⌘K 唤起面板的自定义事件名。定在这里而不是 AppShell：AppShell 要 import 本组件，
 * 反过来再从 AppShell 取常量会成环。顶栏按钮与键盘监听共用这一个字符串。
 */
export const OPEN_PALETTE_EVENT = 'openvibe:open-palette'

/**
 * ⌘K / Ctrl K 的挂载点（面板本体懒加载，见 `CommandPalette.tsx` 顶部注）。
 *
 * 为什么单独一个文件：面板与这个壳必须在**两个 chunk** 里。壳只留一个按键监听
 * （几行），面板（含列表渲染与三个搜索请求）第一次唤起才下载——把它和壳写在一个
 * 文件里，任何 import 这个壳的地方（尤其是入口 AppShell）都会把面板一起拖进去。
 *
 * 监听纪律三条：输入态（INPUT/TEXTAREA/SELECT/contentEditable）内不劫持；
 * 带 meta/ctrl/alt 的组合键放行；CodeMirror 落在 contenteditable 内，因此编辑器里
 * 按 ⌘K 同样不被抢。
 */
export function CommandPaletteHost() {
  const [Palette, setPalette] = useState<ComponentType<{ onClose: () => void }> | null>(null)

  const open = useCallback(() => {
    void import('./CommandPalette').then((m) => setPalette(() => m.CommandPalette))
  }, [])
  const close = useCallback(() => setPalette(null), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'k' || !(e.metaKey || e.ctrlKey)) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable))
        return
      e.preventDefault()
      // 已载入过则直接开关，不重复 import
      if (Palette) close()
      else open()
    }
    // 顶栏可见按钮的唤起通道：只开不关（按钮语义是「打开面板」，不是 toggle）
    const onOpen = () => open()
    document.addEventListener('keydown', onKey)
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen)
    return () => {
      document.removeEventListener('keydown', onKey)
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen)
    }
  }, [Palette, close, open])

  return Palette ? <Palette onClose={close} /> : null
}
