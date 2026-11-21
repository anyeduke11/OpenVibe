import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PackOut, PreviewOut } from '@openvibe/shared'
import { PackWizard } from './PackWizard'

/**
 * v0.2.4 F6 / R5：向导「确认面看到的内容 == 实际待发内容」。
 *
 * **这条覆盖的是「步骤条跳转」路径**：步骤条允许回到走过的任一步（`i <= maxStep`），
 * 而 `goTo(4)` 不经过 `next()` 的保存分支 ⇒ 用户在第 3 步改完资产后直接点步骤条进第 5 步，
 * 预览/导出用的是**旧定义**。修复后：跳进预览步前会先落库（PATCH）。
 */

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }))
vi.stubGlobal('fetch', fetchMock)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const PACK: PackOut = {
  id: 'pk_1',
  name: '测试包',
  description: '',
  selection: {
    promptIds: ['p1'],
    termIds: [],
    skillIds: [],
    playbookIds: [],
    flowTemplateId: null,
  },
  targets: ['claude-code'],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const PREVIEW: PreviewOut = {
  files: [],
  fingerprint: 'f'.repeat(64),
  warnings: [],
  coveredPlatforms: [],
}

function prompt(i: string): Record<string, unknown> {
  return {
    id: `p${i}`,
    title: `提示词 ${i}`,
    description: '',
    useAs: 'reference',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 })
}

function stubFetch(): void {
  fetchMock.mockImplementation((path: string, init?: RequestInit) => {
    const url = String(path)
    const method = (init?.method ?? 'GET').toUpperCase()
    if (url.includes('/api/prompts')) {
      return Promise.resolve(json({ items: [prompt('1'), prompt('2')], total: 2, page: 1 }))
    }
    if (
      url.includes('/api/terms') ||
      url.includes('/api/skills') ||
      url.includes('/api/playbooks')
    ) {
      return Promise.resolve(json({ items: [], total: 0 }))
    }
    if (url.includes('/api/flow-templates')) {
      return Promise.resolve(json({ items: [], total: 0 }))
    }
    if (url === '/api/packs' && method === 'POST') return Promise.resolve(json(PACK))
    if (url.startsWith('/api/packs/') && method === 'PATCH') return Promise.resolve(json(PACK))
    if (url.includes('/preview') && method === 'POST') return Promise.resolve(json(PREVIEW))
    if (url.includes('/exports')) return Promise.resolve(json({ items: [], total: 0 }))
    if (url.includes('/api/packs')) return Promise.resolve(json({ items: [], total: 0 }))
    return Promise.resolve(json({}))
  })
}

function renderWizard(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <PackWizard initial={null} />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

const next = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
  await user.click(screen.getByRole('button', { name: '下一步' }))
}

const patchCount = (): number =>
  fetchMock.mock.calls.filter(
    (c) =>
      String(c[0]).startsWith('/api/packs/') &&
      (c[1] as RequestInit | undefined)?.method === 'PATCH',
  ).length

describe('PackWizard · 步骤条跳转前落库（v0.2.4 F6 / R5）', () => {
  it('改资产后点步骤条进预览 ⇒ 先 PATCH 再进（不再用旧定义）', async () => {
    stubFetch()
    const user = userEvent.setup()
    renderWizard()

    // ① 基本信息（PACK_NAME_RE 只收 ASCII）
    await waitFor(() => expect(screen.getByPlaceholderText('my-team-pack')).toBeTruthy())
    await user.type(screen.getByPlaceholderText('my-team-pack'), 'test-pack')
    await next(user)

    // ② 流程模板（默认跳过）
    await waitFor(() => expect(screen.getByRole('button', { name: '下一步' })).toBeTruthy())
    await next(user)

    // ③ 资产挑选：选第一条
    await waitFor(() => expect(screen.getByText('提示词 1')).toBeTruthy())
    await user.click(screen.getByText('提示词 1'))
    await next(user)

    // ④ 目标平台 → 下一步到钩子配置
    await waitFor(() => expect(screen.getByRole('button', { name: '下一步' })).toBeTruthy())
    await next(user)

    // ⑤ 钩子配置（可选，留空）→ 保存定义并预览
    await waitFor(() => expect(screen.getByRole('button', { name: '保存定义并预览' })).toBeTruthy())
    await user.click(screen.getByRole('button', { name: '保存定义并预览' }))
    await waitFor(() => expect(screen.getByText(/指纹/)).toBeTruthy())
    expect(patchCount()).toBe(0) // 首次是 POST 创建，不是 PATCH

    // 回到第 3 步改资产
    await user.click(screen.getByRole('button', { name: '③ 资产挑选' }))
    await waitFor(() => expect(screen.getByText('提示词 2')).toBeTruthy())
    await user.click(screen.getByText('提示词 2'))

    // 点步骤条直接进预览步 ⇒ 必须先 PATCH 落库
    await user.click(screen.getByRole('button', { name: '⑥ 预览与导出' }))
    await waitFor(() => expect(patchCount()).toBe(1))
  })
})

