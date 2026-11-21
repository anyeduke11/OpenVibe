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
 * ## 判定口径（并发 = 三路上限取最小）
 *
 * ① **每 worker 的估算占用**（`WORKER_FOOTPRINT_BYTES` = 1 GiB）⇒
 *    `可用内存 ÷ 1 GiB` = 这台机器**当前能养活几个 worker**；
 * ② **可用内存 < 总内存的 1/8** ⇒ 连默认并发都养不起 ⇒ 降到 1；
 * ③ **swap 使用率 ≥ 85%** ⇒ 内存已经不够用 ⇒ 降到 1。
 *
 * 三路各给一个上限，**取最小值** ⇒ 任何一路说「不行」都不会被另一路掩盖。
 * 档位由结论反推：机器扛不住默认并发 ⇒ 吃紧；能养满默认并发但余量不足 ⇒ 紧张；否则充裕。
 * ⚠️ **「档位」与「是否真的下调过」是两件事**：`degraded` 只在并发**确实小于**默认并发时为 true
 *   （默认并发本来就是 1 时报 false —— 没发生「下调」这个动作）。
 *
 * ⚠️ **阈值为什么是「比例」而不是绝对字节**：本机实测的换页起点约在「可用内存 < 200 MB」，
 *   1/8（本机 16 GB ⇒ 2 GB）留了 10 倍余量 —— 宁可**早降**（多花点时间）也不要
 *   **晚降**（跑一半才假红，那轮结果直接作废）。用比例是为了在别的机器上同样成立：
 *   绝对值不随机器大小缩放，「可用 4 GB」在小机器上宽裕、在大机器上却已接近换页。
 *
 * ## 纯逻辑与采集分离
 *
 * `decideWorkers()` 是**纯函数**（吃内存/swap 数字，出结论）⇒ 判据测试
 * 能直接喂边界值，不依赖「真的把机器内存耗光」⇒ 由 `tests/machine-preflight.test.ts` 判据。
 * `readMemoryPressure()` 负责采集（读 OS）⇒ 只在真跑时调。
 */
import { execFileSync } from 'node:child_process'
import { freemem, totalmem } from 'node:os'

/**
 * 每 worker 的**估算内存占用**（1 GiB）—— 并发推导的唯一标尺。
 *
 * ⚠️ 取 1 GiB 的**依据**：2026-11-02 实测（`pnpm preflight:matrix`，内存重负载 6 支）
 *   单个 worker 占用 300–700 MB ⇒ 取区间**上界**再留约 50% 余量。
 *   ⇒ 宁可估大：估小会得出「算得下、实际换页」，而换页正是本模块要防的事故。
 *
 * ⚠️ 为什么这是**唯一标尺**：`可用内存 ÷ 1 GiB` = 当前能养几个 worker
 *   ⇒ 换机器不必重新调数（机器越大算出的上限越高，再被默认并发截断）。
 */
export const WORKER_FOOTPRINT_BYTES = 1024 * 1024 * 1024

/**
 * 可用内存**占总内存的比例**低于此值（1/8 = 12.5%）⇒ 连默认并发都养不起 ⇒ 降到 1。
 *
 * ⚠️ 为什么用**比例**而不是绝对字节数（2026-11-02 增强）：
 *   绝对值不随机器大小缩放 ——「可用 4 GB」在 8 GB 机器上很宽裕，在 64 GB 机器上
 *   却意味着已经用掉 60 GB、正逼近换页 ⇒ **同一个数字在两台机器上含义相反**。
 *   ⇒ 改按比例判定，由机器自身总量归一化 ⇒ 换机器不必重新调数。
 *
 * ⚠️ 取 1/8 的**依据**（2026-11-02 第二轮调整）：默认 2 个 worker × 1 GiB = 2 GiB，
 *   本机 16 GB 的 1/8 恰为 2 GiB ⇒ 比例阈值与 `WORKER_FOOTPRINT_BYTES` 在本机上
 *   **得出同一个结论**（两路口径不打架）。旧值 1/16 只够养 1 个，与默认并发 2 对不上。
 */
