import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  ORPHAN_REPORT_FILE,
  ORPHAN_WARN_THRESHOLD,
  PS_TIMEOUT_MS,
  buildPersistedReport,
  buildReport,
  findOrphanWorkers,
  isInsideRepo,
  isOrphan,
  isWorkerCandidate,
  parsePsOutput,
  readRegisteredCwd,
  scanOrphans,
  shouldWarn,
  writeReportFile,
} from '../scripts/check-orphan-workers'
import { tempDir } from '@openvibe/core/test-support'
import {
  DEFAULT_MAX_AGE_MS,
  isExpiredRecord,
  isPidAlive,
  maybePruneRegistry,
  pruneRegistry,
  readRegistryRecords,
} from '@openvibe/core/test-support/worker-registry'

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

describe('孤儿 worker · 跨平台的 cwd 取法（不依赖 lsof）', () => {
  /** 造一条登记文件（**文件名即时间序** ⇒ 排序靠它，不靠写入顺序）。 */
  function writeRecord(dir: string, record: { pid: number; cwd: string; at: string }): string {
    mkdirSync(dir, { recursive: true })
    const epoch = String(Date.parse(record.at)).padStart(13, '0')
    const name = `${String(record.pid)}-${epoch}-${randomUUID().slice(0, 8)}.json`
    const path = join(dir, name)
    writeFileSync(path, `${JSON.stringify(record)}\n`, 'utf8')
    return path
  }

  it('⚠️ 登记目录里有该 pid ⇒ 拿得到 cwd（跨平台主通道）', () => {
    // ⚠️ 这条是「Windows 上也能判归属」的关键：登记是 worker 自己写的
    //   ⇒ **不依赖 `lsof`**（`lsof` 非 POSIX 标准，Windows 没有）。
    const dir = tempDir('ov-registry-probe-')
    writeRecord(dir, { pid: 11, cwd: '/repo', at: '2026-11-02T00:00:00.000Z' })
    writeRecord(dir, { pid: 22, cwd: '/other', at: '2026-11-02T00:00:01.000Z' })
    expect(readRegisteredCwd(11, dir)).toBe('/repo')
    expect(readRegisteredCwd(22, dir)).toBe('/other')
    expect(readRegisteredCwd(33, dir)).toBeNull()
  })

  it('⚠️ 同一 pid 登记多次 ⇒ 取**最新那条**（worker 会复用 pid）', () => {
    const dir = tempDir('ov-registry-probe2-')
    writeRecord(dir, { pid: 44, cwd: '/old', at: '2026-11-02T00:00:00.000Z' })
    writeRecord(dir, { pid: 44, cwd: '/new', at: '2026-11-02T00:00:02.000Z' })
    expect(readRegisteredCwd(44, dir)).toBe('/new')
  })

  it('⚠️ 登记目录里有坏文件 ⇒ 跳过它，不整体失败', () => {
    const dir = tempDir('ov-registry-probe3-')
    writeRecord(dir, { pid: 55, cwd: '/repo', at: '2026-11-02T00:00:00.000Z' })
    writeFileSync(join(dir, '99-0000000000000-badbadba.json'), '{ 这不是 JSON', 'utf8')
    expect(readRegisteredCwd(55, dir)).toBe('/repo')
  })

  it('⚠️ 登记目录不存在 ⇒ 返回 null（回落 lsof 通道），不抛错', () => {
    expect(readRegisteredCwd(66, join(tmpdir(), 'ov-registry-does-not-exist-dir'))).toBeNull()
  })

  it('⚠️ 主通道优先于 lsof（登记里有就用登记的）', () => {
    const src = readFileSync(join(ROOT, 'scripts', 'check-orphan-workers.ts'), 'utf8')
    // readCwd 的实现顺序：先登记、后 lsof
    const idxRegistered = src.indexOf('readRegisteredCwd(pid)')
    const idxLsof = src.indexOf('readCwdViaLsof(pid)')
    expect(idxRegistered).toBeGreaterThan(-1)
    expect(idxLsof).toBeGreaterThan(-1)
    expect(idxRegistered).toBeLessThan(idxLsof)
  })
})

