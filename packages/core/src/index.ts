// packages/core —— 领域核心：db / repos / search（R3：禁止依赖任何 app）
export { openDatabase, defaultDbPath, openvibeHome, type SqliteDatabase } from './db'
export { migrate, nowIso } from './db/runner'
export { runSeed, type SeedBundleResult } from './db/seed'
export { searchPromptRowids, searchTermRowids, ftsPhrase, type TermSearchHit } from './search/fts'
export { computeDirHash, parseSkillFrontmatter, defaultScanRoots, SkillsRepo } from './repos/skills'
export { PromptsRepo } from './repos/prompts'
export { TermsRepo } from './repos/terms'
export { FlowTemplatesRepo } from './repos/flows'
export { ProjectsRepo, type ProjectHealthSummary } from './repos/projects'
export { TasksRepo } from './repos/tasks'
export { DevLogRepo } from './repos/devlog'
export {
  checkLocalPath,
  readInjectionStatus,
  PACK_LOCK_REL,
  type LocalPathCheck,
} from './local/lock'
export { PacksRepo } from './repos/packs'
export { AppMetaRepo, APP_META_KEYS } from './repos/appMeta'
export {
  TelemetryRepo,
  type TelemetryEnqueueInput,
  type TelemetryOs,
  type TelemetryQueuedEvent,
} from './repos/telemetry'
export {
  parseImportFiles,
  parsePromptJsonExport,
  parseRuleFile,
  parseMarkdownFile,
  stripFrontmatter,
  isRuleFile,
  type ImportFile,
} from './importers'
export { sha256Hex, stableJson } from './repos/util'
export {
  composePack,
  resolvePack,
  fileSha256,
  fingerprintOf,
  validatePackFiles,
  buildBundle,
  bundleFileName,
  bundleJson,
  directoryFileName,
  directoryFiles,
  type AdapterBundle,
  type ComposeDeps,
  type RenderedPack,
  type PackDefinition,
  type ResolveDeps,
} from './pack'
export {
  // 注入侧内核（m6b）：安全校验 → 五状态规划 → lock 装配
  checkPackInjectable,
  checkWritePath,
  resolveWriteTarget,
  planInjection,
  applyDecisions,
  strategyToDecisions,
  diffPackLock,
  buildPackLock,
  packLockJson,
  parsePackLock,
  PACK_BACKUP_REL,
  INJECT_STATUSES,
  INJECT_DECISIONS,
  type InjectPackFile,
  type InjectablePack,
  type InjectionViolations,
  type PathCheck,
  type SecurityDeps,
  type PackFileWithHash,
  type PlanInput,
  type InjectPlan,
  type InjectPlanFile,
  type InjectStatus,
  type InjectDecision,
  type InjectAction,
  type InjectWrite,
  type InjectSkip,
  type ApplyResult,
  type DiffResult,
  type BuildLockInput,
} from './inject'

export const CORE_VERSION = '0.0.0'
