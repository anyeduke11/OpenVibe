import { compareSemver } from '@openvibe/shared'

/**
 * verify 的七态判定（v0.2.3 批次 B FR-4，spec `v023-b-first-lap.md`；
 * 2026-10-31 v0.2.4 R0「证据诚实」加 `UNVERIFIED`）。
 *
 * 与 diff 的分工：diff 管「磁盘 vs lock」的逐文件差异（五状态决策的输入）；
 * verify 管「包 / lock / 磁盘」三方一致性的**完整性结论**——回答「这个目录现在的
 * 注入状态是否自洽」，供 sync 前置提示与用户自检。纯函数：所有输入由调用方采集，
 * 本文件不做任何 IO。
 *
 * 态与 spec 的关系（登记于 DEV-0113，spec 升 v1.0 时由 owner 确认）：
 * spec 原四态 CONSISTENT/PARTIAL/STALE_LOCK/ORPHAN 全覆盖；另补两态——
 * UNMANAGED（无 lock，调用方直接判定，不经本函数）与 DISK_DRIFT（包与 lock 一致
 * 但磁盘偏离：这是 diff 的领地，verify 如实报告并指路，不吞也不越权处置）；
 * 再补第三态 **UNVERIFIED**（本地三项干净但服务端未探测到，见下）。
 *
 * ## 为什么要有 `UNVERIFIED`（R0 · 证据诚实）
 *
 * 旧语义把「本地三项干净、服务端不可达」判成 `CONSISTENT`（退出码 0）⇒
 * 用户与脚本都读作「三方一致」，而实际上**包侧根本没问**。
 * ⇒ 「没问过」与「问过了且一致」不许共享同一个词。
 *
 * ⚠️ **「不可达」与「没有记录」是两件事**：
 *   - 服务端**不可达**（`probedOnline=false`）⇒ 未知 ⇒ `UNVERIFIED`；
 *   - 服务端**可达但该包没有导出记录**（`probedOnline=true`，`latestExportVersion=null`）
 *     ⇒ 确定结论（「没有更新版本」）⇒ 仍是 `CONSISTENT`。
 *   混为一谈会让「首次使用、还没导出过标准包」的用户被判成异常。
 */

export type VerifyState =
  'CONSISTENT' | 'PARTIAL' | 'ORPHAN' | 'DISK_DRIFT' | 'STALE_LOCK' | 'UNVERIFIED'

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
  /**
   * 是否真的问到了服务端（2026-10-31 R0 新增）。
   *
   * ⚠️ **缺省值是 `true`**：调用方若不传，视为「已问过」⇒
   *   `latestExportVersion=null` 判 `CONSISTENT`（旧语义）。
   *   ⇒ **不传这个字段的旧调用方行为不变**，只有显式说「没问到」才判 `UNVERIFIED`。
   */
  probedOnline?: boolean
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
 * STALE_LOCK（有更新版本，纯信息性）> UNVERIFIED（未核验）> CONSISTENT。
 *
 * ⚠️ **UNVERIFIED 排在 CONSISTENT 之前、其余四态之后**：
 *   本地有**事实**问题时报事实（用户该去修的是本地）；本地干净才说「未核验」。
 */
export function planVerify(input: VerifyPlanInput): VerifyPlan {
  const { missing, drifted, markedUnregistered, latestExportVersion, packVersion } = input
  // ⚠️ **缺省 true**：不传这个字段的旧调用方行为不变（见 VerifyPlanInput 的说明）
  const probedOnline = input.probedOnline ?? true
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
  // ⚠️ **本地三项都干净，但服务端没问到** ⇒ 不得判 CONSISTENT（R0 · 证据诚实）。
  //   排在 STALE_LOCK 之后：本地有事实问题时先报事实。
  if (!probedOnline) {
    return {
      state: 'UNVERIFIED',
      exitCode: 2,
      missing,
      drifted,
      orphan: markedUnregistered,
      newer,
      reason: '本地两项核验通过，但服务端不可达 ⇒ 包侧未核验（本次结论仅覆盖本地）',
      // ⚠️ 不建议 sync/diff：本地没坏，改它们只会误导用户
      fix: '恢复服务端连接（或配置 token）后重跑 openvibe verify，完成包侧核验',
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
