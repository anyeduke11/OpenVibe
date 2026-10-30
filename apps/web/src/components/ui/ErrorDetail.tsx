import { useState } from 'react'
import { ApiError } from '../../api/client'
import { Icon } from './icons'

/**
 * **诊断原文**（英文机器串）的展示位。
 *
 * ## 为什么有这一件
 *
 * 错误有**两个通道**：`message` 是中文人话（用户看到的那句），
 * `detail` 是诊断原文（`EACCES: permission denied` / `getaddrinfo ENOTFOUND …`）。
 *
 * 两者必须分开，但**都不能丢**：
 *  - 混在一起 ⇒ 中文界面漏出英文机器串（本仓明令禁止的那件事）；
 *  - 只留 message ⇒ 排障失去依据（用户看到「无法连接本地服务」，
 *    但不知道是 DNS 挂了还是端口没监听）。
 *
 * ## 为什么是折叠而不是直接显示
 *
 * 诊断原文是**排障用**的，不是**结论**。直接铺在错误文案下面会让界面
 * 「一眼看上去全是英文」——那正是本仓要避免的形态。折叠起来：
 * 平时是中文一句话，需要时点开看原文。
 *
 * ## 视觉口径（DESIGN.md）
 *
 * - 正文用 `ink-muted`（次要说明，可承载长文本）——**不用 `ink-faint`**：
 *   DESIGN.md Readability Contract 明确「`ink-faint` 只承载元信息，
 *   不承载长文本」，诊断原文是长文本。
 * - 底色用 `panel-2`（纸面档）而**不用 `*-soft`**：`ink-faint` 落 `-soft`
 *   容器在暖夜下会掉到 4.29:1（低于 AA），诊断原文承载长文本更不能踩。
 * - mono 变体给代码/路径/命令（DESIGN.md 排印段：`.mono` 给指纹/路径/命令）。
 */
export function ErrorDetail(props: { detail?: string | undefined; label?: string }) {
  const [open, setOpen] = useState(false)
  const detail = props.detail
  if (detail === undefined || detail === '') return null
  const label = props.label ?? '诊断原文'

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-[12.5px] text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {/* `fwd` 图标旋转 90° 当展开箭头用——不新增图标（theme.md §6.5：入口余量紧，
            未用到的图标才进产物，新图标会白占体积） */}
        <Icon name="fwd" size={12} className={open ? 'rotate-90' : ''} />
        {open ? '收起' : label}
      </button>
      {open && (
        <pre className="mono mt-1 max-w-[68ch] overflow-x-auto whitespace-pre-wrap break-words rounded-sm border border-line-hair bg-panel-2 px-2.5 py-2 text-[12.5px] leading-[1.7] text-ink-muted">
          {detail}
        </pre>
      )}
    </div>
  )
}

/**
 * 从任意错误对象里取出诊断原文。
 *
 * ⚠️ **只认 `ApiError`**：诊断原文是 `api/client.ts` 边界上的**契约**
 * （server 错误体的 `detail` 字段 ⇒ `ApiError.detail`），别的 Error
 * 没有这个通道，`error.message` 就是它全部的内容。
 */
export function detailOf(error: unknown): string | undefined {
  return error instanceof ApiError ? error.detail : undefined
}
