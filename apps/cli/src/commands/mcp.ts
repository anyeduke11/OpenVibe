import { createInterface } from 'node:readline'
import { CLI_VERSION } from '../version'
import { clientFromConfig, ServerUnreachable, type ApiClient } from '../client'
import { resolveConfig } from '../config'
import { diffAction } from './diff'

/**
 * `openvibe mcp`（v0.2.3 批次 F / AN3，spec `v023-e-ai-assistant.md` FR-5）：
 * stdio 形态的 MCP（Model Context Protocol）服务——AI IDE 的只读上下文工具面。
 *
 * 协议：手写最小 JSON-RPC 2.0 子集（§8.2③ 裁定：零新依赖，官方 SDK 会显著膨胀
 * 单文件 bundle）；stdio transport = stdin 逐行请求、stdout 逐行响应（UTF-8）。
 * 实现的方法：initialize / notifications/initialized / tools/list / tools/call。
 *
 * 三只读 tool（红线：MCP 是只读面——无任何写端点暴露；无网络监听——stdio 子进程）：
 * - project_context → GET /api/projects/:id/context（fields/budget 透传，budget 截断如实透出）
 * - search_assets   → terms/playbooks 走既有搜索端点、prompts 走列表端点本地过滤
 * - pack_diff       → 本地 diffAction（磁盘 vs lock；serve 可达时附带更新版本探测）
 * 数据全部经本地 serve 的 HTTP API（token 走 config.json 既有通道）；serve 不可达 ⇒
 * isError + 人话提示（同 ask 的形态）。
 */

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: number | string
  method: string
  params?: Record<string, unknown>
}

interface ToolDef {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

const TOOLS: ToolDef[] = [
  {
    name: 'project_context',
    description:
      '读取一个项目的完整上下文（阶段 / 清单 / 任务 / 开发日志 / 包漂移 / 资产计数）。budget 是字符预算，不够时按 logs→assets→checklist 顺序裁剪并在 truncated 里如实标注。',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: '项目 id（prj_ 前缀）' },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: '可选，只要这些段（缺省全部）',
        },
        budget: { type: 'number', description: '可选，字符预算上限' },
      },
      required: ['project_id'],
    },
  },
  {
    name: 'search_assets',
    description: '按关键词搜索本地资产库（术语 / 提示词 / 技巧）。kind 缺省时三路都查。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索词（术语支持拼音与英文双序）' },
        kind: {
          type: 'string',
          enum: ['terms', 'prompts', 'playbooks'],
          description: '可选，只查这一类',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'pack_diff',
    description:
      '检查一个已注入项目目录的漂移状态：磁盘产物 vs pack.lock.json 比对（只读，不改盘）。返回 clean / drifted / missing 明细与文件级差异。',
    inputSchema: {
      type: 'object',
      properties: {
        project_dir: { type: 'string', description: '项目根目录的绝对路径' },
      },
      required: ['project_dir'],
    },
  },
]

function toolResult(text: string, isError = false): Record<string, unknown> {
  return {
    content: [{ type: 'text', text }],
    ...(isError ? { isError: true } : {}),
  }
}

function unreachableText(e: ServerUnreachable): string {
  return `OpenVibe serve 不可达（${e.detail}）。先在本机运行 openvibe serve 再调用本工具。`
}

interface McpDeps {
  client?: () => ApiClient | undefined
  /** 注入 diff 实现（测试）；缺省用 diffAction */
  diff?: typeof diffAction
  /** --server/--token 旗标透传（警告走 stderr——stdout 是 MCP 协议通道，一行都不能混入） */
  serverOverride?: string
  tokenOverride?: string
}

