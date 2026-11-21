import { spawn } from 'node:child_process'
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { HOOKS_RUN_REL } from '@openvibe/core'
import type { HookDef } from '@openvibe/shared'

/**
 * N3 钩子执行引擎（docs/specs/n3-hooks.md FR-4）。
 *
 * 执行者是 CLI（FR-4.5：本机 shell 执行用户自定义命令），Web 只做配置（FR-3.3）。
 * 语义要点：
 * - 顺序执行：pre/post 各自按数组顺序（FR-4.1/FR-4.2）。
 * - 失败语义（FR-4.3）：`continue` 记 warning 不阻断；`block` 在 pre 阶段立即中止、
 *   在 post 阶段让 sync 返回非零退出码（落盘与锁已完成，不回滚）。
 * - 超时（FR-4.4）：超过 `timeoutMs` 杀进程，按失败处置。
 * - 留痕（FR-4.6）：每次执行追加一行到 `.openvibe/hooks-run.jsonl`，含失败与超时。
 */

export type HookPhase = 'pre' | 'post'

/** FR-4.6 留痕行：JSONL 每行一条，字段与规格一致。 */
export interface HookRunRecord {
  ts: string
  phase: HookPhase
  name: string
  command: string
  exitCode: number | null
  durationMs: number
  timedOut: boolean
  ok: boolean
}

export interface RunHooksDeps {
  /** 执行与留痕的基准目录（项目根） */
  cwd: string
  now?: () => Date
  /** 留痕写入失败时的警告出口（不阻断，FR-4.6 边界口径） */
  onWarning?: (msg: string) => void
}

export interface RunHooksResult {
  /** pre 阶段遇 block 失败：调用方必须中止 sync（不落盘、不写锁） */
  blocked: boolean
  /** 发生任何失败（含超时），post 阶段据此返回非零退出码 */
  hasFailure: boolean
  records: HookRunRecord[]
}

/**
 * 执行单个钩子：本机 shell 运行，带超时，返回留痕记录。
 * 不写留痕文件——留痕由 `runHooks` 统一追加，保持「执行」与「记录」分离。
 */
function runSingleHook(
  phase: HookPhase,
  hook: HookDef,
  deps: RunHooksDeps,
): Promise<HookRunRecord> {
  return new Promise<HookRunRecord>((resolve) => {
    const startedAt = (deps.now ?? (() => new Date()))()
    const startMs = Date.now()
    const record: HookRunRecord = {
      ts: startedAt.toISOString(),
      phase,
      name: hook.name,
      command: hook.command,
      exitCode: null,
      durationMs: 0,
      timedOut: false,
      ok: false,
    }

    let settled = false
    const finish = (): void => {
      if (settled) return
      settled = true
      record.durationMs = Date.now() - startMs
      resolve(record)
    }

    const child = spawn(hook.command, { shell: true, cwd: deps.cwd, stdio: 'pipe' })

    const timer = setTimeout(() => {
      if (settled) return
      record.timedOut = true
      // FR-4.4：超时即杀进程，绝不无限挂起。先 SIGTERM，短窗口后仍存活则 SIGKILL。
      try {
        child.kill('SIGTERM')
      } catch {
        /* 进程可能已退出，忽略 */
      }
      setTimeout(() => {
        if (!settled) {
          try {
            child.kill('SIGKILL')
          } catch {
            /* 已退出 */
          }
        }
      }, 200)
    }, hook.timeoutMs)

    // spawn 层面的错误（shell 无法启动等）：按失败处置，exitCode 留 null
    child.on('error', () => {
      if (settled) return
      clearTimeout(timer)
      record.exitCode = null
      record.ok = false
      finish()
    })

    child.on('close', (code) => {
      if (settled) return
      clearTimeout(timer)
      record.exitCode = code
      record.ok = !record.timedOut && code === 0
      finish()
    })
  })
}

/** FR-4.6：追加一条留痕到 `.openvibe/hooks-run.jsonl`；不可写只警告、不阻断。 */
function appendHookRecord(record: HookRunRecord, deps: RunHooksDeps): void {
  try {
    const file = join(deps.cwd, HOOKS_RUN_REL)
    mkdirSync(dirname(file), { recursive: true })
    appendFileSync(file, `${JSON.stringify(record)}\n`, 'utf8')
  } catch (e) {
    deps.onWarning?.(`钩子留痕写入失败（不阻断）：${(e as Error).message}`)
  }
}

/**
 * 按序执行一组钩子并留痕。
 * - pre 阶段：遇 `block` 失败立即停止后续钩子，`blocked=true`（调用方须中止 sync）。
 * - post 阶段：`block` 失败不停止后续钩子（落盘已完成、无回滚），仅置 `hasFailure=true`。
 * - `continue` 失败：记警告语义，继续执行后续钩子。
 */
export async function runHooks(
  phase: HookPhase,
  hooks: readonly HookDef[],
  deps: RunHooksDeps,
): Promise<RunHooksResult> {
  const records: HookRunRecord[] = []
  let blocked = false
  let hasFailure = false

  for (const hook of hooks) {
    const record = await runSingleHook(phase, hook, deps)
    appendHookRecord(record, deps)
    records.push(record)

    if (!record.ok) {
      hasFailure = true
      if (phase === 'pre' && hook.failPolicy === 'block') {
        blocked = true
        deps.onWarning?.(`pre 钩子「${hook.name}」失败（block）：中止注入`)
        break
      }
      deps.onWarning?.(
        `${phase} 钩子「${hook.name}」失败${
          record.timedOut ? `（超时 ${String(hook.timeoutMs)}ms）` : ''
        }（${hook.failPolicy}）`,
      )
    }
  }

  return { blocked, hasFailure, records }
}
