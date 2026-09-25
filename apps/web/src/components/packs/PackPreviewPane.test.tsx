import { describe, expect, it, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PreviewOut } from '@openvibe/shared'
import { PackPreviewPane } from './PackPreviewPane'

// 这三支夹具的字节数刻意取 1024 / 512：`sizeFor` 走 `utf8ByteLength(content)/1024`，
// 整数 kB 才钉得住「前端不再加工字节」这条（1500 字符会连 kB 舍入一起测）。
const AGENTS = { path: 'AGENTS.md', sha256: 'a'.repeat(64), content: 'a'.repeat(1024) }
const CLAUDE = { path: 'CLAUDE.md', sha256: 'b'.repeat(64), content: 'b'.repeat(512) }

const FOOTPRINT = {
  files: [
    { path: 'AGENTS.md', approxTokens: 250 },
    { path: 'CLAUDE.md', approxTokens: 125 },
  ],
  approxTokens: 375,
  bytes: 1536,
}

const PER_TARGET = [
  {
    adapter: 'claude-code',
    files: FOOTPRINT.files,
    approxTokens: 15213,
    warn: true,
  },
  {
    adapter: 'cursor',
    files: FOOTPRINT.files,
    approxTokens: 900,
    warn: false,
  },
]

function previewOf(sizeEstimate?: PreviewOut['sizeEstimate']): PreviewOut {
  return {
    files: [AGENTS, CLAUDE],
    fingerprint: 'f'.repeat(64),
    warnings: [],
    coveredPlatforms: [],
    ...(sizeEstimate === undefined ? {} : { sizeEstimate }),
  }
}

const WITH_SIZE = { perTarget: PER_TARGET, footprint: FOOTPRINT }

afterEach(cleanup)

describe('WEB-PREVIEW · 体量显示块（T8 四处未验渲染的正腿）', () => {
  it('01 文件树体量列：每行 kB 由 content 字节算出，tok 由 footprint 同路径查出', () => {
    render(<PackPreviewPane preview={previewOf(WITH_SIZE)} />)
    expect(screen.getByText('1.0kB · ≈250 tok')).toBeTruthy()
    expect(screen.getByText('0.5kB · ≈125 tok')).toBeTruthy()
  })

  it('02 perTarget 成本条 + 足迹行：warn=false 的平台照样出数，两个视图不并成一个数', () => {
    render(<PackPreviewPane preview={previewOf(WITH_SIZE)} />)
    expect(screen.getByText('claude-code ≈15213')).toBeTruthy()
    expect(screen.getByText('cursor ≈900')).toBeTruthy()
    expect(screen.getByText(/整包落盘足迹 ≈375 · 2 文件/)).toBeTruthy()
  })

  it('03 warn 黄条：只给 warn=true 的平台，且文案不印阈值数字（裁定 ③）', () => {
    render(<PackPreviewPane preview={previewOf(WITH_SIZE)} />)
    const warnLine = screen.getByText(/已超过提示线/)
    expect(warnLine.textContent).toContain('claude-code ≈15213')
    expect(document.querySelectorAll('[class*="amber-700"]')).toHaveLength(1)
    // 阈值 12000 住在 packages/core；抄进文案就是造第二个源，规格改了而文案不改即为说谎
    expect(warnLine.textContent).not.toMatch(/12[, ]?000/)
  })

  it('04 表头口径后缀（正腿）：sizeEstimate 在场才标出「非计费口径」', () => {
    render(<PackPreviewPane preview={previewOf(WITH_SIZE)} />)
    expect(screen.getByText(/^产物文件/).textContent).toContain('近似上下文量（≈tok，非计费口径）')
  })

  it('05 假零禁止（I-1 通则）：sizeEstimate 缺席 ⇒ 整块不渲染，而不是印「≈0 tok」', () => {
    render(<PackPreviewPane preview={previewOf()} />)
    // 路径仍在（文件树不能跟着一起消失）
    expect(screen.getByText('AGENTS.md')).toBeTruthy()
    expect(screen.queryByText(/≈\d+ ?tok/)).toBeNull()
    expect(screen.queryByText(/整包落盘足迹/)).toBeNull()
    expect(screen.queryByText(/已超过提示线/)).toBeNull()
    // 反腿：表头后缀同受同一个条件，不发明第二个 boolean
    expect(screen.getByText(/^产物文件/).textContent).not.toContain('非计费口径')
  })
})

describe('WEB-PREVIEW · 文件树点选', () => {
  it('06 真 click 换右侧内容与 sha 摘要，同时保留体量行', async () => {
    const user = userEvent.setup()
    render(<PackPreviewPane preview={previewOf(WITH_SIZE)} />)
    expect(screen.getByText(/^AGENTS\.md · sha256 a{12}/)).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /CLAUDE\.md/ }))

    expect(screen.getByText(/^CLAUDE\.md · sha256 b{12}/)).toBeTruthy()
    // 高亮态跟着走：选中行的 class 从 zinc-600 换成 brand
    expect(
      screen.getByRole('button', { name: /CLAUDE\.md/ }).className.includes('bg-brand-soft'),
    ).toBe(true)
  })
})
