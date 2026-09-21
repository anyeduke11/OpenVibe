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
export { checkLocalPath, readInjectionStatus, PACK_LOCK_REL, type LocalPathCheck } from './local/lock'
export { PacksRepo } from './repos/packs'
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

export const CORE_VERSION = '0.0.0'
