import type { SqliteDatabase } from '../db'
import {
  adoptionStats,
  ADOPTION_THRESHOLD,
  ADOPTION_WINDOW_MIN,
  type AdoptionKindStat,
} from './adoption'

/**
 * AN5 第二段：采纳率快照与「连续 N 轮低于门槛」判定（QG1 的时间序列面）。
 * 快照动作显式触发（reseed 面板 / 定期巡检调用），落行条件 = 该 kind 的裁决累计
 * 达到窗口下限（≥ ADOPTION_WINDOW_MIN）；轮次号 = 同 kind 内上一轮 +1。
 * 只增不改：历史轮次是审计事实，不随后续裁决回写。
 */

export const CONSECUTIVE_ROUNDS_TRIGGER = 2

export interface AdoptionSnapshotRow {
  kind: string
  roundNo: number
  published: number
  rejected: number
  rate: number | null
  below: boolean
  createdAt: string
}

export function writeAdoptionSnapshots(db: SqliteDatabase, now: string): AdoptionSnapshotRow[] {
  const stats = adoptionStats(db)
  const out: AdoptionSnapshotRow[] = []
  for (const k of stats.kinds) {
    const denom = k.published + k.rejected
    if (denom < ADOPTION_WINDOW_MIN) continue
    const prev = db
      .prepare(`SELECT MAX(round_no) AS r FROM adoption_snapshots WHERE kind = ?`)
      .get(k.kind) as { r: number | null }
    const roundNo = (prev.r ?? 0) + 1
    db.prepare(
      `INSERT INTO adoption_snapshots (kind, round_no, published, rejected, rate, below, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(k.kind, roundNo, k.published, k.rejected, k.rate, k.belowThreshold ? 1 : 0, now)
    out.push({
      kind: k.kind,
      roundNo,
      published: k.published,
      rejected: k.rejected,
      rate: k.rate,
      below: k.belowThreshold,
      createdAt: now,
    })
  }
  return out
}

export interface ConsecutiveLowVerdict {
  kind: string
  /** 最近 CONSECUTIVE_ROUNDS_TRIGGER 轮是否全部低于门槛（轮数不足 = false） */
  triggered: boolean
  rounds: number
  lastRates: (number | null)[]
}

/** QG1：连续 N 轮低于门槛 ⇒ 建议（横幅 + 新项目默认关；已开项目不强制关） */
export function consecutiveLowAdoption(db: SqliteDatabase): ConsecutiveLowVerdict[] {
  const kinds = ['term_candidate', 'prompt_candidate', 'playbook_candidate'] as const
  return kinds.map((kind) => {
    const rows = db
      .prepare(`SELECT round_no, rate FROM adoption_snapshots WHERE kind = ?`)
      .all(kind) as {
      round_no: number
      rate: number | null
    }[]
    const lastRates = rows
      .sort((a, b) => b.round_no - a.round_no)
      .slice(0, CONSECUTIVE_ROUNDS_TRIGGER)
      .map((r) => r.rate)
    const triggered =
      rows.length >= CONSECUTIVE_ROUNDS_TRIGGER &&
      lastRates.every((r) => r !== null && r < ADOPTION_THRESHOLD)
    return { kind, triggered, rounds: rows.length, lastRates }
  })
}

export interface AdoptionStatsWithHistory {
  kinds: AdoptionKindStat[]
  threshold: number
  windowMin: number
  consecutive: ConsecutiveLowVerdict[]
}

export function adoptionStatsWithHistory(db: SqliteDatabase): AdoptionStatsWithHistory {
  const base = adoptionStats(db)
  return { ...base, consecutive: consecutiveLowAdoption(db) }
}
