import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  COMFORTABLE_FREE_RATIO,
  DEFAULT_WORKERS,
  DEGRADED_WORKERS,
  HALF_SWAP_RATIO,
  HIGH_SWAP_RATIO,
  LOW_FREE_RATIO,
  REPORT_FILE,
  WORKER_FOOTPRINT_BYTES,
  buildReport,
  decideTier,
  decideWorkers,
  readMemoryPressure,
  tierThresholds,
  workerCaps,
  type MemoryPressure,
} from '../scripts/machine-preflight'

/**
 * 机器适配判据（2026-11-02 · 承接 DEV-0158 的性能事故）。
 *
 * ## 它防的是什么
 *
 * 2026-11-02 实测：全量测试先后两轮超时红（18 文件/50 例、13 文件/28 例），
 * 而那两轮的**机器负载完全不同**（509 与 73）⇒ 负载不是原因。
 * 真正的根因是**换页**：`vm.swapusage` used 15.9/17.4 GB、可用内存仅 117 MB
 * ⇒ 耗时操作放大 10 倍（`collect` 正常约 40s、实测 333s）⇒ 用例越闸 ⇒ 假红。
 *
 * ⇒ 跑测试前先读内存压力 ⇒ 扛不住就降并发。
 * ⇒ 这条判据保证「**扛不住时一定会降**」与「**扛得住时一定不乱降**」。
 *
 * ## 为什么判定必须是纯函数
 *
 * 判据测试不能靠「真的把机器内存耗光」来触发降级路径 ⇒
 * `decideWorkers()` 只吃数字、不碰 OS ⇒ 边界值能直接喂。
 */

const ROOT = resolve(__dirname, '..')

/** 造一份内存压力样本（默认值 = 机器健康的样子） */
function sample(over: Partial<MemoryPressure> = {}): MemoryPressure {
  return {
    totalBytes: 16 * 1024 * 1024 * 1024,
    freeBytes: 8 * 1024 * 1024 * 1024,
    swapTotalBytes: 0,
    swapUsedBytes: 0,
    ...over,
  }
}

describe('机器适配 · 降并发的判定（纯函数）', () => {
  it('⚠️ 可用内存低于吃紧线 ⇒ 降并发（机器已在靠 swap 撑）', () => {
    const d = decideWorkers(sample({ freeBytes: 200 * 1024 * 1024 }), DEFAULT_WORKERS)
    expect(d.degraded).toBe(true)
    expect(d.workers).toBe(DEGRADED_WORKERS)
  })

  it('⚠️ swap 使用率 ≥ 85% ⇒ 降并发（内存已经不够用）', () => {
    const d = decideWorkers(
      sample({
        swapTotalBytes: 17.4 * 1024 * 1024 * 1024,
        swapUsedBytes: 15.9 * 1024 * 1024 * 1024,
      }),
      DEFAULT_WORKERS,
    )
    expect(d.degraded).toBe(true)
    expect(d.workers).toBe(DEGRADED_WORKERS)
  })

  it('机器扛得住 ⇒ 不降并发（维持配置的默认值）', () => {
    const d = decideWorkers(sample(), DEFAULT_WORKERS)
    expect(d.degraded).toBe(false)
    expect(d.workers).toBe(DEFAULT_WORKERS)
  })

  it('⚠️ 边界：可用内存**正好**等于吃紧阈值 ⇒ 不降（口径是「低于」，不是「不高于」）', () => {
    const total = 16 * 1024 * 1024 * 1024
    const d = decideWorkers(
      sample({ totalBytes: total, freeBytes: tierThresholds(total).lowBytes }),
      DEFAULT_WORKERS,
    )
    expect(d.degraded).toBe(false)
  })

  it('⚠️ 边界：swap 使用率**正好** 85% ⇒ 降级（口径：≥ 85% 即「吃紧」）', () => {
    // ⚠️ **口径统一（2026-11-03 第二轮调整）**：旧判据是「> 80% 才降」（正好 80% 不降），
    //   新分级表是「**≥** 85% 即吃紧」⇒ 二选一（Rule 7：不平均）。
    //   选「≥」的理由：**85% 的 swap 使用率已经是重度换页**，此时再并发就是雪上加霜
    //   ⇒ 边界取在「刚好进入吃紧」这一侧更保守（宁可早降，不假红）。
    const d = decideWorkers(
      sample({
        swapTotalBytes: 100 * 1024 * 1024 * 1024,
        swapUsedBytes: 85 * 1024 * 1024 * 1024,
      }),
      DEFAULT_WORKERS,
    )
    expect(d.degraded).toBe(true)
    expect(d.tier).toBe('吃紧')
  })

  it('⚠️ swap 信息取不到 ⇒ **跳过** swap 那条判定（不能当成「用量为 0」＝很健康）', () => {
    // ⚠️ 这是最容易写错的一处：查不到 ≠ 没有。
    //   若把「取不到」当成「swap 用量 0」⇒ 在一台正被 swap 拖垮的机器上会漏判。
    const d = decideWorkers(
      sample({ freeBytes: 200 * 1024 * 1024, swapTotalBytes: 0, swapUsedBytes: 0 }),
      DEFAULT_WORKERS,
    )
    // 可用内存那条仍然命中（它是独立的一条）⇒ 仍会降
    expect(d.degraded).toBe(true)
    // 且理由里要说清楚「swap 取不到」，而不是报一个假的 swap 百分比
    expect(d.reason).toMatch(/可用内存/)
  })

  it('机器扛得住但 swap 取不到 ⇒ 结论里如实说「取不到」', () => {
    const d = decideWorkers(sample({ swapTotalBytes: 0, swapUsedBytes: 0 }), DEFAULT_WORKERS)
    expect(d.degraded).toBe(false)
    expect(d.reason).toMatch(/swap 信息取不到/)
  })

  it('⚠️ 理由必须带**具体数字**（不是「内存不足」四个字）', () => {
    // ⚠️ 这条判的是「理由能不能当证据用」：看到假红时，
    //   人要靠这行字判断「这是环境问题还是代码问题」⇒ 没有数字就等于没说。
    const d = decideWorkers(sample({ freeBytes: 200 * 1024 * 1024 }), DEFAULT_WORKERS)
    expect(d.reason).toMatch(/\d/)
    expect(d.reason).not.toMatch(/^内存不足$/)
    expect(d.reason).toContain('并发降到')
  })

  it('降级时说明「并发降到几」，且那是串行（1）', () => {
    const d = decideWorkers(sample({ freeBytes: 100 * 1024 * 1024 }), DEFAULT_WORKERS)
    expect(d.reason).toContain(`并发降到 ${String(DEGRADED_WORKERS)}`)
  })
})

