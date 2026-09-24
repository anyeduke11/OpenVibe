import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, unlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { confirm, isCancel } from '@clack/prompts'
import {
  PACK_LOCK_REL,
  SYNC_LOCK_STALE_MS,
  parsePackLock,
  planRetirement,
  resolveWriteTarget,
  tryAcquireSyncLock,
  type RetirementFile,
  type RetirementPlan,
  type RetirementState,
  type SyncLockAcquire,
  type SyncLockHandle,
} from '@openvibe/core'
import { compareCodeUnit, type PackLock } from '@openvibe/shared'
import { releaseLockOnSignal, uniqueBackupRoot, utcStamp } from './sync'

/**
 * `openvibe clean <projectPath>` —— 受管文件退场（m6b FR-6）。
 * sync 的反向半边：唯一输入是 pack.lock.json，而 lock 可被手改，所以这里的破坏面比 sync 更大。
 * 三道闸缺一不可——managed===true 才是删除凭据（FR-6.3）、删除前一律备份（FR-6.4）、
 * 路径净化失败即整包拒绝且合法条目也不删（FR-6.6，防「半退场」这种最难查的状态）。
 */

export class CleanError extends Error {
  readonly code: string
  readonly details?: unknown
  constructor(code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'CleanError'
    this.code = code
    if (details !== undefined) this.details = details
  }
}

export interface CleanOptions {
  projectPath: string
  dryRun?: boolean
  yes?: boolean
  force?: boolean
}

export interface CleanDeps {
  isTTY?: boolean
  /** 一次批量确认（不是逐文件）：默认动作就是删，问一次足够 */
  confirm?: (plan: RetirementPlan) => Promise<boolean>
  now?: () => Date
}

export interface CleanReportRow {
  path: string
  state: RetirementState
  action: 'delete' | 'keep' | 'none'
  backupPath?: string
}

export interface CleanSummary {
  inSyncRemoved: number
  driftKept: number
  driftForced: number
  absent: number
  foreign: number
  backedUpTo: string | null
  cleaned: boolean
}

export interface CleanOutcome {
  projectPath: string
  lockPath: string
  pack: PackLock['pack']
  dryRun: boolean
  report: CleanReportRow[]
  summary: CleanSummary
  warnings: string[]
  hints: string[]
  exitCode: 0 | 2
}

function assertProjectDir(p: string): string {
  const abs = resolve(p)
  if (!existsSync(abs) || !statSync(abs).isDirectory()) {
    throw new CleanError('NOT_A_DIRECTORY', `项目路径不是目录：${abs}`)
  }
  return abs
}

/** 读取失败必须抛：把它当成「文件不存在」= 当成 ABSENT，就会漏掉 lock 里的一次真实存在 */
function diskReader(projectPath: string): (relPath: string) => string | null {
  return (relPath) => {
    const abs = resolveWriteTarget(projectPath, relPath)
    if (abs === null) {
      throw new CleanError('PATH_ESCAPE', `${relPath} 解析后不在项目内，拒绝作为基准`, {
        escapingPaths: [relPath],
      })
    }
    try {
      return readFileSync(abs, 'utf8')
    } catch (e) {
      const err = e as NodeJS.ErrnoException
      if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return null
      throw new CleanError('READ_FAILED', `读取 ${abs} 失败：${err.message}`)
    }
  }
}

/** FR-6.6：净化失败整包拒绝，且聚合形状与 sync 的 VALIDATION_ERROR 同构（index.ts 的 violationLines 直接复用） */
function sanitizeLockEntries(projectPath: string, lock: PackLock): void {
  const invalidPaths: string[] = []
  const escapingPaths: string[] = []
  for (const entry of lock.files) {
    const abs = resolveWriteTarget(projectPath, entry.path)
    if (abs === null) escapingPaths.push(entry.path)
    else if (!existsSync(abs) && !isPlainRelative(entry.path)) invalidPaths.push(entry.path)
  }
  if (invalidPaths.length > 0 || escapingPaths.length > 0) {
    throw new CleanError(
      'VALIDATION_ERROR',
      `pack.lock.json 有 ${invalidPaths.length + escapingPaths.length} 条路径未通过净化，整包拒绝退场（其余条目同样不删）`,
      {
        invalidPaths: invalidPaths.sort(compareCodeUnit),
        escapingPaths: escapingPaths.sort(compareCodeUnit),
      },
    )
  }
}

