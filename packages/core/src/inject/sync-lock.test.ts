import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { PACK_BACKUP_REL } from './lock'
import {
  SYNC_LOCK_REL,
  SYNC_LOCK_STALE_MS,
  tryAcquireSyncLock,
  type SyncLockAcquire,
} from './sync-lock'
import { PACK_LOCK_REL } from '../local/lock'

/**
 * T8e · 并发 sync 文件锁（m6b §6.9 / design §11.3）。
 *
 * 锁的正确性只由三件事决定：`wx` 的原子性、陈旧判定、release 的归属校验。前两件可以在
 * 单进程里用注入的 now/pid/isAlive 精确量（含 5 分钟边界的两侧各 1 秒），真跨进程的部分
 * 放 apps/cli/test/sync-lock.test.ts 用真子进程证。时间一律以「本文件加载时刻 + 偏移」为准，
 * 不用写死的 UTC 字面量——否则 mtime 与 now 的差值随真实钟点漂移，用例会随机红。
 */

const roots: string[] = []
const project = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'ov-synclock-'))
  roots.push(root)
  const dir = join(root, 'proj')
  mkdirSync(dir)
  return dir
}

afterAll(() => {
  while (roots.length > 0) rmSync(roots.pop() ?? '', { recursive: true, force: true })
})

const T0 = new Date()
const IS_WINDOWS = process.platform === 'win32'
const at = (offsetMs: number): { now: () => Date } => ({ now: () => new Date(T0.getTime() + offsetMs) })
const pid = (p: number) => ({ pid: () => p })
const alive = (predicate: (p: number) => boolean) => ({ isAlive: predicate })
const ALWAYS_ALIVE = alive(() => true)
const DEAD_PID = 999_999

const lockPathOf = (projectPath: string): string => join(projectPath, SYNC_LOCK_REL)
const readHolder = (projectPath: string): Record<string, unknown> =>
  JSON.parse(readFileSync(lockPathOf(projectPath), 'utf8')) as Record<string, unknown>

type Got = Extract<SyncLockAcquire, { acquired: true }>
type Busy = Extract<SyncLockAcquire, { acquired: false }>
const held = (acq: SyncLockAcquire): Got => {
  if (acq.acquired !== true) throw new Error(`预期抢到锁，实际抢不到（${acq.reason}）`)
  return acq
}
const busy = (acq: SyncLockAcquire): Busy => {
  if (acq.acquired === true) throw new Error('预期抢不到锁，实际抢到了')
  return acq
}
const exists = (path: string): boolean => {
  try {
    statSync(path)
    return true
  } catch {
    return false
  }
}

/** 手写一把「别人」的锁（绕过实现，模拟崩溃残留与竞争者） */
function foreignLock(
  projectPath: string,
  holder: { pid: number; startedAt: string; command: string } | string,
): void {
  mkdirSync(join(projectPath, '.openvibe'), { recursive: true })
  writeFileSync(
    lockPathOf(projectPath),
    typeof holder === 'string' ? holder : JSON.stringify(holder),
  )
}

/** 把锁文件的 mtime 推到 ageMs 之前（内容读不懂时只能看磁盘时间） */
function ageTheFile(projectPath: string, ageMs: number): void {
  const when = new Date(Date.now() - ageMs)
  utimesSync(lockPathOf(projectPath), when, when)
}