export async function runMcpServer(deps: McpDeps = {}): Promise<void> {
  const getClient =
    deps.client ?? (() => makeClientFromConfig(deps.serverOverride, deps.tokenOverride))
  const diff = deps.diff ?? diffAction
  const out = (obj: unknown): void => {
    process.stdout.write(`${JSON.stringify(obj)}\n`)
  }

  const callTool = async (
    name: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> => {
    if (name === 'project_context') {
      const id = String(args.project_id ?? '')
      if (id === '') return toolResult('project_id 不能为空', true)
      const client = getClient()
      if (client === undefined)
        return toolResult(
          '未配置 serve 地址（config.json 缺 serverUrl）。先运行 openvibe serve。',
          true,
        )
      try {
        const q = new URLSearchParams()
        if (Array.isArray(args.fields) && args.fields.length > 0)
          q.set('fields', (args.fields as string[]).join(','))
        if (typeof args.budget === 'number') q.set('budget', String(args.budget))
        const qs = q.size > 0 ? `?${q.toString()}` : ''
        return toolResult(
          JSON.stringify(await client.getJson(`/api/projects/${id}/context${qs}`), null, 1),
        )
      } catch (e) {
        if (e instanceof ServerUnreachable) return toolResult(unreachableText(e), true)
        return toolResult(`读取项目上下文失败：${String(e)}`, true)
      }
    }

    if (name === 'search_assets') {
      const query = String(args.query ?? '').trim()
      if (query === '') return toolResult('query 不能为空', true)
      const kind = typeof args.kind === 'string' ? args.kind : undefined
      const client = getClient()
      if (client === undefined)
        return toolResult(
          '未配置 serve 地址（config.json 缺 serverUrl）。先运行 openvibe serve。',
          true,
        )
      try {
        const result: Record<string, unknown> = {}
        if (kind === undefined || kind === 'terms') {
          result.terms = await client.getJson(`/api/terms/search?q=${encodeURIComponent(query)}`)
        }
        if (kind === undefined || kind === 'playbooks') {
          result.playbooks = await client.getJson(
            `/api/playbooks/search?q=${encodeURIComponent(query)}`,
          )
        }
        if (kind === undefined || kind === 'prompts') {
          // prompts 无专用搜索端点（m1）：取全量列表本地按标题/内容包含匹配（薄客户端不引 FTS）
          const list = await client.getJson<{
            items: { id: string; title: string; content?: string; description?: string }[]
          }>(`/api/prompts`)
          const lower = query.toLowerCase()
          result.prompts = {
            items: (list.items ?? []).filter(
              (p) =>
                p.title.toLowerCase().includes(lower) ||
                (p.description ?? '').toLowerCase().includes(lower) ||
                (p.content ?? '').toLowerCase().includes(lower),
            ),
          }
        }
        return toolResult(JSON.stringify(result, null, 1))
      } catch (e) {
        if (e instanceof ServerUnreachable) return toolResult(unreachableText(e), true)
        return toolResult(`搜索失败：${String(e)}`, true)
      }
    }

    if (name === 'pack_diff') {
      const dir = String(args.project_dir ?? '')
      if (dir === '') return toolResult('project_dir 不能为空', true)
      try {
        const client = getClient()
        const outcome = await diff({ projectPath: dir }, client ? { client } : {})
        return toolResult(
          JSON.stringify(
            {
              clean: outcome.clean,
              pack: `${outcome.pack.name}@${outcome.pack.version}`,
              tracked: outcome.tracked,
              drifted: outcome.drifted,
              missing: outcome.missing,
              probedOnline: outcome.probedOnline,
              hints: outcome.hints,
            },
            null,
            1,
          ),
        )
      } catch (e) {
        const err = e as { code?: string; message?: string }
        return toolResult(`比对失败：${err.code ?? ''} ${err.message ?? String(e)}`, true)
      }
    }

    return toolResult(`未知工具：${name}（可用：${TOOLS.map((t) => t.name).join(' / ')}）`, true)
  }

  const rl = createInterface({ input: process.stdin, terminal: false })
  rl.on('line', (line) => {
    const text = line.trim()
    if (text === '') return
    let req: JsonRpcRequest
    try {
      req = JSON.parse(text) as JsonRpcRequest
    } catch {
      out({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
      return
    }
    // notification（无 id）不产生响应（initialize 之后的 initialized 握手就是这种）
    if (req.id === undefined) return

    if (req.method === 'initialize') {
      const params = req.params as { protocolVersion?: string } | undefined
      out({
        jsonrpc: '2.0',
        id: req.id,
        result: {
          // 回显客户端版本（协议兼容的稳妥做法；缺省用我们支持的基线）
          protocolVersion: params?.protocolVersion ?? '2025-06-18',
          capabilities: { tools: {} },
          serverInfo: { name: 'openvibe', version: CLI_VERSION },
          instructions:
            'OpenVibe 本地上下文：project_context 读项目状态，search_assets 搜资产库，pack_diff 查注入漂移。全部只读。',
        },
      })
      return
    }
    if (req.method === 'tools/list') {
      out({ jsonrpc: '2.0', id: req.id, result: { tools: TOOLS } })
      return
    }
    if (req.method === 'tools/call') {
      const params = req.params as
        { name?: string; arguments?: Record<string, unknown> } | undefined
      if (typeof params?.name !== 'string') {
        out({ jsonrpc: '2.0', id: req.id, error: { code: -32602, message: 'params.name 缺失' } })
        return
      }
      void callTool(params.name, params.arguments ?? {})
        .then((result) => out({ jsonrpc: '2.0', id: req.id, result }))
        .catch((e) =>
          out({ jsonrpc: '2.0', id: req.id, error: { code: -32603, message: String(e) } }),
        )
      return
    }
    out({
      jsonrpc: '2.0',
      id: req.id,
      error: { code: -32601, message: `Method not found: ${req.method}` },
    })
  })

  // stdin EOF（客户端断开）⇒ 干净退出；SIGTERM/SIGINT 同理（不挂起父进程）
  return new Promise<void>((resolve) => {
    rl.on('close', () => resolve())
  })
}

/** stdout 是协议通道：config 发现链的警告只走 stderr，一行都不能混进协议流 */
function makeClientFromConfig(
  serverOverride?: string,
  tokenOverride?: string,
): ApiClient | undefined {
  const config = resolveConfig({ server: serverOverride, token: tokenOverride })
  for (const w of config.warnings) process.stderr.write(`${w}\n`)
  return config.token === null ? undefined : clientFromConfig(config)
}
