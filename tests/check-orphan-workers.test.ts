import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  ORPHAN_WARN_THRESHOLD,
  buildReport,
  findOrphanWorkers,
  isInsideRepo,
  isOrphan,
  isWorkerCandidate,
  parsePsOutput,
  scanOrphans,
  shouldWarn,
} from '../scripts/check-orphan-workers'

/**
 * 孤儿 worker 闸（2026-11-02）。
 *
 * ## 它防的是什么
 *
 * 2026-11-02 实测：跑完测试后机器上留了 **9 个 `PPID=1` 的 `node (vitest N)` 进程**。
 * 它们当时 CPU 为 0 ⇒ 无害；但**没有任何机制会发现它们** ⇒ 一旦某个卡在 CPU 密集态，
 * 就会持续拖慢机器，而现象是「测试莫名变慢/变红」⇒ 极难归因。
 *
 * ## 三条判据是「与」的关系
 *
 * 孤儿（PPID=1）**且** 是 worker 候选 **且** cwd 在本仓内
 * ⇒ 三者全中才算「本仓的孤儿 worker」⇒ **不误伤**同机别人的 vitest。
 */

const ROOT = resolve(__dirname, '..')

describe('孤儿 worker · 进程表解析', () => {
  it('解析 pid/ppid/命令三列', () => {
    const rows = parsePsOutput('  123    1 node (vitest 1)\n  456  789 npm exec vitest run\n')
    // ⚠️ 先断言长度再下标 ⇒ 长度不对时下面那行不会越界
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({ pid: 123, ppid: 1, command: 'node (vitest 1)' })
    expect(rows[1]).toEqual({ pid: 456, ppid: 789, command: 'npm exec vitest run' })
  })

  it('⚠️ 命令列里有空格时不能切碎（`node --import tsx …` 的路径带空格）', () => {
    // ⚠️ 若用 `split(' ')` 全切 ⇒ 命令会被截断 ⇒ 后面的「是不是 worker 候选」就判错了。
    const rows = parsePsOutput(
      '  777    1 node --import tsx /Users/duke/Documents/My Project/scripts/x.ts\n',
    )
    expect(rows[0]?.command).toContain('My Project')
  })

  it('表头与空行被跳过', () => {
    const rows = parsePsOutput('  PID  PPID COMMAND\n\n  1  0 /sbin/launchd\n')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.pid).toBe(1)
  })
})

describe('孤儿 worker · 三条判据', () => {
  it('孤儿 = PPID 为 1（父进程已死、被 launchd 收养）', () => {
    expect(isOrphan({ pid: 1, ppid: 1, command: 'x' })).toBe(true)
    expect(isOrphan({ pid: 1, ppid: 42, command: 'x' })).toBe(false)
  })

  it('worker 候选 = 命令含 vitest，或同时含 tsx 与 scripts/', () => {
    expect(isWorkerCandidate('node (vitest 1)')).toBe(true)
    expect(isWorkerCandidate('npm exec vitest run')).toBe(true)
    expect(isWorkerCandidate('node /x/tsx/dist/cli.mjs /repo/scripts/foo.ts')).toBe(true)
    // 别的项目的普通 node 进程不算
    expect(isWorkerCandidate('/Applications/WeChat.app/WeChat')).toBe(false)
  })

  it('⚠️ 只含 tsx 但不含 scripts/ ⇒ 不算（避免把任意 tsx 进程算进来）', () => {
    // ⚠️ 判据别写太宽：`tsx` 在本机很常见（各种脚本都在用）⇒ 必须再要求 `scripts/`。
    expect(isWorkerCandidate('node /x/tsx/dist/cli.mjs /elsewhere/whatever.ts')).toBe(false)
  })

  it('⚠️ 真实命令形态必须能被认出来（判据自检：防「正则写太紧」）', () => {
    // ⚠️ 这条盯的是「判据会不会因为写得太紧而永远匹配不上」——
    //   本轮就踩过：`tsx scripts/` 这种写法在真实命令（`tsx/dist/cli.mjs scripts/x.ts`）上永不命中。
    const real = 'node /opt/homebrew/lib/node_modules/tsx/dist/cli.mjs /repo/scripts/foo.ts'
    expect(isWorkerCandidate(real)).toBe(true)
  })

  it('⚠️ cwd 判定用「路径前缀 + 分隔符」（不能裸 startsWith）', () => {
    // ⚠️ 裸 startsWith 会把 `/Users/duke/Documents/OpenVibe-other` 判成「在仓内」
    //   ⇒ 就会把**别的项目**的孤儿算到本仓头上。
    expect(isInsideRepo('/Users/duke/Documents/OpenVibe', '/Users/duke/Documents/OpenVibe')).toBe(
      true,
    )
    expect(
      isInsideRepo('/Users/duke/Documents/OpenVibe/apps', '/Users/duke/Documents/OpenVibe'),
    ).toBe(true)
    expect(
      isInsideRepo('/Users/duke/Documents/OpenVibe-other', '/Users/duke/Documents/OpenVibe'),
    ).toBe(false)
    expect(isInsideRepo('/Users/duke/Documents/Other', '/Users/duke/Documents/OpenVibe')).toBe(
      false,
    )
    expect(isInsideRepo(null, '/Users/duke/Documents/OpenVibe')).toBe(false)
  })
})