function isPlainRelative(relPath: string): boolean {
  return !relPath.startsWith('/') && !relPath.startsWith('\\') && !relPath.includes('..')
}

type LockBusy = Extract<SyncLockAcquire, { acquired: false }>

/** 让路文案承 §6.9：说清谁在写、写了多久、下一步做什么 */
function busyMessage(path: string, lock: LockBusy): string {
  const seconds = Math.round(lock.ageMs / 1000)
  if (lock.reason === 'unavailable') {
    return `无法建立退场锁 ${path}（${lock.detail ?? '未知错误'}）：.openvibe 不可写或不是目录，先修目录再退场`
  }
  const who = lock.holder
    ? `pid ${String(lock.holder.pid)}（${lock.holder.command}，起于 ${lock.holder.startedAt}）`
    : '一把内容读不懂的残留锁'
  return `另一个写盘命令正在占用这个项目：${who}，已 ${String(seconds)}s。等它结束后重跑 clean 即可`
}

export const confirmWithClack = async (plan: RetirementPlan): Promise<boolean> => {
  const answer = await confirm({
    message: `将删除 ${String(plan.counts.IN_SYNC)} 个受管文件（先备份到 .openvibe/backup/），保留 ${String(
      plan.counts.DRIFT,
    )} 个已改动的文件`,
    initialValue: false,
  })
  return !isCancel(answer) && answer === true
}

