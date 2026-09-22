import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { openerArgs, serveAction, type ServeResult } from '../src/commands/serve'

const SEED_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'content', 'seed')
const CLI_ENTRY = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'index.ts')
const homes: string[] = []
const open: ServeResult[] = []

function tempHome(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ov-serve-home-'))
  homes.push(dir)
  return dir
}

afterAll(async () => {
  while (open.length) await open.pop()?.close()
  while (homes.length) rmSync(homes.pop() ?? '', { recursive: true, force: true })
})

/** /api 受 Bearer 保护：不带令牌的 fetch 只会拿到 401，断言会变空转 */
const termsTotal = async (r: ServeResult) =>
  (
    (await (
      await fetch(`${r.url}/api/terms`, { headers: { authorization: `Bearer ${r.token}` } })
    ).json()) as { total: number }
  ).total

describe('serve 首启初始化（m6b FR-1，dev-plan §1.2 步骤 1/2/8）', () => {
  it('CLI-SERVE-01: 首启建目录 + config.json 0600 + 令牌持久化；二次启动不重播种', async () => {
    const home = tempHome()
    const first = await serveAction({ home, port: 0, seedDir: SEED_DIR })
    open.push(first)

    expect(first.firstRun).toBe(true)
    for (const sub of ['data', 'packs', 'logs']) expect(existsSync(join(home, sub))).toBe(true)
    expect(first.configPath).toBe(join(home, 'config.json'))
    expect(first.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)

    const saved = JSON.parse(readFileSync(first.configPath, 'utf8')) as Record<string, unknown>
    expect(saved.serverUrl).toBe(first.url)
    expect(saved.token).toMatch(/^[0-9a-f]{64}$/)
    expect(saved.port).toBe(Number(new URL(first.url).port))
    if (process.platform !== 'win32') expect(statSync(first.configPath).mode & 0o777).toBe(0o600)

    const termsBefore = await termsTotal(first)
    await first.close()
    open.pop()

    const second = await serveAction({ home, port: 0, seedDir: SEED_DIR })
    open.push(second)
    expect(second.firstRun).toBe(false)
    expect(second.token).toBe(saved.token)
    expect(second.seed.bundles.terms).toBe('skipped')
    expect(second.seed.created.terms).toBe(0)
    expect(await termsTotal(second)).toBe(termsBefore)
  })

  it('CLI-SERVE-02: 已存在但令牌不合法的 config.json → 重新生成并覆盖，不静默带着坏令牌启动', async () => {
    const home = tempHome()
    const r = await serveAction({ home, port: 0, seedDir: SEED_DIR })
    open.push(r)
    const good = JSON.parse(readFileSync(r.configPath, 'utf8')).token as string
    await r.close()
    open.pop()

    writeFileSync(r.configPath, '{"serverUrl":"http://127.0.0.1:8787","token":"","port":8787}')
    const again = await serveAction({ home, port: 0, seedDir: SEED_DIR })
    open.push(again)
    expect(again.token).toMatch(/^[0-9a-f]{64}$/)
    expect(again.token).not.toBe(good)
    expect(again.warnings.join(' ')).toContain('config.json')
  })

  it('CLI-SERVE-03: --open 只解析各平台的浏览器命令，且可注入不外开', async () => {
    expect(openerArgs('darwin', 'http://127.0.0.1:8787')).toEqual({
      command: 'open',
      args: ['http://127.0.0.1:8787'],
    })
    expect(openerArgs('linux', 'http://x')).toEqual({ command: 'xdg-open', args: ['http://x'] })
    expect(openerArgs('win32', 'http://x')).toEqual({
      command: 'cmd',
      args: ['/c', 'start', '', 'http://x'],
    })

    const spy = vi.fn()
    const home = tempHome()
    const r = await serveAction({ home, port: 0, seedDir: SEED_DIR, open: true, opener: spy })
    open.push(r)
    expect(spy).toHaveBeenCalledWith(r.url)
  })

  it('CLI-SERVE-04: 子进程真跑 bin——--version 与 serve --help 退出码 0', () => {
    const run = (args: string[]) =>
      // 子进程上限压在 vitest testTimeout（cli 项目 30s）之内，超时才落在断言里而非被外部杀掉
      spawnSync(process.execPath, ['--import', 'tsx', CLI_ENTRY, ...args], {
        encoding: 'utf8',
        timeout: 25_000,
      })

    const version = run(['--version'])
    expect(version.status).toBe(0)
    expect(version.stdout).toMatch(/^\d+\.\d+\.\d+/)

    const help = run(['serve', '--help'])
    expect(help.status).toBe(0)
    expect(help.stdout).toContain('--port')
    expect(help.stdout).toContain('--open')
  })
})
