import * as ToastPrimitive from '@radix-ui/react-toast'
import { useCallback, useEffect, useState } from 'react'

interface Message {
  id: number
  text: string
  tone: 'info' | 'error'
}

let seq = 0
let push: (msg: Message) => void = () => undefined

/** 全局错误/结果提示（dev-plan §5.3「错误统一 toast」）；组件树外亦可调用 */
export function toast(text: string, tone: 'info' | 'error' = 'info'): void {
  seq += 1
  push({ id: seq, text, tone })
}

export function Toaster() {
  const [queue, setQueue] = useState<Message[]>([])

  useEffect(() => {
    push = (msg) => {
      setQueue((prev) => [...prev, msg])
    }
    return () => {
      push = () => undefined
    }
  }, [])

  const dismiss = useCallback((id: number) => {
    setQueue((prev) => prev.filter((m) => m.id !== id))
  }, [])

  return (
    <ToastPrimitive.Provider swipeDirection="right">
      {queue.map((m) => (
        // Viewport 负责定位，Root 只排版——多条 toast 才能纵向堆叠
        <ToastPrimitive.Root
          key={m.id}
          defaultOpen
          onOpenChange={(next) => {
            if (!next) dismiss(m.id)
          }}
          duration={4000}
          className={`mb-2 flex max-w-sm items-center gap-3 rounded-md border px-4 py-3 text-sm shadow-lg ${
            m.tone === 'error'
              ? 'border-red-200 bg-red-50 text-red-800'
              : 'border-zinc-200 bg-white text-zinc-800'
          }`}
        >
          <ToastPrimitive.Title className="font-normal">{m.text}</ToastPrimitive.Title>
          <ToastPrimitive.Close
            className="text-xs opacity-60 hover:opacity-100"
            aria-label="关闭提示"
            onClick={() => dismiss(m.id)}
          >
            关闭
          </ToastPrimitive.Close>
        </ToastPrimitive.Root>
      ))}
      <ToastPrimitive.Viewport className="fixed bottom-0 right-0 z-50 w-full max-w-sm p-4 outline-none" />
    </ToastPrimitive.Provider>
  )
}
