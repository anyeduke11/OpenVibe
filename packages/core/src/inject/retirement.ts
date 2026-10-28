// packages/core/src/inject/retirement.ts —— clean 的三态分类器（m6b FR-6.3）。
// 纯函数：判据与 sync 的规划器同一条（磁盘 sha256 vs lock 期望哈希），不另造第二套词——
// 两套分类器必然在边界处分叉。删除动作留给 CLI，这里只出「谁可以删」。
//
// ⚠️ 比对规则本体已按 service-layer.md FR-2 搬到 `./consistency`（三处合一）。
// 本文件保留的是**退场自己的形态**：四态原样、action 映射原样、counts 键序原样。
import type { PackLock } from '@openvibe/shared'
import { CONSISTENCY_STATES, verifyAgainstLock, type ConsistencyState } from './consistency'

/**
 * 状态词表随合一的那一处走（FR-2.3 → §8.2 待裁②(a)），但**导出名一字不改**：
 * 全仓既有引用（`retirement.test.ts`、`inject/index.ts`、`core/index.ts`、CLI 报告渲染）都指着它。
 */
export const RETIREMENT_STATES = CONSISTENCY_STATES
export type RetirementState = ConsistencyState

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

export function planRetirement(input: RetirementInput): RetirementPlan {
  const force = input.force === true
  // 退场态就是合一后的单一词表，映射是恒等的：唯一属于本文件的是 state → action。
  const files: RetirementFile[] = verifyAgainstLock(
    input.lock.files.map((entry) => ({
      path: entry.path,
      sha256: entry.sha256,
      // 缺 managed 字段（被手删）按未受管处理，安全侧：判据是 `=== true` 而不是「不是 false」
      managed: entry.managed === true,
    })),
    input.readDisk,
  ).map((row) => {
    const action: RetirementAction =
      row.state === 'IN_SYNC'
        ? 'delete'
        : row.state === 'DRIFT'
          ? force
            ? 'delete'
            : 'keep'
          : 'none'
    return {
      path: row.path,
      state: row.state,
      action,
      lockSha256: row.declaredSha256,
      diskSha256: row.diskSha256,
      managed: row.managed,
    }
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
