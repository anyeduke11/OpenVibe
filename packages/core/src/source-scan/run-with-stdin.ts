/**
 * `packages/core/src/source-scan/run-with-stdin.ts` —— **起子进程并往 stdin 写数据**
 *
 * ## ⚠️ 为什么不用 `execFile`
 *
 * `child_process.execFile` **没有 `input` 选项**（那是 `execFileSync` 才有的）⇒
 * 想把扫描规格送进子进程，只能自己拿 `spawn` 管管道。
 *
 * ⚠️ 也**不用 `spawnSync`** —— 它会**阻塞**父进程的事件循环：
 * 本仓的服务端在同一进程里跑 HTTP（记忆里那笔教训：「测试里用 spawnSync 起子进程
 * ⇒ 父进程的本地 HTTP 服务会假死」）⇒ 扫描接口必须**异步**。
 */
import { spawn } from 'node:child_process'

/** 子进程跑完的结果。 */
export interface RunResult {
  stdout: string
  stderr: string
  /** 退出码；被信号杀死时为 null */
  code: number | null
  /** 是否超时（⇒ 调用方要区分「超时」与「跑挂了」） */
  timedOut: boolean
}

/** 跑一个子进程，往它的 stdin 写 `input`，收它的输出。 */
export function runWithStdin(
  bin: string,
  args: readonly string[],
  input: string,
  opts: { timeoutMs?: number; maxBuffer?: number; cwd?: string } = {},
): Promise<RunResult> {
  const timeoutMs = opts.timeoutMs ?? 180_000
  const maxBuffer = opts.maxBuffer ?? 64 * 1024 * 1024
  return new Promise<RunResult>((resolvePromise, rejectPromise) => {
    const child = spawn(bin, [...args], {
      cwd: opts.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let overflow = false

    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
      if (stdout.length > maxBuffer) {
        overflow = true
        child.kill('SIGKILL')
      }
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      rejectPromise(err)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (overflow) {
        rejectPromise(new Error('子进程输出超过上限'))
        return
      }
      resolvePromise({ stdout, stderr, code, timedOut })
    })

    child.stdin.on('error', () => {
      // 子进程提前退出时写 stdin 会 EPIPE；错误信息由 stderr / 退出码承担。
    })
    child.stdin.end(input, 'utf8')
  })
}
