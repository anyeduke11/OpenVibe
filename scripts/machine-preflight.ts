/**
 * scripts/machine-preflight.ts —— 跑测试**之前**先看机器扛不扛得住（2026-11-02）。
 *
 * ## 它解决什么
 *
 * 2026-11-02 实测事故：全量测试先后两轮超时红（18 文件/50 例、13 文件/28 例），
 * 而那两轮的**机器负载完全不同**（509 与 73）⇒ 负载不是原因。
 * 真正的根因是**换页**：`vm.swapusage` 实测 total 17.4 GB / used 15.9 GB、
 * `Pages free` 仅 7494 页（**117 MB 可用内存**）⇒ 机器在疯狂换页 ⇒
 * 任何耗时操作被放大 10 倍（`collect` 阶段正常约 40s、实测 333s）⇒
 * 用例越过超时闸 ⇒ 一片假红 ⇒ **看起来像「代码坏了」**。
 *
 * ⇒ 本脚本把「机器扛不扛得住」变成**跑测试前就能读到的一句话**，
 *   并据此**下调并发**（而不是让人事后从一堆红里猜是不是环境问题）。
 *
 * ## 为什么「下调并发」能治换页
 *
 * 并发越高 ⇒ 同时驻留的 worker 越多 ⇒ 内存缺口越大 ⇒ 换页越多 ⇒ 越慢。
 * ⇒ **降并发就是降内存峰值** ⇒ 这是本脚本唯一能动的那根杠杆
 *   （换页本身不能从仓内解决：swap 大小是机器配置）。
 *
 * ## 判定口径（三条，任一命中即降并发）
 *
 * ① **可用内存 < 1 GB** ⇒ 机器已经在靠 swap 撑 ⇒ 降到 1；
 * ② **swap 使用率 > 80%** ⇒ 内存已经不够用 ⇒ 降到 1；
 * ③ 以上都没有 ⇒ 用配置文件里的默认并发（不干预）。
 *
 * ⚠️ **阈值为什么是 1 GB / 80%**：本机实测的换页起点约在「可用内存 < 200 MB」，
 *   而「1 GB」留了 5 倍余量 —— 宁可**早降**（多花点时间）也不要
 *   **晚降**（跑一半才假红，那轮结果直接作废）。
 *
 * ## 纯逻辑与采集分离
 *
 * `decideWorkers()` 是**纯函数**（吃内存/swap 数字，出结论）⇒ 判据测试
 * 能直接喂边界值，不依赖「真的把机器内存耗光」⇒ 由 `tests/machine-preflight.test.ts` 判据。
 * `readMemoryPressure()` 负责采集（读 OS）⇒ 只在真跑时调。
 */
import { execFileSync } from 'node:child_process'
import { freemem, totalmem } from 'node:os'

/** 可用内存低于此值（字节）⇒ 降并发。1 GB。 */
export const LOW_FREE_MEM_BYTES = 1024 * 1024 * 1024

/** swap 使用率高于此值 ⇒ 降并发。0.8。 */
export const HIGH_SWAP_RATIO = 0.8

/** 机器扛不住时降到几。1 = 串行。 */
export const DEGRADED_WORKERS = 1

/**
 * 机器扛得住时用的默认并发。
 *
 * ⚠️ **单源纪律**：这个值与 `vitest.config.ts` 的 `maxWorkers` 是**同一个数**
 *   （本仓是 2，2026-11-02 实测定的）⇒ 改一处必须改两处 ⇒
 *   `tests/machine-preflight.test.ts` 有一条判据**盯住这个一致性**（读配置文件比对），
 *   免得将来只改了一边 ⇒ 并发口径漂移。
 */
export const DEFAULT_WORKERS = 2

/**
 * 内存压力的**原始数字**（采集层与判定层之间的契约）。
 *
 * ⚠️ `swapTotalBytes = 0` 表示「**取不到 swap 信息**」（如 Linux 无此接口）
 *   ⇒ 判定时**跳过 swap 那条**，而不是当成「swap 用量为 0」⇒ 否则
 *   「查不到」会被误读成「很健康」。
 */
export interface MemoryPressure {
  /** 物理内存总量（字节） */
  totalBytes: number
  /** 当前可用内存（字节） */
  freeBytes: number
  /** swap 总量（字节）；0 = 取不到 */
  swapTotalBytes: number
  /** swap 已用量（字节）；0 = 取不到 */
  swapUsedBytes: number
}

/**
 * 判据结论。
 *
 * ⚠️ `reason` 必须是**人话 + 具体数字**（不是「内存不足」）——
 *   它的作用是让人在看到假红时能立刻判断「这是环境问题还是代码问题」。
 */
export interface PreflightDecision {
  /** 建议的并发数（正整数） */
  workers: number
  /** 是否因机器压力而下调（false = 不干预，用默认并发） */
  degraded: boolean
  /** 人话理由（含具体数字） */
  reason: string
}

