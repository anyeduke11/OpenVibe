import * as DialogPrimitive from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger

/** 通用弹层：variant='sheet' 右侧抽屉（编辑器），否则居中卡片（确认框/导入） */
export function DialogPanel(props: {
  title: string
  children: ReactNode
  variant?: 'center' | 'sheet'
  footer?: ReactNode
  width?: string
}) {
  const { title, children, footer } = props
  const isSheet = props.variant === 'sheet'
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/30" />
      <DialogPrimitive.Content
        aria-describedby={undefined}
        className={`z-50 flex flex-col bg-white shadow-xl outline-none ${
          isSheet
            ? 'fixed right-0 top-0 h-full w-[min(760px,100vw)] border-l border-zinc-200'
            : `fixed left-1/2 top-1/2 max-h-[85vh] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-lg border border-zinc-200 ${props.width ?? 'w-[min(560px,100vw)]'}`
        }`}
      >
        <header className="flex items-center justify-between border-b border-zinc-100 px-5 py-3">
          <DialogPrimitive.Title className="text-base font-semibold">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Close className="rounded px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100">
            ✕
          </DialogPrimitive.Close>
        </header>
        <div className={isSheet ? 'flex-1 overflow-auto px-5 py-4' : 'px-5 py-4'}>{children}</div>
        {footer !== undefined && (
          <footer className="flex items-center justify-end gap-2 border-t border-zinc-100 px-5 py-3">
            {footer}
          </footer>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}