export async function cleanAction(
  options: CleanOptions,
  deps: CleanDeps = {},
): Promise<CleanOutcome> {
  const projectPath = assertProjectDir(options.projectPath)
  const lockPath = join(projectPath, PACK_LOCK_REL)
  let text: string
  try {
    text = readFileSync(lockPath, 'utf8')
  } catch {
    throw new CleanError('NO_LOCK', `${lockPath} 不存在：该项目未注入过标准包，无需退场。`)
  }
  const lock = parsePackLock(text)
  if (!lock) {
    throw new CleanError(
      'LOCK_INVALID',
      `${lockPath} 无法解析或含非法文件路径：被改过的 lock 不能当删除依据。` +
        '删掉它即承认这些文件归你所有（本命令不会替你删）',
    )
  }
  sanitizeLockEntries(projectPath, lock)

  const plan = planRetirement({
    lock,
    readDisk: diskReader(projectPath),
    ...(options.force === true ? { force: true } : {}),
  })
  const dryRun = options.dryRun === true
  const warnings: string[] = []
  const hints: string[] = []

  const base = (rows: CleanReportRow[], summary: CleanSummary): CleanOutcome => ({
    projectPath,
    lockPath,
    pack: lock.pack,
    dryRun,
    report: rows,
    summary,
    warnings,
    hints,
    exitCode: summary.driftKept > 0 ? 2 : 0,
  })

  const rowsOf = (files: RetirementFile[], backup: Map<string, string>): CleanReportRow[] =>
    files.map((f) => ({
      path: f.path,
      state: f.state,
      action: f.action,
      ...(backup.has(f.path) ? { backupPath: backup.get(f.path) } : {}),
    }))

  const tally = (
    removed: number,
    forced: number,
    kept: number,
    backedUpTo: string | null,
    cleaned: boolean,
  ): CleanSummary => ({
    inSyncRemoved: removed,
    driftKept: kept,
    driftForced: forced,
    absent: plan.counts.ABSENT,
    foreign: plan.counts.FOREIGN,
    backedUpTo,
    cleaned,
  })

  if (dryRun) {
    hints.push('dry-run：以上为计划，零写入零删除（不建 .openvibe/、不抢锁）')
    if (plan.removals.length > 0)
      warnings.push(
        `dry-run：${String(plan.removals.length)} 项将被删除，正式执行需 --yes 或交互确认`,
      )
    return base(rowsOf(plan.files, new Map()), tally(0, 0, plan.counts.DRIFT, null, false))
  }

  if (plan.removals.length > 0 && options.yes !== true) {
    if (deps.isTTY !== true) {
      throw new CleanError(
        'NEED_TTY',
        `${String(plan.removals.length)} 个文件需要删除确认，但当前不是交互终端：加 --yes（仅确认默认动作）` +
          `；要连已改动的 ${String(plan.counts.DRIFT)} 个一起删还得加 --force`,
        { removals: [...plan.removals].sort(compareCodeUnit) },
      )
    }
    const granted = await (deps.confirm ?? confirmWithClack)(plan)
    if (!granted) {
      hints.push('已取消：未删除任何文件，lock 原样保留')
      return base(rowsOf(plan.files, new Map()), tally(0, 0, plan.counts.DRIFT, null, false))
    }
  }

  let handle: SyncLockHandle | null = null
  if (plan.removals.length > 0) {
    const acquired = tryAcquireSyncLock(projectPath, 'clean')
    if (!acquired.acquired) throw new CleanError('SYNC_BUSY', busyMessage(acquired.path, acquired))
    handle = acquired
    if (acquired.tookOver !== null) {
      const prev = acquired.tookOver
      hints.push(
        `接管了残留写盘锁（pid ${String(prev.pid)}，${prev.command}，起于 ${prev.startedAt}）` +
          `：该进程已不存在或超过 ${String(Math.round(SYNC_LOCK_STALE_MS / 1000))}s 未更新`,
      )
    }
  }
  const stopSignalHandlers = handle ? releaseLockOnSignal(handle) : null

  try {
    const now = (deps.now ?? (() => new Date()))()
    const backup = new Map<string, string>()
    let backupRoot: string | null = null
    const removedPaths = new Set<string>()

    for (const relPath of plan.removals) {
      const abs = resolveWriteTarget(projectPath, relPath)
      if (abs === null || !existsSync(abs)) continue // 规划后被别人删了：按 ABSENT 处理
      if (backupRoot === null) {
        backupRoot = uniqueBackupRoot(projectPath, utcStamp(now))
        mkdirSync(backupRoot, { recursive: true })
      }
      const backupPath = join(backupRoot, relPath)
      try {
        mkdirSync(dirname(backupPath), { recursive: true })
        copyFileSync(abs, backupPath)
        unlinkSync(abs)
      } catch (e) {
        throw new CleanError(
          'DELETE_FAILED',
          `退场 ${abs} 失败：${(e as Error).message}。已完成 ${String(removedPaths.size)}/${String(
            plan.removals.length,
          )} 项` + (backupRoot ? `；已删文件在 ${backupRoot} 有逐字节副本，可逐个复制回去` : ''),
          { done: [...removedPaths] },
        )
      }
      backup.set(relPath, backupPath)
      removedPaths.add(relPath)
    }

    // lock 只在「注入已不残留在盘上」时删除：还留着 DRIFT 就仍描述活文件，删了下次 sync 会误判
    const driftKept = plan.files.filter((f) => f.state === 'DRIFT' && f.action === 'keep').length
    const nothingLeftManaged = removedPaths.size > 0 || plan.counts.ABSENT === lock.files.length
    let cleaned = driftKept === 0 && nothingLeftManaged
    if (cleaned) {
      try {
        unlinkSync(lockPath)
      } catch (e) {
        cleaned = false
        warnings.push(
          `pack.lock.json 删除失败（${(e as Error).message}）：受管文件已退场，请手工删除该登记文件`,
        )
      }
    }

    hints.push('确认无误后可手工删除 .openvibe/（本命令不动它，备份目录是你唯一的回退凭据）')
    hints.push('未改动 .gitignore：建议自行把 .openvibe/backup/ 加入忽略清单')

    const driftForced = plan.files.filter(
      (f) => f.state === 'DRIFT' && f.action === 'delete',
    ).length
    return base(
      rowsOf(plan.files, backup),
      tally(
        plan.files.filter((f) => f.state === 'IN_SYNC' && removedPaths.has(f.path)).length,
        driftForced,
        driftKept,
        backupRoot,
        cleaned,
      ),
    )
  } finally {
    if (stopSignalHandlers) stopSignalHandlers()
    if (handle) handle.release()
  }
}
