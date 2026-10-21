import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { SourceDrawer } from './SourceDrawer'

/**
 * M9 v1.6 **P4.4 · DL-20 的变异腿**（把「扫描模式」显示成空）。
 *
 * ## 它为什么单独一个文件
 *
 * ⚠️ `vi.mock` 是**按文件**生效的（会被提升到 import 之前）——
 *   若把它和正支放在同一个文件，整份文件都会跑在变异体上，正支就再也测不到真实现了。
 *   ⇒ 变异体必须独占一份文件。
 *
 * ## 变异的是什么
 *
 * §3.8.2 第 1 条：「当前路径必须**显式可见** —— 不许静默回退」。
 * ⇒ 变异体让 `describeScannerMode` **恒返回空串** ⇒ 界面上**看不出**这次用的是
 *   解析器还是启发式 ⇒ 回退变成静默回退。
 * 然后跑**与生产断言逐字相同**的那条检查 ⇒ 它必须红。
 * **若这里还是绿的，说明正支那条断言根本抓不住「静默回退」这种实现。**
 */
const { ROWS, SUMMARY } = vi.hoisted(() => ({
  ROWS: [
    {
      id: 1,
      scan_id: 1_730_000_000_000,
      topic_id: 42,
      topic_slug: 'go-concurrent',
      topic_title: 'Go 并发',
      lang: 'go' as const,
      file_rel_path: 'cmd/app/main.go',
      line: 42,
      col: 2,
      matched_pattern: 'go func() { fmt.Println("hi") }()',
      confidence: 'confirmed' as const,
      scanner_mode: 'parser' as const,
    },
  ],
  SUMMARY: {
    project_id: 'p1',
    scan_id: 1_730_000_000_000,
    languages: [
      {
        lang: 'python' as const,
        mode: 'parser' as const,
        toolchain: 'Python 3.15.0',
        file_count: 12,
        hit_count: 3,
        notice: null,
      },
      {
        lang: 'go' as const,
        mode: 'heuristic' as const,
        toolchain: null,
        file_count: 7,
        hit_count: 2,
        notice: '未检测到 Go 工具链 —— 已回退到启发式模式，识别可能不全。',
      },
    ],
    warnings: ['未检测到 Go 工具链 —— 已回退到启发式模式，识别可能不全。'],
    written: 5,
    unknown_slugs: [],
    states_updated: 2,
  },
}))

vi.mock('@openvibe/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@openvibe/shared')>()
  return {
    ...actual,
    // ⚠️ 变异：模式标签恒为空 ⇒ 界面上看不出走的是哪条路
    describeScannerMode: () => '',
  }
})

vi.mock('../../hooks/useLangSource', () => ({
  useLangFindings: () => ({ data: { findings: ROWS } }),
  useLangScan: () => ({ mutate: () => undefined, isPending: false, data: SUMMARY }),
  useLangConsent: () => ({
    data: { remember_all: false, remembered_at: null, shares: [] },
  }),
  useLangConsentMutations: () => ({
    set: { mutate: () => undefined },
    clear: { mutate: () => undefined },
  }),
}))

afterEach(cleanup)

describe('M9 P4.4 · DL-20 变异腿（模式标签恒空 ⇒ 静默回退）', () => {
  it('变异体下，生产断言「模式必须显式可见」必须红', () => {
    render(<SourceDrawer open onOpenChange={() => undefined} projectId="p1" />)
    const dialog = screen.getByRole('dialog')

    // ⚠️ **生产断言（与 `SourceDrawer.test.tsx` 的 ① 逐字相同）**：
    //   每一门语言都显示走的是哪条路。它在变异体下必须**取不到**。
    expect(() => within(dialog).getByText('完整解析（Python 3.15.0）')).toThrow()
    expect(within(dialog).queryByText('完整解析（Python 3.15.0）')).toBeNull()
    expect(within(dialog).queryByText('启发式模式')).toBeNull()
  })

  it('变异体下，**回退告警还在**但模式不见了（这正是「静默回退」的样子）', () => {
    render(<SourceDrawer open onOpenChange={() => undefined} projectId="p1" />)
    const dialog = screen.getByRole('dialog')

    // 告警还在（它走的是另一处渲染）⇒ 缺陷不是「没提示」，是「**看不出用的哪条路**」
    expect(within(dialog).getAllByText(/未检测到 Go 工具链/).length).toBeGreaterThan(0)
    expect(within(dialog).queryByText('启发式模式')).toBeNull()
  })
})
