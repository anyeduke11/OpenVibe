import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { InterpretProviderSection } from './InterpretProviderSection'

/**
 * M9（owner 2026-10-22 裁决一 ＋ **增强 2：多份 provider 并存**）· 设置页「AI 解读」区。
 *
 * ## 它断什么
 *
 * | 断的事 | 为什么必须断 |
 * |---|---|
 * | **多份并存**：列表 ＋ 选中编辑 | 「按项目 / 按形态选」是增强 2 的全部意义 |
 * | **保存是一次 PUT 整份集合** | 逐份 PUT 表达不了「删掉哪一份」 |
 * | **默认那一份**是 `default_provider_id` | 没有项目绑定时的兜底 |
 * | **key 只显示末 4 位** | 读端压根不回显全文（视图形状里装不下） |
 * | **没改 key ⇒ 保存时**不**带 api_key** | 否则改个模型名就把 key 抹了 |
 * | **「清除 key」⇒ 显式带空串** | 想清必须显式 |
 * | **至少要留一份** | 删空了就没有 provider 可用了 |
 *
 * ⚠️ **取数真的走一遍 HTTP 形状**（URL 对不对也一起断）—— 与其它设置页区同款。
 */
const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }))

/** 一份配置（**脱敏视图**的形状 —— 读端压根不回显 key 全文）。 */
function entry(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'p-a',
    name: '',
    projects: [],
    enabled: false,
    kind: 'command',
    cmd: '',
    args: [],
    endpoint: '',
    model: '',
    provider: '',
    has_api_key: false,
    api_key_hint: '',
    api_key_storage: 'none',
    api_key_storage_detail: '没有配置 key',
    timeout_ms: 30000,
    ...over,
  }
}

