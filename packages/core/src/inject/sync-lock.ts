// packages/core/src/inject/sync-lock.ts —— 同一项目上并发 sync 的互斥锁（T8e，m6b §6.9 / design §11.3）。
//
// sync 是本机唯一有破坏性的写命令（覆盖前备份、改 pack.lock.json），两个并发执行会互相踩：
// 后者把前者刚写一半的文件判成 DRIFT/CONFLICT，备份目录还会撞出两个时间戳。这里只做一件事——
// 用 O_EXCL 的原子新建把「谁在写这个项目」登记到磁盘上，供后来者让路。
// 不做的事：不防 SIGKILL（残留锁由陈旧判定接管）、不做跨机锁（项目目录本就在单机）。
import { chmodSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** 锁文件相对项目根；与 pack.lock.json（登记）和 backup/（备份）同居 .openvibe/ 但互不占用 */
export const SYNC_LOCK_REL = join('.openvibe', 'sync.lock')

/**
 * 陈旧窗口：超过这个时长且 pid 仍在，说明持锁者卡死而非崩溃（崩溃时 pid 判死会立刻接管）。
 * 取 5 分钟是「交互确认可以慢慢想，但一个卡住的 sync 不该锁死项目到下次开机」。
 */
export const SYNC_LOCK_STALE_MS = 5 * 60_000

export interface SyncLockHolder {
  pid: number
  startedAt: string
  command: string
}

export interface SyncLockDeps {
  now?: () => Date
  /** 注入以便单测伪造持有者；缺省取当前进程 */
  pid?: () => number
  /** 缺省用 `process.kill(pid, 0)` 探活 */
  isAlive?: (pid: number) => boolean
}

export interface SyncLockHandle {
  readonly path: string
  readonly holder: SyncLockHolder
  /** 接管自谁（陈旧锁的旧持有者）；无残留或旧内容读不懂时为 null */
  readonly tookOver: SyncLockHolder | null
  /** 幂等；只删自己那一把（内容与 holder 逐字段相等），因此接管发生后前任的 release 伤不到新锁 */
  release(): void
}

/**
 * `held` 磁盘上确有一把锁（或内容读不懂但还在窗口内）；`unreadable` 内容不是合法 holder，
 * 只能按 mtime 判，保守视为有人在写；`unavailable` 锁根本建不出来（.openvibe 被占成文件、
 * 只读挂载、权限不足）——这时谎报「另一个 sync 在跑」会把用户引向错误的处置，故单列并带 detail。
 */
export type SyncLockBusyReason = 'held' | 'unreadable' | 'unavailable'

export type SyncLockAcquire =
  | ({ acquired: true } & SyncLockHandle)
  | {
      acquired: false
      path: string
      reason: SyncLockBusyReason
      holder: SyncLockHolder | null
      /** 该锁已存在多久（holder 里的 startedAt 起算；内容读不懂时用文件 mtime） */
      ageMs: number
      detail?: string
      tookOver: null
    }

function defaultIsAlive(target: number): boolean {
  if (!Number.isInteger(target) || target <= 0) return false
  try {
    process.kill(target, 0)
    return true
  } catch (e) {
    // EPERM 是「进程在，只是不归我管」；ESRCH/EINVAL 才是没了
    return (e as NodeJS.ErrnoException).code === 'EPERM'
  }
}

function parseHolder(text: string): SyncLockHolder | null {
  try {
    const raw = JSON.parse(text) as Partial<Record<keyof SyncLockHolder, unknown>>
    const { pid, startedAt, command } = raw ?? {}
    if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) return null
    if (typeof startedAt !== 'string' || Number.isNaN(Date.parse(startedAt))) return null
    if (typeof command !== 'string') return null
    return { pid, startedAt, command }
  } catch {
    return null
  }
}

interface Verdict {
  state: 'absent' | 'held' | 'stale'
  holder: SyncLockHolder | null
  ageMs: number
  reason: SyncLockBusyReason
}

