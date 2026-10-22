import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { InterpretProviderSection } from './InterpretProviderSection'

/**
 * M9（owner 2026-10-22 裁决一）· 设置页「AI 解读」区。
 *
 * ## 它断什么
 *
 * | 断的事 | 为什么必须断 |
 * |---|---|
 * | **开关默认关** | DL-08 的下限：没配 ⇒ AI 不可用 ⇒ 确定性层照常 |
 * | **key 只显示末 4 位** | 读端压根不回显全文（视图形状里装不下） |
 * | **没改 key ⇒ 保存时**不**带 api_key** | 否则改个模型名就把 key 抹了 |
 * | **「清除 key」⇒ 显式带空串** | 想清必须显式 |
 * | **两种形态的字段** | 命令适配器 vs OpenAI 兼容接口（本地模型与云端同协议） |
 *
 * ⚠️ **取数真的走一遍 HTTP 形状**（URL 对不对也一起断）—— 与其它设置页区同款。
 */
const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }))

const DEFAULT_VIEW = {
  enabled: false,
  kind: 'command',
  cmd: '',
  args: [],
  endpoint: '',
  model: '',
  provider: '',
  has_api_key: false,
  api_key_hint: '',
  timeout_ms: 30000,
}

interface FetchCall {
  url: string
  method: string
  body: string | null
}

let calls: FetchCall[] = []

beforeEach(() => {
  calls = []
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function mockAll(view: unknown = DEFAULT_VIEW, capability: unknown = undefined): void {
  fetchMock.mockImplementation(async (url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method ?? 'GET'
    calls.push({ url: String(url), method, body: init?.body ?? null })
    if (String(url).includes('/api/lang/interpret/capability')) {
      return new Response(
        JSON.stringify(
          capability ?? {
            available: true,
            runner_id: 'pi',
            status: 'ready',
            detail: 'AI 解读可用（命令适配器）',
          },
        ),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }
    if (String(url).includes('/api/lang/interpret/provider')) {
      if (method === 'PUT') {
        return new Response(JSON.stringify(view), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response(JSON.stringify(view), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
  })
}

function renderSection(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <InterpretProviderSection />
    </QueryClientProvider>,
  )
}

function putCall(): { url: string; body: Record<string, unknown> } | undefined {
  const c = calls.find((x) => x.method === 'PUT')
  if (c === undefined || c.body === null) return undefined
  return { url: c.url, body: JSON.parse(c.body) as Record<string, unknown> }
}

describe('M9 · 设置页「AI 解读」区', () => {
  it('渲染出这一区，**开关默认是关的**（DL-08 的下限）', async () => {
    mockAll()
    renderSection()
    expect(await screen.findByText('AI 解读')).toBeTruthy()
    // ⚠️ 配置还没取回来时渲染的是骨架 ⇒ 开关**晚一点**才出现（要等它，别用同步查询）
    const toggle = (await screen.findByRole('checkbox')) as HTMLInputElement
    await waitFor(() => expect(toggle.checked).toBe(false))
  })

  it('**状态是三档里的哪一档**，界面上看得见（可用 ⇒ 「可用」）', async () => {
    mockAll()
    renderSection()
    expect(await screen.findByText('可用')).toBeTruthy()
    expect(screen.getByText(/AI 解读可用/)).toBeTruthy()
  })

  it('⚠️ **key 只显示末 4 位**，读回来的视图里没有全文', async () => {
    mockAll({ ...DEFAULT_VIEW, enabled: true, kind: 'openai_http', has_api_key: true, api_key_hint: '3456' })
    renderSection()
    expect(await screen.findByText('已配置（末 3456）')).toBeTruthy()
    expect(screen.queryByText(/sk-[A-Za-z0-9-]{10,}/)).toBeNull()
  })

  it('⚠️ **没改 key ⇒ 保存时压根不带 api_key**（改个模型名不该把 key 抹了）', async () => {
    mockAll({ ...DEFAULT_VIEW, enabled: true, kind: 'openai_http', has_api_key: true, api_key_hint: '3456' })
    renderSection()
    await screen.findByText('已配置（末 3456）')
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(putCall()).toBeDefined())
    const call = putCall()
    expect(call?.url).toContain('/api/lang/interpret/provider')
    // ⚠️ **守卫自证**：先断言 body 里**确实有其它字段**（否则「没有 api_key」可能是整个 body 空）
    expect(call?.body['enabled']).toBe(true)
    expect(Object.keys(call?.body ?? {})).not.toContain('api_key')
  })

  it('用户**填了新 key** ⇒ 保存时带上它', async () => {
    mockAll({ ...DEFAULT_VIEW, enabled: true, kind: 'openai_http' })
    renderSection()
    const input = (await screen.findByLabelText('API key')) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'sk-new-key-9999' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(putCall()).toBeDefined())
    expect(putCall()?.body['api_key']).toBe('sk-new-key-9999')
  })

  it('点「清除 key」⇒ 保存时**显式带空串**（想清必须显式）', async () => {
    mockAll({ ...DEFAULT_VIEW, enabled: true, kind: 'openai_http', has_api_key: true, api_key_hint: '3456' })
    renderSection()
    fireEvent.click(await screen.findByRole('button', { name: '清除 key' }))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(putCall()).toBeDefined())
    expect(putCall()?.body['api_key']).toBe('')
  })

  it('**命令形态**显示命令与参数字段；切到 **OpenAI 兼容**显示端点与模型', async () => {
    mockAll({ ...DEFAULT_VIEW, enabled: true, kind: 'command' })
    renderSection()
    expect(await screen.findByLabelText('解读命令')).toBeTruthy()
    expect(screen.queryByLabelText('接口地址')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'OpenAI 兼容接口' }))
    expect(await screen.findByLabelText('接口地址')).toBeTruthy()
    expect(screen.getByLabelText('模型标识')).toBeTruthy()
    expect(screen.queryByLabelText('解读命令')).toBeNull()
  })

  it('参数用**逗号分隔**⇒ 保存时拆成一个个的（不是一整串命令行）', async () => {
    mockAll({ ...DEFAULT_VIEW, enabled: true, kind: 'command' })
    renderSection()
    const args = (await screen.findByLabelText('命令参数')) as HTMLInputElement
    fireEvent.change(args, { target: { value: 'run, --json , ' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(putCall()).toBeDefined())
    expect(putCall()?.body['args']).toEqual(['run', '--json'])
  })

  it('⚠️ **配坏了要说清原因**（三档不许塌成一个兜底）', async () => {
    mockAll(DEFAULT_VIEW, {
      available: false,
      runner_id: null,
      status: 'misconfigured',
      detail: '找不到命令「pi」（不在 PATH 里，或路径写错了）',
    })
    renderSection()
    expect(await screen.findByText('配好了但用不了')).toBeTruthy()
    expect(screen.getByText(/找不到命令/)).toBeTruthy()
  })
})
