import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { SourceDrawer } from './SourceDrawer'

/**
 * M9 v1.6 **P4.4 出口 · DL-20**（`m9-dev-plan-2026-10.md` §6.10 P4.4 ·
 * `m9-dev-language-roadmap.md` §3.8 / §3.8.2 / §7）。
 *
 * ## 它断什么
 *
 * | 判据 | 一句话 | 本文件里对应的那支 |
 * |---|---|---|
 * | **DL-20** | **扫描模式必须显式可见**（不许静默回退） | ① ② |
 * | **§3.8** | T1 **默认全不勾**（只有勾过的片段才允许出网） | ③ ④ |
 * | **§3.8.2** | 两档**不混**（已确认 / 可能分节） | ⑤ |
 *
 * ## ⚠️ hook 被**替掉**了（不是网络）
 *
 * 抽屉的数据来自 react-query 的四个 hook ⇒ 测试里 `vi.mock` 掉它们，
 * 直接喂**已落库的形状**（`SourceFindingRow` / `LangScanSummary`）。
 * ⇒ 测的是**界面形态**（DL-20 那条本来就是「界面形态已跑」那一档），
 *   数据链路由 `apps/server/test/langSource.api.test.ts` 断。
 */
const { ROWS, SUMMARY, SNIPPETS, CAPABILITY, INTERPRET, EXPORT_MUTATE } = vi.hoisted(() => ({
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
  // ⚠️ T1 硬要求：勾选前要看到「将要发送的确切内容」⇒ 片段**常驻显示**
  SNIPPETS: [
    {
      finding_id: 1,
      path: 'cmd/app/main.go',
      start_line: 40,
      end_line: 44,
      // ⚠️ 窗口里**不含**另一条命中的那行（否则「两档不混」那支的断言会被
      //   **上下文**而不是**归属**触发 —— 那是两种不同的错）
      lines: ['func main() {', '\tgo func() { fmt.Println("hi") }()', '}'],
      topic_slug: 'go-concurrent',
      topic_title: 'Go 并发',
    },
    {
      finding_id: 2,
      path: 'cmd/app/main.go',
      start_line: 48,
      end_line: 51,
      // ⚠️ **读不到** ⇒ 界面必须禁用它的勾选框（看不见内容就不许勾）
      lines: null,
      // ⚠️ **增强 2**：读不到要**说清为什么**（不是笼统的「读不到」）
      failure: 'file_missing' as const,
      topic_slug: 'go-concurrent',
      topic_title: 'Go 并发',
    },
  ],
  CAPABILITY: { available: true, runner_id: 'fake-runner' },
  EXPORT_MUTATE: vi.fn(),
  INTERPRET: {
    status: 'ok',
    project_id: 'p1',
    fragment_count: 1,
    item_count: 1,
    risk_count: 1,
    divergence_count: 1,
    divergences: [
      { topic_slug: 'go-concurrent', deterministic_state: 'unused', ai_state: 'mastered' },
    ],
    items: [
      {
        topic_slug: 'go-concurrent',
        summary: '这里起了一个 goroutine',
        risks: ['goroutine 没有等待，可能泄漏'],
        claim_state: 'mastered',
      },
    ],
    input_hash: 'abcdef0123456789',
    provider: 'sensenova',
    usage: { prompt_tokens: 1200, completion_tokens: 340, total_tokens: 1540 },
    failure_reason: null,
  },
}))

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
  useLangInterpretCapability: () => ({ data: CAPABILITY }),
  useLangInterpretExport: () => ({ mutate: EXPORT_MUTATE, isPending: false }),
  useLangInterpret: () => ({
    mutate: () => undefined,
    isPending: false,
    data: INTERPRET,
  }),
}))

afterEach(cleanup)

function open(projectId: string | null = 'p1'): HTMLElement {
  render(<SourceDrawer open onOpenChange={() => undefined} projectId={projectId} />)
  return screen.getByRole('dialog')
}

