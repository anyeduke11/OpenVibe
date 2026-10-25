// `packages/core/src/db/m9-topic-terms.ts` —— M9 v1.6 P1.8（`m9-dev-plan-2026-10.md` §6.2）
//
// **DL-06：术语挂接不反向写 `terms` 表。**
//
//   spec §7 原文：「术语挂接**不反向写 `terms` 表**」
//   怎么证明它能红：变异腿：让挂接动作写 `terms` ⇒ 红
//   背景（§3.4）：「⚠️ **不做反向写入**：AI 补的知识点若需要新术语，
//     **走 M8 回流通道**进「待确认回流」，人工确认后才落 `terms`」
//   迁移 0011 的注释：「**不得反向写 terms 表**：那是 M3 的资产面，本表只做挂接。
//     这一条不变式由 `lang_topic_terms` **没有** `terms` 写入 helper 来保证（API 边界）」
//
// ⚠️ **本轮为什么才有「挂接动作」可守**（这是 P1.8 之前守卫失效的真正原因）：
//   P1.1 建了 `lang_topic_terms` 表，但直到 P1.8 仓内**没有任何一处写过它** ——
//   守卫守的是一个不存在的动作时，它只会「因为没发生所以绿」。
//   ⇒ P1.8 把挂接动作落成**唯一写入点**（`attachTopicTerms`），
//     守卫才有对象；变异腿也才有东西可注入。
//
// ⚠️ **缺失术语不建行**：§3.4 的出路是「走 M8 回流通道进待确认回流，人工确认后才落 terms」。
//   本模块**只负责不建行**并把缺失项报出来（`missing`）——
//   回流通道的写入是 M8 的面（`agent_ingests`），本轮不越权去改它。
//   ⇒ 挂接遇到库里没有的 term ⇒ **不建行、不改 terms、报 missing**。
import { sha256Hex } from '../repos/util'
import type { SqliteDatabase } from '../index'

/** §3.4：「每个知识点挂 **0~3 条**术语（稀疏是常态，§1.3）」 */
export const MAX_TERMS_PER_TOPIC = 3

export interface AttachResult {
  /** 实际写进 `lang_topic_terms` 的条数 */
  attached: number
  /** 库里没有的 term id / 自然键 —— **不建行**，按 §3.4 走 M8 回流 */
  missing: string[]
  /** 被拒的入参（超上限 / 重复 / 空 id） */
  rejected: string[]
}

/**
 * 把术语挂到知识点上 —— **只**写 `lang_topic_terms`。
 *
 * ⚠️ 本函数**刻意不 import** `TermsRepo`（M3 的 terms 写入面）：
 *   import 了就有机会调 `create` / `update` —— 而 DL-06 断的就是那一步。
 *   只用只读的 `SELECT id FROM terms WHERE id = ?` 做存在性校验。
 */
