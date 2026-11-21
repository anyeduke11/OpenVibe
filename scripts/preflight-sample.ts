/**
 * scripts/preflight-sample.ts —— 并发分级的**数据采集**（2026-11-02 · 增强 D 第一步）。
 *
 * ## 它解决什么
 *
 * `scripts/machine-preflight.ts` 现在是**二值**判断：扛不住 ⇒ 并发 1，扛得住 ⇒ 并发 2。
 * 这太粗：机器「略微」紧张时也一律降到 1 ⇒ 慢得没必要。
 *
 * ⚠️ **但分级表不能拍脑袋** —— 那会退化成新的「不可复算」口径
 *   （本仓刚撤掉过一条「数字即可复算」的错口径，见 DEV-0159）。
 * ⇒ 正解是：**先采集数据，再据数据定表**。
 *
 * ## 它采集什么
 *
 * 每次跑记录一组：
 *   · **机器状态**：可用内存、swap 使用率、系统负载；
 *   · **实测耗时**：这一组测试跑了多久；
 *   · **是否超时**：有没有用例越过超时闸（那是「假红」的信号）。
 *
 * ## 怎么用
 *
 * ```sh
 * # 采一组（默认跑 unit 层的一支小测试）
 * pnpm preflight:sample
 *
 * # 指定并发与测试文件
 * pnpm preflight:sample -- --workers 1 --file tests/temp-dir.test.ts
 *
 * # 采完看汇总（决定分级表用哪几档）
 * pnpm preflight:sample -- --summary
 * ```
 *
 * ## 产物
 *
 * `test-results/preflight-samples.jsonl`（JSON Lines，一行一组）⇒
 * **可追加、可复算**（每行带采样时刻与当时的状态）。
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { DEFAULT_WORKERS, readMemoryPressure } from './machine-preflight'

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..')

/** 样本文件（追加式）。 */
export const SAMPLE_FILE = join(ROOT, 'test-results', 'preflight-samples.jsonl')

/** 一组样本。 */
export interface Sample {
  /** 采样时刻（ISO） */
  at: string
  /** 这一组用的并发 */
  workers: number
  /** 跑的是哪个测试 */
  file: string
  /** 可用内存（字节） */
  freeBytes: number
  /** 物理内存总量（字节） */
  totalBytes: number
  /** swap 使用率（0–1）；null = 取不到 */
  swapRatio: number | null
  /** 系统负载（1/5/15 分钟均值，取 1 分钟） */
  load1: number
  /** 实测耗时（毫秒） */
  durationMs: number
  /** 有多少用例失败/超时（0 = 没超） */
  failed: number
  /** 有多少用例跳过 */
  skipped: number
  /**
   * worker 的堆上限（MB）—— **受控压力采集**时才有（`scripts/preflight-pressure-sample.ts`）。
   * ⚠️ 缺这个字段的样本是「自然状态」采样（机器当时啥样就记啥样）⇒
   *   **不能**与受控压力样本混在一张表里比较。
   */
  heapMb?: number
  /**
   * **每个 worker 吃的内存**（MB）—— 受控压力采集时才有。
   * ⚠️ 这一列才是「压力档」的真身：`heapMb` 只影响 GC 频率，不影响实际占用。
   */
  loadMb?: number
}

