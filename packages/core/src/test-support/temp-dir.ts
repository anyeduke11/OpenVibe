import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * 测试临时目录的**统一创建与自愈清理**（2026-11-01 · v0.2.4 R0 后续增强）。
 *
 * ## 它解决什么
 *
 * 本仓的测试夹具在 30 个文件里各自调 `mkdtempSync`（实测 77 处），销毁只挂在
 * **测试框架的正常路径**（`afterEach`）上 ⇒ 进程被中断（Ctrl-C、崩溃、超时被杀、
 * 机器重启）时，临时目录**留在磁盘上没人收**。
 *
 * ⇒ 实测事故（2026-10-31）：一次全量测试因磁盘满（`ENOSPC`）失败，而
 *   `/var/folders/.../T` 下积了 **987 个** `ov-*` 目录 ⇒ `afterEach` 的清理
 *   在 ENOSPC 下也失败 ⇒ **自我放大**（越跑越满 ⇒ 越跑越失败）。
 *   人工清掉 942 个目录后，可用空间从 440 MiB 回到 18 GiB。
 *
 * ## 为什么是「统一封装」而不是「逐个补 afterEach」
 *
 * ① 逐个补要改 30 个文件，且**新写的测试仍会漏**（漏的地方正是问题本身）；
 * ② 统一封装让「建目录」这件事**只有一个出口** ⇒ 兜底清理只需要写一次。
 *
 * ## 兜底怎么工作
 *
 * - 模块加载时注册三个处理器 ⇒ 覆盖**三条退出路径**：
 *   ① `exit`（正常结束、未捕获异常）⇒ 清理；
 *   ② `SIGINT`（Ctrl-C）⇒ **先清理再退出**（退出码 130，POSIX 惯例）；
 *   ③ `SIGTERM`（超时被杀、CI 取消）⇒ 同上（退出码 143）。
 * - ⚠️ **只挂 `exit` 是不够的**（2026-11-01 实测）：Node 在**信号终止**时
 *   **直接终止进程，不跑 `exit` 处理器** ⇒ 实测退出码 130 且目录残留。
 *   而信号终止正是事故场景里最常见的一种 ⇒ 必须显式接管信号。
 * - ⚠️ `exit` 处理器里**只能做同步操作**（Node 不会等异步）⇒ 用 `rmSync`。
 * - ⚠️ **不吞错**：清理失败（如权限）不影响退出码，但会打到 stderr（让人知道有残留）。
 * - ⚠️ **SIGKILL 不可救**（内核直接杀进程，用户态代码一律不跑）⇒ 那种情况只能靠
 *   「下次跑测试时先清残留」兜底（见 `scripts/sweep-stale-temps.ts`）。
 *
 * ## 用法
 *
 * ```ts
 * import { tempDir } from '@openvibe/core/test-support'
 *
 * const dir = tempDir('ov-my-test-')   // 退出时自动清理
 * ```
 *
 * 显式清理仍可做（提前释放磁盘，不必等进程结束）：
 *
 * ```ts
 * const dir = tempDir('ov-my-test-')
 * try { … } finally { cleanupTempDir(dir) }
 * ```
 */

/** 本进程建过的临时目录（退出时兜底清理） */
const created = new Set<string>()

/** 兜底处理器只装一次（多个模块 import 本模块时不会重复注册） */
let installed = false

function installExitHook(): void {
  if (installed) return
  installed = true

  /**
   * 立刻清掉本进程登记的所有临时目录（同步；退出处理器里只能做同步操作）。
   */
  const purgeAll = (): void => {
    for (const dir of created) {
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch (e) {
        // ⚠️ **不抛**：清理失败不该盖掉真正的退出原因 ⇒ 只如实报告，让「有残留」可见。
        process.stderr.write(
          `[temp-dir] 清理失败（残留）：${dir} —— ${e instanceof Error ? e.message : String(e)}\n`,
        )
      }
    }
    created.clear()
  }

  // ⚠️ **只挂 `exit` 是不够的**（2026-11-01 实测）：Node 在**信号终止**（SIGINT/SIGTERM）
  //   时**直接终止进程，不跑 `exit` 处理器** ⇒ 实测退出码 130 且目录残留。
  //   而信号终止正是事故场景里最常见的一种（Ctrl-C、超时被杀、CI 取消）。
  // ⇒ 显式接管这两个信号：先清理，再按「被信号终止」的退出码退出。
  const onSignal = (sig: NodeJS.Signals): void => {
    purgeAll()
    // 128 + 信号号（POSIX 惯例；SIGINT=2 ⇒ 130，SIGTERM=15 ⇒ 143）
    process.exit(128 + (sig === 'SIGINT' ? 2 : 15))
  }
  process.on('SIGINT', () => onSignal('SIGINT'))
  process.on('SIGTERM', () => onSignal('SIGTERM'))

  process.on('exit', purgeAll)
}

/**
 * 建一个临时目录，并登记为**退出时兜底清理**。
 *
 * @param prefix 目录名前缀（惯例：`ov-<用途>-`）
 * @returns 临时目录的绝对路径
 */
export function tempDir(prefix: string): string {
  installExitHook()
  const dir = mkdtempSync(join(tmpdir(), prefix))
  created.add(dir)
  return dir
}

/**
 * 显式清理一个由 `tempDir` 建的目录（提前释放磁盘，不必等进程结束）。
 *
 * @param dir 目录路径
 */
export function cleanupTempDir(dir: string): void {
  created.delete(dir)
  rmSync(dir, { recursive: true, force: true })
}

/**
 * 本进程当前登记的临时目录数（测试用：断言「退出兜底确实登记了」）。
 *
 * ⚠️ **只给测试看**：它是内部状态的观测口，不是公共 API。
 */
export function trackedTempDirCount(): number {
  return created.size
}