describe('机器适配 · 采集层', () => {
  it('能读到本机的真实内存数字（总内存 > 可用内存 > 0）', () => {
    // ⚠️ 真机跑一次：判「采集层没坏」（纯函数测不了这一层）。
    const p = readMemoryPressure()
    expect(p.totalBytes).toBeGreaterThan(0)
    expect(p.freeBytes).toBeGreaterThan(0)
    expect(p.freeBytes).toBeLessThanOrEqual(p.totalBytes)
  })

  it('⚠️ 采集到的数字能直接喂进判定（契约不崩）', () => {
    const p = readMemoryPressure()
    const d = decideWorkers(p, DEFAULT_WORKERS)
    expect(d.workers).toBeGreaterThan(0)
    expect(d.reason.length).toBeGreaterThan(0)
  })
})

describe('机器适配 · 分级表（增强 D · 先采集数据再定表）', () => {
  it('⚠️ 三档边界：可用内存 ≥ 总内存 25% 且 swap < 60% ⇒ 充裕', () => {
    const d = decideTier(
      sample({
        freeBytes: 8 * 1024 * 1024 * 1024,
        swapTotalBytes: 100 * 1024 * 1024 * 1024,
        swapUsedBytes: 10 * 1024 * 1024 * 1024,
      }),
      DEFAULT_WORKERS,
    )
    expect(d.name).toBe('充裕')
    expect(d.workers).toBe(DEFAULT_WORKERS)
    expect(d.degraded).toBe(false)
  })

  it('⚠️ 可用内存在「吃紧线 ~ 25%」之间 ⇒ 紧张（维持默认并发，不降）', () => {
    // ⚠️ 这一档是**实测得来的**：本机实测并发 2 更快（673ms vs 972ms）
    //   ⇒ 降并发会**更慢**且没有收益 ⇒ 「紧张」不该降。
    // ⚠️ 吃紧线 2026-11-03 由 1/16 调为 1/8 ⇒ 本机 2 GB 是新底线。
    const d = decideTier(sample({ freeBytes: 2 * 1024 * 1024 * 1024 }), DEFAULT_WORKERS)
    expect(d.name).toBe('紧张')
    expect(d.workers).toBe(DEFAULT_WORKERS)
    expect(d.degraded).toBe(false)
  })

  it('⚠️ 可用内存 < 总内存 1/8 ⇒ 吃紧（降到 1）', () => {
    const d = decideTier(sample({ freeBytes: 512 * 1024 * 1024 }), DEFAULT_WORKERS)
    expect(d.name).toBe('吃紧')
    expect(d.workers).toBe(DEGRADED_WORKERS)
    expect(d.degraded).toBe(true)
  })

  it('⚠️ swap ≥ 85% ⇒ 吃紧（哪怕可用内存还够）', () => {
    const d = decideTier(
      sample({
        freeBytes: 8 * 1024 * 1024 * 1024,
        swapTotalBytes: 100 * 1024 * 1024 * 1024,
        swapUsedBytes: 85 * 1024 * 1024 * 1024,
      }),
      DEFAULT_WORKERS,
    )
    expect(d.name).toBe('吃紧')
    expect(d.degraded).toBe(true)
  })

  it('⚠️ 可用内存够但 swap 已用 60–85% ⇒ 紧张（不降）', () => {
    const d = decideTier(
      sample({
        freeBytes: 8 * 1024 * 1024 * 1024,
        swapTotalBytes: 100 * 1024 * 1024 * 1024,
        swapUsedBytes: 60 * 1024 * 1024 * 1024,
      }),
      DEFAULT_WORKERS,
    )
    expect(d.name).toBe('紧张')
    expect(d.degraded).toBe(false)
  })

  it('⚠️ 三档的判定理由必须带具体数字', () => {
    for (const pressure of [
      sample({ freeBytes: 8 * 1024 * 1024 * 1024 }),
      sample({ freeBytes: 2 * 1024 * 1024 * 1024 }),
      sample({ freeBytes: 512 * 1024 * 1024 }),
    ]) {
      const d = decideWorkers(pressure, DEFAULT_WORKERS)
      expect(d.reason).toMatch(/\d/)
      expect(d.tier).toBeDefined()
    }
  })

  it('⚠️ 档位要出现在结论里（报告页能看出「这轮是哪个档」）', () => {
    const d = decideWorkers(sample({ freeBytes: 512 * 1024 * 1024 }), DEFAULT_WORKERS)
    expect(d.tier).toBe('吃紧')
  })
})