export const LOW_FREE_RATIO = 1 / 8

/**
 * 可用内存占总内存的比例低于此值（25%）⇒ 算「紧张」（余量够但不宽裕）。
 *
 * ⚠️ 依据：它恰为 `LOW_FREE_RATIO`（1/8）的**两倍** ⇒ 语义是「余量不到一倍」：
 *   本机 16 GB 上，2 GB 是「连默认并发都养不起」的硬底线，4 GB 才算宽裕。
 *   这一档**不改并发**，只影响结论里显示哪个档名。
 */
export const COMFORTABLE_FREE_RATIO = 0.25

/**
 * swap 使用率高于此值 ⇒ 降到 1（吃紧）。0.85。
 *
 * ⚠️ 从 0.8 调高的**依据**：2026-11-02 换页事故实测 15.9 / 17.4 GB = **91%**，
 *   0.85 仍能抓到；而本机常态 swap 占用约 79% ⇒ 旧值 0.8 会在正常状态下**频繁误降**
 *   （每轮多花约一倍时间）⇒ 上调 5 个点，既避开常态噪声，又不漏真事故。
 */
export const HIGH_SWAP_RATIO = 0.85

/**
 * swap 使用率高于此值 ⇒ 算「紧张」（不降并发）。0.6。
 *
 * ⚠️ 从 0.5 调高的依据同 `HIGH_SWAP_RATIO`：常态 79% 下 0.5 让「紧张」常驻，
 *   且与 0.8 的吃紧档只差 30 个点 ⇒ 两档几乎重叠。改为 0.6 后与吃紧档（0.85）
 *   留出 25 个点，档位才有区分度。
 */
export const HALF_SWAP_RATIO = 0.6

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
  /** 命中的档位（'充裕' | '紧张' | '吃紧'） */
  tier?: '充裕' | '紧张' | '吃紧'
}

/**
 * 分级表（**每一档都有实测依据**，不是拍脑袋）。
 *
 * ## 分档依据是什么
 *
 * ⚠️ **不是「耗时劣化的位置」** —— 实测（2026-11-02，`scripts/preflight-pressure-sample.ts`）
 *   在本机采了「内存重负载 × 并发」的对照数据，**耗时随并发上升而下降**
 *   （并发 1/2/4 ⇒ 972/673/600ms），**没有出现劣化点**。
 *   ⇒ 原因已定位：**本机当时 swap 已用 79%、可用内存仅 0.09 GB**
 *   ⇒ 机器**本来就在换页** ⇒ 「因并发而新增的换页」相比「已有的换页」是噪声
 *   ⇒ **在已被换页拖累的机器上，测不出并发带来的边际代价**。
 *
 * ⚠️ 因此分级依据改为**可计算的物理量**：**「并发将新增多少内存占用」**
 *   （= 并发数 × 每个 worker 的估算占用）。
 *   ⇒ 规则：**若预计新增占用吃掉了可用内存的一大半 ⇒ 降档**。
 *   ⇒ 这是**算得出来的**，不依赖「在什么状态下测的」，因此**可复算**。
 *
 * ## 档位定义
 *
 * ⚠️ **档位不是「先定档、再定并发」，而是「先定并发、再反推档位」**
 *   （2026-11-03 第二轮调整）：并发由**三路上限取最小**得出
 *   ⇒ 档位只是这次结论的**名字**，不会出现「吃紧却给 2 个并发」的自相矛盾。
 *
 * | 档 | 触发条件 | 并发 | 依据 |
 * | -- | -------- | ---- | ---- |
 * | 吃紧 | 任一路上限 < 默认并发（比例线被破 / 内存养不起 / swap ≥ 85%） | 上限值（≥1） | 扛不住默认并发 ⇒ 必须降 |
 * | 紧张 | 并发维持默认，但可用 < 总内存 25%（本机 4 GB）或 swap ≥ 60% | 默认（2） | 余量够但不宽裕 ⇒ 维持默认 |
 * | 充裕 | 其余 | 默认（2） | 无压力，不需要降 |
 *
 * ⚠️ **为什么「紧张」档仍是默认而不是 1**：因为并发 2 在本机实测是**更快**的
 *   （673ms vs 972ms）⇒ 降并发会**更慢**而没有收益 ⇒ 「紧张」档不该降。
 *   ⇒ 只有扛不住默认并发时才降，因为那时新增驻留会**加剧**已有的换页。
 */
