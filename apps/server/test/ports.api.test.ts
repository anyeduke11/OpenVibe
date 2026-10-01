import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { newDb, type TestDbHandle } from '@openvibe/core/test-support'
import { buildApp } from '../src/app'
import type { PortRouteDeps } from '../src/routes/ports'
import {
  listListeners,
  parseLsofListen,
  parseNetstatListen,
  scanDeclaredServices,
  type CommandRunner,
} from '../src/lib/port-scan'

const TOKEN = 'test-token'

interface Harness {
  app: FastifyInstance
  handle: TestDbHandle
  root: string
}

const openHandles: Harness[] = []

async function makeHarness(
  listListenersImpl?: PortRouteDeps['listListenersImpl'],
): Promise<Harness> {
  const handle = newDb()
  const { app } = await buildApp({ db: handle.db, token: TOKEN, listListenersImpl })
  const h: Harness = { app, handle, root: mkdtempSync(join(tmpdir(), 'ov-ports-')) }
  openHandles.push(h)
  return h
}

afterEach(() => {
  while (openHandles.length > 0) {
    const h = openHandles.pop()
    void h?.app.close()
    h?.handle.close()
    if (h) rmSync(h.root, { recursive: true, force: true })
  }
})

async function api<T>(
  h: Harness,
  method: 'GET' | 'POST',
  path: string,
  payload?: object,
): Promise<{ status: number; json: T }> {
  const res = await h.app.inject({
    method,
    url: path,
    payload,
    headers: { authorization: `Bearer ${TOKEN}` },
  })
  return { status: res.statusCode, json: res.json() as T }
}