describe('机器适配 · 阈值按比例缩放（不是绝对字节）', () => {
  it('⚠️ 本机 16 GB 上，比例阈值换算成 2 GB / 4 GB（与「2 worker × 1 GiB」对齐）', () => {
    // ⚠️ 2026-11-03 调整：吃紧线由 1/16 调为 **1/8** ⇒ 本机 16 GB 上是 **2 GB**。
    //   换算依据：新吃紧线必须与「默认并发 2 × 每 worker 1 GiB = 2 GiB」对齐
    //   ⇒ 比例阈值与占用估算在本机得出同一个结论（两路口径不打架）。
    const t = tierThresholds(16 * 1024 * 1024 * 1024)
    expect(t.lowBytes).toBe(2 * 1024 * 1024 * 1024) // 12.5% × 16 GB = 2 GB
    expect(t.comfortableBytes).toBe(4 * 1024 * 1024 * 1024) // 25% × 16 GB = 4 GB
  })

  it('⚠️ 同一「可用占 4 GB」在 8 GB 与 64 GB 机器上判定相反（绝对值做不到这点）', () => {
    // ⚠️ 这条判的是**改造动机本身**：若阈值仍是绝对字节，
    //   下面两个用例会得到同一个档位 ⇒ 判据会红 ⇒ 说明比例化没生效。
    const free = 4 * 1024 * 1024 * 1024
    const small = decideTier(
      sample({ totalBytes: 8 * 1024 * 1024 * 1024, freeBytes: free }),
      DEFAULT_WORKERS,
    )
    const large = decideTier(
      sample({ totalBytes: 64 * 1024 * 1024 * 1024, freeBytes: free }),
      DEFAULT_WORKERS,
    )
    // 8 GB 机器：可用 50% ⇒ 充裕
    expect(small.name).toBe('充裕')
    // 64 GB 机器：可用 6.25% ⇒ 已用掉 60 GB ⇒ 正逼近换页 ⇒ 吃紧
    // （若阈值是绝对 1 GB，这里会判成充裕 ⇒ 判据失败）
    expect(large.name).toBe('吃紧')
  })

  it('⚠️ 阈值常量必须是文档里登记的那些值（口径不许偷偷改）', () => {
    expect(LOW_FREE_RATIO).toBe(1 / 8)
    expect(COMFORTABLE_FREE_RATIO).toBe(0.25)
    expect(HALF_SWAP_RATIO).toBe(0.6)
    expect(HIGH_SWAP_RATIO).toBe(0.85)
    expect(DEGRADED_WORKERS).toBe(1)
  })
})