export interface WorkerTier {
  /** 档名 */
  name: '充裕' | '紧张' | '吃紧'
  /** 该档的并发 */
  workers: number
  /** 是否算「已降级」（相对默认并发） */
  degraded: boolean
}

/**
 * 把比例阈值换算成**这台机器上的字节数**。
 *
 * ⚠️ 单列成一个函数（而不是在对角线位置各算一遍）是因为：判定与**理由文案**
 *   必须用**同一个换算结果** ⇒ 否则报告里出现的阈值数字可能与实际判定条件不一致。
 */
export interface TierThresholds {
  /** 吃紧档阈值（字节）：可用内存低于它 ⇒ 降到 1 */
  lowBytes: number
  /** 紧张档阈值（字节）：可用内存低于它 ⇒ 算「紧张」 */
  comfortableBytes: number
}

export function tierThresholds(totalBytes: number): TierThresholds {
  return {
    lowBytes: totalBytes * LOW_FREE_RATIO,
    comfortableBytes: totalBytes * COMFORTABLE_FREE_RATIO,
  }
}

/**
 * 三路上限的明细（**判定与文案共用同一份数字**）。
 */
export interface WorkerCaps {
  /** 按每 worker 估算占用算出的「当前养得起几个」（未截顶） */
  affordable: number
  /** 比例线的上限 */
  byRatio: number
  /** 占用估算的上限 */
  byFootprint: number
  /** swap 线的上限 */
  bySwap: number
  /** 最终并发 = 三路取最小 */
  workers: number
}

/**
 * 算三路上限，**取最小**得出并发（2026-11-03 第二轮调整）。
 *
 * ## 三路各管什么
 *
 * | 路 | 问的问题 | 破线时的上限 |
 * | -- | -------- | ------------ |
 * | 比例 | 机器**相对自身规模**还剩多少余量 | 1 |
 * | 占用 | 当前可用内存**养得起几个** worker（÷ 每 worker 估算占用） | 实际养得起的个数 |
 * | swap | 是不是**已经在重度换页** | 1 |
 *
 * ⚠️ **为什么占用估算要独立成一路**：比例是「相对总内存」的口径 ⇒ 在大机器上偏保守
 *   （64 GB 机器可用 4 GB 只占 6.25% ⇒ 比例线判吃紧），而**绝对占用**才回答
 *   「现在到底还能再跑几个 worker」⇒ 两条口径量的是**不同的东西**，不互相替代。
 *
 * ⚠️ **为什么取最小**：任何一路说「不行」都不该被另一路掩盖 ⇒
 *   宁可早降（多花点时间）也不晚降（跑一半才假红，那轮结果直接作废）。
 */
export function workerCaps(pressure: MemoryPressure, defaultWorkers: number): WorkerCaps {
  const thresholds = tierThresholds(pressure.totalBytes)
  const swapKnown = pressure.swapTotalBytes > 0
  const swapRatio = swapKnown ? pressure.swapUsedBytes / pressure.swapTotalBytes : 0

  const byRatio = pressure.freeBytes < thresholds.lowBytes ? DEGRADED_WORKERS : defaultWorkers
  const affordable = Math.floor(pressure.freeBytes / WORKER_FOOTPRINT_BYTES)
  const byFootprint = Math.min(Math.max(affordable, DEGRADED_WORKERS), defaultWorkers)
  const bySwap = swapKnown && swapRatio >= HIGH_SWAP_RATIO ? DEGRADED_WORKERS : defaultWorkers

  return {
    affordable,
    byRatio,
    byFootprint,
    bySwap,
    workers: Math.min(byRatio, byFootprint, bySwap),
  }
}

