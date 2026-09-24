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
 *
 * 本文件不重写 core 的路径规则（m6 v1.4 ②③，薄客户端）：CLI 侧只留 `resolveWriteTarget` 的
 * 逐条逃逸检查（schema 看不见符号链接）。「宽松读 `files[].path` → 报违规项 → 再 `parsePackLock`」
 * 这道**先于** schema 的闸归 core，是 Task 4 的交付，别在这里再造第二份。
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

/**
 * 计数口径：一律**按 lock 条目数**计，不按去重后的路径数。
 * `planRetirement` 的 removals 不去重（去重不是 core 那层的活），所以同一 path 登记两次就报两次；
 * `removedPaths` 用 Set 只影响「实际 unlink 了几次」，不影响这五个逐条目计数
 * （`inSyncRemoved` / `driftKept` / `driftForced` / `absent` / `foreign`）。
 * 不进这个口径的是 `backedUpTo`（备份目录里是去重后的真实文件数，见 CLI-CLEAN-06f）
 * 与 `cleaned`（收尾判定，不是计数）。
 * 这是口径而非缺陷——Task 5 的 `--json` 测试要钉住它，别在这一轮偷偷改成按去重计。
 */
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
  /**
   * FR-6.9 v1.4：0 全清 / 2 「没退干净」= 有被保留的 DRIFT **或** 用户在确认里答了「不」。
   * 错误（含 NEED_TTY）一律走 CleanError ⇒ index.ts 的 1，不在这个枚举里。
   * dry-run 与真跑同语义（I-4）：是否写盘不改变退出码，CI 才能用同一套判定读计划输出。
   */
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

/**
 * FR-6.6 里 CLI 侧剩下的那半条闸：逐条 `resolveWriteTarget` 抓**符号链接逃逸**——
 * `PackLockSchema` 的 `packPathSchema` 只看语法，看不见磁盘上的链接，所以这条是活代码。
 * 曾经的 `isPlainRelative` / `invalidPaths` 分支已删（T3 审查 I-2）：它重写了一遍
 * `isValidPackRelativePath`，而 schema 会先把那种 lock 判成 `LOCK_INVALID` ⇒ 分支永不可达，
 * 还误导后来人以为它是闸。「净化先于 schema」那道真闸（宽松读 → 报违规项 → 再 parse）
 * 归 core、由 Task 4 交付；这里不预留第二道防线式的死码。
 */
