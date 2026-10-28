import { createHash } from 'node:crypto'
import type { SqliteDatabase } from './index'

/**
 * m9 播种器的行级三态合并（v0.2.3 批次 C CS2，spec `v023-c-consolidation.md` FR-2）。
 *
 * 此前 m9 各播种器是「一次性 INSERT OR IGNORE」（自陈「老库不会自动更新」）——
 * 种子内容修订后，已装库永远不刷新（PRD-v0.2.3 E6）。本 helper 把主通道
 * `seed.ts` 的 seed_hash 语义推广到行级：
 *
 *   1. stored === 新行哈希            ⇒ `unchanged`（跳过）
 *   2. stored 非空，hash(现内容) === stored ⇒ 用户没动过 ⇒ `updated`（覆盖内容 + 哈希）
 *   3. stored 非空，hash(现内容) !== stored ⇒ 用户改过   ⇒ `user-modified`（永不覆盖）
 *   4. stored 为 NULL（0019 前的老行）      ⇒ 按用户态对待：内容与新种子逐字相同
 *      才补登哈希（`legacy-adopted`），否则 `user-modified`——老行零 clobber 风险。
 *
 * 判「用户没动过」的机制：seed_hash 存的是**上次播种内容的哈希**；
 * 现内容重算哈希与之相等 ⇔ 内容自我上次播种以来未被改动（哈希碰撞忽略不计）。
 * 因此**不需要**保存旧内容本身，一列 seed_hash 即可支撑三态。
 *
 * registry（seed_registry 表）维持**纯诊断**用途：m9 播种量级小（百行级），
 * 行级合并本身幂等且廉价，不做 bundle 级跳过（主通道的 fast-path 是优化不是语义）。
 */

export type SeedMergeAction =
  'created' | 'unchanged' | 'updated' | 'user-modified' | 'legacy-adopted'

export interface SeedMergeSpec {
  table: string
  /** 业务键列（定位既有行；联合键按序给出） */
  keyColumns: string[]
  /** 内容列：参与哈希与覆盖。其余列仅 INSERT 时写入，更新路径不触碰 */
  contentColumns: string[]
}

export type SeedRecord = Record<string, string | number | null>

/** 行内容哈希：JSON 序列化（键序由调用方按 contentColumns 固定）后 sha256 */
export function seedRowHash(content: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(content)).digest('hex')
}

/**
 * 单行三态合并。`record` 必须含 spec.keyColumns 与 INSERT 所需的全部列
 * （命名参数与各播种器的既有 INSERT 形状一致）；seed_hash 由本函数维护，调用方不传。
 */
export function mergeSeedRow(
  db: SqliteDatabase,
  spec: SeedMergeSpec,
  record: SeedRecord,
): SeedMergeAction {
  const allColumns = Object.keys(record)
  const hash = seedRowHash(pickRecord(record, spec.contentColumns))
  // 标识符一律加双引号：`group` 等保留字列（lang_vibe_resources）裸写是语法错误
  const q = (id: string): string => `"${id}"`
  const where = spec.keyColumns.map((c) => `${q(c)} = @${c}`).join(' AND ')
  const existing = db
    .prepare(
      `SELECT ${[...spec.keyColumns, ...spec.contentColumns, 'seed_hash'].map(q).join(', ')}
       FROM ${q(spec.table)} WHERE ${where}`,
    )
    .get(keyParams(spec, record)) as
    (Record<string, string | number | null> & { seed_hash: string | null }) | undefined

  if (existing === undefined) {
    const cols = [...allColumns, 'seed_hash']
    db.prepare(
      `INSERT INTO ${q(spec.table)} (${cols.map(q).join(', ')})
       VALUES (${cols.map((c) => `@${c}`).join(', ')})`,
    ).run({ ...record, seed_hash: hash })
    return 'created'
  }

  const stored = existing.seed_hash ?? null
  const currentContent = pickRecord(existing, spec.contentColumns)
  // 「用户没动过」= 现内容仍与上次播种的内容一致（现内容哈希 == stored）
  const currentMatchesStored = stored !== null && seedRowHash(currentContent) === stored

  if (stored === hash) {
    // 新种子 == 上次播种的内容；但还要确认**磁盘上的现内容**没被用户改过——
    // 用户把行改成 X 后种子仍是旧值 ⇒ stored === hash(旧种子) 但现内容已偏离 ⇒ user-modified
    return currentMatchesStored ? 'unchanged' : 'user-modified'
  }

  const untouched = currentMatchesStored

  if (stored === null) {
    // 老行（0019 前入库）：内容与新种子相同才补登哈希，否则按用户态跳过
    if (seedRowHash(currentContent) === hash) {
      db.prepare(`UPDATE ${q(spec.table)} SET ${q('seed_hash')} = @h WHERE ${where}`).run({
        ...keyParams(spec, record),
        h: hash,
      })
      return 'legacy-adopted'
    }
    return 'user-modified'
  }
  if (untouched) {
    const set = spec.contentColumns.map((c) => `${q(c)} = @${c}`)
    db.prepare(
      `UPDATE ${q(spec.table)} SET ${set.join(', ')}, ${q('seed_hash')} = @__seed_hash WHERE ${where}`,
    ).run({ ...record, __seed_hash: hash, ...keyParams(spec, record) })
    return 'updated'
  }
  return 'user-modified'
}

function pickRecord(
  record: Record<string, string | number | null | undefined>,
  columns: string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const c of columns) out[c] = record[c] ?? null
  return out
}

function keyParams(
  spec: SeedMergeSpec,
  record: SeedRecord,
): Record<string, string | number | null> {
  const out: Record<string, string | number | null> = {}
  for (const c of spec.keyColumns) out[c] = record[c] ?? null
  return out
}
