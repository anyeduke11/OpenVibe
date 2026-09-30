import { execFile } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import type { DeclaredService, PortListener, PortServiceSource } from '@openvibe/shared'

/**
 * 端口与服务扫描（m5 FR-8「端口与服务」卡的服务端事实层）。
 *
 * 安全面（write-up 见 DEV-0047）：
 * - 目录扫描只读仓库内已登记项目的 localPath 下的白名单文件名，解析失败静默跳过；
 * - 本机监听查询是 execFile(固定二进制, 固定参数数组)——无 shell、无字符串拼接、
 *   无任何用户输入进入 argv；lsof/netstat 都是只读系统查询；
 * - 解析器为纯函数（文本进、结构出），单测直接喂罐头输出，不依赖真机命令；
 * - 文本解析统一用 String.prototype.match（等价且不触碰 exec 歧义面）。
 */

const execFileP = promisify(execFile)

/**
 * 声明扫描面：项目根一层 + 一级子包（apps/*、packages/*，各自再认同一份名单）。
 * monorepo 的端口几乎都长在子包里（vite/next 服务在 apps/web 这类），只扫根等于没扫。
 * 子包只认目录型条目（node_modules 等按名单天然不存在），深度固定两层、不递归。
 */
const CANDIDATE_FILES = [
  '.env',
  '.env.local',
  '.env.example',
  'package.json',
  'vite.config.ts',
  'vite.config.js',
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yml',
  'compose.yaml',
  'Dockerfile',
] as const

/** 依赖名 → 约定端口（仅当 package.json dependencies 里真实出现才报） */
const CONVENTIONS: Readonly<Record<string, { port: number; service: string }>> = {
  vite: { port: 5173, service: 'vite' },
  '@angular/cli': { port: 4200, service: 'ng serve' },
  'react-scripts': { port: 3000, service: 'react-scripts' },
  next: { port: 3000, service: 'next' },
  nuxt: { port: 3000, service: 'nuxt' },
  astro: { port: 4321, service: 'astro' },
  '@sveltejs/kit': { port: 5173, service: 'svelte-kit' },
  flask: { port: 5000, service: 'flask' },
  uvicorn: { port: 8000, service: 'uvicorn' },
  'fastapi[standard]': { port: 8000, service: 'fastapi' },
}

export interface ScanDeclaredResult {
  declared: DeclaredService[]
  scannedFiles: string[]
}

interface RawHit {
  port: number
  service: string
  source: PortServiceSource
  sourceFile: string
  priority: number
}

const asRel = (name: string): string => `./${name}`

function pushHit(hits: RawHit[], hit: RawHit): void {
  if (Number.isInteger(hit.port) && hit.port >= 1 && hit.port <= 65_535) hits.push(hit)
}

/** `PORT=3000` / `export PORT=3000`（.env 族） */
function scanDotenv(text: string, sourceFile: string, hits: RawHit[]): void {
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?PORT\s*=\s*(\d{1,5})\s*(?:#.*)?$/)
    if (m?.[1] !== undefined) {
      pushHit(hits, {
        port: Number(m[1]),
        service: 'PORT',
        source: 'dotenv',
        sourceFile,
        priority: 1,
      })
    }
  }
}

/** scripts 里的 `--port 5173` / `-p 4173` / `PORT=3000`（package.json；子包场景 sourceFile 带子包前缀） */
function scanPackageScripts(
  pkg: Record<string, unknown>,
  sourceFile: string,
  hits: RawHit[],
): void {
  const scripts = pkg.scripts
  if (typeof scripts !== 'object' || scripts === null) return
  const deps: Record<string, unknown> = {}
  for (const key of ['dependencies', 'devDependencies'] as const) {
    if (typeof pkg[key] === 'object' && pkg[key] !== null) Object.assign(deps, pkg[key])
  }
  for (const [name, cmd] of Object.entries(scripts as Record<string, string>)) {
    const portMatch = cmd.match(/(?:^|\s)(?:--port|-p)\s+(\d{1,5})(?:\s|$)/)
    if (portMatch?.[1] !== undefined) {
      pushHit(hits, {
        port: Number(portMatch[1]),
        service: `script:${name}`,
        source: 'package-script',
        sourceFile,
        priority: 2,
      })
      continue
    }
    const envMatch = cmd.match(/(?:^|&&\s*|\s)PORT=(\d{1,5})(?:\s|$)/)
    if (envMatch?.[1] !== undefined) {
      pushHit(hits, {
        port: Number(envMatch[1]),
        service: `script:${name}`,
        source: 'package-script',
        sourceFile,
        priority: 2,
      })
    }
  }
  // 约定库：只在真实装了这个依赖时才报（否则每个仓库都长出 3000）
  for (const [dep, conv] of Object.entries(CONVENTIONS)) {
    if (deps[dep] !== undefined) {
      pushHit(hits, {
        port: conv.port,
        service: conv.service,
        source: 'convention',
        sourceFile,
        priority: 6,
      })
    }
  }
}