describe('M9 P4.4 · DL-20 扫描模式显式可见', () => {
  it('① 每一门语言都显示**走的是哪条路**（解析器带工具链版本）', () => {
    const dialog = open()
    expect(within(dialog).getByText('完整解析（Python 3.15.0）')).toBeTruthy()
    expect(within(dialog).getByText('启发式模式')).toBeTruthy()
  })

  it('② ⚠️ 回退时**告警必须出现在界面上**（§3.8.2 第 1 条：不许静默回退）', () => {
    const dialog = open()
    // 告警出现**两次**也不为过（模式行旁一次、汇总区一次）⇒ 只断言「在」
    expect(
      within(dialog).getAllByText(/未检测到 Go 工具链/).length,
      '回退告警必须显式出现在界面上',
    ).toBeGreaterThan(0)
  })

  it('③ 默认**全不勾**（T1 的保护线：默认不发）', () => {
    const dialog = open()
    const boxes = within(dialog).getAllByRole('checkbox') as HTMLInputElement[]
    expect(boxes.length).toBe(2)
    for (const b of boxes) expect(b.checked).toBe(false)
    expect(within(dialog).getByText('已勾 0 / 2 条')).toBeTruthy()
  })

  it('④ 勾一条 ⇒ 只有那一条被勾上（逐条控制，不是「全选」）', () => {
    const dialog = open()
    const boxes = within(dialog).getAllByRole('checkbox') as HTMLInputElement[]
    fireEvent.click(boxes[0] as HTMLInputElement)
    const after = within(dialog).getAllByRole('checkbox') as HTMLInputElement[]
    expect(after[0]?.checked).toBe(true)
    expect(after[1]?.checked).toBe(false)
    expect(within(dialog).getByText('已勾 1 / 2 条')).toBeTruthy()
  })

  it('⑤ 两档**不混**：已确认 / 可能分属两个小节', () => {
    const dialog = open()
    const confirmed = within(dialog).getByRole('region', { name: '已确认' })
    const possible = within(dialog).getByRole('region', { name: '可能' })
    expect(within(confirmed).getAllByRole('checkbox')).toHaveLength(1)
    expect(within(possible).getAllByRole('checkbox')).toHaveLength(1)
    // ⚠️ 「可能」那一档**不许**混进「已确认」的小节
    expect(within(confirmed).queryByText(/defer resp.Body.Close\(\)/)).toBeNull()
    expect(within(possible).getByText(/defer resp.Body.Close\(\)/)).toBeTruthy()
  })

  it('⑥ 记忆三选一 + 清除入口都在（DL-21 的界面侧）', () => {
    const dialog = open()
    expect(within(dialog).getByText('不记')).toBeTruthy()
    expect(within(dialog).getByText('记住「全发」')).toBeTruthy()
    expect(within(dialog).getByText('记住「全不发」')).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: '清除记忆' })).toBeTruthy()
  })

  it('⑦ 没选项目 ⇒ 明确提示「先选一个项目」（不许静默扫错项目）', () => {
    const dialog = open(null)
    expect(within(dialog).getByText(/先选一个项目/)).toBeTruthy()
    // ⚠️ 没选项目时**不许**出现「扫描这个项目」按钮（点了也不知道扫谁）
    expect(within(dialog).queryByRole('button', { name: /扫描这个项目/ })).toBeNull()
  })

  it('⑧ 导出清单的链接指向**当前项目**（DL-22 的入口）', () => {
    const dialog = open('p1')
    const link = within(dialog).getByRole('link', { name: /导出清单/ }) as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/api/lang/source/export?project=p1')
  })
})

describe('M9 P5 · T1 硬要求：勾选前要看到「将要发送的确切内容」', () => {
  it('⑨ 每条命中都**常驻显示**它的片段正文（不是点开才有）', () => {
    const dialog = open('p1')
    expect(within(dialog).getAllByText('将要发送的内容').length).toBeGreaterThan(0)
    // ⚠️ 正文真的在 DOM 里（不是一句描述）
    // ⚠️ 用 `getAllByText`：同一段文字在**片段正文**与**模式串**两处都出现
    expect(
      within(dialog).getAllByText(/go func\(\) \{ fmt\.Println\("hi"\) \}\(\)/).length,
    ).toBeGreaterThan(0)
  })

  it('⑩ ⚠️ **读不到内容**的命中 ⇒ 勾选框**禁用**（看不见内容就不许勾）', () => {
    const dialog = open('p1')
    const boxes = within(dialog).getAllByRole('checkbox') as HTMLInputElement[]
    const readable = boxes.filter((b) => !b.disabled)
    const unreadable = boxes.filter((b) => b.disabled)
    expect(readable.length).toBeGreaterThan(0)
    expect(unreadable.length).toBeGreaterThan(0)
  })

  it('⑭ ⚠️ **增强 2**：读不到时显示的是**具体原因**（不是笼统的「读不到」）', () => {
    const dialog = open('p1')
    // ⚠️ **生产断言**（与 `SourceDrawer.mutant.test.tsx` 里那条逐字相同）：
    //   这条命中的失败原因是「文件不在了」⇒ 界面必须说这件事。
    expect(within(dialog).getByText(/文件已经不在了/)).toBeTruthy()
  })
})

describe('M9 增强 4 · 解读结果可导出（用户主动动作）', () => {
  it('⑮ T2 区有「保存这次解读」按钮，点了就把当次结果交给导出', () => {
    const dialog = open('p1')
    const region = within(dialog).getByRole('region', { name: 'AI 解读' })
    const button = within(region).getByRole('button', { name: /保存这次解读/ })
    fireEvent.click(button)
    // ⚠️ 导出**拿到的是当次结果**（不是空、不是别的东西）
    expect(EXPORT_MUTATE).toHaveBeenCalled()
    expect(EXPORT_MUTATE.mock.calls[0]?.[0]).toMatchObject({ status: 'ok', project_id: 'p1' })
  })
})

describe('M9 P5 · DL-08 / DL-09 · T2 解读区', () => {
  it('⑪ AI 可用 ⇒ T2 区渲染（有解读按钮 ＋ 提示）', () => {
    const dialog = open('p1')
    const region = within(dialog).getByRole('region', { name: 'AI 解读' })
    expect(within(region).getByRole('button', { name: /解读勾选的片段/ })).toBeTruthy()
    expect(within(region).getByText(/只把你勾过的片段发出去/)).toBeTruthy()
  })

  it('⑫ ⚠️ DL-09：分歧**两处并列**（判定层的说法 ＋ AI 的声称都要显示）', () => {
    const dialog = open('p1')
    const region = within(dialog).getByRole('region', { name: 'AI 解读' })
    // ⚠️ 两边都在
    expect(within(region).getByText(/确定性层：unused/)).toBeTruthy()
    expect(within(region).getByText(/AI 声称：mastered/)).toBeTruthy()
  })

  it('⑬ 解读结果与风险点都显示（**只展示不留存** ⇒ 结果在界面上）', () => {
    const dialog = open('p1')
    const region = within(dialog).getByRole('region', { name: 'AI 解读' })
    expect(within(region).getByText('这里起了一个 goroutine')).toBeTruthy()
    expect(within(region).getByText(/goroutine 没有等待，可能泄漏/)).toBeTruthy()
  })
})
