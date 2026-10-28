// packages/core/src/inject/planner —— sync 的五状态规划器（m6b FR-2.2 / FR-2.7 / FR-5.2）。
// 纯函数：磁盘由 readDisk 注入，规划器本身零副作用——dry-run 的「零写入」因此是结构保证，
// 不是靠调用方记得加分支（design §9 薄客户端原则：状态机在 core，CLI 只做交互与落盘）。
import { AppError, compareCodeUnit, type PackLock } from '@openvibe/shared'
import { fileSha256 } from '../pack/fingerprint'
import { verifyAgainstLock, type ConsistencyFile } from './consistency'

/** bundle/目录导出的一种形态：路径 + 内容 + 期望哈希（三者由 CLI 在解析源时对齐，FR-2.1） */
export interface PackFileWithHash {
  path: string
  content: string
  sha256: string
}

export const INJECT_STATUSES = ['NEW', 'IN_SYNC', 'UPDATE', 'CONFLICT', 'DRIFT'] as const
export type InjectStatus = (typeof INJECT_STATUSES)[number]

/** CONFLICT 只有两项、DRIFT 三项（m6b FR-2.2 的交互三选） */
export const INJECT_DECISIONS = ['overwrite', 'keep-local', 'skip'] as const
export type InjectDecision = (typeof INJECT_DECISIONS)[number]

export type InjectAction = 'write' | 'skip' | 'backup-write'

export interface InjectPlanFile {
  path: string
  packSha256: string
  diskSha256: string | null
  /** 上次注入时登记的期望哈希（null = lock 里没有这个路径） */
  lockSha256: string | null
  /** lock 是否标记本包受管（UPDATE/DRIFT 与 CONFLICT 的分水岭） */
  managed: boolean
  /** --target 过滤后本次是否属于写入范围 */
  inScope: boolean
  status: InjectStatus
  options: InjectDecision[]
  defaultDecision: InjectDecision
  defaultAction: InjectAction
}

export interface InjectPlan {
  files: InjectPlanFile[]
  counts: Record<InjectStatus, number>
  /** 需要用户（或 --strategy）决策的项 */
  pending: InjectPlanFile[]
}

export interface PlanInput {
  files: readonly PackFileWithHash[]
  /** null = 磁盘不存在；抛错 = 读取失败（调用方按 m6b §6.5 中止） */
  readDisk: (relPath: string) => string | null
  lock: PackLock | null
  /** 已解析为路径集合的 --target（null = 不过滤） */
  targets: readonly string[] | null
}

interface StatusRule {
  options: InjectDecision[]
  defaultDecision: InjectDecision
  defaultAction: InjectAction
}

const RULES: Record<InjectStatus, StatusRule> = {
  NEW: { options: [], defaultDecision: 'overwrite', defaultAction: 'write' },
  IN_SYNC: { options: [], defaultDecision: 'skip', defaultAction: 'skip' },
  UPDATE: { options: [], defaultDecision: 'overwrite', defaultAction: 'backup-write' },
  CONFLICT: {
    options: ['overwrite', 'skip'],
    defaultDecision: 'overwrite',
    defaultAction: 'backup-write',
  },
  DRIFT: {
    options: ['overwrite', 'keep-local', 'skip'],
    defaultDecision: 'overwrite',
    defaultAction: 'backup-write',
  },
}

export function planInjection(input: PlanInput): InjectPlan {
  const lockByPath = new Map<string, PackLock['files'][number]>()
  for (const entry of input.lock?.files ?? []) lockByPath.set(entry.path, entry)
  const targetSet = input.targets ? new Set(input.targets) : null

  const files: InjectPlanFile[] = [...input.files]
    .sort((a, b) => compareCodeUnit(a.path, b.path))
    .map((file) => {
      const entry = lockByPath.get(file.path)
      const diskContent = input.readDisk(file.path)
      const diskSha256 = diskContent === null ? null : fileSha256(diskContent)
      const managed = entry?.managed === true
      const lockSha256 = entry?.sha256 ?? null

      let status: InjectStatus
      if (diskSha256 === null) status = 'NEW'
      // 内容一致优先：无论是否受管，磁盘已是包内容就没必要再写、也没必要问
      else if (diskSha256 === file.sha256) status = 'IN_SYNC'
      else if (managed && lockSha256 !== null)
        status = diskSha256 === lockSha256 ? 'UPDATE' : 'DRIFT'
      else status = 'CONFLICT'

      const rule = RULES[status]
      const inScope = targetSet === null || targetSet.has(file.path)
      return {
        path: file.path,
        packSha256: file.sha256,
        diskSha256,
        lockSha256,
        managed,
        inScope,
        status,
        options: inScope ? rule.options : [],
        defaultDecision: inScope ? rule.defaultDecision : 'skip',
        defaultAction: inScope ? rule.defaultAction : ('skip' as InjectAction),
      }
    })

  const counts = Object.fromEntries(INJECT_STATUSES.map((s) => [s, 0])) as Record<
    InjectStatus,
    number
  >
  for (const file of files) counts[file.status] += 1

  return { files, counts, pending: files.filter((f) => f.options.length > 0) }
}

/** --yes --strategy 批量处置：只作用在待决项上（m6b FR-2.4） */
export function strategyToDecisions(
  plan: InjectPlan,
  strategy: InjectDecision,
): Record<string, InjectDecision> {
  const decisions: Record<string, InjectDecision> = {}
  for (const file of plan.pending) decisions[file.path] = strategy
  return decisions
}

