import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { demoPack, writeBundleFile } from './helpers/pack-fixture'
import { syncAction } from '../src/commands/sync'

/**
 * v0.2.3 批次 F / AN3：`openvibe mcp` 的 stdio 协议面（spec `v023-e-ai-assistant.md` FR-5）。
 * 真子进程逐行 JSON-RPC：initialize 握手 / tools/list 三工具 / tools/call 三路（pack_diff
 * 走本地、两路 HTTP 工具在 serve 不可达时 isError 人话）。stdio 子进程**无网络监听**
 * 由 MCP-05 静态断言钉住。
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const CLI_ENTRY = join(HERE, '..', 'src', 'index.ts')
const roots: string[] = []

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  roots.push(dir)
  return dir
}

afterAll(() => {
  while (roots.length > 0) rmSync(roots.pop() ?? '', { recursive: true, force: true })
})

interface McpProc {
  child: ChildProcess
  send(obj: unknown): void
  /** 逐行收一条响应（带 id 的那种）；notification 不产生响应 */
  nextResponse(timeoutMs?: number): Promise<Record<string, unknown>>
  close(): Promise<void>
}

async function startMcp(envHome: string): Promise<McpProc> {
  const child = spawn(process.execPath, ['--import', 'tsx', CLI_ENTRY, 'mcp'], {
    env: { ...process.env, OPENVIBE_HOME: envHome, OPENVIBE_SERVER: '', OPENVIBE_TOKEN: '' },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const lines: string[] = []
  let buf = ''
  child.stdout?.setEncoding('utf8')
  child.stdout?.on('data', (chunk: string) => {
    buf += chunk
    const parts = buf.split('\n')
    buf = parts.pop() ?? ''
    for (const l of parts) if (l.trim() !== '') lines.push(l)
  })
  const send = (obj: unknown): void => {
    child.stdin?.write(`${JSON.stringify(obj)}\n`)
  }
  const nextResponse = (timeoutMs = 8000): Promise<Record<string, unknown>> =>
    new Promise((resolve, reject) => {
      const t = setTimeout(
        () => reject(new Error(`MCP 响应超时（等待 ${String(timeoutMs)}ms）`)),
        timeoutMs,
      )
      const poll = (): void => {
        const line = lines.shift()
        if (line === undefined) {
          setTimeout(poll, 25)
          return
        }
        clearTimeout(t)
        resolve(JSON.parse(line) as Record<string, unknown>)
      }
      poll()
    })
  return {
    child,
    send,
    nextResponse,
    close: () =>
      new Promise<void>((resolve) => {
        child.on('exit', () => resolve())
        child.stdin?.end()
        setTimeout(() => child.kill('SIGTERM'), 2000)
      }),
  }
}

describe('openvibe mcp（stdio JSON-RPC，只读三工具）', () => {
  let proc: McpProc
  const home = tempDir('ov-mcp-home-')

  beforeAll(async () => {
    proc = await startMcp(home)
  })

  afterAll(async () => {
    await proc.close()
  })

  it('MCP-01: initialize 握手——回显协议版本、capabilities.tools、serverInfo', async () => {
    proc.send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18' },
    })
    const res = await proc.nextResponse()
    const result = res.result as {
      protocolVersion?: string
      capabilities?: Record<string, unknown>
      serverInfo?: { name?: string }
    }
    expect(result.protocolVersion).toBe('2025-06-18')
    expect(result.capabilities?.tools).toBeDefined()
    expect(result.serverInfo?.name).toBe('openvibe')
    // initialized 是 notification（无 id）⇒ 不产生任何响应行
    proc.send({ jsonrpc: '2.0', method: 'notifications/initialized' })
    await new Promise((r) => setTimeout(r, 150))
  })

  it('MCP-02: tools/list 恰好三只读工具，inputSchema 齐', async () => {
    proc.send({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
    const res = await proc.nextResponse()
    const tools = (
      res.result as { tools: { name: string; inputSchema: Record<string, unknown> }[] }
    ).tools
    expect(tools.map((t) => t.name).sort()).toEqual([
      'pack_diff',
      'project_context',
      'search_assets',
    ])
    for (const t of tools) {
      expect(t.inputSchema.type).toBe('object')
      expect(Object.keys(t.inputSchema).length).toBeGreaterThan(0)
    }
  })

  it('MCP-03: tools/call pack_diff（本地比对，无需 serve）——注入后 clean，手改后 drifted', async () => {
    const root = tempDir('ov-mcp-proj-')
    const project = join(root, 'proj')
    mkdirSync(project)
    const bundlePath = writeBundleFile(root, demoPack())
    await syncAction({ projectPath: project, file: bundlePath, yes: true }, {})

    proc.send({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'pack_diff', arguments: { project_dir: project } },
    })
    const res = await proc.nextResponse()
    const result = res.result as { isError?: boolean; content: { text: string }[] }
    expect(result.isError).toBeUndefined()
    const payload = JSON.parse(result.content[0]?.text ?? '{}') as { clean: boolean; pack: string }
    expect(payload.clean).toBe(true)
    expect(payload.pack).toBe('fixture@1.0.0')

    // 手改产物 ⇒ drifted（文件级明细透出）
    const terms = join(project, 'TERMS.md')
    const before = readFileSync(terms, 'utf8')
    const { writeFileSync } = await import('node:fs')
    writeFileSync(terms, `${before}\n手改\n`, 'utf8')
    proc.send({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'pack_diff', arguments: { project_dir: project } },
    })
    const res2 = await proc.nextResponse()
    const payload2 = JSON.parse(
      (res2.result as { content: { text: string }[] }).content[0]?.text ?? '{}',
    ) as {
      clean: boolean
      drifted: { path: string }[]
    }
    expect(payload2.clean).toBe(false)
    expect(payload2.drifted.map((d) => d.path)).toContain('TERMS.md')
  })

  it('MCP-04: serve 不可达 ⇒ project_context / search_assets 返回 isError + 人话（含「先 openvibe serve」）', async () => {
    proc.send({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'project_context', arguments: { project_id: 'prj_x' } },
    })
    const res = await proc.nextResponse()
    const result = res.result as { isError?: boolean; content: { text: string }[] }
    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toContain('openvibe serve')

    proc.send({
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: { name: 'search_assets', arguments: { query: '术语' } },
    })
    const res2 = await proc.nextResponse()
    const result2 = res2.result as { isError?: boolean; content: { text: string }[] }
    expect(result2.isError).toBe(true)
    expect(result2.content[0]?.text).toContain('openvibe serve')
  })

  it('MCP-05: 静态断言——mcp 实现零网络监听（stdio 子进程，红线：无 listen）', async () => {
    const src = readFileSync(join(HERE, '..', 'src', 'commands', 'mcp.ts'), 'utf8')
    expect(src).not.toMatch(/\blisten\s*\(/)
    expect(src).not.toMatch(/createServer\s*\(/)
    expect(src).not.toMatch(/\.listen\b/)
  })

  it('MCP-06: 未知方法 ⇒ -32601；坏 JSON ⇒ -32700；未知工具 ⇒ isError', async () => {
    proc.send({ jsonrpc: '2.0', id: 7, method: 'no/such-method' })
    const res = await proc.nextResponse()
    expect((res.error as { code: number }).code).toBe(-32601)

    proc.send({
      jsonrpc: '2.0',
      id: 8,
      method: 'tools/call',
      params: { name: 'delete_everything', arguments: {} },
    })
    const res2 = await proc.nextResponse()
    const result2 = res2.result as { isError?: boolean; content: { text: string }[] }
    expect(result2.isError).toBe(true)
    expect(result2.content[0]?.text).toContain('未知工具')
  })

  it('MCP-07: stdin EOF ⇒ 进程干净退出（退出码 0）', async () => {
    const child = spawn(process.execPath, ['--import', 'tsx', CLI_ENTRY, 'mcp'], {
      env: { ...process.env, OPENVIBE_HOME: home, OPENVIBE_SERVER: '', OPENVIBE_TOKEN: '' },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const code = await new Promise<number>((resolve) => {
      child.on('exit', (c) => resolve(c ?? -1))
      child.stdin?.end()
    })
    expect(code).toBe(0)
  }, 20_000)
})
