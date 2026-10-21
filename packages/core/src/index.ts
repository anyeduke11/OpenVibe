export { M9_FIXTURES, M9_FIXTURE_NAMES, type M9FixtureName } from "./fixtures/m9"
// packages/core —— 领域核心：db / repos / search（R3：禁止依赖任何 app）
export { openDatabase, defaultDbPath, openvibeHome, type SqliteDatabase } from './db'
export { migrate, nowIso } from './db/runner'
export { runSeed, applyTermAnnotations, type SeedBundleResult } from './db/seed'
export {
  searchPromptRowids,
  searchTermRowids,
  searchPlaybookRowids,
  ftsPhrase,
  type TermSearchHit,
  type PlaybookSearchHit,
} from './search/fts'
export {
  computeDirHash,
  parseSkillFrontmatter,
  defaultScanRoots,
  discoverSkillRoots,
  zcodePluginSkillRoots,
  hashSkillEntries,
  skillNameIssue,
  suggestSkillName,
  reviewSkill,
  SkillsRepo,
} from './repos/skills'
export { PromptsRepo } from './repos/prompts'
export { TermsRepo } from './repos/terms'
export { PlaybooksRepo } from './repos/playbooks'
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
export { AgentIngestRepo, type AgentIngest, type IngestInput, type IngestOutcome } from './repos/agentIngest'
export { LocalEventsRepo, dayOf, type LocalEventInput, type LocalEventSummary } from './repos/localEvents'
/* --- 服务层（service-layer.md 第五个服务；写入点集中在此，不散落 route）--- */
export { createAgentService, AGENT_BATCH_LIMITS, type AgentServiceDeps, type IngestBatchResult } from './services/agentService'
export { createContextService, type ContextServiceDeps } from './services/contextService'
export { createTermRecommendService, type TermRecommendDeps } from './services/termRecommendService'
export { createCommandRunService, CLI_COMMAND_RUN_COMMANDS, CLI_COMMAND_RUN_PAYLOAD_KEYS, type CliCommandRunCommand, type CommandRunInput, type CommandRunServiceDeps } from './services/commandRunService'
export { assembleAiCallPayload, toRelativePath, PayloadAssemblyError, type AssembleOpts, type AiCallPayload, type SourceFragment } from './services/m9-payload'
// P1.10 · DL-03 停更源标记 —— **采集脚本也用它**（scripts/ 走 @openvibe/core 导入）
// ⇒ 新鲜度标记的**算法只有一处**，采集脚本与守卫不会各算各的。
export {
  computeFreshness,
  yearsText,
  parseSpecStaleSources,
  readSpecStaleSources,
  specSourceNameToKey,
  validateFreshness,
  scanSourceFreshness,
  STALE_SOURCE_KEYS,
  type SourceFreshness,
  type FreshnessRule,
  type FreshnessViolation,
} from './db/m9-source-freshness'
// P1b · spec §1.6.1 口径读取器 —— **提取脚本与单测共用同一份解析**
// ⇒ 文档与实跑的对照不会「两边错得一模一样」（那会让对账闸变成同义反复）。
export {
  parseSpecResourceCounts,
  specSection161,
  type SpecResourceCounts,
  type SpecCategoryCount,
} from './db/m9-p1b-spec'
// P1b · 必要性矩阵（DL-48）—— **提取脚本与单测共用同一份解析**
export {
  parseNecRule,
  parseSpecDistribution,
  parseSpecNecDistribution,
  necessaryFor,
  computeDistribution,
  verifyNecessity,
  LANG_PROFILES,
  RESOURCE_TIERS,
  MAIN_RESOURCE_TIERS,
  TIER_LEGEND,
  NECESSITY_LABEL,
  type LangProfile,
  type ResourceTier,
  type MainResourceTier,
  type Necessity,
  type NecRule,
  type NecDistribution,
  type SpecNec,
  type NecRuleViolation,
} from './db/m9-p1b-necessity'
// P1b · 资源层种子导入器 —— **巡检脚本的 --seed 走它**（口径只留一处）
export {
  seedLangResources,
  seedLangVibeResources,
  seedLangTopicResources,
  seedLangResourceLayer,
  type M9ResourceSeedResult,
} from './db/m9-p1b-seed-resources'
// P1 · 知识点种子导入器 —— 巡检脚本 --seed 时用它（挂接行引用知识点）
export { seedLangTopics, type M9SeedBundleResult } from './db/m9-p1-seed-lang-topics'
// P1b/P1c · 失效巡检的**状态机**（§3.14 写死的那三行）—— 唯一出处
export {
  FAIL_THRESHOLD,
  livenessOf,
  planProbeTargets,
  applyProbeOutcome,
  runResourceProbe,
  PROBE_TABLE_NAMES,
  type Liveness,
  type ProbeTableName,
  type ProbeTarget,
  type ProbeTransport,
  type ProbeRequest,
  type ProbeResponse,
  type ResourceProbeState,
} from './db/m9-p1b-probe'
// P1c · 失效巡检的**执行侧**（真出网 HEAD ＋ 两表去重 ＋ 报告/判定）
export {
  headStatusCode,
  createHeadTransport,
  planLinkTargets,
  runLinkProbe,
  verdictOf,
  isOutdatedTier,
  verifyLinkProbeRun,
  DEFAULT_HEAD_TIMEOUT_MS,
  PROBE_USER_AGENT,
  OUTDATED_TIER,
  type LinkRowRef,
  type LinkTarget,
  type LinkTargetReport,
  type LinkProbeReport,
  type LinkProbeRule,
  type LinkProbeViolation,
  type LinkVerdict,
} from './db/m9-p1c-links'
// ⚠️ **M9 v1.6 P1d · 三模式层** —— 模式层的口径、装载器与两条守卫
export {
  assignTopicProfiles,
  vibeMinutesBySlug,
  vibeTotalMinutes,
  COLD_TIER_TOPICS,
  VIBE_ABILITY_LABELS,
  VIBE_ABILITY_MAP,
  PROFILE_DEPTH,
  type ModeTopic,
  type TopicProfileRow,
  type VibeEntry,
} from './db/m9-p1d-mode-assign'
export {
  seedProfiles,
  seedProfilePhases,
  seedTopicProfiles,
  type M9ProfileSeedResult,
} from './db/m9-p1d-seed-profiles'
export { readStageTracks } from './db/m9-p1f-stage-tracks'
export { type StageTrackRow } from './db/m9-p1f-stage-guards'
export {
  findLayeringViolations,
  findEmptyRequiredViolations,
  findEstMinutesViolations,
  type ProfileGuardRow,
} from './db/m9-p1d-profile-guards'
export {
  findStagePhaseArtifacts,
  checkNoMappingStatementsStillThere,
  type StagePhaseGuardOptions,
  type StagePhaseViolation,
} from './db/m9-p1d-stage-phase-guard'
export {
  parseSpecPhaseRows,
  parseSpecVibeStatic,
  tallyOutcomePrefixes,
  checkNoMappingStatements,
  specSection3171,
  type SpecPhaseRow,
  type SpecVibeStatic,
  type OutcomePrefixTally,
  type NoMappingCheck,
} from './db/m9-p1d-spec'
export {
  VIBE_ABILITIES,
  VIBE_MINIMAL_KNOWLEDGE,
  VIBE_WORKFLOW,
  VIBE_PITFALLS,
  VIBE_EMPTY_STATE_TEXT,
  VIBE_STATIC_BLOCK_SIZES,
  type VibeAbility,
  type MinimalKnowledgeItem,
  type VibeWorkflowStep,
  type VibePitfall,
} from './db/m9-vibe-static'
export {
  createPackService,
  type PackServiceDeps,
  type ExportWithRecordInput,
} from './services/packService'
export {
  decideInjections,
  planDecideApply,
  InjectError,
  type AskFn as InjectAskFn,
  type DecideOptions,
  type PlanDecideApplyInput,
  type PlanDecideApplyResult,
} from './services/injectService'
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
  estimateBundle,
  estimateTokens,
  SIZE_WARN_THRESHOLD,
  type AdapterBundle,
  type ComposeDeps,
  type RenderedPack,
  type PackDefinition,
  type ResolveDeps,
  type TokenEstimate,
} from './pack'
export {
  // 注入侧内核（m6b）：安全校验 → 五状态规划 → lock 装配
  auditLockPaths,
  checkPackInjectable,
  checkWritePath,
  resolveWriteTarget,
  planInjection,
  applyDecisions,
  strategyToDecisions,
  diffPackLock,
  summarizeDiff,
  buildPackLock,
  packLockJson,
  parsePackLock,
  PACK_BACKUP_REL,
  RETIREMENT_STATES,
  planRetirement,
  type RetirementAction,
  type RetirementFile,
  type RetirementInput,
  type RetirementPlan,
  type RetirementState,
  // 一致性比对的单一规则与单一状态词表（service-layer.md FR-2）
  CONSISTENCY_STATES,
  verifyAgainstLock,
  type ConsistencyFile,
  type ConsistencyState,
  type DeclaredFile,
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
export {
  // 并发注入互斥（T8e）：CLI 抢锁，抢不到让路
  SYNC_LOCK_REL,
  SYNC_LOCK_STALE_MS,
  tryAcquireSyncLock,
  type SyncLockAcquire,
  type SyncLockBusyReason,
  type SyncLockDeps,
  type SyncLockHandle,
  type SyncLockHolder,
} from './inject'
export {
  // 落盘的「只动这一个目录项」保证：硬链接不换成拒绝，换成解链后新建
  writeReplacingLinks,
  type ReplaceLinkWrite,
} from './inject'

export {
  readRoadmap,
  readTopicDetail,
  readStates,
  CONCEPT_MOUNT_PREFIX,
  type TopicDetailRow,
} from './db/m9-roadmap-read'

export {
  scanProjectSource,
  modeOf,
  splitByConfidence,
  type ScanProjectOptions,
} from './source-scan/scan'

export {
  detectGoToolchain,
  ensureGoHelper,
  scanGoHeuristic,
  scanGoParser,
  type GoHit,
  type GoScanOutput,
  type GoToolchain,
} from './source-scan/go-scanner'

export {
  scanPython,
  parseNodeSpec,
  SourceScanError,
  type PythonSpec,
  type PythonHit,
  type PythonScanOutput,
} from './source-scan/python-scanner'

export {
  listSourceFiles,
  SCAN_SKIP_DIRS,
  DEFAULT_MAX_FILES,
  type FileListing,
} from './source-scan/files'

export { stripGoComments } from './source-scan/go-comments'
export { breSafePattern, resolvePatternText } from './source-scan/pattern-text'
export { runWithStdin, type RunResult } from './source-scan/run-with-stdin'

export {
  saveFindings,
  readFindings,
  findingsToEvidence,
  readConsent,
  readAllConsents,
  setConsent,
  clearConsent,
  recordShare,
  readShares,
  readShareSummary,
  buildExportText,
  type ConsentRow,
  type FindingRow,
  type FindingRowInput,
  type SaveFindingsResult,
  type ShareRow,
  type ShareSummaryRow,
} from './db/m9-source-scan'

// ── M9 P1e / P1f 的读端（模式表 + 资源挂接反查 + 点亮的知识点）────────────
export {
  readLitTopicIds,
  readResourcesWithTopics,
  readTopicProfiles,
  readTopicStages,
  type ResourceWithTopics,
} from './db/m9-mode-read'

export {
  runProjectScan,
  exportFindingsText,
  readProjectRoot,
  SourceServiceError,
  type ScanServiceResult,
} from './services/m9-source-service'

// ── M9 P5 · T2 源码解读（runner 契约 ＋ 装配 ＋ 分歧 ＋ 台账）────────────────
export {
  CommandInterpretRunner,
  InterpretRunnerError,
  INTERPRET_STATUS_LABELS,
  commandExists,
  runnerFromEnv,
  type CommandRunnerOptions,
  type InterpretFailureReason,
  type SourceInterpretRunner,
} from './source-ai/runner'

export {
  EXTERNAL_PATH_PLACEHOLDER,
  PROJECT_ROOT_PLACEHOLDER,
  hasAbsolutePath,
  redactAbsolutePaths,
} from './source-ai/redact'

export {
  SNIPPET_CONTEXT_LINES,
  SNIPPET_MAX_BYTES,
  SNIPPET_MAX_FILES,
  SNIPPET_MAX_LINES,
  readSnippet,
  readSnippets,
  type SnippetReadResult,
  type SnippetWindow,
} from './source-ai/snippet'

export {
  assembleInterpretRequest,
  type AssembleInterpretOptions,
  type InterpretCandidate,
} from './source-ai/assemble'

export { divergenceText, findDivergences } from './source-ai/divergence'

export {
  formatInterpretMarkdown,
  type ExportInterpretOptions,
} from './source-ai/export'

export {
  fingerprintRequest,
  recordInterpretCall,
  type InterpretCallRecord,
} from './source-ai/ledger'

export {
  interpretCapability,
  interpretSourceFindings,
  type InterpretOptions,
} from './source-ai/interpret-service'

export const CORE_VERSION = '0.0.0'
