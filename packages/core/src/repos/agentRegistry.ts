import type { SqliteDatabase } from '../db'
import { seedRegistryUpsert } from '../db/seed-registry'
import { AGENT_REGISTRY_SEEDS } from '../db/seed-agent-registry'

/**
 * agent 注册表的读取与健康回写（v0.3.0 FR-3.0-1）。
 *
 * 边界（为什么这些不做）：
 * - **不删行**：健康检查失败的条目只置 archived=1。iFlow 的停服记录必须留下，
 *   否则「曾经登记过什么」永久丢失。
 * - **不自动复活**：探测成功的条目**不会**自动把 archived 置回 0。
 *   停服/改名是产品事实，不是本机事实；复活必须由人显式操作。
 * - **不在这里读文件系统**：探测函数由调用方注入（service 层负责），
 *   repo 只做 SQL —— 与既有 repos 的分层一致。
 */

export type AgentHealth = 'ok' | 'missing' | 'unverified'

type AgentRegistryRow = {
  id: string
  display_name: string
  executable: string | null
  headless_flag: string | null
  resume_flag: string | null
  json_flag: string | null
  capabilities_json: string
  health: string
  archived: number
  quota_limit: number | null
  quota_cost: number | null
  last_checked_at: string | null
}

export interface AgentRegistryEntry {
  id: string
  displayName: string
  executable: string | null
  headlessFlag: string | null
  resumeFlag: string | null
  jsonFlag: string | null
  capabilities: Record<string, string>
  health: AgentHealth
  archived: boolean
  quotaLimit: number | null
  quotaCost: number | null
  lastCheckedAt: string | null
}

function toEntry(row: AgentRegistryRow): AgentRegistryEntry {
  let capabilities: Record<string, string> = {}
  try {
    const parsed: unknown = JSON.parse(row.capabilities_json)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      capabilities = parsed as Record<string, string>
    }
  } catch {
    // 坏 JSON 不阻断列表：能力声明缺失是可降级的（capability negotiation 语义）
  }
  return {
    id: row.id,
    displayName: row.display_name,
    executable: row.executable,
    headlessFlag: row.headless_flag,
    resumeFlag: row.resume_flag,
    jsonFlag: row.json_flag,
    capabilities,
    health: row.health as AgentHealth,
    archived: row.archived === 1,
    quotaLimit: row.quota_limit,
    quotaCost: row.quota_cost,
    lastCheckedAt: row.last_checked_at,
  }
}

export function listAgentRegistry(
  db: SqliteDatabase,
  includeArchived: boolean,
): AgentRegistryEntry[] {
  // 按「未归档在前、再按 id」排：列表默认语义是「现在能用谁」
  const sql = includeArchived
    ? `SELECT * FROM agent_registry ORDER BY archived ASC, id ASC`
    : `SELECT * FROM agent_registry WHERE archived = 0 ORDER BY id ASC`
  return (db.prepare(sql).all() as AgentRegistryRow[]).map(toEntry)
}

export function countAgentRegistry(db: SqliteDatabase): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM agent_registry`).get() as { n: number }
  return row.n
}

/** 读当前 executable，健康检查据此判断是否需要探测 */
export function listProbeTargets(
  db: SqliteDatabase,
): Array<{ id: string; executable: string | null }> {
  return db.prepare(`SELECT id, executable FROM agent_registry ORDER BY id ASC`).all() as Array<{
    id: string
    executable: string | null
  }>
}

export function writeHealth(
  db: SqliteDatabase,
  id: string,
  health: AgentHealth,
  archive: boolean,
  now: string,
): void {
  db.prepare(
    `UPDATE agent_registry
        SET health = ?, archived = CASE WHEN ? THEN 1 ELSE archived END,
            last_checked_at = ?, updated_at = ?
      WHERE id = ?`,
  ).run(health, archive ? 1 : 0, now, now, id)
}

/** 播种登记用的 bundle 名（与 seed_registry 同表，语义见 db/seed-registry.ts） */
const SEED_BUNDLE = 'agent_registry'

/**
 * 只播种一次：以 seed_registry 的登记为准，而不是「表是否为空」。
 *
 * 为什么不用 `COUNT(*) === 0` 判：用户删光全部条目是一个**合法操作**（他不想要注册表），
 * 空表判据会让下次读取把它们全部复活。seed_registry 的登记位才是「播种过没有」的单一事实源。
 */
export function seedOnce(db: SqliteDatabase, now: string): number {
  const hit = db.prepare(`SELECT 1 AS hit FROM seed_registry WHERE bundle = ?`).get(SEED_BUNDLE)
  if (hit) return 0
  const insert = db.prepare(
    `INSERT INTO agent_registry (
       id, display_name, executable, headless_flag, resume_flag, json_flag,
       capabilities_json, health, archived, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, 'unverified', ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  )
  let inserted = 0
  for (const seed of AGENT_REGISTRY_SEEDS) {
    inserted += insert.run(
      seed.id,
      seed.displayName,
      seed.executable,
      seed.headlessFlag,
      seed.resumeFlag,
      seed.jsonFlag,
      JSON.stringify(seed.capabilities),
      seed.archived,
      now,
      now,
    ).changes
  }
  seedRegistryUpsert(db, SEED_BUNDLE, 'v030-fr301-minimal', now)
  return inserted
}