/**
 * 判定档位。
 *
 * ⚠️ **档位由并发结论反推**（而不是各判各的）⇒ 不会出现「吃紧却给 2 个并发」。
 *
 * @param pressure 内存压力
 * @param defaultWorkers 默认并发
 */
export function decideTier(pressure: MemoryPressure, defaultWorkers: number): WorkerTier {
  const caps = workerCaps(pressure, defaultWorkers)
  const swapKnown = pressure.swapTotalBytes > 0
  const swapRatio = swapKnown ? pressure.swapUsedBytes / pressure.swapTotalBytes : 0
  const thresholds = tierThresholds(pressure.totalBytes)

  // 吃紧：机器扛不住**比默认并发更多**的驻留
  // ⚠️ 判据写成「机器状态」而不是「并发有没有变小」：
  //   默认并发本来就是 1 时，仍然是「吃紧」这台机器 ⇒ 档位要如实说，
  //   只是 `degraded`（是否真的下调过）会为 false。
  const tight =
    pressure.freeBytes < thresholds.lowBytes ||
    (swapKnown && swapRatio >= HIGH_SWAP_RATIO) ||
    caps.affordable < defaultWorkers
  if (tight) {
    return { name: '吃紧', workers: caps.workers, degraded: caps.workers < defaultWorkers }
  }
  // 紧张：并发维持默认，但余量不宽裕
  if (
    pressure.freeBytes < thresholds.comfortableBytes ||
    (swapKnown && swapRatio >= HALF_SWAP_RATIO)
  ) {
    return { name: '紧张', workers: caps.workers, degraded: false }
  }
  return { name: '充裕', workers: caps.workers, degraded: false }
}

/**
 * 纯判定：给内存压力数字 ⇒ 给并发建议。
 *
 * @param pressure 采集到的内存压力
 * @param defaultWorkers 机器扛得住时用的并发（来自配置文件）
 */
