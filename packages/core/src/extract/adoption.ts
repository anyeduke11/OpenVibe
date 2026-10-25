import type { SqliteDatabase } from '../db'

/**
 * AN5 影子门槛（v0.2.3 批次 D，spec FR-11）：采纳率从 agent_ingests 的 review 结果
 * 现算（published / (published + rejected)，按候选 kind 分组），**无第二数据源**。
 * 门槛 25% 与统计窗口每轮 ≥20 条是首版预判值（QG1），owner 可改——改判据 = 改这里的常量单源。
 * 「连续 2 轮」的时间序列判定不在本函数（MVP：当前累计窗口低于门槛即 belowThreshold，
 * 连续轮次的横切留待采纳历史表——登记于 DEV-0142）。
 */

export const ADOPTION_THRESHOLD = 0.25
export const ADOPTION_WINDOW_MIN = 20

const CANDIDATE_KINDS = ['term_candidate', 'prompt_candidate', 'playbook_candidate'] as const

export interface AdoptionKindStat {
  kind: string
  published: number
  rejected: number
  rate: number | null
  belowThreshold: boolean
}

export interface AdoptionStats {
  kinds: AdoptionKindStat[]
  threshold: number
  windowMin: number
}

export function adoptionStats(db: SqliteDatabase): AdoptionStats {
  const rows = db
    .prepare(
      `SELECT kind, status, COUNT(*) AS c FROM agent_ingests
       WHERE kind IN ('term_candidate','prompt_candidate','playbook_candidate')
         AND status IN ('published','rejected')
       GROUP BY kind, status`,
    )
    .all() as { kind: string; status: string; c: number }[]

  const kinds: AdoptionKindStat[] = CANDIDATE_KINDS.map((kind) => {
    const published = rows.find((r) => r.kind === kind && r.status === 'published')?.c ?? 0
    const rejected = rows.find((r) => r.kind === kind && r.status === 'rejected')?.c ?? 0
    const denom = published + rejected
    const rate = denom === 0 ? null : Math.round((published / denom) * 1000) / 1000
    return {
      kind,
      published,
      rejected,
      rate,
      belowThreshold: rate !== null && denom >= ADOPTION_WINDOW_MIN && rate < ADOPTION_THRESHOLD,
    }
  })
  return { kinds, threshold: ADOPTION_THRESHOLD, windowMin: ADOPTION_WINDOW_MIN }
}
