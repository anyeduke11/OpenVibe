import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ADAPTER_IDS } from '@openvibe/shared'
import { InstallGuide } from './InstallGuide'
import { AGENT_ADAPTER_LABELS } from '../../i18n/lane-agent'

/**
 * 接入指引的多选判据（owner 增强项「一键接入各种自选 Agent」）。
 *
 * 断言意图而非表象：
 * - **多选真的生效**：勾两个平台 ⇒ 脚本里两条 `--target` 都在（不是只留最后一个）；
 * - **清单不硬编码**：芯片数 == `ADAPTER_IDS.length`（FR-5.1.4.1 的界面侧）；
 * - **不给错命令**：项目未登记路径 ⇒ 脚本里没有 `openvibe sync`；
 * - **一键复制**：点复制 ⇒ 剪贴板收到的是整段脚本。
 */

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function renderGuide(projectPath: string | null = '/Users/x/proj'): void {
  render(<InstallGuide projectPath={projectPath} />)
}

describe('InstallGuide · 多选平台', () => {
  it('芯片清单来自 ADAPTER_IDS（不硬编码平台名）', () => {
    renderGuide()
    for (const id of ADAPTER_IDS) {
      expect(screen.getByRole('button', { name: AGENT_ADAPTER_LABELS[id] })).toBeTruthy()
    }
  })

  it('默认选中 claude-code，脚本里带它的 --target', () => {
    renderGuide()
    const pre = document.querySelector('pre')
    expect(pre?.textContent).toContain('--target claude-code')
  })

  it('⚠️ 勾第二个平台 ⇒ 脚本里两条 --target 都在（多选真的生效，不是覆盖）', () => {
    renderGuide()
    const cursor = screen.getByRole('button', { name: AGENT_ADAPTER_LABELS.cursor })
    fireEvent.click(cursor)
    const text = document.querySelector('pre')?.textContent ?? ''
    expect(text).toContain('--target claude-code')
    expect(text).toContain('--target cursor')
  })

  it('全选 ⇒ 六个平台都在脚本里；再点变清空', () => {
    renderGuide()
    fireEvent.click(screen.getByRole('button', { name: '全选' }))
    const all = document.querySelector('pre')?.textContent ?? ''
    for (const id of ADAPTER_IDS) expect(all).toContain(`--target ${id}`)

    fireEvent.click(screen.getByRole('button', { name: '清空' }))
    expect(screen.getByText('先选一个平台。')).toBeTruthy()
  })

  it('未选任何平台 ⇒ 复制按钮禁用（不给半截脚本）', () => {
    renderGuide()
    // 按钮是「全选 / 清空」二态：先全选（此时标签变「清空」），再清空
    fireEvent.click(screen.getByRole('button', { name: '全选' }))
    fireEvent.click(screen.getByRole('button', { name: '清空' }))
    expect(screen.getByRole('button', { name: '复制接入脚本' })).toHaveProperty('disabled', true)
  })
})

describe('InstallGuide · 不给错命令', () => {
  it('⚠️ 项目未登记路径 ⇒ 脚本里没有 openvibe sync（缺路径的命令是错的命令）', () => {
    renderGuide(null)
    const text = document.querySelector('pre')?.textContent ?? ''
    expect(text).not.toContain('openvibe sync')
    expect(text).toContain('未登记本地路径')
  })
})

describe('InstallGuide · 一键复制', () => {
  it('点复制 ⇒ 剪贴板收到整段脚本（含 sync 与 MCP 配置）', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    renderGuide()

    fireEvent.click(screen.getByRole('button', { name: '复制接入脚本' }))
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    const copied = writeText.mock.calls[0]?.[0] ?? ''
    expect(copied).toContain(`openvibe sync '/Users/x/proj'`)
    expect(copied).toContain('mcpServers')
  })
})