describe('孤儿 worker · 登记目录回收（2026-11-02 增强 · 2026-11-03 改布局）', () => {
  /**
   * ⚠️ **固定「当前时刻」**：回收还看登记年龄（默认 7 天）
   *   ⇒ 若用真实时钟，写死的 2026-11-02 登记过了 7 天就会全部过期
   *   ⇒ 用例会在某天**突然红** ⇒ 这里显式注入时刻，让判据与真实时钟解耦。
   */
  const NOW = Date.parse('2026-11-02T12:00:00.000Z')

  /** 造一条登记文件（**文件名即时间序** ⇒ 排序靠它，不靠写入顺序）。 */
  function writeRecord(dir: string, record: { pid: number; cwd: string; at: string }): string {
    mkdirSync(dir, { recursive: true })
    const epoch = String(Date.parse(record.at)).padStart(13, '0')
    const name = `${String(record.pid)}-${epoch}-${randomUUID().slice(0, 8)}.json`
    const path = join(dir, name)
    writeFileSync(path, `${JSON.stringify(record)}\n`, 'utf8')
    return path
  }

  it('⚠️ 已死 pid 被删掉，活着的保留', () => {
    // ⚠️ 这条判的是**回收的语义本身**：登记目录原先「只增不减」⇒ 会无限长下去。
    //   注入假 isAlive ⇒ 不依赖「真去造一个死进程」。
    const dir = tempDir('ov-prune-probe1-')
    writeRecord(dir, { pid: 111, cwd: '/repo/a', at: '2026-11-02T00:00:00.000Z' })
    writeRecord(dir, { pid: 222, cwd: '/repo/b', at: '2026-11-02T00:00:01.000Z' })
    const res = pruneRegistry(dir, (pid) => pid === 222, { now: NOW })
    expect(res).toEqual({ before: 2, after: 1, removed: 1 })
    expect(readRegistryRecords(dir).map((r) => r.pid)).toEqual([222])
  })

  it('⚠️ 同一 pid 多条 ⇒ 去重只留**最新那条**（worker 会复用 pid）', () => {
    const dir = tempDir('ov-prune-probe2-')
    writeRecord(dir, { pid: 333, cwd: '/repo/old', at: '2026-11-02T00:00:00.000Z' })
    writeRecord(dir, { pid: 333, cwd: '/repo/new', at: '2026-11-02T00:00:02.000Z' })
    const res = pruneRegistry(dir, () => true, { now: NOW })
    expect(res).toEqual({ before: 2, after: 1, removed: 1 })
    const kept = readRegistryRecords(dir)
    expect(kept).toHaveLength(1)
    expect(kept[0]?.cwd).toBe('/repo/new')
  })

  it('⚠️ 坏文件在回收时一并清掉（读侧跳过它，写侧不再保留）', () => {
    const dir = tempDir('ov-prune-probe3-')
    writeRecord(dir, { pid: 444, cwd: '/repo', at: '' })
    writeFileSync(join(dir, '88-0000000000000-badbadba.json'), '{ 这不是 JSON', 'utf8')
    const res = pruneRegistry(dir, () => true, { now: NOW })
    // 坏文件虽不是有效记录，但它占着一个位置 ⇒ 也要被清掉（before 按文件数计）
    expect(res).toEqual({ before: 2, after: 1, removed: 1 })
    expect(readRegistryRecords(dir).map((r) => r.pid)).toEqual([444])
  })

  it('⚠️ 目录不存在 ⇒ 全 0（还没跑过测试不是错误）', () => {
    const res = pruneRegistry(join(tmpdir(), 'ov-prune-does-not-exist-dir'), () => true)
    expect(res).toEqual({ before: 0, after: 0, removed: 0 })
  })

  it('⚠️ 全部存活时不动文件（removed = 0 ⇒ 不发生写操作）', () => {
    const dir = tempDir('ov-prune-probe4-')
    const path = writeRecord(dir, { pid: 555, cwd: '/repo', at: '2026-11-02T00:00:00.000Z' })
    const before = readFileSync(path, 'utf8')
    const res = pruneRegistry(dir, () => true, { now: NOW })
    expect(res).toEqual({ before: 1, after: 1, removed: 0 })
    expect(readFileSync(path, 'utf8')).toBe(before)
  })

  it('⚠️ isPidAlive 的边界：pid ≤ 0 一律判死（否则会变成「向进程组发信号」）', () => {
    expect(isPidAlive(process.pid)).toBe(true)
    expect(isPidAlive(0)).toBe(false)
    expect(isPidAlive(-1)).toBe(false)
    expect(isPidAlive(1.5)).toBe(false)
  })

  it('⚠️ 闸门确实调用了回收（否则登记目录仍会无限增长）', () => {
    const src = readFileSync(join(ROOT, 'scripts', 'check-orphan-workers.ts'), 'utf8')
    expect(src).toContain('pruneRegistry(')
  })
})

