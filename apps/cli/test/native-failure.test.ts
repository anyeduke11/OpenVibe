import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

/**
 * v0.2.3 批次 A FR-3 端到端腿（真子进程）：
 * `--require` 预挂钩把 require('better-sqlite3') 拦成 ABI 失败（ERR_DLOPEN_FAILED +
 * NODE_MODULE_VERSION 文案），spawn 真实 CLI 入口跑 `serve`——验证的是整条链：
 * 受控懒加载点抛 NativeStorageUnavailableError → bootstrap 既有信封
 * `DB_OPEN_FAILED`（诊断文本作为 message 原样带出，bootstrap.ts 的「数据库无法打开：」
 * 前缀 + 全文）→ printer.fail 人话输出 + 退出码 1。
 * 纯函数侧（分类/排版）在 packages/core/src/db/native-load.test.ts。
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const CLI_ENTRY = join(HERE, '..', 'src', 'index.ts')

const BREAK_HOOK = `\
const Module = require('node:module')
const origLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'better-sqlite3') {
    const err = new Error(
      'Was compiled against a different Node.js version using\\nNODE_MODULE_VERSION 137. This version of Node.js requires NODE_MODULE_VERSION 147.',
    )
    err.code = 'ERR_DLOPEN_FAILED'
    throw err
  }
  return origLoad.call(this, request, parent, isMain)
}
`

describe('批次 A FR-3：better-sqlite3 载入失败的可读诊断（真子进程）', () => {
  const home = mkdtempSync(join(tmpdir(), 'ov-native-home-'))
  const hookPath = join(home, 'break-better-sqlite3.cjs')
  writeFileSync(hookPath, BREAK_HOOK, 'utf8')

  afterAll(() => {
    rmSync(home, { recursive: true, force: true })
  })

  const runCli = (args: string[]) =>
    spawnSync(process.execPath, ['--import', 'tsx', '--require', hookPath, CLI_ENTRY, ...args], {
      encoding: 'utf8',
      timeout: 25_000,
      env: { ...process.env, OPENVIBE_HOME: home, OPENVIBE_SERVER: '', OPENVIBE_TOKEN: '' },
    })

  it('serve：三要素诊断 + DB_OPEN_FAILED 信封 + 退出码 1，不透出堆栈', () => {
    const res = runCli(['serve', '--port', '0'])
    const out = `${res.stdout ?? ''}${res.stderr ?? ''}`

    expect(res.status).toBe(1)
    expect(out).toContain('DB_OPEN_FAILED')
    expect(out).toContain('better-sqlite3 加载失败')
    // 要素一：平台与架构；要素二：Node 版本与 ABI；要素三：修复路径
    expect(out).toContain(process.platform)
    expect(out).toContain('NODE_MODULE_VERSION')
    expect(out).toContain('npm rebuild better-sqlite3')
    // 原始错误不再裸奔：无堆栈帧
    expect(out).not.toMatch(/^\s+at /m)
  }, 30_000)

  it('不打开数据库的路径不受影响：--help 照常可用（懒加载的附带收益）', () => {
    const res = runCli(['--help'])
    expect(res.status).toBe(0)
    expect(res.stdout).toContain('openvibe')
  }, 30_000)
})
