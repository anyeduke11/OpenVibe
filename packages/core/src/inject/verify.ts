import { compareSemver } from '@openvibe/shared'

/**
 * verify 的六态判定（v0.2.3 批次 B FR-4，spec `v023-b-first-lap.md`）。
 *
 * 与 diff 的分工：diff 管「磁盘 vs lock」的逐文件差异（五状态决策的输入）；
 * verify 管「包 / lock / 磁盘」三方一致性的**完整性结论**——回答「这个目录现在的
 * 注入状态是否自洽」，供 sync 前置提示与用户自检。纯函数：所有输入由调用方采集，
 * 本文件不做任何 IO。
 *
 * 六态与 spec 四态的关系（登记于 DEV-0113，spec 升 v1.0 时由 owner 确认）：
 * spec 原四态 CONSISTENT/PARTIAL/STALE_LOCK/ORPHAN 全覆盖；另补两态——
 * UNMANAGED（无 lock，调用方直接判定，不经本函数）与 DISK_DRIFT（包与 lock 一致
 * 但磁盘偏离：这是 diff 的领地，verify 如实报告并指路，不吞也不越权处置）。
 */

export type VerifyState = 'CONSISTENT' | 'PARTIAL' | 'ORPHAN' | 'DISK_DRIFT' | 'STALE_LOCK'

export interface VerifyPlanInput {
  /** lock 登记文件在磁盘缺失（写一半的典型形态）——由调用方用 diffPackLock/summarizeDiff 采集 */
  missing: string[]
  /** 受管文件磁盘哈希偏离 lock——同上采集 */
  drifted: { path: string; expected: string; actual: string }[]
  /** 磁盘上带 OpenVibe 注入标记、却不在 lock 登记内的产物（lock 被重建/删除后的弃儿） */
  markedUnregistered: string[]
  /** 服务端同包最新导出版本；不可达或无导出记录为 null（此时不判 STALE_LOCK） */
  latestExportVersion: string | null
  /** lock 所指包版本 */
  packVersion: string
}

export interface VerifyPlan {
  state: VerifyState
  exitCode: 0 | 2
  missing: string[]
  drifted: { path: string; expected: string; actual: string }[]
  orphan: string[]
  newer: { from: string; to: string } | null
  /** 一句人话结论（printer 直接展示） */
  reason: string
  /** 修复建议（指向既有命令，verify 自己永不写盘） */
  fix: string
}

/**
 * 判定优先级（最严重的先报，其余发现仍列在明细里）：
 * PARTIAL（注入完整性破坏）> ORPHAN（lock 失踪的弃儿）> DISK_DRIFT（磁盘偏离）>
 * STALE_LOCK（有更新版本，纯信息性）> CONSISTENT。
 */
export function planVerify(input: VerifyPlanInput): VerifyPlan {
  const { missing, drifted, markedUnregistered, latestExportVersion, packVersion } = input
  const newer =
    latestExportVersion !== null && compareSemver(latestExportVersion, packVersion) > 0
      ? { from: packVersion, to: latestExportVersion }
      : null

  if (missing.length > 0) {
    return {
      state: 'PARTIAL',
      exitCode: 2,
      missing,
      drifted,
      orphan: markedUnregistered,
      newer,
      reason: `lock 登记 ${missing.length} 个文件在磁盘缺失（疑似上次注入中断）`,
      fix: 'openvibe sync --dry-run 预览后重新 sync，按包内容重建缺失文件',
    }
  }
  if (markedUnregistered.length > 0) {
    return {
      state: 'ORPHAN',
      exitCode: 2,
      missing,
      drifted,
      orphan: markedUnregistered,
      newer,
      reason: `发现 ${markedUnregistered.length} 个带 OpenVibe 标记却未登记在 lock 里的产物（lock 可能被删除或重建过）`,
      fix: 'openvibe sync 重新收编，或确认这些文件不再需要后手工清理',
    }
  }
  if (drifted.length > 0) {
    return {
      state: 'DISK_DRIFT',
      exitCode: 2,
      missing,
      drifted,
      orphan: markedUnregistered,
      newer,
      reason: `磁盘偏离 lock：${drifted.length} 个受管文件被改动`,
      fix: 'openvibe diff 查看逐文件差异，决定以包为准或保留本地',
    }
  }
  if (newer !== null) {
    return {
      state: 'STALE_LOCK',
      exitCode: 2,
      missing,
      drifted,
      orphan: markedUnregistered,
      newer,
      reason: `磁盘与 lock 一致，但服务端已有更新的导出版本（${newer.from} → ${newer.to}）`,
      fix: 'openvibe diff 查看变更集后 openvibe sync 升级',
    }
  }
  return {
    state: 'CONSISTENT',
    exitCode: 0,
    missing,
    drifted,
    orphan: markedUnregistered,
    newer,
    reason: '三方一致：磁盘与 lock 一致，且没有更新的导出版本',
    fix: '',
  }
}
