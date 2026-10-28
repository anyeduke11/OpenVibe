// packages/core/src/inject —— 注入侧领域逻辑（m6b CLI 的三块内核：安全校验 / 五状态规划 / lock 装配）。
// CLI 只负责传输、交互与文件 IO；状态机与防线在这里，dry-run 的零写入因此可被结构性证明（design §9）。
export { writeReplacingLinks, type ReplaceLinkWrite } from './atomic-write'
export {
  auditLockPaths,
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
  // 三处 sha 比对合一后的唯一规则（service-layer.md FR-2）
  CONSISTENCY_STATES,
  verifyAgainstLock,
  type ConsistencyFile,
  type ConsistencyState,
  type DeclaredFile,
} from './consistency'
export {
  // 三方一致性核验的六态判定（v0.2.3 批次 B FR-4）
  planVerify,
  type VerifyPlan,
  type VerifyPlanInput,
  type VerifyState,
} from './verify'
export {
  // 段级差异报告（v0.2.3 批次 C RQ4，只读；写入行为与五状态判定不动）
  diffSections,
  type SectionDiffResult,
  type SectionRegion,
} from './section-diff'
export {
  INJECT_STATUSES,
  INJECT_DECISIONS,
  planInjection,
  applyDecisions,
  strategyToDecisions,
  diffPackLock,
  summarizeDiff,
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