describe('机器适配 · 并发按每 worker 估算占用推导（2026-11-03）', () => {
  it('⚠️ 可用内存 ÷ 每 worker 占用 = 养得起的个数（绝对口径）', () => {
    // ⚠️ 这条判的是「并发不再由固定三档拍脑袋决定」：
    //   占用估算回答的是「现在到底还能再跑几个 worker」⇒ 绝对字节。
    const caps = workerCaps(sample({ freeBytes: 3.5 * 1024 * 1024 * 1024 }), DEFAULT_WORKERS)
    expect(caps.affordable).toBe(3)
  })

  it('⚠️ 养不起 1 个时按 1 算（并发不能是 0）', () => {
    const caps = workerCaps(sample({ freeBytes: 100 * 1024 * 1024 }), DEFAULT_WORKERS)
    expect(caps.affordable).toBe(0)
    expect(caps.workers).toBe(DEGRADED_WORKERS)
  })

  it('⚠️ 占用估算是**上限之一**，最终并发 = 三路取最小', () => {
    // 8 GB 机器、可用 1.5 GB：比例线（1 GB）没破，但只养得起 1 个 worker
    // ⇒ 说明两条口径量的是不同的东西（相对余量 vs 绝对占用）。
    const caps = workerCaps(
      sample({ totalBytes: 8 * 1024 * 1024 * 1024, freeBytes: 1.5 * 1024 * 1024 * 1024 }),
      DEFAULT_WORKERS,
    )
    expect(caps.byRatio).toBe(DEFAULT_WORKERS)
    expect(caps.byFootprint).toBe(DEGRADED_WORKERS)
    expect(caps.workers).toBe(DEGRADED_WORKERS)
  })

  it('⚠️ 大机器上比例线更早破（小机器上占用估算更早破）', () => {
    // 64 GB 机器、可用 4 GB：比例线破了（4 < 8 GB），但占用估算说能养 4 个
    // ⇒ 比例线按「机器自身规模」判 ⇒ 这正是它存在的意义。
    const caps = workerCaps(
      sample({ totalBytes: 64 * 1024 * 1024 * 1024, freeBytes: 4 * 1024 * 1024 * 1024 }),
      DEFAULT_WORKERS,
    )
    expect(caps.byRatio).toBe(DEGRADED_WORKERS)
    expect(caps.byFootprint).toBe(DEFAULT_WORKERS)
    expect(caps.workers).toBe(DEGRADED_WORKERS)
  })

  it('⚠️ swap 路破了 ⇒ 上限为 1（已在重度换页）', () => {
    const caps = workerCaps(
      sample({
        freeBytes: 8 * 1024 * 1024 * 1024,
        swapTotalBytes: 100 * 1024 * 1024 * 1024,
        swapUsedBytes: 90 * 1024 * 1024 * 1024,
      }),
      DEFAULT_WORKERS,
    )
    expect(caps.bySwap).toBe(DEGRADED_WORKERS)
    expect(caps.workers).toBe(DEGRADED_WORKERS)
  })

  it('⚠️ 理由里要出现「按每 worker 估算可养几个」（让人能自己复算）', () => {
    const d = decideWorkers(sample({ freeBytes: 8 * 1024 * 1024 * 1024 }), DEFAULT_WORKERS)
    expect(d.reason).toContain('按每 worker')
    expect(d.reason).toMatch(/可养 \d+ 个/)
  })

  it('⚠️ 每 worker 占用必须记进结论（口径可查）', () => {
    expect(WORKER_FOOTPRINT_BYTES).toBe(1024 * 1024 * 1024)
  })

  it('⚠️ 默认并发本来就是 1 时 ⇒ 档位仍报「吃紧」，但 degraded=false（没得再降）', () => {
    // ⚠️ 这条判的是「状态」与「动作」要分开说：
    //   机器确实在重度换页（吃紧）⇒ 档位要如实报；
    //   但并发已经是 1 ⇒ 没有「下调」这个动作发生 ⇒ degraded 不能谎报 true
    //   （否则 `test-summary.ts` 会给 vitest 传一个没意义的 `--maxWorkers=1`）。
    const d = decideWorkers(
      sample({
        freeBytes: 100 * 1024 * 1024,
        swapTotalBytes: 100 * 1024 * 1024 * 1024,
        swapUsedBytes: 95 * 1024 * 1024 * 1024,
      }),
      1,
    )
    expect(d.tier).toBe('吃紧')
    expect(d.degraded).toBe(false)
    expect(d.workers).toBe(1)
    expect(d.reason).toContain('无从再降')
  })

  it('⚠️ 默认并发 1 且机器宽松 ⇒ 充裕（不被 swap 旧值误伤）', () => {
    const d = decideWorkers(sample(), 1)
    expect(d.tier).toBe('充裕')
    expect(d.degraded).toBe(false)
  })
})

