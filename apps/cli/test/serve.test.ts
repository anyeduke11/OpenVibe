import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { TELEMETRY_FLUSH_INTERVAL_MS } from '@openvibe/shared'
import { openerArgs, serveAction, type ServeResult } from '../src/commands/serve'

const SEED_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'content', 'seed')
const CLI_ENTRY = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'index.ts')
const IS_WINDOWS = process.platform === 'win32'
const homes: string[] = []
const open: ServeResult[] = []

function tempHome(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ov-serve-home-'))
  homes.push(dir)
  return dir
}

/** serveAction 会把 home 桥接进 OPENVIBE_HOME（预置包导出与 home 同源），跑完还原免得串到别的用例 */
const REAL_HOME = process.env.OPENVIBE_HOME
afterAll(async () => {
  while (open.length) await open.pop()?.close()
  if (REAL_HOME === undefined) delete process.env.OPENVIBE_HOME
  else process.env.OPENVIBE_HOME = REAL_HOME
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

  it.skipIf(IS_WINDOWS)(
    'CLI-SERVE-01b: 首启落盘的 config.json 权限 0600（win32 无 POSIX 权限位）',
    async () => {
      const home = tempHome()
      const first = await serveAction({ home, port: 0, seedDir: SEED_DIR })
      open.push(first)
      expect(statSync(first.configPath).mode & 0o777).toBe(0o600)
      await first.close()
      open.pop()
    },
  )

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

  it('CLI-SERVE-05: telemetryEndpoint 读入即回显，serve 重写 config.json 时不抹掉用户手配的端点（T8d D-6）', async () => {
    const endpoint = 'http://127.0.0.1:8799/collect/test-token'
    const home = tempHome()
    writeFileSync(
      join(home, 'config.json'),
      JSON.stringify({
        serverUrl: 'http://127.0.0.1:8787',
        token: 'b'.repeat(64),
        port: 8787,
        telemetryEndpoint: endpoint,
      }),
      { mode: 0o600 },
    )

    const r = await serveAction({ home, port: 0, seedDir: SEED_DIR })
    open.push(r)
    expect(r.telemetry).toEqual({ endpoint, intervalMs: TELEMETRY_FLUSH_INTERVAL_MS })
    const saved = JSON.parse(readFileSync(r.configPath, 'utf8')) as Record<string, unknown>
    expect(saved.telemetryEndpoint).toBe(endpoint)
    // 端口换了、令牌沿用：重写只挪 serverUrl/port，端点原样带回去
    expect(saved.token).toBe('b'.repeat(64))
    expect(saved.serverUrl).toBe(r.url)

    // 未配置端点的家：回显空串，且不往 config.json 里凭空写一个键——「零外联」由此是结构性的
    const fresh = await serveAction({ home: tempHome(), port: 0, seedDir: SEED_DIR })
    open.push(fresh)
    expect(fresh.telemetry.endpoint).toBe('')
    expect(
      'telemetryEndpoint' in
        (JSON.parse(readFileSync(fresh.configPath, 'utf8')) as Record<string, unknown>),
    ).toBe(false)
  })

  it('CLI-SERVE-06: 只有 telemetryEndpoint 手打错时不连带换令牌，重写把坏端点摘掉（T9a-4）', async () => {
    const home = tempHome()
    const token = 'c'.repeat(64)
    writeFileSync(
      join(home, 'config.json'),
      JSON.stringify({
        serverUrl: 'http://127.0.0.1:8787',
        token,
        port: 8787,
        telemetryEndpoint: 'http://telemetry.example.com/collect',
      }),
      { mode: 0o600 },
    )

    const r = await serveAction({ home, port: 0, seedDir: SEED_DIR })
    open.push(r)
    expect(r.token).toBe(token)
    expect(r.telemetry.endpoint).toBe('')
    expect(r.warnings.join(' ')).toContain('telemetryEndpoint')
    expect(r.warnings.join(' ')).not.toContain('令牌已重新生成')
    const saved = JSON.parse(readFileSync(r.configPath, 'utf8')) as Record<string, unknown>
    expect(saved.token).toBe(token)
    expect(saved.serverUrl).toBe(r.url)
    expect('telemetryEndpoint' in saved).toBe(false)
  })
})
