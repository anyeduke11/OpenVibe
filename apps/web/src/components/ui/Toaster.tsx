import * as ToastPrimitive from '@radix-ui/react-toast'
import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '../../api/client'
import { ErrorDetail } from './ErrorDetail'

interface Message {
  id: number
  text: string
  tone: 'info' | 'error'
  /**
   * 诊断原文（允许英文：Node 的 errno 消息、第三方库的英文原文）。
   *
   * 与 `text` 分通道：`text` 是中文人话，`detail` 是排障依据。
   * 缺省即不产生该字段——绝大多数提示没有诊断原文。
   */
  detail?: string
}

let seq = 0
let push: (msg: Message) => void = () => undefined

/**
 * 全局错误/结果提示（dev-plan §5.3「错误统一 toast」）；组件树外亦可调用。
 *
 * @param detail 诊断原文（允许英文）。**给了它，这条 toast 就不自动消失**——
 *   需要排障的错误不该在 4 秒后消失（诊断信息随它一起没了）。
 */
export function toast(text: string, tone: 'info' | 'error' = 'info', detail?: string): void {
  seq += 1
  push({ id: seq, text, tone, ...(detail !== undefined && detail !== '' ? { detail } : {}) })
}

/**
 * 错误提示的统一入口：中文人话 + 英文诊断原文分两路。
 *
 * ⚠️ **为什么不让调用点自己写 `toast(e.message, 'error', e.detail)`**：
 * 那样每个调用点都要记得带 detail，漏一处就丢一次排障依据。
 * 这里从错误对象里取，调用点只管调 `toastError(e)`。
 *
 * ⚠️ **只认 `ApiError`**：诊断原文是 `api/client.ts` 边界上的契约
 * （server 错误体的 `detail` ⇒ `ApiError.detail`）。别的 Error 没有这个通道，
 * 它的 `message` 就是全部内容。
 */
export function toastError(error: unknown): void {
  if (error instanceof ApiError) {
    toast(error.message, 'error', error.detail)
    return
  }
  toast(error instanceof Error ? error.message : '未知错误', 'error')
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
          // 有诊断原文的常驻（用户要能点开看）；没有的仍 4 秒自动走
          duration={m.detail === undefined ? 4000 : Number.POSITIVE_INFINITY}
          className={`mb-2 flex max-w-sm flex-col items-start gap-2 rounded-md border px-4 py-3 text-sm shadow-lg ${
            m.tone === 'error'
              ? 'border-danger-line bg-danger-soft text-danger'
              : 'border-line bg-panel text-ink-body'
          }`}
        >
          <div className="flex w-full items-center gap-3">
            <ToastPrimitive.Title className="font-normal">{m.text}</ToastPrimitive.Title>
            <ToastPrimitive.Close
              className="ml-auto text-xs opacity-60 hover:opacity-100"
              aria-label="关闭提示"
              onClick={() => dismiss(m.id)}
            >
              关闭
            </ToastPrimitive.Close>
          </div>
          {/* 诊断原文折叠在下方：排障要它，平时不该抢视线 */}
          <ErrorDetail detail={m.detail} />
        </ToastPrimitive.Root>
      ))}
      <ToastPrimitive.Viewport className="fixed bottom-0 right-0 z-50 w-full max-w-sm p-4 outline-none" />
    </ToastPrimitive.Provider>
  )
}