function rejectEscapingLockEntries(projectPath: string, lock: PackLock): void {
  const escapingPaths: string[] = []
  for (const entry of lock.files) {
    if (resolveWriteTarget(projectPath, entry.path) === null) escapingPaths.push(entry.path)
  }
  if (escapingPaths.length > 0) {
    throw new CleanError(
      'VALIDATION_ERROR',
      `pack.lock.json 有 ${String(escapingPaths.length)} 条路径解析后越出项目目录，整包拒绝退场（其余条目同样不删）`,
      { escapingPaths: escapingPaths.sort(compareCodeUnit) },
    )
  }
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

/**
 * 一次批量确认。措辞按 **action** 给而不是按 `plan.counts.DRIFT`（T3 修复轮 2）：
 * counts.DRIFT 是「状态」计数，--force 下这批 DRIFT 正是要删的，照字面说「保留 N 个已改动的文件」
 * 就是当着用户的面承诺一件马上不做的事。没有可保留项时不提保留，删除数直接取 removals。
 */
export const confirmWithClack = async (plan: RetirementPlan): Promise<boolean> => {
  const kept = plan.files.filter((f) => f.state === 'DRIFT' && f.action === 'keep').length
  const forced = plan.files.filter((f) => f.state === 'DRIFT' && f.action === 'delete').length
  const answer = await confirm({
    message:
      `将删除 ${String(plan.removals.length)} 个受管文件（先备份到 .openvibe/backup/）` +
      (kept > 0 ? `，保留 ${String(kept)} 个已改动的文件` : '') +
      (forced > 0 ? `，其中 ${String(forced)} 个是已改动的文件（--force）` : ''),
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
  rejectEscapingLockEntries(projectPath, lock)

  const plan = planRetirement({
    lock,
    readDisk: diskReader(projectPath),
    ...(options.force === true ? { force: true } : {}),
  })
  const dryRun = options.dryRun === true
  const warnings: string[] = []
  const hints: string[] = []

  // 只从 plan 推导一次：dry-run、取消、真跑三条腿共用，退出码与计数才不会各自漂移（I-4）。
  // 注意用 action 而非 state 判 DRIFT——--force 下 DRIFT 是要删的，不该留在「没退干净」里。
  const driftKept = plan.files.filter((f) => f.state === 'DRIFT' && f.action === 'keep').length
  const driftForced = plan.files.filter((f) => f.state === 'DRIFT' && f.action === 'delete').length

  const base = (
    rows: CleanReportRow[],
    summary: CleanSummary,
    /** 默认按「有没有 DRIFT 残留」推导；只有交互取消那一支会显式给 2 */
    exitCode: 0 | 2 = summary.driftKept > 0 ? 2 : 0,
  ): CleanOutcome => ({
    projectPath,
    lockPath,
    pack: lock.pack,
    dryRun,
    report: rows,
    summary,
    warnings,
    hints,
    exitCode,
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
    return base(rowsOf(plan.files, new Map()), tally(0, 0, driftKept, null, false))
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
      // §7.10 e2 / FR-6.9 v1.4：答「不」与 Ctrl-C 同口径 ⇒ 2、cleaned=false、lock 原样、树未动。
      // 0 的口径是「全清」，一次什么都没做的执行报 0 是假信号；1 的枚举里全是错误，而主动拒绝不是错误。
      hints.push('已取消：未删除任何文件，lock 原样保留')
      return base(rowsOf(plan.files, new Map()), tally(0, 0, driftKept, null, false), 2)
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
      // 两种「这一条没法删」不是一回事，合并成一条 continue 就是 T3 审查 I-3 的 bug：
      //   abs === null ⇒ 路径被判违规（符号链接逃逸，规划后才发现的 TOCTOU 面）。FR-6.6 要求整包中止：
      //     带着半删的盘继续 = 制造「半退场」，且违规路径会静默参与收尾判定。
      //   !existsSync ⇒ 文件真的不在了（被别的进程删了，或 lock 把同一路径登记了两次而 unlink 只有一次）
      //     ⇒ 按 ABSENT 跳过，不中止——这是 lock 冗余而非安全违规。
      if (abs === null) {
        throw new CleanError(
          'PATH_ESCAPE',
          `${relPath} 解析后不在项目内：整包中止（已删 ${String(removedPaths.size)} 项，其余条目不再删）` +
            (backupRoot ? `；已删文件在 ${backupRoot} 有逐字节副本，可逐个复制回去` : ''),
          { escapingPaths: [relPath], done: [...removedPaths] },
        )
      }
      if (!existsSync(abs)) continue // 见上：真不存在 = ABSENT，不是违规
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

    // lock 的去留判据是 **driftKept === 0**，不是「本次 unlink 了几个」（FR-6.5 v1.4 / T3 审查 I-1）。
    // 只要没有被我方保留下来的 DRIFT，lock 描述的注入就已不成立 ⇒ 照删 lock、cleaned=true、退出码 0，
    // 包括「全部登记项已 ABSENT（用户自己删过）」与「全部 FOREIGN（managed!==true）」这两种一个盘都没动的情况：
    // 判据若写成「删过东西」，用户手工删光注入文件后 clean 会永久停在「保留 lock」，
    // diff 长报全量缺失且没有任何命令能收尾，还与 §6.3 ABSENT 行「计入已自行退场」自相矛盾。
    // 反过来 lock 只在 driftKept > 0（它仍描述活着的受管文件）与 §6.9 各早退路径下保留。
    let cleaned = driftKept === 0
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
