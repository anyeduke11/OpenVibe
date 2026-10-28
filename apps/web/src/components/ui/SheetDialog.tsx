import type { ReactNode } from 'react'
import { Dialog, DialogPanel } from './Dialog'

/**
 * 右侧抽屉式弹层 —— 把「`Dialog` ＋ `variant="sheet"` ＋ 只认关闭的 `onOpenChange`」
 * 这套写法收成一处。
 *
 * ⚠️ `onOpenChange` 只认**关闭**：Radix 在打开时也会回调一次，
 *   照抄成 `onOpenChange={props.onClose}` 会在打开瞬间把弹层关掉 ——
 *   这条约定写在这里，调用点不必各记一遍。
 */
export function SheetDialog(props: {
  open: boolean
  onClose: () => void
  title: string
  footer?: ReactNode
  children: ReactNode
}) {
  return (
    <Dialog open={props.open} onOpenChange={(o) => (o ? undefined : props.onClose())}>
      <DialogPanel variant="sheet" title={props.title} footer={props.footer}>
        {props.children}
      </DialogPanel>
    </Dialog>
  )
}