describe('机器适配 · 预检产物（增强 E）', () => {
  it('⚠️ 产物字段齐全且可解析（机器可读 ⇒ 报告页能引用）', () => {
    const pressure = sample({ freeBytes: 512 * 1024 * 1024 })
    const decision = decideWorkers(pressure, DEFAULT_WORKERS)
    const report = buildReport(pressure, decision)
    expect(report.at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(report.tier).toBe('吃紧')
    expect(report.workers).toBe(DEGRADED_WORKERS)
    expect(report.degraded).toBe(true)
    expect(report.reason.length).toBeGreaterThan(0)
    expect(report.pressure.freeBytes).toBe(pressure.freeBytes)
    expect(report.swapKnown).toBe(false)
  })

  it('⚠️ swap 取不到 ⇒ swapKnown=false（报告里能看出「那条判定被跳过了」）', () => {
    const pressure = sample({ swapTotalBytes: 0, swapUsedBytes: 0 })
    const report = buildReport(pressure, decideWorkers(pressure, DEFAULT_WORKERS))
    expect(report.swapKnown).toBe(false)
  })

  it('⚠️ 产物路径是约定的那一个（报告页/CI 按这个路径找）', () => {
    expect(REPORT_FILE).toBe('test-results/preflight.json')
  })

  it('⚠️ 产物能原样往返（JSON 序列化 ⇄ 解析）', () => {
    const pressure = sample()
    const report = buildReport(pressure, decideWorkers(pressure, DEFAULT_WORKERS))
    const parsed = JSON.parse(JSON.stringify(report)) as typeof report
    expect(parsed.tier).toBe(report.tier)
    expect(parsed.workers).toBe(report.workers)
    expect(parsed.pressure.totalBytes).toBe(report.pressure.totalBytes)
  })
})

describe('机器适配 · 并发口径的单源纪律', () => {
  it('⚠️ DEFAULT_WORKERS 必须与 vitest.config.ts 的 maxWorkers 一致', () => {
    // ⚠️ 这条防的是「改了一边忘了另一边」：
    //   `machine-preflight.ts` 的 DEFAULT_WORKERS 与 `vitest.config.ts` 的 maxWorkers
    //   是**同一个数的两个副本** ⇒ 漂了就意味着「自动降并发」和「实际并发」不是一回事。
    //
    // ⚠️ **只认代码行**：注释里出现过 `` `maxWorkers: 5` ``（讲历史的那句）⇒
    //   直接正则扫全文会抓到注释里的旧值 ⇒ 必须先剥掉行首注释再匹配。
    const src = readFileSync(join(ROOT, 'vitest.config.ts'), 'utf8')
    const codeLines = src
      .split('\n')
      .map((l) => l.replace(/^\s*\/\/.*$/, ''))
      .join('\n')
    const m = /maxWorkers:\s*(\d+)/.exec(codeLines)
    expect(m).not.toBeNull()
    expect(Number(m?.[1])).toBe(DEFAULT_WORKERS)
  })

  it('⚠️ 判据本身不能被注释里的旧值骗到（防止这条判据腐化）', () => {
    // ⚠️ 上一条判据的**自检**：若有人把注释写成 `maxWorkers: 7`，
    //   而判据改成扫全文 ⇒ 就会误判成「不一致」⇒ 判据必须先剥注释。
    //   这里用同样口径验证一遍：剥注释后源码里应当只剩**真值**。
    const src = readFileSync(join(ROOT, 'vitest.config.ts'), 'utf8')
    const codeLines = src
      .split('\n')
      .map((l) => l.replace(/^\s*\/\/.*$/, ''))
      .join('\n')
    const found = [...codeLines.matchAll(/maxWorkers:\s*(\d+)/g)].map((m) => Number(m[1]))
    // 全局 + cli 两处（cli 那处的理由不同但数值相同，见配置注释）
    expect(found.length).toBeGreaterThanOrEqual(1)
    expect(found.every((n) => n === DEFAULT_WORKERS)).toBe(true)
  })
})
