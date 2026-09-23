import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { isCancel, select } from '@clack/prompts'
import { ADAPTER_MAIN_PATH } from '@openvibe/adapters'
import {
  PACK_BACKUP_REL,
  PACK_LOCK_REL,
  applyDecisions,
  buildPackLock,
  checkPackInjectable,
  packLockJson,
  parsePackLock,
  planInjection,
  resolveWriteTarget,
  strategyToDecisions,
  SYNC_LOCK_STALE_MS,
  tryAcquireSyncLock,
  type InjectDecision,
  type InjectPlan,
  type InjectPlanFile,
  type InjectStatus,
  type SyncLockAcquire,
  type SyncLockHandle,
} from '@openvibe/core'
import {
  PACK_FILE_CHECKLIST,
  PACK_FILE_SKILLS,
  PACK_FILE_TERMS,
  compareCodeUnit,
  type AdapterId,
  type PackLock,
} from '@openvibe/shared'
import { ServerUnreachable, type ApiClient } from '../client'
import {
  SourceError,
  assertSourceExclusive,
  findRegisteredPack,
  loadBundleJson,
  loadPackDir,
  loadPackFromServer,
  targetPathsFor,
  type LoadedPack,
} from '../pack-source'
import { ExitCode, type PlanItem } from '../output'

/**
 * `openvibe sync <projectPath>` —— 注入状态机（m6b FR-2）。
 * 三重保护按 §1 落在这里：dry-run 结构性零写入（只规划不落盘）、覆盖前强制备份、
 * 破坏性动作要么交互确认要么 --yes 显式授权（非 TTY 且无 --yes 直接拒执行）。
 */

const AUX_PRODUCT_PATHS = new Set([PACK_FILE_TERMS, PACK_FILE_CHECKLIST, PACK_FILE_SKILLS])

export class SyncError extends Error {
  readonly code: string
  readonly details?: unknown
  constructor(code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'SyncError'
    this.code = code
    if (details !== undefined) this.details = details
  }
}

export interface SyncOptions {
  projectPath: string
  pack?: string
  file?: string
  dir?: string
  dryRun?: boolean
  yes?: boolean
  strategy?: InjectDecision
  targets?: AdapterId[]
}

/** 交互询问：CONFLICT 给两项、DRIFT 给三项（core 的 options 已按状态裁好） */
export type AskFn = (file: InjectPlanFile) => Promise<InjectDecision>

export interface SyncDeps {
  client?: ApiClient
  isTTY?: boolean
  ask?: AskFn
  now?: () => Date
  /** 遥测出口（telemetry.ts 注入；syncAction 只在注入成功后调一次） */
  onInjected?: (pack: { name: string; version: string }) => Promise<void>
}

export interface SyncWriteReport {
  path: string
  status: InjectStatus
  backupPath: string | null
}

export interface SyncSkipReport {
  path: string
  status: InjectStatus
  why: string
}

export interface SyncOutcome {
  projectPath: string
  pack: { id: string; name: string; version: string; fingerprint: string; origin: string }
  dryRun: boolean
  counts: Record<InjectStatus, number>
  writes: SyncWriteReport[]
  skipped: SyncSkipReport[]
  plan: InjectPlan
  /** 渲染用的计划行（与 --json 的 plan 数组同一份数据，状态/路径/动作/体积） */
  rows: PlanItem[]
  lockPath: string | null
  backupRoot: string | null
  injectionReported: boolean
  warnings: string[]
  hints: string[]
  exitCode: 0 | 1 | 2
}