describe('孤儿 worker · 登记目录按年龄清理（2026-11-03）', () => {
  const NOW = Date.parse('2026-11-02T12:00:00.000Z')

  it('⚠️ 超龄的登记被删掉（哪怕 pid 还活着）', () => {
    // ⚠️ 为什么按年龄再清一遍：pid 会被**复用** ⇒ 一个还活着的 pid
    //   （早已不是当初那个 worker）会让那条登记永远留着 ⇒ 只按存活判定清不干净。
    const dir = tempDir('ov-age-probe1-')
    const epoch = (at: string): string => String(Date.parse(at)).padStart(13, '0')
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, `601-${epoch('2026-10-01T00:00:00.000Z')}-aaaaaaaa.json`),
      `${JSON.stringify({ pid: 601, cwd: '/repo/old', at: '2026-10-01T00:00:00.000Z' })}\n`,
      'utf8',
    )
    writeFileSync(
      join(dir, `602-${epoch('2026-11-02T11:00:00.000Z')}-bbbbbbbb.json`),
      `${JSON.stringify({ pid: 602, cwd: '/repo/new', at: '2026-11-02T11:00:00.000Z' })}\n`,
      'utf8',
    )
    const res = pruneRegistry(dir, () => true, { now: NOW })
    expect(res).toEqual({ before: 2, after: 1, removed: 1 })
    expect(readRegistryRecords(dir).map((r) => r.pid)).toEqual([602])
  })

  it('⚠️ 默认上限是 7 天（过期判定的口径不许偷偷改）', () => {
    expect(DEFAULT_MAX_AGE_MS).toBe(7 * 24 * 60 * 60 * 1000)
  })

  it('⚠️ `at` 解析不出来 ⇒ **不算过期**（查不到 ≠ 不合法）', () => {
    // ⚠️ 把「取不到时刻」当成「一定很旧」⇒ 会误删正在跑的 worker 的登记。
    expect(isExpiredRecord({ pid: 1, cwd: '/repo', at: '' }, DEFAULT_MAX_AGE_MS, NOW)).toBe(false)
    expect(
      isExpiredRecord({ pid: 1, cwd: '/repo', at: 'not-a-date' }, DEFAULT_MAX_AGE_MS, NOW),
    ).toBe(false)
    // 真超龄的仍要判过期
    expect(
      isExpiredRecord(
        { pid: 1, cwd: '/repo', at: '2026-10-01T00:00:00.000Z' },
        DEFAULT_MAX_AGE_MS,
        NOW,
      ),
    ).toBe(true)
  })

  it('⚠️ 恰在上限之内（不超龄）⇒ 保留', () => {
    expect(
      isExpiredRecord(
        { pid: 1, cwd: '/repo', at: '2026-10-26T12:00:00.000Z' },
        DEFAULT_MAX_AGE_MS,
        NOW,
      ),
    ).toBe(false)
  })
})