export interface InjectWrite {
  path: string
  content: string
  sha256: string
  /** 覆盖前必须备份（m6b FR-2.5 / §7.1b） */
  backup: boolean
}

export interface InjectSkip {
  path: string
  why: string
}

export interface ApplyResult {
  writes: InjectWrite[]
  skipped: InjectSkip[]
}

/**
 * 决策落地。非待决项（NEW/IN_SYNC/UPDATE）忽略传入决策——它们没有决策点；
 * keep-local 对 CONFLICT 不适用（本包从未拥有该文件），按 skip 处置。
 */
export function applyDecisions(
  plan: InjectPlan,
  contents: Readonly<Record<string, string | undefined>>,
  decisions: Readonly<Record<string, InjectDecision | undefined>>,
): ApplyResult {
  const writes: InjectWrite[] = []
  const skipped: InjectSkip[] = []

  for (const file of plan.files) {
    if (!file.inScope) {
      skipped.push({ path: file.path, why: '--target 过滤：本次不写入' })
      continue
    }
    const decision =
      file.options.length === 0
        ? file.defaultDecision
        : (decisions[file.path] ?? file.defaultDecision)
    if (decision === 'overwrite') {
      const content = contents[file.path]
      if (content === undefined) {
        throw new AppError(
          'VALIDATION_ERROR',
          `包内缺少文件内容：${file.path}（bundle 与 manifest 不一致，拒绝写入空文件）`,
          { path: file.path },
        )
      }
      writes.push({
        path: file.path,
        content,
        sha256: file.packSha256,
        backup: file.status !== 'NEW',
      })
      continue
    }
    skipped.push({ path: file.path, why: skipReason(file.status, decision) })
  }
  return { writes, skipped }
}

function skipReason(status: InjectStatus, decision: InjectDecision): string {
  if (status === 'IN_SYNC') return '内容与包一致'
  if (status === 'DRIFT') {
    return decision === 'keep-local' ? '检测到漂移，选择保留本地手改' : '检测到漂移，选择跳过'
  }
  return '本地文件与包冲突，选择跳过'
}

/** diff 的磁盘比对（m6b FR-5.2）：lock 里的每一项都算，managed=false 也留痕 */
/**
 * 比对结果：**四态全集**（owner 2026-10-15 裁「授权 planner 直接输出四态」）。
 *
 * 此前本接口自己维护 `drifted` / `missing` 两列，把未受管条目并进 `drifted`，
 * 导致「受管产物被改」与「未受管条目被改」在输出里**长得一样**，用户无从分辨。
 * 现在四态直接透出，派生分桶交给 `summarizeDiff` —— **信息不丢，只是分得更清**。
 */
export interface DiffResult {
  clean: boolean
  /** 全部登记条目，按路径码点序；每条带自己的 state */
  files: ConsistencyFile[]
}

/**
 * 把四态分桶，供 CLI 与测试消费。**派生，不是第二份真相** —— 真相只有 `files`。
 *
 * ⚠️ **FOREIGN 单列是一处可观察的行为变化**（owner 已授权）：未受管条目此前落进 `drifted`，
 * 现在落进 `foreign`。退出码口径**不变**（FOREIGN 存在 ⇒ `clean=false` ⇒ 退 2），
 * 变的只是「报在哪一列」，信息一条不少。
 */
export function summarizeDiff(result: DiffResult): {
  clean: boolean
  drifted: { path: string; expected: string; actual: string }[]
  missing: string[]
  foreign: { path: string; actual: string }[]
} {
  const drifted: { path: string; expected: string; actual: string }[] = []
  const missing: string[] = []
  const foreign: { path: string; actual: string }[] = []
  for (const row of result.files) {
    if (row.state === 'ABSENT') missing.push(row.path)
    else if (row.state === 'DRIFT')
      drifted.push({ path: row.path, expected: row.declaredSha256, actual: row.diskSha256 })
    else if (row.state === 'FOREIGN') foreign.push({ path: row.path, actual: row.diskSha256 })
  }
  return { clean: result.clean, drifted, missing, foreign }
}

export function diffPackLock(
  lock: PackLock,
  readDisk: (relPath: string) => string | null,
): DiffResult {
  const files = verifyAgainstLock(
    lock.files.map((entry) => ({
      path: entry.path,
      sha256: entry.sha256,
      managed: entry.managed === true,
    })),
    readDisk,
  )
  // `clean` 的口径**必须与改判前逐字一致**，否则是一次静默的语义收紧。
  //
  // ⚠️ 这里踩过一个坑：曾写成「全部 IN_SYNC 才算 clean」。但 `verifyAgainstLock` 的判据顺序是
  // ABSENT → FOREIGN → IN_SYNC/DRIFT，**未受管条目在哈希比对之前就被判成 FOREIGN**，
  // 于是「未受管但内容恰好一致」的文件会把 `clean` 拽成 false —— 而改判前它不算问题。
  // 症状是 `apps/cli/test/security.test.ts` 的 CLI-SEC-03 挂了（同步收敛后 diff 不再 clean）。
  //
  // 正确口径（与旧实现等价）：**既不缺、也没有一处哈希对不上**。
  // 未受管且内容一致 ⇒ 仍然算干净；未受管且内容不一致 ⇒ 不是干净，且落 `foreign` 列。
  const clean = files.every(
    (row) =>
      row.state === 'IN_SYNC' || (row.state === 'FOREIGN' && row.diskSha256 === row.declaredSha256),
  )
  return { clean, files }
}