function readText(path: string): string | null {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

/** 磁盘读取器：不存在 → null；m6b §6.5 的读取失败按抛错处理（不静默当成可覆盖的新文件） */
function diskReader(projectPath: string): (relPath: string) => string | null {
  return (relPath) => {
    const abs = resolveWriteTarget(projectPath, relPath)
    if (abs === null || !existsSync(abs)) return null
    if (!statSync(abs).isFile()) {
      throw new SyncError('NOT_A_FILE', `磁盘上的 ${relPath} 不是普通文件，拒绝写入`)
    }
    const text = readText(abs)
    if (text === null) throw new SyncError('READ_FAILED', `读取 ${abs} 失败，中止注入`)
    return text
  }
}

export function utcStamp(now: Date): string {
  return now
    .toISOString()
    .replace(/[:]/g, '-')
    .replace(/\.\d{3}Z$/, 'Z')
}

/** §6.4：同戳备份目录已存在则追加 -1、-2，绝不覆盖既有备份 */
export function uniqueBackupRoot(projectPath: string, stamp: string): string {
  const base = join(projectPath, PACK_BACKUP_REL, stamp)
  if (!existsSync(base)) return base
  for (let i = 1; i < 1000; i++) {
    const candidate = `${base}-${i}`
    if (!existsSync(candidate)) return candidate
  }
  throw new SyncError('BACKUP_EXHAUSTED', `备份目录 ${base}-n 冲突过多`)
}

function assertProjectDir(projectPath: string): string {
  const abs = resolve(projectPath)
  if (!existsSync(abs) || !statSync(abs).isDirectory()) {
    throw new SyncError('NOT_A_DIRECTORY', `项目路径不是目录：${abs}（先 mkdir 或检查拼写）`)
  }
  return abs
}

function resolveTargets(
  pack: LoadedPack,
  targets: AdapterId[] | undefined,
  warnings: string[],
): readonly string[] | null {
  if (!targets || targets.length === 0) return null
  const adapterPaths = new Set<string>(targets.map((id) => ADAPTER_MAIN_PATH[id]))
  const selected = targetPathsFor(
    pack.files.map((f) => f.path),
    adapterPaths,
    AUX_PRODUCT_PATHS,
  )
  // 只挑主规则文件不够——术语表/检查清单/skill 也是包产物，否则 --target 会退化成单文件写入
  const inPack = new Set(pack.files.map((f) => f.path))
  for (const id of targets) {
    if (!inPack.has(ADAPTER_MAIN_PATH[id])) {
      warnings.push(`包内没有 ${id} 的产物（${ADAPTER_MAIN_PATH[id]}），本次不会写入该平台文件`)
    }
  }
  return selected
}

async function loadSource(
  options: SyncOptions,
  deps: SyncDeps,
  projectPath: string,
): Promise<LoadedPack> {
  assertSourceExclusive(options)
  if (options.file !== undefined) {
    const text = readText(resolve(options.file))
    if (text === null) throw new SourceError('SOURCE_READ', `读不到 bundle 文件：${options.file}`)
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch (e) {
      throw new SourceError('BAD_JSON', `bundle 不是合法 JSON：${(e as Error).message}`)
    }
    return loadBundleJson(raw, options.file)
  }
  if (options.dir !== undefined) return loadPackDir(resolve(options.dir))

  const client = deps.client
  if (!client) {
    throw new SyncError(
      'NO_SOURCE',
      '离线模式需要 --file 或 --dir；在线模式需要可用的令牌。' +
        '用法：openvibe sync <projectPath> [--pack name[@version] | --file bundle.json | --dir packDir]',
    )
  }
  if (options.pack) return loadPackFromServer(client, options.pack)
  // 缺省：取项目登记包（m6b FR-2.1）
  const registered = await findRegisteredPackRef(client, projectPath)
  return loadPackFromServer(
    client,
    registered.version ? `${registered.name}@${registered.version}` : registered.name,
  )
}

async function findRegisteredPackRef(
  client: ApiClient,
  projectPath: string,
): Promise<{ name: string; version: string | null }> {
  const registered = await findRegisteredPack(client, projectPath)
  if (!registered) {
    throw new SyncError(
      'NO_REGISTERED_PACK',
      `项目 ${projectPath} 未登记标准包，请显式给 --pack/--file/--dir，或在 Web /projects 工作台绑定标准包`,
    )
  }
  return { name: registered.name, version: registered.version }
}

/** 渲染用的计划行（--json 与人读表格同源，字段名对齐 m6b §5.1） */
export function planRows(plan: InjectPlan, pack: LoadedPack): PlanItem[] {
  const contentOf = new Map(pack.files.map((f) => [f.path, f.content]))
  return plan.files.map((file) => ({
    state: file.status,
    path: file.path,
    action: file.defaultAction,
    sizeBytes: Buffer.byteLength(contentOf.get(file.path) ?? '', 'utf8'),
    inScope: file.inScope,
  }))
}

type LockBusy = Extract<SyncLockAcquire, { acquired: false }>

/** 让路文案要能直接照着做：谁在写、写了多久、下一步等什么或删什么 */
function busyMessage(path: string, lock: LockBusy): string {
  const seconds = Math.round(lock.ageMs / 1000)
  if (lock.reason === 'unavailable') {
    return `无法建立注入锁 ${path}（${lock.detail ?? '未知错误'}）：.openvibe 不可写或不是目录，先修目录再注入`
  }
  const who = lock.holder
    ? `pid ${String(lock.holder.pid)}（${lock.holder.command}，起于 ${lock.holder.startedAt}）`
    : '一把内容读不懂的残留锁'
  return (
    `另一个 sync 正在写这个项目：${who}，已 ${String(seconds)}s。等它结束后重跑即可` +
    (lock.reason === 'unreadable'
      ? `；确认没有 sync 在跑时手工删除 ${path}（该文件超过 5 分钟未更新会被自动接管）`
      : `；若该进程已不存在，锁会在下次运行时被自动接管`)
  )
}

/**
 * SIGINT/SIGTERM 到达时先放锁再退出：Ctrl-C 之后重跑不必等 5 分钟陈旧窗口。
 * 装了监听就没有默认的按信号终止，退出码由我们给（m6b §5.2 只认 0/1/2，中断算 1）。
 */
function releaseLockOnSignal(lock: SyncLockHandle): () => void {
  const bound = (['SIGINT', 'SIGTERM'] as const).map((signal) => {
    const handler = (): void => {
      lock.release()
      process.exit(ExitCode.error)
    }
    process.on(signal, handler)
    return { signal, handler }
  })
  return () => {
    for (const { signal, handler } of bound) process.off(signal, handler)
  }
}

export async function syncAction(
  options: SyncOptions,
  deps: SyncDeps = {},
  warningsOut: string[] = [],
): Promise<SyncOutcome> {
  const projectPath = assertProjectDir(options.projectPath)
  const pack = await loadSource(options, deps, projectPath)
  const contents: Record<string, string | undefined> = Object.fromEntries(
    pack.files.map((f) => [f.path, f.content]),
  )

  // 整包安全防线：违规一律零写入（§6.1/§6.3，details 供逐条报告）
  const safety = checkPackInjectable(projectPath, pack.files)

  const lockPath = join(projectPath, PACK_LOCK_REL)
  const lockText = readText(lockPath)
  let oldLock: PackLock | null = null
  if (lockText !== null) {
    oldLock = parsePackLock(lockText)
    if (!oldLock) {
      warningsOut.push('pack.lock.json 无法解析，本次按未注入处理（覆盖前仍会备份原文件）')
    }
  }

  const targets = resolveTargets(pack, options.targets, warningsOut)
  const plan = planInjection({
    files: pack.files,
    readDisk: diskReader(projectPath),
    lock: oldLock,
    targets,
  })
  const dryRun = options.dryRun === true
  const decided = await decide(plan, options, deps, warningsOut, dryRun)
  const applied = applyDecisions(plan, contents, decided)

  const outcome: SyncOutcome = {
    projectPath,
    pack: {
      id: pack.manifest.pack.id,
      name: pack.manifest.pack.name,
      version: pack.manifest.pack.version,
      fingerprint: pack.fingerprint,
      origin: pack.origin,
    },
    dryRun,
    counts: plan.counts,
    writes: [],
    skipped: applied.skipped.map((s) => ({
      path: s.path,
      status: statusOf(plan, s.path),
      why: s.why,
    })),
    plan,
    rows: planRows(plan, pack),
    lockPath: null,
    backupRoot: null,
    injectionReported: false,
    warnings: warningsOut,
    hints: [],
    exitCode: 0,
  }

  if (dryRun) {
    outcome.writes = applied.writes.map((w) => ({
      path: w.path,
      status: statusOf(plan, w.path),
      backupPath: null,
    }))
    outcome.hints.push('dry-run：以上为默认决策下的计划，零写入零备份')
    return outcome
  }

  // 真会写盘了才抢锁（m6b §6.9）：抢不到就一个字节都不动，也不在拒绝执行前留下 .openvibe/。
  // 位置在 decide 之后是有意的——交互确认可以慢慢想，不该占着锁；5 分钟陈旧窗口只为崩溃残留兜底。
  const lock = tryAcquireSyncLock(projectPath, 'sync')
  if (!lock.acquired) throw new SyncError('SYNC_BUSY', busyMessage(lock.path, lock))
  if (lock.tookOver !== null) {
    // 接管不是静默行为：上一把锁的主人要么是崩了的进程，要么卡过了 5 分钟，用户该知道
    const prev = lock.tookOver
    outcome.hints.push(
      `接管了残留注入锁（pid ${String(prev.pid)}，${prev.command}，起于 ${prev.startedAt}）` +
        `：该进程已不存在或超过 ${String(Math.round(SYNC_LOCK_STALE_MS / 1000))}s 未更新`,
    )
  }
  const stopSignalHandlers = releaseLockOnSignal(lock)
  try {
    const now = (deps.now ?? (() => new Date()))()
    const written: string[] = []
    let backupRoot: string | null = null
    for (const write of applied.writes) {
      const abs = safety.absPaths[write.path]
      if (abs === undefined) {
        throw new SyncError('PATH_REJECTED', `${write.path} 未通过写入路径校验，整包中止`)
      }
      let backupPath: string | null = null
      if (write.backup && existsSync(abs)) {
        if (backupRoot === null) {
          backupRoot = uniqueBackupRoot(projectPath, utcStamp(now))
          mkdirSync(backupRoot, { recursive: true })
        }
        backupPath = join(backupRoot, write.path)
        mkdirSync(dirname(backupPath), { recursive: true })
        copyFileSync(abs, backupPath)
      }
      try {
        mkdirSync(dirname(abs), { recursive: true })
        writeFileSync(abs, write.content, { mode: 0o644 })
        chmodSync(abs, 0o644)
      } catch (e) {
        // §6.5：中止后续写入，已写文件保留（幂等重跑可收敛），并给手工回滚指引
        throw new SyncError(
          'WRITE_FAILED',
          `写入 ${abs} 失败：${(e as Error).message}。已完成 ${written.length}/${applied.writes.length} 项` +
            (backupRoot ? `；被覆盖的旧文件在 ${backupRoot}，可逐个复制回去` : ''),
          { done: written },
        )
      }
      written.push(write.path)
      outcome.writes.push({ path: write.path, status: statusOf(plan, write.path), backupPath })
    }

    const nextLock = buildPackLock({
      pack: {
        id: pack.manifest.pack.id,
        name: pack.manifest.pack.name,
        version: pack.manifest.pack.version,
        fingerprint: pack.fingerprint,
      },
      plan,
      written,
      oldLock,
      injectedAt: now.toISOString(),
    })
    mkdirSync(dirname(lockPath), { recursive: true })
    writeFileSync(lockPath, packLockJson(nextLock), { mode: 0o644 })
    chmodSync(lockPath, 0o644)
    outcome.lockPath = lockPath
    outcome.backupRoot = backupRoot

    outcome.hints.push('建议把 .openvibe/backup/ 加入 .gitignore（本命令不会改动 .gitignore）')

    await reportInjection(outcome, deps, pack, warningsOut)
    if (written.length > 0) {
      await deps.onInjected?.({ name: outcome.pack.name, version: outcome.pack.version })
    }

    // §5.2：--yes --strategy skip 把 CONFLICT/DRIFT 全部留在磁盘外，这是「检测到冲突」而非成功，
    // 返回 2 让 CI 能区分「无事可做」与「有冲突被批量跳过」。
    if (options.yes === true && options.strategy === 'skip' && plan.pending.length > 0) {
      outcome.exitCode = 2
    }
    return outcome
  } finally {
    stopSignalHandlers()
    lock.release()
  }
}

function statusOf(plan: InjectPlan, path: string): InjectStatus {
  const file = plan.files.find((f) => f.path === path)
  return file ? file.status : 'NEW'
}

/** 决策收集：dry-run 用默认动作；--yes 按策略批量；否则逐项询问（非 TTY 拒绝执行） */
async function decide(
  plan: InjectPlan,
  options: SyncOptions,
  deps: SyncDeps,
  warningsOut: string[],
  dryRun: boolean,
): Promise<Record<string, InjectDecision | undefined>> {
  if (plan.pending.length === 0) return {}
  if (dryRun) {
    warningsOut.push(
      `dry-run：${plan.pending.length} 项待决（CONFLICT/DRIFT），正式执行会按默认「以包为准」处理`,
    )
    return {}
  }
  if (options.yes) {
    return options.strategy ? strategyToDecisions(plan, options.strategy) : {}
  }
  if (deps.isTTY !== true) {
    throw new SyncError(
      'NEED_TTY',
      `${plan.pending.length} 个文件需要确认，但当前不是交互终端：加 --yes（默认以包为准）或 --yes --strategy skip|overwrite|keep-local`,
      { pending: plan.pending.map((p) => p.path).sort(compareCodeUnit) },
    )
  }
  const ask = deps.ask
  if (!ask) throw new SyncError('NO_ASKER', '交互确认器未注入')
  const decisions: Record<string, InjectDecision | undefined> = {}
  for (const file of plan.pending) decisions[file.path] = await ask(file)
  return decisions
}

const DECISION_LABEL: Record<InjectDecision, string> = {
  overwrite: '以包为准（覆盖，旧文件先备份）',
  'keep-local': '保留本地手改（包内容不落地）',
  skip: '跳过（什么都不动）',
}

/**
 * 交互确认器（design §9 用 @clack）：CONFLICT 两项、DRIFT 三项，core 已按状态裁好 options。
 * Ctrl-C / Esc 视为「别动我的文件」→ skip，而不是落到破坏性的默认值上。
 */
export const askWithClack: AskFn = async (file) => {
  const answer = await select<InjectDecision>({
    message: `${file.path}：磁盘内容与包不一致（${file.status}）`,
    options: file.options.map((d) => ({
      value: d,
      label: DECISION_LABEL[d] + (d === file.defaultDecision ? '（默认）' : ''),
    })),
    initialValue: file.defaultDecision,
  })
  return isCancel(answer) ? 'skip' : answer
}

/** 注入历史上报（m6b FR-2.5）：离线模式只警告，不打断已经完成的注入 */
async function reportInjection(
  outcome: SyncOutcome,
  deps: SyncDeps,
  pack: LoadedPack,
  warningsOut: string[],
): Promise<void> {
  if (!deps.client) {
    warningsOut.push('离线模式：跳过注入历史上报（lock 文件已写入，后续联网再 sync 会补记录）')
    return
  }
  try {
    const body = {
      packId: pack.manifest.pack.id,
      packVersion: pack.manifest.pack.version,
      projectPath: outcome.projectPath,
    }
    await deps.client.postJson<{ id: string }>('/api/injections', body)
    outcome.injectionReported = true
  } catch (e) {
    const detail =
      e instanceof ServerUnreachable ? '服务端不可达' : ((e as Error).message ?? String(e))
    warningsOut.push(`注入历史上报失败（${detail}），文件与 lock 已就位`)
  }
}
