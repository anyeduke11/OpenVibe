import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ApiError } from '../../api/client'
import { ErrorDetail, detailOf } from './ErrorDetail'

// ⚠️ **显式 cleanup**（与仓内其它 web 测试同款）：testing-library 不自动清理，
// 上一支 render 留下的 DOM 会让下一支的 `getByRole('button')` 命中多个。
afterEach(() => {
  cleanup()
})

/**
 * 诊断原文（detail）的**界面行为**。
 *
 * ## 钉的是什么意图
 *
 * ① **折叠**：诊断原文是排障用的，不是结论。铺在错误文案下面会让界面
 *    「一眼看上去全是英文」——那正是本仓要避免的形态（中文优先，DESIGN.md Overview）。
 *    所以它必须**默认收起**、点开才见。
 * ② **两通道不混**：中文人话（message）与英文诊断（detail）在界面上是**两段**，
 *    不是一段混排。
 * ③ **无诊断不生位**：没有 detail 时**不渲染任何东西**——不留空按钮、
 *    不留空壳（那会让界面出现「有话没说」的空档）。
 */
describe('ErrorDetail · 诊断原文的折叠展示', () => {
  it('默认收起：原文不在 DOM 里，只有展开按钮', () => {
    render(<ErrorDetail detail="EACCES: permission denied" />)
    expect(screen.queryByText('EACCES: permission denied')).toBeNull()
    expect(screen.getByRole('button')).toBeTruthy()
  })

  it('点开才见原文，且能再收起', () => {
    render(<ErrorDetail detail="EACCES: permission denied" />)
    const button = screen.getByRole('button')
    fireEvent.click(button)
    expect(screen.getByText('EACCES: permission denied')).toBeTruthy()
    fireEvent.click(button)
    expect(screen.queryByText('EACCES: permission denied')).toBeNull()
  })

  it('展开状态由 aria-expanded 表达（屏幕阅读器可读）', () => {
    render(<ErrorDetail detail="EACCES: permission denied" />)
    const button = screen.getByRole('button')
    expect(button.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('true')
  })

  it('没有 detail ⇒ 什么都不渲染（不留空按钮）', () => {
    const { container } = render(<ErrorDetail detail={undefined} />)
    expect(container.innerHTML).toBe('')
  })

  it('detail 为空串 ⇒ 同样什么都不渲染', () => {
    const { container } = render(<ErrorDetail detail="" />)
    expect(container.innerHTML).toBe('')
  })
})

/**
 * `detailOf` 的取数口径。
 *
 * ⚠️ **只认 `ApiError`**：诊断原文是 `api/client.ts` 边界上的**契约**
 * （server 错误体的 `detail` ⇒ `ApiError.detail`）。别的 Error 没有这个通道，
 * 它的 `message` 就是全部内容——拿一个不存在的 `detail` 出来是编造。
 */
describe('detailOf · 只从 ApiError 取诊断原文', () => {
  it('ApiError ⇒ 取它的 detail', () => {
    const err = new ApiError(502, 'REMOTE_UNREACHABLE', '请求远端失败', undefined, 'fetch failed')
    expect(detailOf(err)).toBe('fetch failed')
  })

  it('ApiError 没有 detail ⇒ undefined（不编造）', () => {
    const err = new ApiError(404, 'NOT_FOUND', '项目不存在')
    expect(detailOf(err)).toBeUndefined()
  })

  it('普通 Error ⇒ undefined（它没有诊断通道）', () => {
    expect(detailOf(new Error('boom'))).toBeUndefined()
  })

  it('非 Error 值 ⇒ undefined', () => {
    expect(detailOf('boom')).toBeUndefined()
    expect(detailOf(null)).toBeUndefined()
  })
})
