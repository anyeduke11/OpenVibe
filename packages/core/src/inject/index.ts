// packages/core/src/inject —— 注入侧领域逻辑（m6b CLI 的三块内核：安全校验 / 五状态规划 / lock 装配）。
// CLI 只负责传输、交互与文件 IO；状态机与防线在这里，dry-run 的零写入因此可被结构性证明（design §9）。
export {
  checkPackInjectable,
  checkWritePath,
  resolveWriteTarget,
  type InjectablePack,
  type InjectionViolations,
  type InjectPackFile,
  type PathCheck,
  type SecurityDeps,
} from './security'
export {
  INJECT_STATUSES,
  INJECT_DECISIONS,
  planInjection,
  applyDecisions,
  strategyToDecisions,
  diffPackLock,
  type ApplyResult,
  type DiffResult,
  type InjectAction,
  type InjectDecision,
  type InjectPlan,
  type InjectPlanFile,
  type InjectSkip,
  type InjectStatus,
  type InjectWrite,
  type PackFileWithHash,
  type PlanInput,
} from './planner'
export {
  PACK_BACKUP_REL,
  buildPackLock,
  packLockJson,
  parsePackLock,
  type BuildLockInput,
} from './lock'
export {
  SYNC_LOCK_REL,
  SYNC_LOCK_STALE_MS,
  tryAcquireSyncLock,
  type SyncLockAcquire,
  type SyncLockBusyReason,
  type SyncLockDeps,
  type SyncLockHandle,
  type SyncLockHolder,
} from './sync-lock'
export {
  RETIREMENT_STATES,
  planRetirement,
  type RetirementAction,
  type RetirementFile,
  type RetirementInput,
  type RetirementPlan,
  type RetirementState,
} from './retirement'
