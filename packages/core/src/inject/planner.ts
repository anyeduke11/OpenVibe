// packages/core/src/inject/planner —— sync 的五状态规划器（m6b FR-2.2 / FR-2.7 / FR-5.2）。
// 纯函数：磁盘由 readDisk 注入，规划器本身零副作用——dry-run 的「零写入」因此是结构保证，
// 不是靠调用方记得加分支（design §9 薄客户端原则：状态机在 core，CLI 只做交互与落盘）。
import { AppError, compareCodeUnit, type PackLock } from '@openvibe/shared'
import { fileSha256 } from '../pack/fingerprint'

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

export interface DiffResult {
  clean: boolean
  drifted: { path: string; expected: string; actual: string }[]
  missing: string[]
}

/** diff 的磁盘比对（m6b FR-5.2）：lock 里的每一项都算，managed=false 也留痕 */
export function diffPackLock(
  lock: PackLock,
  readDisk: (relPath: string) => string | null,
): DiffResult {
  const drifted: DiffResult['drifted'] = []
  const missing: string[] = []
  for (const entry of [...lock.files].sort((a, b) => compareCodeUnit(a.path, b.path))) {
    const content = readDisk(entry.path)
    if (content === null) {
      missing.push(entry.path)
      continue
    }
    const actual = fileSha256(content)
    if (actual !== entry.sha256) drifted.push({ path: entry.path, expected: entry.sha256, actual })
  }
  return { clean: drifted.length === 0 && missing.length === 0, drifted, missing }
}