describe('sync.lock（并发注入互斥）', () => {
  it('SL-01: 抢到即落盘 {pid,startedAt,command}，release 后消失且可重复调用', () => {
    const dir = project()
    const lock = held(tryAcquireSyncLock(dir, 'sync', { ...at(0), ...pid(4242) }))
    expect(lock.holder).toEqual({ pid: 4242, startedAt: T0.toISOString(), command: 'sync' })
    expect(lock.path).toBe(lockPathOf(dir))
    expect(lock.tookOver).toBeNull()
    expect(readHolder(dir)).toEqual(lock.holder)

    lock.release()
    expect(exists(lockPathOf(dir))).toBe(false)
    expect(() => lock.release()).not.toThrow()
  })

  it('SL-02: 活进程持有的新鲜锁 → 抢不到，holder 原样回读，磁盘一个字节没动', () => {
    const dir = project()
    const prev = { pid: 5001, startedAt: T0.toISOString(), command: 'sync' }
    foreignLock(dir, prev)
    const before = readFileSync(lockPathOf(dir))
    const acq = busy(tryAcquireSyncLock(dir, 'sync', { ...at(1000), ...pid(1), ...ALWAYS_ALIVE }))
    expect(acq.reason).toBe('held')
    expect(acq.holder).toEqual(prev)
    expect(acq.ageMs).toBe(1000)
    expect(readFileSync(lockPathOf(dir)).equals(before)).toBe(true)
  })

  it('SL-03: pid 已死（Ctrl-C 后崩溃残留）→ 立刻接管，tookOver 记下前任', () => {
    const dir = project()
    const prev = { pid: DEAD_PID, startedAt: T0.toISOString(), command: 'sync' }
    foreignLock(dir, prev)
    const lock = held(
      tryAcquireSyncLock(dir, 'sync', {
        ...at(1000),
        ...pid(7),
        ...alive((p) => p !== DEAD_PID),
      }),
    )
    expect(lock.tookOver).toEqual(prev)
    expect(readHolder(dir)).toEqual({
      pid: 7,
      startedAt: new Date(T0.getTime() + 1000).toISOString(),
      command: 'sync',
    })
    lock.release()
  })

  it('SL-04: 5 分钟边界——超一秒即接管（pid 仍活），差一秒仍判占用', () => {
    const dir = project()
    foreignLock(dir, {
      pid: 5001,
      startedAt: new Date(T0.getTime() - (SYNC_LOCK_STALE_MS + 1)).toISOString(),
      command: 'sync',
    })
    const stale = held(tryAcquireSyncLock(dir, 'sync', { ...at(0), ...pid(1), ...ALWAYS_ALIVE }))
    expect(stale.tookOver).not.toBeNull()
    stale.release()

    foreignLock(dir, {
      pid: 5001,
      startedAt: new Date(T0.getTime() - (SYNC_LOCK_STALE_MS - 1000)).toISOString(),
      command: 'sync',
    })
    const fresh = busy(tryAcquireSyncLock(dir, 'sync', { ...at(0), ...pid(1), ...ALWAYS_ALIVE }))
    expect(fresh.reason).toBe('held')
    expect(fresh.ageMs).toBe(SYNC_LOCK_STALE_MS - 1000)
  })

  it('SL-05: 内容读不懂时改看磁盘时间——新鲜按占用处理，陈旧才接管', () => {
    const dir = project()
    foreignLock(dir, 'not json at all')
    const nowReal = { now: () => new Date() }
    const acq = busy(tryAcquireSyncLock(dir, 'sync', nowReal))
    expect(acq.reason).toBe('unreadable')
    expect(acq.holder).toBeNull()
    expect(acq.ageMs).toBeLessThan(5000)

    // 半截 JSON（前任写到一半被 kill）同属读不懂
    foreignLock(dir, '{"pid":1,"started')
    expect(busy(tryAcquireSyncLock(dir, 'sync', nowReal)).reason).toBe('unreadable')

    // 形状对但字段坏（pid 非正整数）也归读不懂：一个坏文件最多挡 5 分钟，不是永久锁死
    foreignLock(dir, { pid: 0, startedAt: T0.toISOString(), command: 'sync' })
    expect(busy(tryAcquireSyncLock(dir, 'sync', nowReal)).reason).toBe('unreadable')

    ageTheFile(dir, SYNC_LOCK_STALE_MS + 5000)
    const lock = held(tryAcquireSyncLock(dir, 'sync', { ...nowReal, ...pid(9) }))
    expect(lock.tookOver).toBeNull() // 前任读不出身份，接管时无从记录
    lock.release()
  })

  it('SL-06: .openvibe 目录不存在时自动建（首次注入就并发是常态）', () => {
    const dir = project()
    expect(exists(join(dir, '.openvibe'))).toBe(false)
    const lock = held(tryAcquireSyncLock(dir, 'sync', at(0)))
    expect(exists(lock.path)).toBe(true)
    lock.release()
  })

  it('SL-07: release 只删自己的锁——被接管后前任 release 不得伤及新锁', () => {
    const dir = project()
    const first = held(tryAcquireSyncLock(dir, 'sync', { ...at(0), ...pid(11), ...ALWAYS_ALIVE }))
    const second = held(
      tryAcquireSyncLock(dir, 'sync', {
        ...at(SYNC_LOCK_STALE_MS + 1),
        ...pid(22),
        ...ALWAYS_ALIVE,
      }),
    )
    expect(second.tookOver).toEqual({ pid: 11, startedAt: T0.toISOString(), command: 'sync' })

    first.release()
    expect(readHolder(dir)).toEqual(second.holder)
    second.release()
    expect(exists(lockPathOf(dir))).toBe(false)
  })

  it('SL-08: 缺省活性判定走真系统调用——本进程 pid 判活，PID 尽头判死', () => {
    const dir = project()
    foreignLock(dir, { pid: process.pid, startedAt: T0.toISOString(), command: 'sync' })
    expect(busy(tryAcquireSyncLock(dir, 'sync', at(1000))).reason).toBe('held')

    rmSync(lockPathOf(dir))
    foreignLock(dir, { pid: 4_000_000_000, startedAt: T0.toISOString(), command: 'sync' })
    const lock = held(tryAcquireSyncLock(dir, 'sync', at(1000)))
    expect(lock.tookOver?.pid).toBe(4_000_000_000)
    lock.release()
  })

  it.skipIf(IS_WINDOWS)('SL-09: 锁文件权限 0600（win32 无 POSIX 权限位）', () => {
    const dir = project()
    const lock = held(tryAcquireSyncLock(dir, 'sync', at(0)))
    expect(statSync(lock.path).mode & 0o777).toBe(0o600)
    lock.release()

    // 接管路径：unlink 后仍是 wx 新建，权限同样收得住
    foreignLock(dir, { pid: DEAD_PID, startedAt: T0.toISOString(), command: 'sync' })
    chmodSync(lockPathOf(dir), 0o644)
    const taken = held(tryAcquireSyncLock(dir, 'sync', { ...at(1000), ...alive(() => false) }))
    expect(statSync(taken.path).mode & 0o777).toBe(0o600)
    taken.release()
  })

  it('SL-10: 锁路径与 pack.lock.json / backup 互不占用', () => {
    expect(SYNC_LOCK_REL).toBe(join('.openvibe', 'sync.lock'))
    expect(SYNC_LOCK_REL).not.toBe(PACK_LOCK_REL)
    expect(SYNC_LOCK_REL).not.toContain(PACK_BACKUP_REL)
  })

  it('SL-11: 判陈旧后被第三方抢先清场 → 照样抢到，且不误记 tookOver', () => {
    const dir = project()
    foreignLock(dir, { pid: DEAD_PID, startedAt: T0.toISOString(), command: 'sync' })
    rmSync(lockPathOf(dir))
    const lock = held(tryAcquireSyncLock(dir, 'sync', { ...at(1000), ...pid(3) }))
    expect(lock.tookOver).toBeNull()
    expect(readHolder(dir).pid).toBe(3)
    lock.release()
  })

  it('SL-12: 锁根本建不出来（.openvibe 被占成文件）→ reason unavailable 而非谎报「有人在跑」', () => {
    const dir = project()
    writeFileSync(join(dir, '.openvibe'), 'not a dir')
    const acq = busy(tryAcquireSyncLock(dir, 'sync', at(0)))
    expect(acq.reason).toBe('unavailable')
    expect(acq.holder).toBeNull()
    expect(String(acq.detail)).toContain('EEXIST')
  })
})
