import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  DEFAULT_WORKERS,
  DEGRADED_WORKERS,
  HIGH_SWAP_RATIO,
  LOW_FREE_MEM_BYTES,
  decideWorkers,
  readMemoryPressure,
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
  it('⚠️ 可用内存 < 1 GB ⇒ 降并发（机器已在靠 swap 撑）', () => {
    const d = decideWorkers(sample({ freeBytes: 200 * 1024 * 1024 }), DEFAULT_WORKERS)
    expect(d.degraded).toBe(true)
    expect(d.workers).toBe(DEGRADED_WORKERS)
  })

  it('⚠️ swap 使用率 > 80% ⇒ 降并发（内存已经不够用）', () => {
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

  it('⚠️ 边界：可用内存**正好** 1 GB ⇒ 不降（阈值是「低于」，不是「不高于」）', () => {
    const d = decideWorkers(sample({ freeBytes: LOW_FREE_MEM_BYTES }), DEFAULT_WORKERS)
    expect(d.degraded).toBe(false)
  })

  it('⚠️ 边界：swap 使用率**正好** 80% ⇒ 不降', () => {
    const d = decideWorkers(
      sample({
        swapTotalBytes: 100 * 1024 * 1024 * 1024,
        swapUsedBytes: 80 * 1024 * 1024 * 1024,
      }),
      DEFAULT_WORKERS,
    )
    expect(d.degraded).toBe(false)
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

  it('⚠️ 阈值常量必须是文档里登记的那些值（口径不许偷偷改）', () => {
    expect(LOW_FREE_MEM_BYTES).toBe(1024 * 1024 * 1024)
    expect(HIGH_SWAP_RATIO).toBe(0.8)
    expect(DEGRADED_WORKERS).toBe(1)
  })
})