export function attachTopicTerms(
  db: SqliteDatabase,
  topicId: number,
  termIds: string[],
): AttachResult {
  const result: AttachResult = { attached: 0, missing: [], rejected: [] }
  if (!Number.isInteger(topicId) || topicId <= 0) {
    result.rejected.push(`topic_id 非法: ${String(topicId)}`)
    return result
  }

  const topic = db.prepare(`SELECT id FROM lang_topics WHERE id = ?`).get(topicId) as
    | { id: number }
    | undefined
  if (!topic) {
    result.rejected.push(`topic 不存在: ${topicId}`)
    return result
  }

  const findTerm = db.prepare(`SELECT id FROM terms WHERE id = ?`)
  const existing = db
    .prepare(`SELECT term_id FROM lang_topic_terms WHERE topic_id = ?`)
    .all(topicId) as Array<{ term_id: string }>
  const already = new Set(existing.map((r) => r.term_id))

  // 去重后按「已挂条数 + 本次条数 ≤ 3」判上限
  const seen = new Set<string>()
  const pending: string[] = []
  for (const raw of termIds) {
    const id = (raw ?? '').trim()
    if (!id) {
      result.rejected.push('空的 term id')
      continue
    }
    if (seen.has(id)) {
      result.rejected.push(`重复的 term id: ${id}`)
      continue
    }
    seen.add(id)
    if (!findTerm.get(id)) {
      // ⚠️ **不建行**（§3.4：走 M8 回流，人工确认后才落 terms）
      result.missing.push(id)
      continue
    }
    pending.push(id)
  }

  const room = MAX_TERMS_PER_TOPIC - already.size
  if (pending.length > room) {
    result.rejected.push(
      `超过每知识点 ${MAX_TERMS_PER_TOPIC} 条上限（已挂 ${already.size} 条，本次 ${pending.length} 条）`,
    )
  }
  const accepted = pending.slice(0, Math.max(room, 0))

  const insert = db.prepare(
    `INSERT OR IGNORE INTO lang_topic_terms (topic_id, term_id) VALUES (?, ?)`,
  )
  for (const id of accepted) {
    const info = insert.run(topicId, id)
    if (info.changes > 0) result.attached += 1
    else result.rejected.push(`已挂过: ${id}`)
  }
  return result
}

/**
 * 按**自然键**（`zh`）挂术语。
 *
 * ⚠️ **为什么必须按自然键**：`terms.id` 是 `newId('term')` 生成的（每次建库都不同），
 *   挂接数据若写死 id 就无法复跑。按自然键解析 ⇒ 挂接可复算。
 */
export function attachTopicTermByNaturalKey(
  db: SqliteDatabase,
  topicId: number,
  termZh: string,
): AttachResult {
  const row = db
    .prepare(`SELECT id FROM terms WHERE zh = ? OR en = ? ORDER BY id LIMIT 1`)
    .get(termZh, termZh) as { id: string } | undefined
  if (!row) {
    return { attached: 0, missing: [termZh], rejected: [] }
  }
  return attachTopicTerms(db, topicId, [row.id])
}

/**
 * 某知识点挂的术语 id 列表。
 *
 * ⚠️ **排序放 JS，不放 SQL** —— 与 `m9-p1-7-topic-stages.ts` 的 `listDagEdges` 同因：
 *   `lang_topic_terms` 的主键是**复合键** (topic_id, term_id)，单独一列都不唯一
 *   ⇒ 仓内静态守卫「tests/order-determinism.test.ts」的兜底键白名单认不出它，
 *   SQL 里写 ORDER BY 会被判红。在 JS 里排序，确定性等价。
 */
export function listTopicTerms(db: SqliteDatabase, topicId: number): string[] {
  const rows = db
    .prepare(`SELECT term_id FROM lang_topic_terms WHERE topic_id = ?`)
    .all(topicId) as Array<{ term_id: string }>
  return rows.map((r) => r.term_id).sort()
}

/**
 * `terms` 表的内容指纹 —— DL-06 守卫的**核心量**。
 *
 * ⚠️ **只算内容不算行数**：行数不变但内容被改（改定义、改状态）同样违反
 *   「不反向写 terms」。指纹覆盖 id / zh / en / aliases / definition / example / status。
 */
export function termsFingerprint(db: SqliteDatabase): string {
  const rows = db
    .prepare(
      `SELECT id, zh, en, aliases, definition, example, status
         FROM terms ORDER BY id`,
    )
    .all() as Array<Record<string, unknown>>
  return sha256Hex(JSON.stringify(rows))
}

/** `terms` 表的行数。 */
export function termsRowCount(db: SqliteDatabase): number {
  const row = db.prepare(`SELECT COUNT(*) AS c FROM terms`).get() as { c: number }
  return row.c
}

/** 两次指纹之间是否有变化（DL-06 守卫的判定式）。 */
export function termsChanged(before: string, after: string): boolean {
  return before !== after
}