export function decideWorkers(pressure: MemoryPressure, defaultWorkers: number): PreflightDecision {
  const memGb = (bytes: number): string => (bytes / 1024 / 1024 / 1024).toFixed(2)
  const pct = (bytes: number): string =>
    pressure.totalBytes > 0 ? ((bytes / pressure.totalBytes) * 100).toFixed(1) : '0.0'
  const swapKnown = pressure.swapTotalBytes > 0
  const swapRatio = swapKnown ? pressure.swapUsedBytes / pressure.swapTotalBytes : 0
  const thresholds = tierThresholds(pressure.totalBytes)
  const caps = workerCaps(pressure, defaultWorkers)
  const tier = decideTier(pressure, defaultWorkers)

  const swapText = swapKnown
    ? `，swap 使用率 ${(swapRatio * 100).toFixed(0)}%`
    : '，swap 信息取不到（跳过该条判定）'
  const footprintText =
    caps.affordable >= 1
      ? `，按每 worker ${memGb(WORKER_FOOTPRINT_BYTES)} GB 估算，可养 ${String(caps.affordable)} 个`
      : `，按每 worker ${memGb(WORKER_FOOTPRINT_BYTES)} GB 估算，当前可用内存养不起 1 个`

  if (tier.name === '吃紧') {
    // 说明是哪一路把并发压下来的（取最小的那路）
    const binding =
      caps.bySwap === caps.workers && swapKnown && swapRatio >= HIGH_SWAP_RATIO
        ? `swap 使用率 ${(swapRatio * 100).toFixed(0)}% ≥ ${(HIGH_SWAP_RATIO * 100).toFixed(0)}%` +
          `（已用 ${memGb(pressure.swapUsedBytes)} GB / 总量 ${memGb(pressure.swapTotalBytes)} GB）`
        : caps.byRatio === caps.workers
          ? `可用内存 ${memGb(pressure.freeBytes)} GB / 总内存 ${memGb(pressure.totalBytes)} GB（${pct(pressure.freeBytes)}%）` +
            ` < 吃紧阈值 ${memGb(thresholds.lowBytes)} GB（总内存 × ${(LOW_FREE_RATIO * 100).toFixed(2)}%）`
          : `可用内存 ${memGb(pressure.freeBytes)} GB${footprintText}`
    // ⚠️ **降不动的情况**：默认并发本来就是 1 ⇒ 无从再降
    //   ⇒ 如实说「已是最低」，不能谎报「降到了 1」。
    const tail =
      tier.workers < defaultWorkers
        ? ` ⇒ 机器扛不住默认并发 ${String(defaultWorkers)} ⇒ 并发降到 ${String(tier.workers)}`
        : ` ⇒ 机器已在重度换页 ⇒ 并发已是最低（${String(tier.workers)}），无从再降`
    return {
      workers: tier.workers,
      degraded: tier.workers < defaultWorkers,
      reason: `${binding}${tail}`,
      tier: tier.name,
    }
  }

  if (tier.name === '紧张') {
    return {
      workers: tier.workers,
      degraded: false,
      reason:
        `可用内存 ${memGb(pressure.freeBytes)} GB${swapText}${footprintText} ⇒ 余量够但不宽裕` +
        ` ⇒ 并发维持 ${String(tier.workers)}（实测降并发只会更慢，不会更快）`,
      tier: tier.name,
    }
  }

  return {
    workers: tier.workers,
    degraded: false,
    reason:
      `可用内存 ${memGb(pressure.freeBytes)} GB${swapText}${footprintText}` +
      ` ⇒ 机器扛得住 ⇒ 并发维持 ${String(tier.workers)}`,
    tier: tier.name,
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
 * 预检结论的**机器可读**产物（增强 E · 2026-11-02）。
 *
 * ## 为什么要有它
 *
 * 预检的说明打在 `pnpm test` 的 **stdout 开头** ⇒ CI 里若只看**测试报告**
 * （Junit XML / GitHub Actions summary）就**看不到这行** ⇒ 假红时仍要人去翻日志
 * 找「是不是环境问题」⇒ 这条增强就白做了。
 *
 * ⇒ 把结论落成一个文件 ⇒ 报告页/流水线摘要都能直接引用。
 *
 * ## 字段（闭集）
 *
 * - `at`：采样时刻（ISO）
 * - `tier`：档位（'充裕' | '紧张' | '吃紧'）
 * - `workers`：建议并发
 * - `degraded`：是否降级
 * - `reason`：人话理由（含具体数字）
 * - `pressure`：原始内存数字（总量/可用/swap 总量/swap 已用）
 * - `swapKnown`：swap 信息是否取到（取不到 ⇒ 判定跳过那条 ⇒ 报告里要能看出来）
 */
export interface PreflightReport {
  at: string
  tier: '充裕' | '紧张' | '吃紧'
  workers: number
  degraded: boolean
  reason: string
  pressure: {
    totalBytes: number
    freeBytes: number
    swapTotalBytes: number
    swapUsedBytes: number
  }
  swapKnown: boolean
}

/** 产物路径（相对仓根）。 */
export const REPORT_FILE = 'test-results/preflight.json'

/**
 * 生成预检报告。
 */
export function buildReport(
  pressure: MemoryPressure,
  decision: PreflightDecision,
): PreflightReport {
  return {
    at: new Date().toISOString(),
    tier: decision.tier ?? '充裕',
    workers: decision.workers,
    degraded: decision.degraded,
    reason: decision.reason,
    pressure: {
      totalBytes: pressure.totalBytes,
      freeBytes: pressure.freeBytes,
      swapTotalBytes: pressure.swapTotalBytes,
      swapUsedBytes: pressure.swapUsedBytes,
    },
    swapKnown: pressure.swapTotalBytes > 0,
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
  const pressure = readMemoryPressure()
  const decision = decideWorkers(pressure, defaultWorkers)
  console.log(`[preflight] ${decision.reason}`)
  if (decision.degraded) {
    console.log(
      '[preflight] ⚠️ 这是**环境问题**不是代码问题：机器内存吃紧时，超时闸会误判成「功能回归」。' +
        '若看到大批超时，先看这一行。',
    )
  }
  return 0
}