/** 默认取数：**两份**并存（一份命令适配器、一份 OpenAI 兼容接口）。 */
const DEFAULT_COLLECTION = {
  providers: [
    entry({
      id: 'p-a',
      name: '本机快速',
      projects: ['p1'],
      enabled: true,
      kind: 'command',
      cmd: 'pi',
      args: ['run'],
      model: 'm-local',
      provider: 'pi',
    }),
    entry({
      id: 'p-b',
      name: '云端主力',
      projects: [],
      enabled: false,
      kind: 'openai_http',
      endpoint: 'http://127.0.0.1:11434/v1/chat/completions',
      model: 'qwen2.5-coder:7b',
      provider: 'ollama',
      has_api_key: true,
      api_key_hint: '3456',
      api_key_storage: 'keychain',
      api_key_storage_detail: '存在 macOS 系统钥匙串里（本地数据库只留一个标记，不存 key 本身）',
    }),
  ],
  default_provider_id: 'p-a',
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

function mockAll(collection: unknown = DEFAULT_COLLECTION, capability: unknown = undefined): void {
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
    if (String(url).includes('/api/lang/interpret/providers')) {
      return new Response(JSON.stringify(collection), {
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

interface PutBody {
  providers: Record<string, unknown>[]
  default_provider_id: string
}

/** 所有 PUT（一次保存可能触发多次 ⇒ 取**最后一次**才是最新的那次）。 */
function putCalls(): { url: string; body: PutBody }[] {
  return calls
    .filter((c) => c.method === 'PUT' && c.body !== null)
    .map((c) => ({ url: c.url, body: JSON.parse(c.body as string) as PutBody }))
}

function lastPut(): { url: string; body: PutBody } | undefined {
  const all = putCalls()
  return all.length === 0 ? undefined : all[all.length - 1]
}

/** 列表区（唯一的 `<ul>`）里的行数。 */
function listRows(): HTMLElement[] {
  return within(screen.getByRole('list')).getAllByRole('listitem')
}

describe('M9 · 设置页「AI 解读」区', () => {
  it('渲染出这一区，**开关如实反映读回来的状态**（DL-08 的下限：没开就是关的）', async () => {
    mockAll({
      ...DEFAULT_COLLECTION,
      providers: DEFAULT_COLLECTION.providers.map((p) => ({ ...p, enabled: false })),
    })
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

  it('⚠️ **配坏了要说清原因**（三档不许塌成一个兜底）', async () => {
    mockAll(DEFAULT_COLLECTION, {
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

// ---------------------------------------------------------------------------
// 增强 2 · 多份 provider 并存
// ---------------------------------------------------------------------------

describe('M9 · 「AI 解读」区 · 多份并存', () => {
  it('① **列表渲染出多份**（各自的名字 / 形态 / 默认标记）', async () => {
    mockAll()
    renderSection()
    const rowA = await screen.findByRole('button', { name: /本机快速/ })
    const rowB = screen.getByRole('button', { name: /云端主力/ })
    // 形态（命令适配器 / OpenAI 兼容接口）写在**各自那一行**上
    expect(within(rowA).getByText('命令适配器')).toBeTruthy()
    expect(within(rowB).getByText('OpenAI 兼容接口')).toBeTruthy()
    // 默认标记只有一份（p-a）
    expect(screen.getAllByText('默认')).toHaveLength(1)
    expect(within(rowA).getByText('默认')).toBeTruthy()
    // 绑定项目：p-a 绑了 p1，p-b 是通用的
    expect(within(rowA).getByText('绑定：p1')).toBeTruthy()
    expect(within(rowB).getByText('通用')).toBeTruthy()
  })

  it('② 点另一份 ⇒ **编辑区切到那一份**（表单值随之变）', async () => {
    mockAll()
    renderSection()
    // 先确认选中的是 p-a（命令形态）
    expect((await screen.findByLabelText('解读命令')).getAttribute('value')).toBe('pi')
    fireEvent.click(screen.getByRole('button', { name: /云端主力/ }))
    const endpoint = (await screen.findByLabelText('接口地址')) as HTMLInputElement
    expect(endpoint.value).toBe('http://127.0.0.1:11434/v1/chat/completions')
    // 形态也切过去了（命令字段不再渲染）
    expect(screen.queryByLabelText('解读命令')).toBeNull()
  })

  it('③ 「新增一份」⇒ **列表多一行**（且是空白草稿、默认关着）', async () => {
    mockAll()
    renderSection()
    await screen.findByRole('button', { name: /本机快速/ })
    await waitFor(() => expect(listRows()).toHaveLength(2))
    fireEvent.click(screen.getByRole('button', { name: '新增一份' }))
    await waitFor(() => expect(listRows()).toHaveLength(3))
    // 新增的那份是草稿：默认关着、形态是命令适配器
    const toggle = screen.getByRole('checkbox') as HTMLInputElement
    expect(toggle.checked).toBe(false)
    expect(screen.getByRole('button', { name: '命令适配器' })).toBeTruthy()
  })

  it('④ 「设为默认」⇒ 那一份成为默认（**保存的请求体里 default_provider_id 是它**）', async () => {
    mockAll()
    renderSection()
    fireEvent.click(await screen.findByRole('button', { name: /云端主力/ }))
    fireEvent.click(screen.getByRole('button', { name: '设为默认' }))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(lastPut()).toBeDefined())
    expect(lastPut()?.body.default_provider_id).toBe('p-b')
  })

  it('⑤ 「删除一份」⇒ **列表少一行**；只剩一份时按钮禁用并说明', async () => {
    mockAll()
    renderSection()
    await screen.findByRole('button', { name: /本机快速/ })
    await waitFor(() => expect(listRows()).toHaveLength(2))
    fireEvent.click(screen.getByRole('button', { name: '删除这份' }))
    await waitFor(() => expect(listRows()).toHaveLength(1))
    // 只剩一份 ⇒ 不能再删
    const del = screen.getByRole('button', { name: '删除这份' }) as HTMLButtonElement
    expect(del.disabled).toBe(true)
    expect(screen.getByText(/至少要留一份/)).toBeTruthy()
  })

  it('⑥ 保存时 **一次 PUT 整份集合**（URL / 方法 / 请求体形状都断）', async () => {
    mockAll()
    renderSection()
    await screen.findByRole('button', { name: /本机快速/ })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(lastPut()).toBeDefined())
    // ⚠️ **只 PUT 一次**（不是逐份 PUT）
    expect(putCalls()).toHaveLength(1)
    const call = lastPut()
    expect(call?.url).toBe('/api/lang/interpret/providers')
    expect(Object.keys(call?.body ?? {}).sort()).toEqual(['default_provider_id', 'providers'])
    expect(call?.body.providers).toHaveLength(2)
    expect(call?.body.default_provider_id).toBe('p-a')
    expect(call?.body.providers[0]?.['id']).toBe('p-a')
    expect(call?.body.providers[0]?.['projects']).toEqual(['p1'])
    expect(call?.body.providers[1]?.['id']).toBe('p-b')
    expect(call?.body.providers[1]?.['projects']).toEqual([])
  })

  it('⑦ ⚠️ **key 输入框留空 ⇒ 请求体里没有 api_key 字段**（保持原值）', async () => {
    mockAll()
    renderSection()
    fireEvent.click(await screen.findByRole('button', { name: /云端主力/ }))
    await screen.findByLabelText('API key')
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(lastPut()).toBeDefined())
    const entryB = lastPut()?.body.providers.find((p) => p['id'] === 'p-b')
    expect(entryB).toBeDefined()
    // ⚠️ **守卫自证**：先断言 body 里**确实有其它字段**（否则「没有 api_key」可能是整个 body 空）
    expect(entryB?.['provider']).toBe('ollama')
    expect(Object.keys(entryB ?? {})).not.toContain('api_key')
  })

  it('⑧ 点「清除 key」⇒ 请求体里 **api_key 是空串**（想清必须显式）', async () => {
    mockAll()
    renderSection()
    fireEvent.click(await screen.findByRole('button', { name: /云端主力/ }))
    await screen.findByLabelText('API key')
    fireEvent.click(screen.getByRole('button', { name: '清除 key' }))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(lastPut()).toBeDefined())
    const entryB = lastPut()?.body.providers.find((p) => p['id'] === 'p-b')
    expect(entryB?.['api_key']).toBe('')
  })

  it('⑨ 用户**填了新 key** ⇒ 保存时带上它', async () => {
    mockAll()
    renderSection()
    fireEvent.click(await screen.findByRole('button', { name: /云端主力/ }))
    const input = (await screen.findByLabelText('API key')) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'sk-new-key-9999' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(lastPut()).toBeDefined())
    const entryB = lastPut()?.body.providers.find((p) => p['id'] === 'p-b')
    expect(entryB?.['api_key']).toBe('sk-new-key-9999')
  })

  it('⑩ 绑定项目用**逗号分隔**⇒ 保存时拆成一个个的；留空 = 通用', async () => {
    mockAll()
    renderSection()
    const projects = (await screen.findByLabelText('绑定项目')) as HTMLInputElement
    expect(projects.value).toBe('p1')
    fireEvent.change(projects, { target: { value: 'p1, proj-2026 , ' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(lastPut()).toBeDefined())
    const entryA = lastPut()?.body.providers.find((p) => p['id'] === 'p-a')
    expect(entryA?.['projects']).toEqual(['p1', 'proj-2026'])
  })
})

describe('M9 · 设置页「AI 解读」区 · 单份的字段行为', () => {
  it('**命令形态**显示命令与参数字段；切到 **OpenAI 兼容**显示端点与模型', async () => {
    mockAll()
    renderSection()
    expect(await screen.findByLabelText('解读命令')).toBeTruthy()
    expect(screen.queryByLabelText('接口地址')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'OpenAI 兼容接口' }))
    expect(await screen.findByLabelText('接口地址')).toBeTruthy()
    expect(screen.getByLabelText('模型标识')).toBeTruthy()
    expect(screen.queryByLabelText('解读命令')).toBeNull()
  })

  it('参数用**逗号分隔**⇒ 保存时拆成一个个的（不是一整串命令行）', async () => {
    mockAll()
    renderSection()
    const args = (await screen.findByLabelText('命令参数')) as HTMLInputElement
    fireEvent.change(args, { target: { value: 'run, --json , ' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(lastPut()).toBeDefined())
    const entryA = lastPut()?.body.providers.find((p) => p['id'] === 'p-a')
    expect(entryA?.['args']).toEqual(['run', '--json'])
  })

  it('⚠️ **key 只显示末 4 位**，读回来的视图里没有全文', async () => {
    mockAll()
    renderSection()
    fireEvent.click(await screen.findByRole('button', { name: /云端主力/ }))
    expect(await screen.findByText('已配置（末 3456）')).toBeTruthy()
    expect(screen.queryByText(/sk-[A-Za-z0-9-]{10,}/)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 批次 D · key 存在哪，界面上必须看得见
// ---------------------------------------------------------------------------

describe('M9 · 设置页「AI 解读」区 · key 的存放位置', () => {
  it('① ⚠️ **在系统钥匙串里** ⇒ 界面上说清楚（不是明文）', async () => {
    mockAll()
    renderSection()
    fireEvent.click(await screen.findByRole('button', { name: /云端主力/ }))
    expect(await screen.findByText('存放位置')).toBeTruthy()
    expect(screen.getByText(/系统钥匙串/)).toBeTruthy()
  })

  it('② ⚠️ **降级成明文** ⇒ 界面必须**显眼地**说出来（不许悄悄降级）', async () => {
    mockAll({
      ...DEFAULT_COLLECTION,
      providers: [
        entry({
          id: 'p-b',
          name: '云端主力',
          kind: 'openai_http',
          enabled: true,
          endpoint: 'http://127.0.0.1:11434/v1/chat/completions',
          has_api_key: true,
          api_key_hint: '0000',
          api_key_storage: 'inline',
          api_key_storage_detail: '这台机器没有可用的系统钥匙串，key 以明文存在本地数据库里',
        }),
      ],
      default_provider_id: 'p-b',
    })
    renderSection()
    expect(await screen.findByText('key 以明文存放')).toBeTruthy()
    expect(screen.getByText(/以明文存在本地数据库里/)).toBeTruthy()
  })

  it('③ 没配 key ⇒ **不显示**存放位置（没什么可说的）', async () => {
    mockAll()
    renderSection()
    await screen.findByText('未配置')
    expect(screen.queryByText('存放位置')).toBeNull()
    expect(screen.queryByText('key 以明文存放')).toBeNull()
  })
})
