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
const { ROWS, SUMMARY, SNIPPETS } = vi.hoisted(() => ({
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
    {
      // ⚠️ **读不到的那一条**（增强 2 的变异腿需要它在列表里，否则失败原因不会出现在界面上）
      id: 2,
      scan_id: 1_730_000_000_000,
      topic_id: 42,
      topic_slug: 'go-concurrent',
      topic_title: 'Go 并发',
      lang: 'go' as const,
      file_rel_path: 'cmd/app/main.go',
      line: 50,
      col: 2,
      matched_pattern: 'defer resp.Body.Close()',
      confidence: 'possible' as const,
      scanner_mode: 'heuristic' as const,
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
  SNIPPETS: [
    {
      finding_id: 1,
      path: 'cmd/app/main.go',
      start_line: 40,
      end_line: 42,
      lines: ['func main() {', 'go func() { fmt.Println("hi") }()', '}'],
      failure: null,
      topic_slug: 'go-concurrent',
      topic_title: 'Go 并发',
    },
    {
      finding_id: 2,
      path: 'cmd/app/main.go',
      start_line: 48,
      end_line: 51,
      // ⚠️ **读不到**（失败原因要**具体**，否则下面的变异腿是恒红而不是"变异导致红"）
      lines: null,
      failure: 'file_missing',
      topic_slug: 'go-concurrent',
      topic_title: 'Go 并发',
    },
  ],
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
  useLangSnippets: () => ({ data: { snippets: SNIPPETS } }),
  // ⚠️ **变异：AI 不可用** ⇒ T2 区**不渲染**（DL-08 的形态）
  useLangInterpretCapability: () => ({ data: { available: false, runner_id: null } }),
  useLangInterpretExport: () => ({ mutate: () => undefined, isPending: false }),
  useLangInterpret: () => ({ mutate: () => undefined, isPending: false, data: undefined }),
}))

// ⚠️ **变异（增强 2）**：把「读不到的原因」**塌成一个笼统的兜底文案**
//   ⇒ 界面分不清「文件被删了」与「路径越界」，用户也不知道该做什么。
vi.mock('./sourceFailureText', () => ({
  snippetFailureText: () => '读不到这个片段。',
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

describe('M9 P5 · DL-08 变异腿（AI 不可用 ⇒ T2 区不渲染）', () => {
  it('变异体下，生产断言「AI 可用时 T2 区必须渲染」必须红', () => {
    render(<SourceDrawer open onOpenChange={() => undefined} projectId="p1" />)
    const dialog = screen.getByRole('dialog')

    // ⚠️ **生产断言（与 `SourceDrawer.test.tsx` 的 ⑪ 逐字相同）**：
    //   AI 可用 ⇒ T2 区渲染。它在变异体下必须**取不到**。
    expect(() => within(dialog).getByRole('region', { name: 'AI 解读' })).toThrow()
    expect(within(dialog).queryByRole('region', { name: 'AI 解读' })).toBeNull()
  })

  it('变异体下，**T0/T1 仍然照常**（DL-08 的主体：AI 挂了不影响确定性层）', () => {
    render(<SourceDrawer open onOpenChange={() => undefined} projectId="p1" />)
    const dialog = screen.getByRole('dialog')

    // ⚠️ 命中列表 ＋ 勾选框 ＋ 片段内容**都还在**
    expect(within(dialog).getAllByRole('checkbox').length).toBeGreaterThan(0)
    expect(within(dialog).getAllByText('将要发送的内容').length).toBeGreaterThan(0)
  })
})

describe('M9 增强 2 · 变异腿（失败原因塌成一个笼统兜底）', () => {
  it('变异体下，生产断言「必须显示**具体原因**」必须红', () => {
    render(<SourceDrawer open onOpenChange={() => undefined} projectId="p1" />)
    const dialog = screen.getByRole('dialog')

    // ⚠️ **生产断言（与 `SourceDrawer.test.tsx` 的 ⑭ 逐字相同）**：
    //   这条命中的失败原因是「文件不在了」⇒ 界面必须说这件事。
    expect(() => within(dialog).getByText(/文件已经不在了/)).toThrow()
    expect(within(dialog).queryByText(/文件已经不在了/)).toBeNull()
  })

  it('变异体下，**笼统兜底出现了**（证明变异真的改了文本，不是恒红）', () => {
    render(<SourceDrawer open onOpenChange={() => undefined} projectId="p1" />)
    const dialog = screen.getByRole('dialog')

    // ⚠️ **守卫自证**：变异若没生效，上面那条会**恒红**（正支也红）⇒
    //   这里断言「变后的文本确实出现在界面上」。
    expect(within(dialog).getAllByText('读不到这个片段。').length).toBeGreaterThan(0)
  })
})
