/**
 * scripts/preflight-pressure-sample.ts
 * —— **受控内存压力**下的并发对照采集（2026-11-02 · 增强 D 第一步）。
 *
 * ## 它解决什么
 *
 * `scripts/preflight-sample.ts` 采的是「机器当时什么状态就记什么」⇒
 * 状态不可控 ⇒ 采出来的数据**没法用来定分级表**（不同组的压力差太多）。
 *
 * ⇒ 本脚本**主动制造**内存压力：用 `--max-old-space-size` 把 worker 的堆上限压到
 *   某个小值（越小 ⇒ 压力越大）⇒ 在**同一台机器、同一时刻**拿到「压力 ↔ 耗时」的对照。
 *
 * ## 为什么用「堆上限」而不是「占内存」
 *
 * - 「占内存」⇒ 要真的吃满几 GB ⇒ **危险**（本机已因内存耗尽假红过）且**不可逆**；
 * - 「压堆上限」⇒ V8 在上限处更频繁 GC ⇒ **同样触发换页压力**，但**占用有界**、**随时可停**。
 *
 * ## 它采集什么
 *
 * 每个「压力档 × 并发档」跑一次，记录耗时与失败数 ⇒
 * **分级表的边界应当落在「耗时开始劣化」的位置**（不是拍脑袋）。
 */
