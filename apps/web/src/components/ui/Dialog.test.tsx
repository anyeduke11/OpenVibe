import { describe, expect, it, afterEach } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { Dialog, DialogPanel } from './Dialog'
import { Toaster, toast } from './Toaster'

// 这支文件的存在理由：toast 的关闭键与弹窗 footer 的关闭键**可见文本同为「关闭」**，
// 驱动器（docs/devlog-evidence/DEV-0025/three-smokes.mjs 的 dlgBtnExpr）因此必须按
// [role="dialog"] 作用域查。这里钉的是另一件事——三者的**可访问名**必须互不相同，
// 否则将来任何按 role+name 定位的自动化都会静默点错。

describe('关闭语义的可访问名', () => {
  afterEach(cleanup)

  it('弹窗头部 ✕ 有可访问名「关闭弹窗」', () => {
    render(
      <Dialog open>
        <DialogPanel title="导入提示词">正文</DialogPanel>
      </Dialog>,
    )
    expect(screen.getAllByRole('button', { name: '关闭弹窗' })).toHaveLength(1)
  })

  it('toast 与弹窗同时在场时，三个关闭名各自唯一', () => {
    render(
      <>
        <Toaster />
        <Dialog open>
          <DialogPanel title="导入提示词" footer={<button type="button">关闭</button>}>
            正文
          </DialogPanel>
        </Dialog>
      </>,
    )
    // toast() 走模块级 push → setState，落在 render 的 act 之外，不包一层就还没 flush 到 DOM。
    act(() => toast('导入完成：新建 1 条，跳过 0 条'))
    // hidden: true 不是放宽，是收紧：模态弹窗开着时 Radix 的 hideOthers 会给 toast 那棵树
    // 套上 aria-hidden="true"，默认的 role 查询直接把 toast 关闭键整个剔掉——那样
    // name:'关闭' 只命中 1 个就是靠 aria-hidden 蒙对的，删掉 toast 的 aria-label 也照样绿。
    // 要钉的是「可访问名互不撞车」，跟模态层不隐藏与否无关，故按全量 DOM 查。
    // hidden: true 的地基：模态开着时 Radix 的 hideOthers 会给非弹窗子树套 aria-hidden，
    // 所以默认的 role 查询看不见 toast 那颗。把这件事本身钉成断言——将来 hideOthers 行为变了，
    // 先红的是这一条，而不是「name:'关闭' 命中 1」那条静默失去牙齿的断言。
    const toastHidden = [...document.body.querySelectorAll('[aria-hidden="true"]')].some((el) =>
      [...el.querySelectorAll('button')].some((b) => b.getAttribute('aria-label') === '关闭提示'),
    )
    expect(toastHidden).toBe(true)
    expect(screen.getAllByRole('button', { name: '关闭弹窗', hidden: true })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: '关闭提示', hidden: true })).toHaveLength(1)
    // footer 那颗没有 aria-label，可访问名就是它的文本；toast 那颗有 aria-label，
    // 所以不会被 name:'关闭' 算进来——这正是「改可访问名」 buys 到的东西。
    expect(screen.getAllByRole('button', { name: '关闭', hidden: true })).toHaveLength(1)
  })

  it('按可见文本查「关闭」仍会多命中：作用域限定不能被省掉', () => {
    render(
      <>
        <Toaster />
        <Dialog open>
          <DialogPanel title="导入提示词" footer={<button type="button">关闭</button>}>
            正文
          </DialogPanel>
        </Dialog>
      </>,
    )
    act(() => toast('导入完成：新建 1 条，跳过 0 条'))
    // 查 document.body 而不是 render 返回的 container：DialogPanel 与 toast 都 portal 到 body
    // 末尾，container 里一颗按钮都没有。
    // 这条钉的是「按可见文本查『关闭』必然多命中（toast 那颗 + footer 那颗）」——
    // 正是驱动器 three-smokes.mjs 的 dlgBtnExpr 必须带 [role="dialog"] 前缀的原因，
    // 改可访问名之后也不能省。
    const byText = [...document.body.querySelectorAll('button')].filter(
      (b) => (b.textContent ?? '').trim() === '关闭',
    )
    // 内外各一颗且总数恰为 2：多一颗少一颗都要红——弹窗内那颗才是驱动器
    // three-smokes.mjs 的 dlgBtnExpr 必须带 [role="dialog"] 前缀的真正凭据。
    const inside = byText.filter((b) => b.closest('[role="dialog"]') !== null)
    expect(inside).toHaveLength(1)
    expect(byText).toHaveLength(2)
  })
})