/** vite.config.* 里的 `port: 5173` / `port: 5173,`（config-file） */
function scanViteConfig(text: string, sourceFile: string, hits: RawHit[]): void {
  const m = text.match(/\bport\s*:\s*(\d{1,5})\b/)
  if (m?.[1] !== undefined) {
    pushHit(hits, {
      port: Number(m[1]),
      service: 'vite',
      source: 'config-file',
      sourceFile,
      priority: 3,
    })
  }
}

/** compose `ports:` 段的 `"8080:80"` / `8080:80`（行级解析：MVP 只认主机侧端口） */
function scanCompose(text: string, sourceFile: string, hits: RawHit[]): void {
  const seen: string[] = []
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*-\s*["']?(\d{1,5}):\d{1,5}(?:\/\w+)?["']?\s*(?:#.*)?$/)
    if (m?.[1] !== undefined) seen.push(m[1])
  }
  for (const port of new Set(seen)) {
    pushHit(hits, {
      port: Number(port),
      service: 'compose',
      source: 'compose',
      sourceFile,
      priority: 4,
    })
  }
}

/** Dockerfile `EXPOSE 8080`（可能带协议后缀，多条取全部） */
function scanDockerfile(text: string, sourceFile: string, hits: RawHit[]): void {
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*EXPOSE\s+(\d{1,5})(?:\/\w+)?\s*(?:#.*)?$/i)
    if (m?.[1] !== undefined) {
      pushHit(hits, {
        port: Number(m[1]),
        service: 'exposed',
        source: 'dockerfile',
        sourceFile,
        priority: 5,
      })
    }
  }
}

function scanOneFile(
  absFile: string,
  relFile: string,
  name: string,
  hits: RawHit[],
  scannedFiles: string[],
): void {
  let text: string
  try {
    text = readFileSync(absFile, 'utf8')
  } catch {
    return // 不可读（权限等）：跳过该文件，不阻断整体扫描
  }
  scannedFiles.push(relFile)
  if (name.startsWith('.env')) scanDotenv(text, relFile, hits)
  else if (name === 'package.json') {
    try {
      scanPackageScripts(JSON.parse(text) as Record<string, unknown>, relFile, hits)
    } catch {
      // 非法 JSON：跳过
    }
  } else if (name.startsWith('vite.config.')) scanViteConfig(text, relFile, hits)
  else if (name.includes('compose')) scanCompose(text, relFile, hits)
  else scanDockerfile(text, relFile, hits)
}

