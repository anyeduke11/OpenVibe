import type { SqliteDatabase } from '../db'
import {
  listAgentRegistry,
  listProbeTargets,
  seedOnce,
  writeHealth,
  type AgentHealth,
  type AgentRegistryEntry,
} from '../repos/agentRegistry'

/**
 * agent 注册表服务（v0.3.0 FR-3.0-1 最小只读版）。
 *
 * 三条纪律：
 * 1. **健康检查只判「在不在」，不判「能不能用」**——能跑 `--help` 不等于能跑完任务；
 *    后者要真机探针（L1），属 V-1 出口的验收，不在本服务里假装。
 * 2. **探测失败只归档，不删行**（理由见 repo 头注）。
 * 3. **探测成功不复活归档项**——iFlow 停服是产品事实，与本机是否恰好装了同名命令无关。
 *
 * 注入点：probe 与 now 都由调用方给。测试里用假探测跑通全分支，不依赖本机装了什么。
 */

export interface AgentRegistryDeps {
  now?: () => string
  /**
   * 探测实现**必填**：服务层禁止 import 子进程（ESLint R5）。
   * 默认的 `which` 实现在传输层 `apps/server/src/lib/agent-probe.ts`。
   */
  probe: (executable: string) => boolean
}

export interface HealthCheckResult {
  checked: number
  /** 本次由非 missing 变为 missing 的条目 */
  newlyMissing: string[]
  /** 本次首次探测成功（unverified → ok）的条目 */
  newlyOk: string[]
}

export interface AgentRegistryService {
  listAgents(includeArchived?: boolean): AgentRegistryEntry[]
  checkHealth(): HealthCheckResult
}

export function createAgentRegistryService(
  db: SqliteDatabase,
  deps: AgentRegistryDeps,
): AgentRegistryService {
  const now = deps.now ?? (() => new Date().toISOString())
  const probe = deps.probe

  function ensureSeeded(): void {
    // 以 seed_registry 登记位为准：用户删光条目不复活（理由见 repo 的 seedOnce）
    seedOnce(db, now())
  }

  return {
    listAgents(includeArchived = true) {
      ensureSeeded()
      return listAgentRegistry(db, includeArchived)
    },

    checkHealth() {
      ensureSeeded()
      const result: HealthCheckResult = { checked: 0, newlyMissing: [], newlyOk: [] }
      for (const target of listProbeTargets(db)) {
        result.checked += 1
        const nextHealth: AgentHealth =
          target.executable === null ? 'unverified' : probe(target.executable) ? 'ok' : 'missing'
        writeHealth(db, target.id, nextHealth, nextHealth === 'missing', now())
        if (nextHealth === 'missing') result.newlyMissing.push(target.id)
        if (nextHealth === 'ok') result.newlyOk.push(target.id)
      }
      return result
    },
  }
}
