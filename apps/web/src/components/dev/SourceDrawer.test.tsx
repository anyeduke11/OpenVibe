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
