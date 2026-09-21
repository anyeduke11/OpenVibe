// packages/core —— 领域核心：db / repos / search（R3：禁止依赖任何 app）
export { openDatabase, defaultDbPath, openvibeHome, type SqliteDatabase } from './db'
export { migrate, nowIso } from './db/runner'
export { runSeed, type SeedBundleResult } from './db/seed'
export {
  searchPromptRowids,
  searchTermRowids,
  ftsPhrase,
  type TermSearchHit,
} from './search/fts'
export {
  computeDirHash,
  parseSkillFrontmatter,
  defaultScanRoots,
  SkillsRepo,
} from './repos/skills'
export { PromptsRepo } from './repos/prompts'
export { TermsRepo } from './repos/terms'
export { FlowTemplatesRepo } from './repos/flows'
export { ProjectsRepo, type ProjectHealthSummary } from './repos/projects'
export { DevLogRepo } from './repos/devlog'
export { PacksRepo } from './repos/packs'
export { sha256Hex, stableJson, compareCodeUnit } from './repos/util'

export const CORE_VERSION = '0.0.0'