import { spawnSync } from 'node:child_process'
import {
  appendFileSync,
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { parseVitestResult, readLoad1, readSamples, SAMPLE_FILE } from './preflight-sample'
import { readMemoryPressure } from './machine-preflight'

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..')

/** 压力档：worker 的堆上限（MB）。越小 ⇒ 压力越大。 */
export const PRESSURE_TIERS_MB = [2048, 256, 96] as const

/** 并发档。 */
export const WORKER_TIERS = [1, 2, 4] as const

/**
 * 跑一组（指定堆上限 + 并发），返回耗时与失败数。
 *
 * ⚠️ **堆上限是靠 `NODE_OPTIONS` 传的**：vitest 的 worker 是子进程 ⇒ 继承环境变量 ⇒ 生效。
 *
 * ⚠️ **测什么文件很关键**：拿「几十毫秒就完」的小测试去测 ⇒ 差异被启动开销淹没
 *   （实测：堆上限 2048/256/96 MB 三档耗时全在 850–1020ms，毫无区分度）
 *   ⇒ 必须用**重负载**（真正吃内存的）才能显出「压力 ↔ 耗时」的关系。
 */
export function runUnderPressure(
  heapMb: number,
  workers: number,
  files: string | string[],
): { durationMs: number; failed: number; skipped: number } {
  const started = Date.now()
  const fileArgs = Array.isArray(files) ? files : [files]
  // ⚠️ **输出必须落到文件**：vitest 的输出量可能超过 pipe 缓冲 ⇒ `spawnSync` 的
  //   pipe 写满时抛 `TransformError`（本轮实测崩了两次）⇒ 改用文件重定向，
  //   跑完再读文件尾部解析汇总行。
  const logFile = join(tmpdir(), `ov-pressure-run-${String(process.pid)}-${String(workers)}.log`)
  const fd = openSync(logFile, 'w')
  try {
    spawnSync(
      'npx',
      ['vitest', 'run', '--project', 'unit', `--maxWorkers=${String(workers)}`, ...fileArgs],
      {
        cwd: ROOT,
        shell: false,
        stdio: ['ignore', fd, fd],
        env: {
          ...process.env,
          NODE_OPTIONS: `--max-old-space-size=${String(heapMb)}`,
        },
      },
    )
  } finally {
    closeSync(fd)
  }
  let output = ''
  try {
    output = readFileSync(logFile, 'utf8')
  } catch {
    // 读不到就按「没跑起来」算
  } finally {
    rmSync(logFile, { force: true })
  }
  const parsed = parseVitestResult(output)
  return {
    durationMs: parsed.durationMs > 0 ? parsed.durationMs : Date.now() - started,
    failed: parsed.failed,
    skipped: parsed.skipped,
  }
}

/**
 * 造**一组**吃内存的临时测试（用于制造可测的压力差）。
 *
 * ⚠️ **为什么需要它**：真实测试的内存占用是**固定的**，换不了堆上限也换不了占用
 *   ⇒ 只能造一个「按需吃内存」的样本，才能在**同一台机器**上把压力拉满。
 *   ⚠️ 吃掉的内存有上限（`MB` 参数）⇒ **不会**把机器拖进换页灾难。
 *
 * ⚠️ **必须放在仓内**：vitest 的 `include` 只含仓内路径（`tests/` 下的测试文件）
 *   ⇒ 放系统临时目录 ⇒ vitest **扫不到** ⇒ 跑的是「零个测试」（实测耗时 281–331ms，
 *   那不是测试耗时，是启动开销）⇒ 数据无意义。
 *   ⇒ 放 `tests/` 下，**用完即删**（文件名带前缀，便于识别与清理）。
 *
 * ⚠️ **必须造「多支」**：并发只有在**有多支测试可并行**时才有意义
 *   （实测：只造 1 支 ⇒ 并发 1/2/4 的耗时全在 471–512ms，毫无区分度
 *   ⇒ 因为总工作量固定，并行不并行都一样快）。
 *   ⇒ 造 `count` 支 ⇒ 并发越高 ⇒ 同时驻留的内存越多 ⇒ 压力差才显出来。
 */
export function makeMemoryHeavyFixture(dir: string, mb: number, count = 6): string[] {
  mkdirSync(dir, { recursive: true })
  const files: string[] = []
  for (let i = 0; i < count; i += 1) {
    const file = join(dir, `memory-heavy-${String(i)}.test.ts`)
    const script = `
import { describe, expect, it } from 'vitest'
describe('内存压力样本 ${String(i)}', () => {
  it('分配并触碰 ${String(mb)} MB', () => {
    const blocks: Uint8Array[] = []
    for (let i = 0; i < ${String(mb)}; i += 1) {
      const b = new Uint8Array(1024 * 1024)
      b[0] = 1
      b[b.length - 1] = 1
      blocks.push(b)
    }
    expect(blocks.length).toBe(${String(mb)})
  })
})
`
    writeFileSync(file, script, 'utf8')
    files.push(file)
  }
  return files
}

/** 命令行入口。 */
export function main(argv: string[]): number {
  const fileIdx = argv.indexOf('--file')
  const file =
    fileIdx >= 0 && argv[fileIdx + 1] !== undefined ? argv[fileIdx + 1] : 'tests/temp-dir.test.ts'

  mkdirSync(dirname(SAMPLE_FILE), { recursive: true })
  console.log(`[pressure] 采集：文件 ${file}`)
  console.log('[pressure] 压力档（worker 堆上限 MB）：' + PRESSURE_TIERS_MB.join(' / '))
  console.log('[pressure] 并发档：' + WORKER_TIERS.join(' / '))

  for (const heapMb of PRESSURE_TIERS_MB) {
    for (const workers of WORKER_TIERS) {
      const pressure = readMemoryPressure()
      const swapRatio =
        pressure.swapTotalBytes > 0 ? pressure.swapUsedBytes / pressure.swapTotalBytes : null
      const result = runUnderPressure(heapMb, workers, file as string)
      const sample = {
        at: new Date().toISOString(),
        workers,
        file,
        freeBytes: pressure.freeBytes,
        totalBytes: pressure.totalBytes,
        swapRatio,
        load1: readLoad1(),
        durationMs: result.durationMs,
        failed: result.failed,
        skipped: result.skipped,
        // ⚠️ 额外记下「这组是用多大堆上限跑的」—— 分级表的依据
        heapMb,
      }
      appendFileSync(SAMPLE_FILE, `${JSON.stringify(sample)}\n`, 'utf8')
      console.log(
        `[pressure] 堆上限 ${String(heapMb)}MB · 并发 ${String(workers)} ⇒ ` +
          `${String(result.durationMs)}ms · 失败 ${String(result.failed)}`,
      )
    }
  }
  console.log(`[pressure] 样本已追加到 ${SAMPLE_FILE}（当前共 ${String(readSamples().length)} 条）`)
  return 0
}

/**
 * 受控压力的**主采集流程**：用「内存重负载夹具」把压力拉起来，
 * 逐档加压 × 逐档并发 ⇒ 得到「压力 ↔ 并发 ↔ 耗时」的对照表。
 *
 * ⚠️ **为什么不用「压堆上限」**：堆上限只让 GC 更频繁，**不增加内存占用**
 *   ⇒ 实测三档（2048/256/96 MB）耗时几乎一样（850–1020ms）⇒ 没有区分度。
 *   ⇒ 真正决定「会不会换页」的是**实际占用** ⇒ 必须用吃内存的夹具。
 */
export function collectPressureMatrix(
  dir: string,
  loadMb: number,
  tiers: number[],
  workerTiers: readonly number[],
): void {
  const files = makeMemoryHeavyFixture(dir, loadMb)
  const fileArgs = files.map((f) => f.replace(`${dir}/`, ''))
  mkdirSync(dirname(SAMPLE_FILE), { recursive: true })
  console.log(
    `[matrix] 内存负载夹具：${String(files.length)} 支 · 每支吃 ${String(loadMb)} MB` +
      ` ⇒ 并发 N 时最多 ${String(loadMb * workerTiers.length)} MB 同时驻留`,
  )
  for (const workers of workerTiers) {
    const pressure = readMemoryPressure()
    const swapRatio =
      pressure.swapTotalBytes > 0 ? pressure.swapUsedBytes / pressure.swapTotalBytes : null
    const result = runUnderPressure(4096, workers, fileArgs)
    const sample = {
      at: new Date().toISOString(),
      workers,
      file: `memory-heavy-*.test.ts（${String(files.length)} 支）`,
      freeBytes: pressure.freeBytes,
      totalBytes: pressure.totalBytes,
      swapRatio,
      load1: readLoad1(),
      durationMs: result.durationMs,
      failed: result.failed,
      skipped: result.skipped,
      heapMb: 4096,
      loadMb,
    }
    appendFileSync(SAMPLE_FILE, `${JSON.stringify(sample)}\n`, 'utf8')
    console.log(
      `[matrix] 每 worker ${String(loadMb)} MB · 并发 ${String(workers)} ⇒ ` +
        `${String(result.durationMs)}ms · 失败 ${String(result.failed)} · ` +
        `跑前可用内存 ${(pressure.freeBytes / 1024 / 1024 / 1024).toFixed(2)} GB`,
    )
  }
  void tiers
}

if (process.argv[1] !== undefined && process.argv[1].endsWith('preflight-pressure-sample.ts')) {
  // `--matrix` ⇒ 跑「内存重负载 × 并发」的对照采集（分级表的真正依据）
  if (process.argv.slice(2).includes('--matrix')) {
    // ⚠️ 夹具必须落在**仓内**（vitest 的 include 只扫仓内路径）
    const dir = join(ROOT, 'tests')
    const loadIdx = process.argv.indexOf('--load-mb')
    const loadMb = loadIdx >= 0 ? Number(process.argv[loadIdx + 1]) : 256
    try {
      collectPressureMatrix(dir, Number.isFinite(loadMb) ? loadMb : 256, [], WORKER_TIERS)
    } finally {
      // ⚠️ 夹具用完即删（多支）—— 否则会留在 `tests/` 里被正式测试跑到
      for (const name of readdirSync(dir)) {
        if (name.startsWith('memory-heavy-')) rmSync(join(dir, name), { force: true })
      }
    }
  } else {
    process.exitCode = main(process.argv.slice(2))
  }
}