/** 取 1 分钟负载均值（取不到就 0）。 */
export function readLoad1(): number {
  try {
    const out = execFileSync('sysctl', ['-n', 'vm.loadavg'], { encoding: 'utf8' })
    const m = /([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(out)
    return m === null ? 0 : Number(m[1])
  } catch {
    return 0
  }
}

/** 从 vitest 输出里取「失败数」与「耗时」。 */
export function parseVitestResult(output: string): {
  failed: number
  skipped: number
  durationMs: number
} {
  // eslint-disable-next-line no-control-regex
  const plain = output.replace(/\x1b\[[0-9;]*m/g, '')
  const testsLine = plain
    .split('\n')
    .reverse()
    .find((l) => /^\s*Tests\s/.test(l))
  const failed = testsLine === undefined ? 0 : Number(/(\d+)\s+failed/.exec(testsLine)?.[1] ?? 0)
  const skipped = testsLine === undefined ? 0 : Number(/(\d+)\s+skipped/.exec(testsLine)?.[1] ?? 0)
  const dur = /Duration\s+([\d.]+)s/.exec(plain)
  return {
    failed: Number.isFinite(failed) ? failed : 0,
    skipped: Number.isFinite(skipped) ? skipped : 0,
    durationMs: dur === null ? 0 : Math.round(Number(dur[1]) * 1000),
  }
}

/**
 * 跑一组测试并采一组样本。
 *
 * @param workers 并发
 * @param file 测试文件（相对仓根）
 */
export function collectSample(workers: number, file: string): Sample {
  const pressure = readMemoryPressure()
  const swapRatio =
    pressure.swapTotalBytes > 0 ? pressure.swapUsedBytes / pressure.swapTotalBytes : null
  const started = Date.now()
  const res = spawnSync(
    'npx',
    ['vitest', 'run', '--project', 'unit', `--maxWorkers=${String(workers)}`, file],
    { cwd: ROOT, encoding: 'utf8', shell: false },
  )
  const output = `${res.stdout ?? ''}${res.stderr ?? ''}`
  const parsed = parseVitestResult(output)
  return {
    at: new Date().toISOString(),
    workers,
    file,
    freeBytes: pressure.freeBytes,
    totalBytes: pressure.totalBytes,
    swapRatio,
    load1: readLoad1(),
    durationMs: parsed.durationMs > 0 ? parsed.durationMs : Date.now() - started,
    failed: parsed.failed,
    skipped: parsed.skipped,
  }
}

/** 读全部样本。 */
export function readSamples(): Sample[] {
  let text: string
  try {
    text = readFileSync(SAMPLE_FILE, 'utf8')
  } catch {
    return []
  }
  const out: Sample[] = []
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (t.length === 0) continue
    try {
      out.push(JSON.parse(t) as Sample)
    } catch {
      // 坏行跳过
    }
  }
  return out
}

/** 追加一条样本。 */
export function appendSample(sample: Sample): void {
  mkdirSync(dirname(SAMPLE_FILE), { recursive: true })
  appendFileSync(SAMPLE_FILE, `${JSON.stringify(sample)}\n`, 'utf8')
}

/**
 * 汇总：按并发分组，给出「每档的实测耗时与失败数」。
 *
 * ⚠️ **这个汇总就是分级表的依据** —— 分档边界应当落在「耗时开始劣化」的位置，
 *   而不是拍脑袋 ⇒ `docs/dev-plan.md` §19.3 待办 2 的验收标准。
 */
export function summarize(samples: Sample[]): string {
  if (samples.length === 0) return '[sample] 还没有样本 ⇒ 先跑几组（pnpm preflight:sample）'
  const byWorkers = new Map<number, Sample[]>()
  for (const s of samples) {
    const list = byWorkers.get(s.workers) ?? []
    list.push(s)
    byWorkers.set(s.workers, list)
  }
  const lines: string[] = []
  for (const workers of [...byWorkers.keys()].sort((a, b) => a - b)) {
    const list = byWorkers.get(workers) ?? []
    const durations = list.map((s) => s.durationMs).sort((a, b) => a - b)
    const failedTotal = list.reduce((acc, s) => acc + s.failed, 0)
    const median = durations[Math.floor(durations.length / 2)] ?? 0
    const freeGb = list.map((s) => s.freeBytes / 1024 / 1024 / 1024)
    const minFree = Math.min(...freeGb)
    lines.push(
      `[sample] 并发 ${String(workers)}：${String(list.length)} 组 · 中位耗时 ${String(median)}ms` +
        ` · 失败合计 ${String(failedTotal)} · 最差可用内存 ${minFree.toFixed(2)} GB`,
    )
  }
  return lines.join('\n')
}

/** 命令行入口。 */
export function main(argv: string[]): number {
  const summaryOnly = argv.includes('--summary')
  if (summaryOnly) {
    console.log(summarize(readSamples()))
    return 0
  }
  const workersIdx = argv.indexOf('--workers')
  const workers =
    workersIdx >= 0 && argv[workersIdx + 1] !== undefined
      ? Number(argv[workersIdx + 1])
      : DEFAULT_WORKERS
  const fileIdx = argv.indexOf('--file')
  const file =
    fileIdx >= 0 && argv[fileIdx + 1] !== undefined
      ? (argv[fileIdx + 1] as string)
      : 'tests/temp-dir.test.ts'

  console.log(`[sample] 采集：并发 ${String(workers)} · ${file}`)
  const sample = collectSample(Number.isFinite(workers) ? workers : DEFAULT_WORKERS, file)
  appendSample(sample)
  console.log(
    `[sample] 可用内存 ${(sample.freeBytes / 1024 / 1024 / 1024).toFixed(2)} GB` +
      ` · 耗时 ${String(sample.durationMs)}ms · 失败 ${String(sample.failed)}`,
  )
  console.log(summarize(readSamples()))
  return 0
}

if (process.argv[1] !== undefined && process.argv[1].endsWith('preflight-sample.ts')) {
  process.exitCode = main(process.argv.slice(2))
}