/**
 * 纯判定：给内存压力数字 ⇒ 给并发建议。
 *
 * @param pressure 采集到的内存压力
 * @param defaultWorkers 机器扛得住时用的并发（来自配置文件）
 */
export function decideWorkers(pressure: MemoryPressure, defaultWorkers: number): PreflightDecision {
  const memGb = (bytes: number): string => (bytes / 1024 / 1024 / 1024).toFixed(2)
  const swapKnown = pressure.swapTotalBytes > 0
  const swapRatio = swapKnown ? pressure.swapUsedBytes / pressure.swapTotalBytes : 0

  // ① 可用内存太低 ⇒ 已经在靠 swap 撑
  if (pressure.freeBytes < LOW_FREE_MEM_BYTES) {
    return {
      workers: DEGRADED_WORKERS,
      degraded: true,
      reason:
        `可用内存 ${memGb(pressure.freeBytes)} GB < 1 GB（总量 ${memGb(pressure.totalBytes)} GB）` +
        `⇒ 机器已在靠 swap 撑 ⇒ 并发降到 ${String(DEGRADED_WORKERS)}`,
    }
  }

  // ② swap 用得太狠 ⇒ 内存已经不够用
  if (swapKnown && swapRatio > HIGH_SWAP_RATIO) {
    return {
      workers: DEGRADED_WORKERS,
      degraded: true,
      reason:
        `swap 使用率 ${(swapRatio * 100).toFixed(0)}% > 80%` +
        `（已用 ${memGb(pressure.swapUsedBytes)} GB / 总量 ${memGb(pressure.swapTotalBytes)} GB）` +
        `⇒ 内存不够用 ⇒ 并发降到 ${String(DEGRADED_WORKERS)}`,
    }
  }

  // ③ 机器扛得住 ⇒ 不干预
  const swapText = swapKnown
    ? `，swap 使用率 ${(swapRatio * 100).toFixed(0)}%`
    : '，swap 信息取不到（跳过该条判定）'
  return {
    workers: defaultWorkers,
    degraded: false,
    reason: `可用内存 ${memGb(pressure.freeBytes)} GB${swapText} ⇒ 机器扛得住 ⇒ 并发维持 ${String(defaultWorkers)}`,
  }
}

/**
 * 采集 swap 数字（macOS 用 `vm.swapusage`，取不到就返回 0/0）。
 *
 * ⚠️ **取不到就返回 0**（而不是抛错、更不是编一个数）⇒ 判定层会跳过 swap 那条。
 */
export function readSwap(): { totalBytes: number; usedBytes: number } {
  try {
    const out = execFileSync('sysctl', ['-n', 'vm.swapusage'], { encoding: 'utf8' })
    // 形如：total = 17408.00M  used = 15964.00M  free = 1444.00M  (encrypted)
    const total = /total\s*=\s*([\d.]+)M/.exec(out)
    const used = /used\s*=\s*([\d.]+)M/.exec(out)
    if (total === null || used === null) return { totalBytes: 0, usedBytes: 0 }
    return {
      totalBytes: Math.round(Number(total[1]) * 1024 * 1024),
      usedBytes: Math.round(Number(used[1]) * 1024 * 1024),
    }
  } catch {
    // Linux 等没有这个接口 ⇒ 交由判定层跳过该条
    return { totalBytes: 0, usedBytes: 0 }
  }
}

/**
 * 采集当前机器的内存压力。
 */
export function readMemoryPressure(): MemoryPressure {
  const swap = readSwap()
  return {
    totalBytes: totalmem(),
    freeBytes: freemem(),
    swapTotalBytes: swap.totalBytes,
    swapUsedBytes: swap.usedBytes,
  }
}

/**
 * 命令行入口：打印一条人话结论（供人读，也供别的脚本消费）。
 *
 * ⚠️ **默认并发只有一个出处**：`DEFAULT_WORKERS`（与 `vitest.config.ts` 的
 *   `maxWorkers` 是同一个数，由判据测试盯住一致性）⇒ 这里**不硬编码数字**，
 *   也不从 `argv[0]` 取「默认为 2」——那会多出第四个副本。
 *   ⇒ `argv[0]` 只作**显式覆盖**用（不传就用 `DEFAULT_WORKERS`）。
 */
export function main(argv: string[]): number {
  const override = Number(argv[0])
  const defaultWorkers = Number.isFinite(override) && override > 0 ? override : DEFAULT_WORKERS
  const decision = decideWorkers(readMemoryPressure(), defaultWorkers)
  console.log(`[preflight] ${decision.reason}`)
  if (decision.degraded) {
    console.log(
      '[preflight] ⚠️ 这是**环境问题**不是代码问题：机器内存吃紧时，超时闸会误判成「功能回归」。' +
        '若看到大批超时，先看这一行。',
    )
  }
  return 0
}

// 直接跑（被 import 时不跑）
if (process.argv[1] !== undefined && process.argv[1].endsWith('machine-preflight.ts')) {
  process.exitCode = main(process.argv.slice(2))
}