describe('port-scan · 声明扫描器（纯文件解析）', () => {
  it('读 .env PORT / package.json --port / 约定依赖 / compose / Dockerfile，同端口按优先级去重', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ov-scan-'))
    try {
      writeFileSync(join(dir, '.env'), 'PORT=4321\nDATABASE_URL=postgres://…\n')
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({
          scripts: {
            dev: 'vite --port 4321',
            start: 'PORT=8787 node server.js',
            build: 'vite build',
          },
          dependencies: { vue: '^3', vite: '^6' },
        }),
      )
      writeFileSync(join(dir, 'docker-compose.yml'), 'services:\n  web:\n    ports:\n      - "8080:80"\n      - 9090:90\n')
      writeFileSync(join(dir, 'Dockerfile'), 'FROM node:22\nEXPOSE 4321/tcp\nCMD ["npm","run","dev"]\n')

      const { declared, scannedFiles } = scanDeclaredServices(dir)
      const byPort = new Map(declared.map((d) => [d.port, d]))
      // 4321：dotenv(1) < script(2) < dockerfile(5)，取 dotenv
      expect(byPort.get(4321)?.source).toBe('dotenv')
      // 8787 来自 script:start
      expect(byPort.get(8787)?.service).toBe('script:start')
      // 8080 compose、9090 compose
      expect(byPort.get(8080)?.source).toBe('compose')
      expect(byPort.get(9090)?.source).toBe('compose')
      // vite 是真实依赖 → 约定 5173
      expect(byPort.get(5173)?.source).toBe('convention')
      expect(scannedFiles).toContain('./.env')
      expect(scannedFiles).toContain('./package.json')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('monorepo 一级子包：apps/*/package.json 的约定依赖与 scripts 端口都被认出', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ov-scan-mono-'))
    try {
      const web = join(dir, 'apps', 'web')
      mkdirSync(web, { recursive: true })
      writeFileSync(
        join(web, 'package.json'),
        JSON.stringify({ scripts: { dev: 'vite --port 5173' }, devDependencies: { vite: '^6' } }),
      )
      const srv = join(dir, 'packages', 'core')
      mkdirSync(srv, { recursive: true })
      writeFileSync(join(srv, '.env'), 'PORT=8787\n')
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts: { dev: 'echo hi' } }))

      const { declared, scannedFiles } = scanDeclaredServices(dir)
      const byPort = new Map(declared.map((d) => [d.port, d]))
      expect(byPort.get(5173)).toMatchObject({
        service: 'script:dev',
        sourceFile: 'apps/web/package.json',
      })
      expect(byPort.get(8787)).toMatchObject({ source: 'dotenv', sourceFile: 'packages/core/.env' })
      expect(scannedFiles).toContain('apps/web/package.json')
      expect(scannedFiles).toContain('packages/core/.env')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('空目录零声明零文件；非法 JSON 不炸', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ov-scan-empty-'))
    try {
      writeFileSync(join(dir, 'package.json'), '{not json')
      expect(scanDeclaredServices(dir)).toEqual({ declared: [], scannedFiles: ['./package.json'] })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('port-scan · 监听器解析（罐头输出）', () => {
  it('lsof：全接口 *:port / 回环 / IPv6 归一，按端口排序', () => {
    const text = [
      'COMMAND   PID USER   FD   TYPE   DEVICE SIZE/OFF NODE NAME',
      'node    83015 duke   18u  IPv4  0x5afed  0t0  TCP *:5173 (LISTEN)',
      'node    73250 duke   29u  IPv4  0x911c6  0t0  TCP 127.0.0.1:8787 (LISTEN)',
      'python3   999 duke   31u  IPv6  0x911d0  0t0  TCP [::]:8000 (LISTEN)',
      'Code   1234 duke   41u  IPv4  0x91200  0t0  TCP 192.168.1.5:9229 (LISTEN)',
    ].join('\n')
    const parsed = parseLsofListen(text)
    expect(parsed.map((l) => l.port)).toEqual([5173, 8000, 8787, 9229])
    expect(parsed[0]).toMatchObject({ port: 5173, addr: '*', process: 'node', pid: 83015 })
    expect(parsed[1]).toMatchObject({ port: 8000, addr: '*', process: 'python3', pid: 999 })
    expect(parsed[2]).toMatchObject({ port: 8787, addr: '127.0.0.1' })
    expect(parsed[3]).toMatchObject({ port: 9229, addr: '192.168.1.5' })
  })

  it('netstat：0.0.0.0/[::] 归一 *，LISTENING 行提取 pid', () => {
    const text = [
      '  Proto  Local Address          Foreign Address        State           PID',
      '  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       12345',
      '  TCP    [::]:3000              [::]:0                 LISTENING       12345',
      '  TCP    127.0.0.1:8787         127.0.0.1:0            LISTENING       999',
      '  TCP    127.0.0.1:50000        127.0.0.1:8787         ESTABLISHED     4242',
    ].join('\n')
    const parsed = parseNetstatListen(text)
    expect(parsed).toHaveLength(3)
    expect(parsed[0]).toMatchObject({ port: 3000, addr: '*', pid: 12345 })
    expect(parsed[2]).toMatchObject({ port: 8787, addr: '127.0.0.1', pid: 999 })
  })

  it('真机命令不可用时降级为 warning 不抛（runner 注入抛错）', async () => {
    // 查听命令本身分平台（darwin/linux=lsof，win32=netstat -ano），warning 前缀跟着命令名走
    const expected =
      process.platform === 'win32'
        ? { file: 'netstat', args: ['-ano', '-p', 'tcp'], prefix: 'netstat 查询失败' }
        : { file: 'lsof', args: ['-nP', '-iTCP', '-sTCP:LISTEN'], prefix: 'lsof 查询失败' }
    let invoked: { file: string; args: string[] } | undefined
    const boom: CommandRunner = async (file, args) => {
      invoked = { file, args }
      throw new Error('command not found')
    }
    const r = await listListeners(boom)
    expect(r.listeners).toEqual([])
    expect(invoked).toEqual({ file: expected.file, args: expected.args })
    expect(r.warning).toContain(expected.prefix)
  })
})

describe('GET /api/projects/:id/ports', () => {
  /** 内存库无种子：先自建一条最小模板再挂项目（与 flow.api.test.ts 同法） */
  async function mkProject(h: Harness, localPath?: string): Promise<string> {
    const tpl = await api<{ id: string }>(h, 'POST', '/api/flow-templates', {
      name: '端口测试模板',
      kind: 'custom',
      stages: [{ name: '开发', checklist: [], artifacts: [] }],
    })
    expect(tpl.status).toBe(201)
    const created = await api<{ id: string }>(h, 'POST', '/api/projects', {
      name: '演示项目',
      flowTemplateId: tpl.json.id,
      ...(localPath === undefined ? {} : { localPath }),
    })
    expect(created.status).toBe(201)
    return created.json.id
  }

  it('声明 × 监听合并：监听中的带进程与 url，未监听 idle', async () => {
    const h = await makeHarness()

    // 造一个项目目录：.env 声明 4321；注入 runner 假装 4321 在听、8787 也在听
    const projDir = join(h.root, 'proj')
    mkdirSync(projDir)
    writeFileSync(join(projDir, '.env'), 'PORT=4321\n')

    // 内存库无种子：自建一条最小模板（与 flow.api.test.ts 同法）
    const tpl = await api<{ id: string }>(h, 'POST', '/api/flow-templates', {
      name: '端口测试模板',
      kind: 'custom',
      stages: [{ name: '开发', checklist: [], artifacts: [] }],
    })
    expect(tpl.status).toBe(201)
    const created = await api<{ id: string }>(h, 'POST', '/api/projects', {
      name: '演示项目',
      flowTemplateId: tpl.json.id,
      localPath: projDir,
    })
    expect(created.status).toBe(201)
    const pid = created.json.id

    // 夹具随 listListeners 的平台分支换形：win32 跑 parseNetstatListen，喂 lsof 文本会解出 0 条
    const isWin = process.platform === 'win32'
    const fakeRunner: CommandRunner = async () =>
      (
        isWin
          ? [
              '  Proto  Local Address          Foreign Address        State           PID',
              '  TCP    127.0.0.1:4321         127.0.0.1:0            LISTENING       111',
              '  TCP    0.0.0.0:8787           0.0.0.0:0              LISTENING       222',
            ]
          : [
              'COMMAND   PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME',
              'node    111  duke   18u  IPv4 0x1 0t0  TCP 127.0.0.1:4321 (LISTEN)',
              'node    222  duke   19u  IPv4 0x2 0t0  TCP *:8787 (LISTEN)',
            ]
      ).join('\n')

    // 直接用 lib 组装（路由的注入点在 registerPortRoutes；此处走 buildApp 默认路径,
    // 但为了不依赖真机 lsof 的具体进程名，合并逻辑用注入 runner 独立验证一次）
    const { scanDeclaredServices: scan } = await import('../src/lib/port-scan')
    const live = await listListeners(fakeRunner)
    const declared = scan(projDir).declared
    const byPort = new Map(live.listeners.map((l) => [l.port, l]))
    const merged = declared.map((d) => {
      const l = byPort.get(d.port)
      return l === undefined ? { ...d, state: 'idle' as const } : { ...d, state: 'listening' as const, process: l.process, pid: l.pid, url: `http://localhost:${String(d.port)}` }
    })
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({
      port: 4321,
      state: 'listening',
      // netstat -ano 不含进程名，解析器统一补 'netstat' 占位（port-scan.ts:278）
      process: isWin ? 'netstat' : 'node',
      pid: 111,
      url: 'http://localhost:4321',
    })

    // 路由端到端（真机 lsof 在本机可用；CI 无 lsof 时 listenersWarning 降级仍 200）
    const res = await api<Record<string, unknown>>(h, 'GET', `/api/projects/${String(pid)}/ports`)
    expect(res.status).toBe(200)
    expect(res.json.projectPath).toBe(projDir)
    expect(Array.isArray(res.json.services)).toBe(true)
  })

  it('未登记 localPath ⇒ 空台账且 HTTP 200（projectPath 是空串，不是缺键也不是 4xx）', async () => {
    // m5 §6-7 / §7-7 那条 promise 此前只活在上一支的标题里，正文从未建过「没有路径」的项目。
    const h = await makeHarness()
    const pid = await mkProject(h)
    const res = await api<Record<string, unknown>>(h, 'GET', `/api/projects/${String(pid)}/ports`)
    expect(res.status).toBe(200)
    expect(res.json.projectPath).toBe('')
    expect(res.json.services).toEqual([])
    expect(res.json.scannedFiles).toEqual([])
    // 「只有本机监听清单」不要求非空（CI 上可能真的扫不到），只要求形状在
    expect(Array.isArray(res.json.listeners)).toBe(true)
  })

  it('localPath 指向已消失的目录 ⇒ 声明侧置空 + listenersWarning 说明原因，本机监听照报', async () => {
    // 注入一个「干净可用」的监听实现：否则 CI 上 lsof 缺失也会填上 listenersWarning，
    // 那条断言就分不清是目录原因还是扫描器原因（本机 darwin 有 lsof，红了也看不出来）。
    const h = await makeHarness(async () => ({ listeners: [] }))
    const gone = join(h.root, 'gone')
    const pid = await mkProject(h, gone)
    const res = await api<Record<string, unknown>>(h, 'GET', `/api/projects/${String(pid)}/ports`)
    expect(res.status).toBe(200)
    expect(res.json.projectPath).toBe(gone)
    expect(res.json.services).toEqual([])
    expect(res.json.scannedFiles).toEqual([])
    expect(typeof res.json.listenersWarning).toBe('string')
    expect(String(res.json.listenersWarning).length).toBeGreaterThan(0)
  })

  it('路由级合并（注入监听实现）：监听中的带 process/pid/url，未监听的三者一律缺席', async () => {
    // 上一支的 route 级断言只有 `Array.isArray(services)`——它只能证明「没抛」。端口是易变态，
    // 真机 lsof 在 CI 上给什么全凭运气，所以合并语义要端到端钉住就必须有注入点（本轮补上
    // buildApp 缺的那一层转发：registerPortRoutes 本来就收 listListenersImpl）。
    type Row = { port: number; state: string; process?: string; pid?: number; url?: string }
    const h = await makeHarness(async () => ({
      listeners: [{ port: 4321, addr: '127.0.0.1', process: 'node', pid: 111 }],
    }))
    const projDir = join(h.root, 'proj')
    mkdirSync(projDir)
    writeFileSync(join(projDir, '.env'), 'PORT=4321\n')
    writeFileSync(join(projDir, 'docker-compose.yml'), 'services:\n  web:\n    ports:\n      - "8787:80"\n')
    const pid = await mkProject(h, projDir)

    const res = await api<{ services: Row[] }>(h, 'GET', `/api/projects/${String(pid)}/ports`)
    expect(res.status).toBe(200)
    expect(res.json.services).toHaveLength(2)
    const byPort = new Map(res.json.services.map((s) => [s.port, s]))
    expect(byPort.get(4321)).toMatchObject({
      state: 'listening',
      process: 'node',
      pid: 111,
      url: 'http://localhost:4321',
    })
    const idle = byPort.get(8787)
    expect(idle?.state).toBe('idle')
    expect(idle?.process).toBeUndefined()
    expect(idle?.pid).toBeUndefined()
    expect(idle?.url).toBeUndefined()
  })

  it('不存在的项目 404', async () => {
    const h = await makeHarness()
    const res = await api(h, 'GET', '/api/projects/nope/ports')
    expect(res.status).toBe(404)
  })
})