describe('孤儿 worker · 挑选', () => {
  const rows = [
    { pid: 100, ppid: 1, command: 'node (vitest 1)' },
    { pid: 101, ppid: 1, command: 'node (vitest 2)' },
    { pid: 102, ppid: 555, command: 'node (vitest 3)' }, // 父进程还活着 ⇒ 不是孤儿
    { pid: 103, ppid: 1, command: '/Applications/WeChat.app/WeChat' }, // 不是 worker
  ]

  it('只挑「孤儿 + worker 候选 + 本仓 cwd」三者全中的', () => {
    const found = findOrphanWorkers(rows, '/repo', [], (pid) =>
      pid === 103 ? '/other/project' : '/repo',
    )
    expect(found.map((w) => w.pid)).toEqual([100, 101])
  })

  it('⚠️ 别把「父进程还活着」的 worker 当孤儿', () => {
    const found = findOrphanWorkers(rows, '/repo', [], () => '/repo')
    expect(found.map((w) => w.pid)).not.toContain(102)
  })

  it('⚠️ 别把别的项目的 worker 算到本仓头上', () => {
    const found = findOrphanWorkers(rows, '/repo', [], (pid) =>
      pid === 100 ? '/other/project' : '/repo',
    )
    expect(found.map((w) => w.pid)).toEqual([101])
  })

  it('⚠️ 排除指定的 pid（脚本自己与它的祖先）', () => {
    const found = findOrphanWorkers(rows, '/repo', [100], () => '/repo')
    expect(found.map((w) => w.pid)).toEqual([101])
  })

  it('cwd 取不到 ⇒ 不算本仓的（宁可不报也不误报）', () => {
    const found = findOrphanWorkers(rows, '/repo', [], () => null)
    expect(found).toEqual([])
  })
})

describe('孤儿 worker · 「无法判定」要如实说（不能静默报 0）', () => {
  const rows = [
    { pid: 300, ppid: 1, command: 'node (vitest 1)' },
    { pid: 301, ppid: 1, command: 'node (vitest 2)' },
  ]

  it('⚠️ cwd 取不到 ⇒ 记进「无法判定」，不进「本仓的」', () => {
    const scan = scanOrphans(rows, '/repo', [], () => null)
    expect(scan.workers).toEqual([])
    expect(scan.undetermined.map((u) => u.pid)).toEqual([300, 301])
  })

  it('⚠️ 报告里必须出现「无法判定」（不能只说「0 个 ⇒ 干净」）', () => {
    // ⚠️ 这条盯的是「没测到」与「没问题」的区分：
    //   cwd 取不到时真相是「判不了」⇒ 若报告说「干净」⇒ 掩盖问题。
    const scan = scanOrphans(rows, '/repo', [], () => null)
    const report = buildReport(scan.workers, ORPHAN_WARN_THRESHOLD, scan.undetermined)
    expect(report.message).toMatch(/无法判定/)
    expect(report.undetermined).toHaveLength(2)
  })

  it('⚠️ 「无法判定」的候选一律不杀（归属不明 ⇒ 可能属于别的项目）', () => {
    const src = readFileSync(join(ROOT, 'scripts', 'check-orphan-workers.ts'), 'utf8')
    // kill 循环只能遍历 scan.workers（已确认 cwd 的）⇒ 不能碰 undetermined
    expect(src).toMatch(/for \(const w of scan\.workers\)/)
    expect(src).not.toMatch(/for \(const u of scan\.undetermined\)/)
  })
})

describe('孤儿 worker · 阈值与报告', () => {
  it('⚠️ 低于阈值不报警（攒够一批才提醒，避免噪音）', () => {
    expect(shouldWarn(1)).toBe(false)
    expect(shouldWarn(ORPHAN_WARN_THRESHOLD)).toBe(false)
    expect(shouldWarn(ORPHAN_WARN_THRESHOLD + 1)).toBe(true)
  })

  it('一个都没有 ⇒ 报告说「干净」', () => {
    const report = buildReport([])
    expect(report.warn).toBe(false)
    expect(report.message).toMatch(/0 个/)
    expect(report.message).toMatch(/干净/)
  })

  it('⚠️ 超阈值 ⇒ 报告里带「建议清理」与具体 pid', () => {
    const workers = Array.from({ length: ORPHAN_WARN_THRESHOLD + 1 }, (_, i) => ({
      pid: 200 + i,
      command: 'node (vitest 1)',
      cwd: '/repo',
    }))
    const report = buildReport(workers)
    expect(report.warn).toBe(true)
    expect(report.message).toMatch(/建议清理/)
    expect(report.message).toMatch(/pid 200/)
  })

  it('⚠️ 报告本身不算失败（它是体检报告，不是门禁闸口）', () => {
    // 理由：孤儿 worker 的存在不该让 `pnpm test` 失败 ⇒ 它是**体检**，不是**闸**。
    const report = buildReport([{ pid: 1, command: 'node (vitest 1)', cwd: '/repo' }])
    expect(report.warn).toBe(false)
  })
})

describe('孤儿 worker · 脚本形态', () => {
  it('⚠️ 默认不自动 kill（会误伤同机别人的 vitest）', () => {
    const src = readFileSync(join(ROOT, 'scripts', 'check-orphan-workers.ts'), 'utf8')
    // `process.kill` 只允许出现在 `--kill` 分支里 ⇒ 判据盯住「默认路径无 kill」
    const killCalls = src.match(/process\.kill\(/g) ?? []
    expect(killCalls.length).toBe(1)
    expect(src).toContain("argv.includes('--kill')")
  })

  it('⚠️ 动手前必须逐个确认 cwd 在本仓内（不许裸按 pid 杀）', () => {
    const src = readFileSync(join(ROOT, 'scripts', 'check-orphan-workers.ts'), 'utf8')
    expect(src).toContain('isInsideRepo')
    // kill 的循环体只能遍历「已筛过 cwd」的 scan.workers
    expect(src).toMatch(/for \(const w of scan\.workers\)/)
  })
})