/** 汇总：同端口同服务名去重，再按端口排序；同端口多来源取优先级最高的一条 */
export function scanDeclaredServices(dir: string): ScanDeclaredResult {
  const root = resolve(dir)
  const hits: RawHit[] = []
  const scannedFiles: string[] = []

  for (const name of CANDIDATE_FILES) {
    const full = join(root, name)
    if (existsSync(full)) scanOneFile(full, asRel(name), name, hits, scannedFiles)
  }
  // 一级子包（apps/* / packages/*）：只进目录，名单同根
  for (const group of ['apps', 'packages']) {
    const groupDir = join(root, group)
    if (!existsSync(groupDir) || !statSync(groupDir).isDirectory()) continue
    let entries: string[]
    try {
      entries = readdirSync(groupDir)
    } catch {
      continue
    }
    for (const sub of entries.sort()) {
      const subDir = join(groupDir, sub)
      if (!statSync(subDir).isDirectory()) continue
      for (const name of CANDIDATE_FILES) {
        const full = join(subDir, name)
        if (existsSync(full)) {
          scanOneFile(full, `${group}/${sub}/${name}`, name, hits, scannedFiles)
        }
      }
    }
  }

  // 同端口去重：按（优先级, 来源名）取最具体的一条；scannedFiles 仍如实列出全部读过的文件
  const byPort = new Map<number, RawHit>()
  for (const hit of hits) {
    const cur = byPort.get(hit.port)
    if (cur === undefined || hit.priority < cur.priority) byPort.set(hit.port, hit)
  }
  const declared: DeclaredService[] = [...byPort.values()]
    .sort((a, b) => a.port - b.port || a.service.localeCompare(b.service))
    .map(({ port, service, source, sourceFile }) => ({ port, service, source, sourceFile }))
  return { declared, scannedFiles }
}

/** lsof 行 → 监听器（`TCP *:5173 (LISTEN)` / `TCP 127.0.0.1:8787 (LISTEN)` / IPv6 `[::]:3000`） */
export function parseLsofListen(text: string): PortListener[] {
  const out: PortListener[] = []
  for (const line of text.split('\n')) {
    const m = line.match(
      /^(\S+)\s+(\d+)\s+\S+\s+\S+\s+.*TCP\s+(\[[^\]]+\]|[^\s:]+):(\d{1,5})\s+\(LISTEN\)\s*$/,
    )
    if (m?.[1] === undefined || m[2] === undefined || m[3] === undefined || m[4] === undefined) {
      continue
    }
    const addr = m[3] === '*' || m[3] === '[::]' || m[3] === '::' ? '*' : m[3]
    out.push({ port: Number(m[4]), addr, process: m[1], pid: Number(m[2]) })
  }
  return out.sort((a, b) => a.port - b.port)
}

/** `netstat -ano` 的 LISTENING 行（Windows）→ 监听器 */
export function parseNetstatListen(text: string): PortListener[] {
  const out: PortListener[] = []
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*TCP\s+(\S+):(\d{1,5})\s+\S+\s+LISTENING\s+(\d+)\s*$/i)
    if (m?.[1] === undefined || m[2] === undefined || m[3] === undefined) continue
    const addr = m[1] === '0.0.0.0' || m[1] === '[::]' || m[1] === '::' ? '*' : m[1]
    out.push({ port: Number(m[2]), addr, process: 'netstat', pid: Number(m[3]) })
  }
  return out.sort((a, b) => a.port - b.port)
}

export type CommandRunner = (file: string, args: string[]) => Promise<string>

/** 默认 runner：promisified execFile（固定二进制 + 固定参数，见文件头安全面） */
const defaultRunner: CommandRunner = async (file, args) => {
  const { stdout } = await execFileP(file, args, { timeout: 10_000, maxBuffer: 4 * 1024 * 1024 })
  return stdout
}

export interface ListenersResult {
  listeners: PortListener[]
  warning?: string
}

/** 本机 TCP LISTEN 查询：darwin/linux 走 lsof，win32 走 netstat；不可用则降级为 warning */
export async function listListeners(runner: CommandRunner = defaultRunner): Promise<ListenersResult> {
  if (process.platform === 'win32') {
    try {
      return { listeners: parseNetstatListen(await runner('netstat', ['-ano', '-p', 'tcp'])) }
    } catch (e) {
      return { listeners: [], warning: `netstat 查询失败：${(e as Error).message}` }
    }
  }
  try {
    return { listeners: parseLsofListen(await runner('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN'])) }
  } catch (e) {
    return { listeners: [], warning: `lsof 查询失败：${(e as Error).message}` }
  }
}

/** 路由层断言：localPath 必须存在且是绝对路径（与注入状态读同源的语义） */
export function assertScannableDir(localPath: string): string {
  if (!isAbsolute(localPath)) {
    throw new Error('localPath 必须是绝对路径')
  }
  if (!existsSync(localPath)) {
    throw new Error(`项目目录不存在: ${localPath}`)
  }
  return resolve(localPath)
}
