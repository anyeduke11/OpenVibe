// packages/core/src/inject/retirement.ts —— clean 的三态分类器（m6b FR-6.3）。
// 纯函数：判据与 sync 的规划器同一条（磁盘 sha256 vs lock 期望哈希），不另造第二套词——
// 两套分类器必然在边界处分叉。删除动作留给 CLI，这里只出「谁可以删」。
import { compareCodeUnit, type PackLock } from '@openvibe/shared'
import { fileSha256 } from '../pack/fingerprint'

export const RETIREMENT_STATES = ['IN_SYNC', 'DRIFT', 'ABSENT', 'FOREIGN'] as const
export type RetirementState = (typeof RETIREMENT_STATES)[number]

/** delete=备份后删除；keep=DRIFT 被保留（--force 会变成 delete）；none=不动盘 */
export type RetirementAction = 'delete' | 'keep' | 'none'

export interface RetirementFile {
  path: string
  state: RetirementState
  action: RetirementAction
  lockSha256: string
  diskSha256: string | null
  managed: boolean
}

export interface RetirementPlan {
  files: RetirementFile[]
  counts: Record<RetirementState, number>
  /** 本次真要删的路径（IN_SYNC ∪ --force 的 DRIFT），码点序 */
  removals: string[]
}

export interface RetirementInput {
  lock: PackLock
  /** null = 磁盘不存在；抛错 = 读取失败（调用方按 §6.5 中止，不得当成 ABSENT） */
  readDisk: (relPath: string) => string | null
  force?: boolean
}

/** 项目根下第一段是 .openvibe 即非包产物：lock 可被手改，这条不能依赖 lock 的自觉 */
function isOpenVibeInternal(relPath: string): boolean {
  const [first] = relPath.split(/[\\/]+/)
  return first === '.openvibe'
}

export function planRetirement(input: RetirementInput): RetirementPlan {
  const force = input.force === true
  const files: RetirementFile[] = [...input.lock.files]
    .sort((a, b) => compareCodeUnit(a.path, b.path))
    .map((entry) => {
      const managed = entry.managed === true
      const content = input.readDisk(entry.path)
      const diskSha256 = content === null ? null : fileSha256(content)

      let state: RetirementState
      if (content === null) state = 'ABSENT'
      else if (!managed || isOpenVibeInternal(entry.path)) state = 'FOREIGN'
      else state = diskSha256 === entry.sha256 ? 'IN_SYNC' : 'DRIFT'

      const action: RetirementAction =
        state === 'IN_SYNC' ? 'delete' : state === 'DRIFT' ? (force ? 'delete' : 'keep') : 'none'
      return { path: entry.path, state, action, lockSha256: entry.sha256, diskSha256, managed }
    })

  const counts = Object.fromEntries(RETIREMENT_STATES.map((s) => [s, 0])) as Record<
    RetirementState,
    number
  >
  for (const file of files) counts[file.state] += 1

  return {
    files,
    counts,
    removals: files.filter((f) => f.action === 'delete').map((f) => f.path),
  }
}