/** 看磁盘上那把锁：不存在 / 别人正持着 / 已陈旧可接管 */
function inspect(
  path: string,
  now: () => Date,
  isAlive: (pid: number) => boolean,
): Verdict {
  let text: string
  let mtimeMs: number
  try {
    text = readFileSync(path, 'utf8')
    mtimeMs = statSync(path).mtimeMs
  } catch {
    // ENOENT 与 ENOTDIR（.openvibe 是个文件）都算「此处无锁」，真正的失败留给新建那一步报
    return { state: 'absent', holder: null, ageMs: 0, reason: 'held' }
  }
  const holder = parseHolder(text)
  const age = (fromMs: number): number => Math.max(0, now().getTime() - fromMs)
  if (holder === null) {
    const ageMs = age(mtimeMs)
    return {
      state: ageMs > SYNC_LOCK_STALE_MS ? 'stale' : 'held',
      holder: null,
      ageMs,
      reason: 'unreadable',
    }
  }
  const ageMs = age(Date.parse(holder.startedAt))
  if (!isAlive(holder.pid)) return { state: 'stale', holder, ageMs, reason: 'held' }
  return {
    state: ageMs > SYNC_LOCK_STALE_MS ? 'stale' : 'held',
    holder,
    ageMs,
    reason: 'held',
  }
}

function ownerRelease(path: string, holder: SyncLockHolder): () => void {
  let done = false
  return () => {
    if (done) return
    done = true
    let current: SyncLockHolder | null = null
    try {
      current = parseHolder(readFileSync(path, 'utf8'))
    } catch {
      return
    }
    if (current === null) return
    if (current.pid !== holder.pid || current.startedAt !== holder.startedAt) return
    try {
      unlinkSync(path)
    } catch {
      // 已被他人清走，正是我们想要的结果
    }
  }
}

function create(path: string, holder: SyncLockHolder): { ok: true } | { ok: false; code: string } {
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, `${JSON.stringify(holder)}\n`, { flag: 'wx', mode: 0o600 })
    // 与 config.json 同一坑：umask 会吃掉 mode 的位，显式 chmod 才收得住 0600
    chmodSync(path, 0o600)
    return { ok: true }
  } catch (e) {
    return { ok: false, code: (e as NodeJS.ErrnoException).code ?? 'UNKNOWN' }
  }
}

/**
 * 非阻塞抢占：抢到返回带 `release()` 的句柄，抢不到返回让路信息（绝不排队等待）。
 * sync 的失败成本低（重跑一次即可），让它等一个可能正在等人类回答提示词的锁才是坏交易。
 */
export function tryAcquireSyncLock(
  projectPath: string,
  command: string,
  deps: SyncLockDeps = {},
): SyncLockAcquire {
  const now = deps.now ?? ((): Date => new Date())
  const isAlive = deps.isAlive ?? defaultIsAlive
  const path = join(projectPath, SYNC_LOCK_REL)
  const holder: SyncLockHolder = {
    pid: deps.pid?.() ?? process.pid,
    startedAt: now().toISOString(),
    command,
  }

  const first = inspect(path, now, isAlive)
  if (first.state === 'held') {
    return {
      acquired: false,
      path,
      reason: first.reason,
      holder: first.holder,
      ageMs: first.ageMs,
      tookOver: null,
    }
  }
  if (first.state === 'stale') {
    try {
      unlinkSync(path)
    } catch {
      /* 已被他人清走 */
    }
  }

  const created = create(path, holder)
  if (created.ok) {
    return {
      acquired: true,
      path,
      holder,
      tookOver: first.state === 'stale' ? first.holder : null,
      release: ownerRelease(path, holder),
    }
  }

  // 抢输（并发了另一个 sync）或根本建不出来：重看一次磁盘，按实况定性
  const again = inspect(path, now, isAlive)
  if (again.state !== 'absent') {
    return {
      acquired: false,
      path,
      reason: again.reason,
      holder: again.holder,
      ageMs: again.ageMs,
      tookOver: null,
    }
  }
  return {
    acquired: false,
    path,
    reason: 'unavailable',
    holder: null,
    ageMs: 0,
    detail: created.code,
    tookOver: null,
  }
}
