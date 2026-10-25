import type { SqliteDatabase } from '../db'

/**
 * 提取出网的授权来源推导与审计行（v0.2.3 批次 D 收尾，spec FR-7.2——对齐 M9
 * `deriveConsentDetail` 的纪律：**分类由服务端从两个输入推导**（库里的同意记忆 +
 * 本次是否显式确认），客户端只提供「用户点了确认」这个事实，无权上报授权分类）。
 * 提取链没有逐条勾选（M9 的 user_partial 不存在），四值取三 + 防御值。
 */

export type ExtractConsentSource = 'explicit_tick' | 'remembered'
export type ExtractConsentDetail = 'no_memory' | 'memory_applied' | 'user_reticked' | 'unknown'

export interface DerivedConsent {
  source: ExtractConsentSource
  detail: ExtractConsentDetail
}

/** 纯函数：记忆在场 ⇒ remembered/memory_applied；无记忆但本次显式确认 ⇒ explicit_tick/user_reticked */
export function deriveExtractConsent(rememberAll: boolean, confirm: boolean): DerivedConsent {
  if (rememberAll) return { source: 'remembered', detail: 'memory_applied' }
  if (confirm) return { source: 'explicit_tick', detail: 'user_reticked' }
  // 到达这里意味着既无记忆也未确认——service 的 consent-required 关应已拦下；
  // 记 unknown 是防御：万一未来有人绕过那道关，审计行会如实暴露，而不是伪装成合法来源
  return { source: 'explicit_tick', detail: 'unknown' }
}

export interface ShareRowInput {
  projectId: string
  provider: string
  model: string
  candidateCount: number
  passedCount: number
  droppedCount: number
  consent: DerivedConsent
  createdAt: string
}

/** 每次成功出网落一行（失败不出网——失败的审计在台账 ai_extract_call 的 result='error'） */
export function recordExtractShare(db: SqliteDatabase, row: ShareRowInput): void {
  db.prepare(
    `INSERT INTO ai_extract_shares
       (project_id, provider, model, candidate_count, passed_count, dropped_count, consent_source, consent_detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.projectId,
    row.provider,
    row.model,
    row.candidateCount,
    row.passedCount,
    row.droppedCount,
    row.consent.source,
    row.consent.detail,
    row.createdAt,
  )
}

/** 成本台账视图（设置页「AI 与出网」区）：按 provider/model 分组的出网计数 */
export interface ExtractUsageRow {
  provider: string
  model: string
  calls: number
  okCalls: number
  candidates: number
  lastAt: string | null
}

export function extractUsage(db: SqliteDatabase): ExtractUsageRow[] {
  const rows = db
    .prepare(
      `SELECT json_extract(payload_json, '$.aiProvider') AS provider,
              json_extract(payload_json, '$.aiModel') AS model,
              COUNT(*) AS calls,
              SUM(CASE WHEN json_extract(payload_json, '$.result') = 'ok' THEN 1 ELSE 0 END) AS okCalls,
              SUM(json_extract(payload_json, '$.candidateCount')) AS candidates,
              MAX(created_at) AS lastAt
       FROM local_events WHERE kind = 'ai_extract_call'
       GROUP BY provider, model`,
    )
    .all() as { provider: string; model: string; calls: number; okCalls: number; candidates: number | null; lastAt: string | null }[]
  return rows.map((r) => ({
    provider: r.provider,
    model: r.model,
    calls: r.calls,
    okCalls: r.okCalls,
    candidates: r.candidates ?? 0,
    lastAt: r.lastAt ?? null,
  }))
}
