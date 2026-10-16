import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * 真 CLI 子进程（`--json` 契约 / 退出码那几支的载体）。
 *
 * ⚠️ **必须用异步 spawn，不能用 spawnSync**：假服务端（`helpers/stub-server.ts`）跑在
 * 本测试进程里，而 `spawnSync` 会同步阻塞事件循环——子进程把请求发过来时没人 accept，
 * 5 秒后子进程超时退出，实测得到「exit 1 + 空 stderr + 零请求记录」的假象。
 * （本仓踩过一次：e2e-flow 用异步 spawn 也是同一个理由。）
 */

const CLI_ENTRY = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'index.ts')

export interface CliRunOptions {
  /** OPENVIBE_HOME 指向的临时目录：不让子进程读写真实 ~/.openvibe/config.json */
  home?: string
  /** 追加/覆盖环境变量（如 OPENVIBE_AGENT） */
  env?: Record<string, string | undefined>
  timeoutMs?: number
}

export interface CliRunResult {
  status: number
  stdout: string
  stderr: string
}

export function tempHome(): string {
  return mkdtempSync(join(tmpdir(), 'ov-cli-home-'))
}

export async function runCli(args: string[], options: CliRunOptions = {}): Promise<CliRunResult> {
  const home = options.home ?? tempHome()
  return new Promise<CliRunResult>((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', CLI_ENTRY, ...args], {
      env: {
        ...process.env,
        OPENVIBE_HOME: home,
        // 显式清空：真实环境里的 OPENVIBE_SERVER/TOKEN 会盖掉测试夹具
        OPENVIBE_SERVER: '',
        OPENVIBE_TOKEN: '',
        ...options.env,
      },
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (c: string) => {
      stdout += c
    })
    child.stderr.on('data', (c: string) => {
      stderr += c
    })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
    }, options.timeoutMs ?? 25_000)
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ status: code ?? -1, stdout, stderr })
    })
  })
}