describe('孤儿 worker · worker 启动时限频回收（2026-11-03）', () => {
  const NOW = Date.parse('2026-11-02T12:00:00.000Z')

  /** 造一条登记文件（**文件名即时间序**）。 */
  function writeRecord(dir: string, record: { pid: number; cwd: string; at: string }): string {
    mkdirSync(dir, { recursive: true })
    const epoch = String(Date.parse(record.at)).padStart(13, '0')
    const name = `${String(record.pid)}-${epoch}-${randomUUID().slice(0, 8)}.json`
    const path = join(dir, name)
    writeFileSync(path, `${JSON.stringify(record)}\n`, 'utf8')
    return path
  }

  it('⚠️ 没跑过体检的机器也能回收（worker 启动时自己清）', () => {
    // ⚠️ 这条判的是「回收不再只发生在体检进程里」⇒ 只跑 vitest 的机器也能清。
    const dir = tempDir('ov-maybe-prune-1-')
    writeRecord(dir, { pid: 999_999, cwd: '/repo', at: '2026-11-02T11:00:00.000Z' })
    const res = maybePruneRegistry(dir, { now: NOW })
    expect(res.ran).toBe(true)
    expect(res.skipped).toBeNull()
    expect(res.result.before).toBe(1)
  })

  it('⚠️ 限频窗口内 ⇒ 跳过（不做枚举 + 删除）', () => {
    // ⚠️ 回收要枚举 + 逐个删 ⇒ 每轮都做一遍纯属浪费 ⇒ 24h 一次足够。
    const dir = tempDir('ov-maybe-prune-2-')
    writeRecord(dir, { pid: 999_998, cwd: '/repo', at: '2026-11-02T11:00:00.000Z' })
    const first = maybePruneRegistry(dir, { now: NOW })
    expect(first.ran).toBe(true)
    const second = maybePruneRegistry(dir, { now: NOW + 60 * 60 * 1000 })
    expect(second.ran).toBe(false)
    expect(second.skipped).toBe('throttled')
  })

  it('⚠️ 过了限频窗口 ⇒ 又能回收', () => {
    const dir = tempDir('ov-maybe-prune-3-')
    writeRecord(dir, { pid: 999_997, cwd: '/repo', at: '2026-11-02T11:00:00.000Z' })
    expect(maybePruneRegistry(dir, { now: NOW }).ran).toBe(true)
    const later = maybePruneRegistry(dir, { now: NOW + 25 * 60 * 60 * 1000 })
    expect(later.ran).toBe(true)
  })

  it('⚠️ setup 文件确实调了限频回收（否则「没跑体检的机器」永远不清）', () => {
    const src = readFileSync(join(ROOT, 'tests', 'setup-worker-registry.ts'), 'utf8')
    expect(src).toContain('maybePruneRegistry(')
  })
})

