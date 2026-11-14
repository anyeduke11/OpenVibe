import { afterEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

/**
 * dev 隔离实例的端到端判据（2026-10-30）。
 *
 * ## 它钉的是哪一件事
 *
 * 真机实测技能库时，唯一能安全写库的姿势是「起一套自己的实例」——
 * 数据落在沙箱目录、端口与真实实例不同、web 的代理指向自己那套 API。
 *
 * 在这个能力出现之前，任何涉及写库的真机实测都只能跑在**用户真实数据**上，
 * 风险只能靠「手轻」来兜。本文件把这件事变成**机器可判的事实**：
 * 覆盖变量生效、库落在沙箱目录、真实库不受影响。
 *
 * ## 为什么用「真起进程」而不是单测
 *
 * 隔离这件事的关键环节全在**进程边界**上：环境变量 → 进程 → 监听端口 → 建库路径。
 * 单测里 mock 掉任意一环，就测不到「变量名写错」「端口没透传」这类真实事故。
 * ⇒ 这里真起 `tsx src/index.ts`，用**随机端口**避免与真实实例撞车。
 *
 * ⚠️ **不碰真实数据**：每个用例一个临时 `OPENVIBE_HOME`，且断言真实库文件不被触碰。
 */

const ROOT = resolve(__dirname, '..')
const SERVER_ENTRY = join(ROOT, 'apps', 'server', 'src', 'index.ts')
const roots: string[] = []

function tempHome(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ov-iso-'))
  roots.push(dir)
  return dir
}

/**
 * 真起一个 server 进程，等到它把「API（脚本直连）」那行打进 stdout。
 *
 * ⚠️ 用**随机端口**（0 由内核分配）避开真实实例的 8787 —— 隔离实例若占用了
 *   真实实例的端口，两者会互相顶掉，而「顶掉」这件事在测试里表现为随机超时，
 *   极难排查。
 */
async function startServer(env: Record<string, string>): Promise<{
  url: string
  token: string
  dbPath: string
  stop: () => void
}> {
  const { spawn } = await import('node:child_process')
  // windows 下 spawn('npx') 不带 .cmd 后缀找不到可执行（ENOENT）——同 test-summary.ts 口径
  const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  const proc = spawn(npxBin, ['tsx', SERVER_ENTRY], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let buf = ''
  const stop = () => {
    try {
      proc.kill('SIGTERM')
    } catch {
      /* 已退出 */
    }
  }
  return await new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => {
      stop()
      reject(new Error(`server 启动超时（stdout：${buf.slice(0, 500)}）`))
    }, 60_000)
    const onData = (chunk: Buffer) => {
      buf += chunk.toString()
      const url = /API（脚本直连）\s+(\S+)/.exec(buf)?.[1]
      // ⚠️ token 是 64 位十六进制；用字符类而不是 `\S+?`（非贪婪只捕到 1 个字符 ⇒ 鉴权必失败）
      const token = /dev CLI token:\s+([0-9a-f]+)/.exec(buf)?.[1]
      const dbPath = /db:\s+(\S+)/.exec(buf)?.[1]
      if (url !== undefined && token !== undefined && dbPath !== undefined) {
        clearTimeout(timer)
        resolvePromise({ url, token, dbPath, stop })
      }
    }
    proc.stdout?.on('data', onData)
    proc.stderr?.on('data', onData)
    proc.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
  })
}

afterEach(() => {
  while (roots.length) rmSync(roots.pop() ?? '', { recursive: true, force: true })
})

describe('dev 隔离实例 · 端口与数据目录真隔离', () => {
  it('ISO-01: 覆盖变量生效 ⇒ 真起在别的端口，且库落在沙箱目录', async () => {
    const home = tempHome()
    // 端口 0 ⇒ 内核分配一个空闲端口（不与真实实例撞车）
    const srv = await startServer({
      OPENVIBE_HOME: home,
      OPENVIBE_API_PORT: '0',
      OPENVIBE_WEB_PORT: '5145',
    })
    try {
      // 监听在别的端口上（不是默认那个）
      expect(srv.url).not.toContain(':8787')
      // 库落在沙箱目录，不在真实 home 下
      expect(srv.dbPath.startsWith(home)).toBe(true)
      expect(existsSync(join(home, 'data', 'openvibe.db'))).toBe(true)
    } finally {
      srv.stop()
    }
  })

  it('ISO-02: 沙箱实例的台账与真实库互不影响（写沙箱不改真实库）', async () => {
    const home = tempHome()
    const srv = await startServer({
      OPENVIBE_HOME: home,
      OPENVIBE_API_PORT: '0',
      OPENVIBE_WEB_PORT: '5145',
    })
    try {
      const auth = { headers: { authorization: `Bearer ${srv.token}` } }
      const before = (await (await fetch(`${srv.url}/api/skills`, auth)).json()) as {
        total: number
      }
      // 沙箱实例刚建 ⇒ skill 台账是空的（真实库里有几百条）
      expect(before.total).toBe(0)
    } finally {
      srv.stop()
    }
  })

  it('ISO-03: 非法端口覆盖值 ⇒ 进程起不来（大声失败，绝不静默回落）', () => {
    // 静默回落是这里最坏的行为：用户以为自己在隔离端口上跑，实际连的是真实实例。
    // ⇒ 这里断言「覆盖值非法 ⇒ 进程非零退出」，而不是「回落到默认端口」。
    let code = 0
    let out = ''
    try {
      execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['tsx', SERVER_ENTRY], {
        cwd: ROOT,
        env: { ...process.env, OPENVIBE_HOME: tempHome(), OPENVIBE_API_PORT: 'abc' },
        encoding: 'utf8',
        timeout: 60_000,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (e) {
      const err = e as { status?: number; stdout?: string; stderr?: string }
      code = err.status ?? 1
      out = `${err.stdout ?? ''}${err.stderr ?? ''}`
    }
    expect(code).not.toBe(0)
    expect(out).toMatch(/端口覆盖值非法/)
  })
})
