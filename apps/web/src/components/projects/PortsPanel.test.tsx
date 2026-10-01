import { describe, expect, it, afterEach } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import type { ProjectPortsOut } from '@openvibe/shared'
import { PortsPanel } from './PortsPanel'
import { zh } from '../../i18n/zh'

// 这支文件的存在理由：`docs/specs/m5-project-flow.md` §7-12 把「PortsPanel 无自动化 DOM 断言」记成
// 端口卡唯一的人工凭据（一张 DEV-0047 截图）。合并语义在服务端已测，但「服务端给的形状到了表格里
// 怎么落地」此前无人钉——而恰恰是显示层最容易名不符实（队列 ㉔：win32 每行进程名都显示成 netstat，
// 服务端测试看不见那一层）。
// 纪律：只钉形状，不替 owner 预裁 ㉔——这里锁的是「监听中才带 process·pid·url，未监听一律降级」，
// 至于那个 process 字符串在 win32 上该显示什么，留给 ㉔ 的裁定。

const LISTENING = {
  port: 5144,
  service: 'vite',
  source: 'package-script' as const,
  sourceFile: 'apps/web/package.json',
  state: 'listening' as const,
  process: 'node',
  pid: 4242,
  url: 'http://localhost:5144',
}
const IDLE = {
  port: 5432,
  service: 'POSTGRES',
  source: 'compose' as const,
  sourceFile: 'docker-compose.yml',
  state: 'idle' as const,
}

function outOf(patch: Partial<ProjectPortsOut> = {}): ProjectPortsOut {
  return {
    projectPath: '/repo/demo',
    scannedFiles: ['package.json', 'docker-compose.yml'],
    services: [LISTENING, IDLE],
    listeners: [{ port: 5144, addr: '*', process: 'node', pid: 4242 }],
    ...patch,
  }
}

/** 端口号所在行（等宽那列是唯一稳定锚点） */
function rowOf(port: number): HTMLElement {
  const tr = screen.getByText(String(port)).closest('tr')
  expect(tr).not.toBeNull()
  return tr as HTMLElement
}

describe('WEB-PORTS · 端口台账卡的合并渲染（m5 FR-8 §7-11 的显示侧）', () => {
  afterEach(cleanup)

  it('01 监听中的行三件套齐全：状态点文案==aria-label、进程列带 pid、打开列是真链接', () => {
    render(<PortsPanel data={outOf()} />)
    const tr = rowOf(5144)
    const dot = within(tr).getByLabelText(zh.projects.ports.listening)
    expect(dot.textContent).toBe(zh.projects.ports.listening)
    expect(within(tr).getByText('node·4242')).toBeTruthy()
    const link = within(tr).getByRole('link', { name: zh.projects.ports.open })
    expect(link.getAttribute('href')).toBe('http://localhost:5144')
    expect(link.getAttribute('target')).toBe('_blank')
    // rel 必须含 noreferrer：target=_blank 不带它会把 window.opener 反向暴露给目标页
    expect(String(link.getAttribute('rel'))).toContain('noreferrer')
  })

  it('02 未监听的行一律降级：进程列与打开列都是「—」，整行没有任何链接', () => {
    render(<PortsPanel data={outOf()} />)
    const tr = rowOf(5432)
    expect(within(tr).getByLabelText(zh.projects.ports.idle)).toBeTruthy()
    expect(within(tr).getAllByText(zh.common.none)).toHaveLength(2)
    expect(within(tr).queryByRole('link')).toBeNull()
    // 反向：idle 行不得把 pid/process 漏进 DOM（服务端已不给，显示层也不兜底发明一个）
    expect(String(tr.textContent)).not.toContain('node')
    expect(String(tr.textContent)).not.toContain('4242')
  })

  it('03 来源列同时给中文标签与仓库相对路径（缺路径就无法解释这个端口从哪认出来的）', () => {
    render(<PortsPanel data={outOf()} />)
    expect(within(rowOf(5144)).getByText(/脚本/).textContent).toContain('apps/web/package.json')
    // compose 的中文标签与文件名同串（sourceLabel.compose === 'compose'，而 sourceFile 里也含
    // 'compose'），所以整词锚——否则这条会命中两个元素，测的就不是「标签+路径」而是查询本身
    expect(within(rowOf(5432)).getByText(/^compose$/).textContent).toContain('docker-compose.yml')
  })

  it('04 listenersWarning 有则原样印、无则该节点不存在（不是留一个空 <p>）', () => {
    const warn = '本机监听扫描不可用：lsof 未安装'
    const { unmount } = render(<PortsPanel data={outOf({ listenersWarning: warn })} />)
    expect(screen.getByText(warn)).toBeTruthy()
    unmount()
    cleanup()
    render(<PortsPanel data={outOf()} />)
    expect(screen.queryByText(warn)).toBeNull()
    expect(document.querySelectorAll('[class*="text-warn-700"]')).toHaveLength(0)
  })

  it('05 认读清单：scannedFiles 非空才出现，且按、连接原样列出', () => {
    const { unmount } = render(<PortsPanel data={outOf()} />)
    expect(screen.getByText('本次认读：package.json、docker-compose.yml')).toBeTruthy()
    unmount()
    cleanup()
    render(<PortsPanel data={outOf({ scannedFiles: [] })} />)
    expect(screen.queryByText(/^本次认读：/)).toBeNull()
  })

  it('06 三种空卡互不串：未加载 / 未登记路径 / 有路径无声明各给各的文案', () => {
    render(<PortsPanel data={undefined} />)
    expect(screen.getByText(zh.common.loading)).toBeTruthy()
    expect(screen.queryByText(zh.projects.ports.noPath)).toBeNull()
    cleanup()

    render(<PortsPanel data={outOf({ projectPath: '', services: [], scannedFiles: [] })} />)
    expect(screen.getByText(zh.projects.ports.noPath)).toBeTruthy()
    expect(screen.queryByText(zh.projects.ports.empty)).toBeNull()
    cleanup()

    render(<PortsPanel data={outOf({ services: [], scannedFiles: [] })} />)
    expect(screen.getByText(zh.projects.ports.empty)).toBeTruthy()
    expect(screen.queryByText(zh.projects.ports.noPath)).toBeNull()
  })

  it('07 本机监听清单不进台账：listeners 三条而 services 空 ⇒ 只有 empty 文案、没有表', () => {
    // 钉的是**契约**：`listeners` 自 owner 裁 ㉖(b) 起定性为「services 的合并输入、不出 UI」，
    // schema 侧不再 promise 参考区。将来真要建那一区，得先回 `m5` 加验收条目再改这支——
    // 不能让一个字段悄悄变成 UI。
    render(
      <PortsPanel
        data={outOf({
          services: [],
          scannedFiles: [],
          listeners: [
            { port: 5144, addr: '*', process: 'node', pid: 4242 },
            { port: 8898, addr: '127.0.0.1', process: 'hotspot', pid: 77 },
            { port: 3000, addr: '[::]', process: 'python3', pid: 99 },
          ],
        })}
      />,
    )
    expect(screen.getByText(zh.projects.ports.empty)).toBeTruthy()
    expect(screen.queryByText('8898')).toBeNull()
    expect(document.querySelector('table')).toBeNull()
  })
})
