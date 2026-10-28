import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

/**
 * AN2 · `openvibe discuss` 的 CLI 腿（真子进程）：--json 契约（stdout 单对象）+
 * serve 不可达人话 + 退出码族。服务端行为由 apps/server/test/discuss.api.test.ts 背书。
 * 顺带断言 ask 契约零改动（AN2 验收 1：确定性七词原样——discuss 与 ask 并列不覆盖）。
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

const runCli = (args: string[], home: string) =>
  spawnSync(process.execPath, ['--import', 'tsx', CLI_ENTRY, ...args], {
    encoding: 'utf8',
    timeout: 25_000,
    env: { ...process.env, OPENVIBE_HOME: home, OPENVIBE_SERVER: '', OPENVIBE_TOKEN: '' },
  })

describe('openvibe discuss（CLI 腿）', () => {
  const home = tempDir('ov-discuss-home-')

  it('DISC-CLI-01: --json 下 stdout 单对象（command=discuss），退出码映射（serve 不可达/未配置）', () => {
    writeFileSync(
      join(home, 'config.json'),
      JSON.stringify({ serverUrl: 'http://127.0.0.1:1', token: 't', port: 1 }),
      {
        mode: 0o600,
      },
    )
    const res = runCli(['--json', 'discuss', '项目到哪了？'], home)
    // config 指向不可达端口：ask/discuss 依赖 serve —— 人话错误、退出码 1
    expect(res.status).toBe(1)
    const env = JSON.parse(res.stdout) as { command: string; summary: { error?: { code: string } } }
    expect(env.command).toBe('discuss')
    expect(env.summary.error?.code).toBeDefined()
  }, 30_000)

  it('DISC-CLI-02: 空问题 ⇒ 人话错误不透堆栈', () => {
    const res = runCli(['discuss', '  '], home)
    expect(res.status).toBe(1)
    expect(`${res.stdout}${res.stderr}`).toContain('问题不能为空')
  }, 30_000)

  it('DISC-CLI-03: ask 契约零改动——七词闭集原样、自由文本仍 UNKNOWN_QUERY（并列不覆盖的回归证明）', () => {
    const res = runCli(['--json', 'ask', '随便聊聊'], home)
    expect(`${res.stdout}${res.stderr}`).toContain('UNKNOWN_QUERY')
    const help = runCli(['--help'], home)
    // help 同时列出两命令（并列存在）
    expect(help.stdout).toContain('discuss')
    expect(help.stdout).toContain('ask')
  }, 30_000)
})
