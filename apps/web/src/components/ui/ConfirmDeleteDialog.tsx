import type { ReactNode } from 'react'
import { zh } from '../../i18n/zh'
import { Dialog, DialogPanel } from './Dialog'
import { toast } from './Toaster'
import { btnDanger, btnGhost } from './styles'

/**
 * 删除确认框的统一外壳：右侧「取消」+ 左侧危险色「确认删除」。
 *
 * 七个台账页此前各写一份同样的 Dialog/DialogPanel 骨架，差异只在标题、确认文案、
 * 是否 pending、以及确认后的副作用（toast、联动清理选中项）——副作用的**文案**留在
 * 调用点，回执的**顺序与分支**收在 `deleteReceipts`（见下），骨架收在这里，
 * 避免「取消按钮忘了接 onClose」这类漂移。
 */
export function ConfirmDeleteDialog(props: {
  open: boolean
  onClose: () => void
  title: string
  confirmLabel: string
  /** 删除请求进行中：禁用确认键，防止重复提交 */
  pending: boolean
  onConfirm: () => void
  children: ReactNode
}) {
  return (
    <Dialog open={props.open} onOpenChange={(o) => (o ? undefined : props.onClose())}>
      <DialogPanel
        title={props.title}
        footer={
          <>
            <button className={btnGhost} onClick={props.onClose}>
              {zh.editor.cancel}
            </button>
            <button className={btnDanger} disabled={props.pending} onClick={props.onConfirm}>
              {props.confirmLabel}
            </button>
          </>
        }
      >
        {props.children}
      </DialogPanel>
    </Dialog>
  )
}

/**
 * 删除请求的回执三件套 —— 提示条文案与确认框同域，故与它同住一文：
 *
 *  1. 成功提示；
 *  2. 服务端 `X-Referenced-Packs` 响应头非空 ⇒ 该条目被标准包引用过，**必须单独警示**
 *     （只报「已删除」，用户会以为连引用一起清了）；
 *  3. 关闭确认框。
 *
 * 提示词 / 词条 / 技巧三页此前各抄一份；分支写漏一处，就会出现「有的页不报引用」。
 */
export function deleteReceipts(opts: {
  done: string
  referenced: (packs: string) => string
  close: () => void
}): { onSuccess: (packs: string | null) => void; onError: (e: Error) => void } {
  return {
    onSuccess: (packs) => {
      toast(opts.done)
      if (packs !== null && packs !== '') toast(opts.referenced(packs), 'error')
      opts.close()
    },
    onError: (e) => toast(e.message, 'error'),
  }
}