describe('PackWizard · N3 FR-3.3 钩子配置步骤', () => {
  /** 走到钩子配置步（step 4）：填名 → 跳流程 → 选资产 → 选平台 → 下一步到钩子步 */
  async function gotoHooksStep(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await waitFor(() => expect(screen.getByPlaceholderText('my-team-pack')).toBeTruthy())
    await user.type(screen.getByPlaceholderText('my-team-pack'), 'test-pack')
    await next(user)
    await next(user)
    await waitFor(() => expect(screen.getByText('提示词 1')).toBeTruthy())
    await user.click(screen.getByText('提示词 1'))
    await next(user)
    await next(user)
    await waitFor(() => expect(screen.getAllByRole('button', { name: '添加钩子' }).length).toBe(2))
  }

  it('钩子配置步渲染 pre/post 两组，默认空集提示', async () => {
    stubFetch()
    const user = userEvent.setup()
    renderWizard()
    await gotoHooksStep(user)

    expect(screen.getByText('注入前（pre）')).toBeTruthy()
    expect(screen.getByText('注入后（post）')).toBeTruthy()
    expect(screen.getAllByText('未配置钩子（同步时不执行任何钩子）').length).toBe(2)
  })

  it('添加钩子后可编辑 name/command，保存时写入 selection.hooks', async () => {
    stubFetch()
    const user = userEvent.setup()
    renderWizard()
    await gotoHooksStep(user)

    // pre 组添加钩子
    await user.click(screen.getAllByRole('button', { name: '添加钩子' })[0]!)
    const nameInput = screen.getByPlaceholderText('echo hello')
    await user.type(nameInput, 'echo hello')

    // name 输入框（pre 组，第一个）
    const nameFields = screen.getAllByLabelText('名称（同组内唯一）')
    await user.type(nameFields[0]!, 'pre-hook')

    // 保存定义并预览 ⇒ POST 创建时 selection.hooks 含该钩子
    await user.click(screen.getByRole('button', { name: '保存定义并预览' }))
    await waitFor(() => expect(screen.getByText(/指纹/)).toBeTruthy())

    const postBody = fetchMock.mock.calls.find(
      (c) => String(c[0]) === '/api/packs' && (c[1] as RequestInit | undefined)?.method === 'POST',
    )
    const body = JSON.parse(String((postBody?.[1] as RequestInit).body))
    expect(body.selection.hooks.pre[0].name).toBe('pre-hook')
    expect(body.selection.hooks.pre[0].command).toBe('echo hello')
    expect(body.selection.hooks.pre[0].timeoutMs).toBe(30000)
    expect(body.selection.hooks.pre[0].failPolicy).toBe('continue')
  })

  it('钩子 name 为空时校验拦截，不进入下一步', async () => {
    stubFetch()
    const user = userEvent.setup()
    renderWizard()
    await gotoHooksStep(user)

    await user.click(screen.getAllByRole('button', { name: '添加钩子' })[0]!)
    // 不填 name，直接点保存 ⇒ 校验拦截，仍停留钩子配置步，不进入预览
    await user.click(screen.getByRole('button', { name: '保存定义并预览' }))
    await waitFor(() => expect(screen.queryByText(/指纹/)).toBeNull())
    expect(screen.getByRole('button', { name: '保存定义并预览' })).toBeTruthy()
  })

  it('同组内钩子 name 重复时校验拦截', async () => {
    stubFetch()
    const user = userEvent.setup()
    renderWizard()
    await gotoHooksStep(user)

    // 添加两个钩子，name 相同
    const addBtns = screen.getAllByRole('button', { name: '添加钩子' })
    await user.click(addBtns[0]!)
    await user.click(addBtns[0]!)
    const nameFields = screen.getAllByLabelText('名称（同组内唯一）')
    await user.type(nameFields[0]!, 'dup')
    await user.type(nameFields[1]!, 'dup')
    // 补 command 避免被 command 校验先拦截
    const cmdFields = screen.getAllByLabelText('命令')
    await user.type(cmdFields[0]!, 'echo a')
    await user.type(cmdFields[1]!, 'echo b')

    await user.click(screen.getByRole('button', { name: '保存定义并预览' }))
    await waitFor(() => expect(screen.queryByText(/指纹/)).toBeNull())
    expect(screen.getByRole('button', { name: '保存定义并预览' })).toBeTruthy()
  })

  it('pre 与 post 可重名（命名空间独立），不校验跨组', async () => {
    stubFetch()
    const user = userEvent.setup()
    renderWizard()
    await gotoHooksStep(user)

    const addBtns = screen.getAllByRole('button', { name: '添加钩子' })
    await user.click(addBtns[0]!) // pre
    await user.click(addBtns[1]!) // post
    const nameFields = screen.getAllByLabelText('名称（同组内唯一）')
    await user.type(nameFields[0]!, 'same-name')
    await user.type(nameFields[1]!, 'same-name')
    const cmdFields = screen.getAllByLabelText('命令')
    await user.type(cmdFields[0]!, 'echo pre')
    await user.type(cmdFields[1]!, 'echo post')

    // 不触发重复校验（pre/post 独立命名空间），可保存进入预览
    await user.click(screen.getByRole('button', { name: '保存定义并预览' }))
    await waitFor(() => expect(screen.getByText(/指纹/)).toBeTruthy())
  })
})