describe('孤儿 worker · 登记与回收的并发竞态（2026-11-03 修）', () => {
  it('⚠️ 回收过程中新建的登记 ⇒ 不会被回收删掉（结构上不可能丢行）', () => {
    // ⚠️ **这条判的是本轮修复的核心**：
    //   旧布局是「一个 JSON Lines 文件」⇒ 登记**追加**、回收**读-改-写**
    //   ⇒ 回收读完 → 另一个 worker 追加一行 → 回收 rename 覆盖 ⇒ **那行消失**。
    //   新布局是「目录 + 每条登记一个文件」⇒ 回收**只删自己枚举到的文件**
    //   ⇒ 枚举之后新建的文件**必然安全**。
    //   ⇒ 用「回收回调里新建一条登记」来复现那个时序（确定性复现，不靠运气）。
    const dir = tempDir('ov-race-probe-')
    mkdirSync(dir, { recursive: true })
    const epoch = String(Date.parse('2026-11-02T00:00:00.000Z')).padStart(13, '0')
    writeFileSync(
      join(dir, `111-${epoch}-aaaaaaaa.json`),
      `${JSON.stringify({ pid: 111, cwd: '/repo', at: '2026-11-02T00:00:00.000Z' })}\n`,
      'utf8',
    )
    // 假 isAlive：在它被调用时（= 回收正在做判定）新建一条登记 ⇒ 模拟并发写入
    let injected = false
    const res = pruneRegistry(dir, () => {
      if (!injected) {
        injected = true
        const e2 = String(Date.parse('2026-11-02T00:00:01.000Z')).padStart(13, '0')
        writeFileSync(
          join(dir, `222-${e2}-bbbbbbbb.json`),
          `${JSON.stringify({ pid: 222, cwd: '/repo/new', at: '2026-11-02T00:00:01.000Z' })}\n`,
          'utf8',
        )
      }
      return false
    })
    // 回收只删「自己枚举到」的文件 ⇒ 回收期间新建的那条必须还在
    expect(readRegistryRecords(dir).map((r) => r.pid)).toContain(222)
    expect(res.before).toBe(1)
  })

  it('⚠️ 登记是**新建文件**、不是往共享文件里追加（竞态的根因已除）', () => {
    // ⚠️ 这条判的是「结构性」的：登记若还在往一个共享文件里追加，
    //   那么「回收读-改-写」就仍然可能覆盖它 ⇒ 竞态只是被推迟，不是被消除。
    const src = readFileSync(
      join(ROOT, 'packages/core/src/test-support/worker-registry.ts'),
      'utf8',
    )
    // ⚠️ 追加语义（appendFileSync）在登记路径上必须**没有**
    expect(src).not.toMatch(/appendFileSync/)
    // ⚠️ 而「写自己的文件 + rename 发布」必须在
    expect(src).toMatch(/writeFileSync\(tmp/)
    expect(src).toMatch(/renameSync\(tmp, target\)/)
  })

  it('⚠️ 回收只删「自己枚举到」的文件（不整目录重写）', () => {
    // ⚠️ 整目录重写 = 旧竞态的形态（读-改-写）⇒ 必须没有
    const src = readFileSync(
      join(ROOT, 'packages/core/src/test-support/worker-registry.ts'),
      'utf8',
    )
    expect(src).toMatch(/unlinkSync\(join\(dir, entry\.name\)\)/)
  })

  it('⚠️ 登记是**原子发布**（写 tmp 再 rename）⇒ 读者不会看到半截 JSON', () => {
    // ⚠️ 这条判的是「发布是原子的」：直接写正式文件名 ⇒ 并发读者可能读到半截内容
    //   ⇒ 那条登记会被当成坏文件清掉 ⇒ 又是一次丢行。
    const src = readFileSync(
      join(ROOT, 'packages/core/src/test-support/worker-registry.ts'),
      'utf8',
    )
    expect(src).toMatch(/renameSync\(tmp, target\)/)
    // ⚠️ 而「tmp 中间文件」不能被回收当成正式登记（否则会删掉别人正在写的那份）
    expect(src).toMatch(/name\.startsWith\(TMP_PREFIX\)/)
  })

  it('⚠️ 写了一半的 tmp 文件**暂不删**（正在写的那份不能碰）', () => {
    // ⚠️ 回收时若把「正在写的 tmp」删了 ⇒ 那个 worker 的 rename 会失败
    //   ⇒ 那条登记就丢了 ⇒ 正是本轮要消灭的那类丢行。
    const dir = tempDir('ov-race-tmp-')
    mkdirSync(dir, { recursive: true })
    const tmpPath = join(dir, '.tmp-inflight')
    writeFileSync(tmpPath, '{ 写了一半', 'utf8')
    pruneRegistry(dir, () => true, { now: Date.now() })
    expect(existsSync(tmpPath)).toBe(true)
  })

  it('⚠️ 写了一半且**放了很久**的 tmp 文件 ⇒ 回收时清掉（持有者已被杀）', () => {
    // ⚠️ 不清 ⇒ 目录里会攒下越来越多的垃圾文件。
    const dir = tempDir('ov-race-tmp2-')
    mkdirSync(dir, { recursive: true })
    const tmpPath = join(dir, '.tmp-stale')
    writeFileSync(tmpPath, '{ 写了一半', 'utf8')
    // 注入「现在」= 2 分钟后 ⇒ 该 tmp 已超过 60 秒 ⇒ 算残留
    pruneRegistry(dir, () => true, { now: Date.now() + 5 * 60 * 1000 })
    expect(existsSync(tmpPath)).toBe(false)
  })
})

describe('孤儿 worker · 结果落盘与 ps 超时（2026-11-02 增强）', () => {
  const scan = {
    workers: [{ pid: 900, command: 'node (vitest 1)', cwd: '/repo' }],
    undetermined: [{ pid: 901, command: 'node (vitest 2)' }],
  }
  const pruned = { before: 4, after: 1, removed: 3 }

  it('⚠️ 落盘内容与本次体检同源（孤儿 / 无法判定 / 回收三项都在）', () => {
    // ⚠️ 为什么要判这条：结论原先只打在 stdout ⇒ 日志滚掉后「那次结束时有没有孤儿、
    //   回收了多少行」就查不回来 ⇒ 落盘必须覆盖这三项，缺一项就等于没存。
    const report = buildPersistedReport(scan, pruned, '/repo')
    expect(report.orphans.map((w) => w.pid)).toEqual([900])
    expect(report.undetermined.map((u) => u.pid)).toEqual([901])
    expect(report.registry).toEqual(pruned)
    expect(report.warn).toBe(false)
  })

  it('⚠️ 写出的是可解析的 JSON（父目录不存在时自动创建）', () => {
    const path = join(tempDir('ov-orphans-report-'), 'nested', 'orphans.json')
    const saved = writeReportFile(buildPersistedReport(scan, pruned, '/repo'), path)
    expect(saved).toBe(path)
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { registry: { removed: number } }
    expect(parsed.registry.removed).toBe(3)
  })

  it('⚠️ 写失败不抛（产物是辅助信息，不能反过来让测试失败）', () => {
    // 把「父目录」指向一个**已存在的文件** ⇒ mkdirSync 必失败
    const notADir = join(tempDir('ov-orphans-blocked-'), 'blocked')
    writeFileSync(notADir, 'x', 'utf8')
    expect(
      writeReportFile(buildPersistedReport(scan, pruned, '/repo'), join(notADir, 'o.json')),
    ).toBeNull()
  })

  it('⚠️ 两处 `ps` 调用都带超时（体检不能把测试退出拖住）', () => {
    // ⚠️ 体检挂在 `pnpm test` 收尾 ⇒ `ps` 挂住就等于整条测试命令挂住。
    const src = readFileSync(join(ROOT, 'scripts', 'check-orphan-workers.ts'), 'utf8')
    const psCalls = src.match(/execFileSync\('ps'[\s\S]*?\)\n/g) ?? []
    expect(psCalls.length).toBeGreaterThanOrEqual(2)
    for (const call of psCalls) expect(call).toContain('timeout: PS_TIMEOUT_MS')
    expect(PS_TIMEOUT_MS).toBeGreaterThan(0)
  })

  it('⚠️ 落盘路径与 preflight 产物并列（都在 test-results/ 下）', () => {
    expect(ORPHAN_REPORT_FILE.startsWith('test-results/')).toBe(true)
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
