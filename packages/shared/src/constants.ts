/** 当前标准包契约 schemaVersion（design §7 v1.3，A 级变更红线） */
export const SCHEMA_VERSION = 1 as const

export const APP_NAME = 'openvibe' as const
export const APP_ID = 'openvibe-cli' as const
export const DEFAULT_PORT = 8787

/** 专用 adapter（design §8 v1.3 冻结：MVP 六个） */
export const ADAPTER_IDS = [
  'claude-code',
  'cursor',
  'generic-agents',
  'codebuddy',
  'trae',
  'minicode',
] as const
export type AdapterId = (typeof ADAPTER_IDS)[number]

/** P1 可选 adapter（design §8 表，MVP 不实现） */
export const ADAPTER_IDS_P1 = ['windsurf', 'gemini', 'copilot'] as const

/** 提示词平台标记枚举（m1 §3，与 adapter 清单对齐；兼容平台用 generic 覆盖） */
export const PLATFORM_MARKS = [
  'claude-code',
  'cursor',
  'codebuddy',
  'trae',
  'minicode',
  'windsurf',
  'codex',
  'generic',
] as const
export type PlatformMark = (typeof PLATFORM_MARKS)[number]

/** 种子内容受控标签词表·八类（seed-content §5，种子词条强制） */
export const CONTROLLED_TAG_VOCAB = [
  '基础概念',
  '方法论',
  '工具平台',
  '质量工程',
  '协作流程',
  '风险陷阱',
  '提示工程',
  '数据与存储',
] as const
export type ControlledTag = (typeof CONTROLLED_TAG_VOCAB)[number]

export const USE_AS = ['rule', 'reference'] as const
export type UseAs = (typeof USE_AS)[number]

export const PROMPT_STATUS = ['draft', 'active', 'deprecated'] as const
export const TERM_STATUS = ['draft', 'active'] as const
export const PROJECT_STATUS = ['active', 'paused', 'archived'] as const
export const TASK_STATUS = ['todo', 'doing', 'done'] as const
export const FLOW_KINDS = ['light', 'spec_driven', 'retro', 'custom'] as const
export type FlowKind = (typeof FLOW_KINDS)[number]

export const DEVLOG_TYPES = ['DEV', 'CHECK'] as const
export const EXPORT_CHANNELS = ['download', 'directory'] as const
export const SKILL_SOURCES = ['local', 'manual'] as const

/** 遥测事件白名单·仅三类（design §11.5，D3/D13） */
export const TELEMETRY_EVENTS = ['pack_injected', 'flow_template_used', 'project_active'] as const
export type TelemetryEvent = (typeof TELEMETRY_EVENTS)[number]

export const TELEMETRY_ASK_STATES = ['unset', 'accepted', 'declined'] as const
export type TelemetryAskState = (typeof TELEMETRY_ASK_STATES)[number]

/** 字段与规模限制（各 spec 边界节 + design §7.7 的单一出处） */
export const LIMITS = {
  promptTitleMax: 200,
  promptDescriptionMax: 500,
  promptContentMaxBytes: 512 * 1024,
  termZhMax: 100,
  termEnMax: 100,
  termDefinitionMaxBytes: 4 * 1024,
  termExampleMaxBytes: 2 * 1024,
  projectNameMax: 100,
  packNameMax: 64,
  pathSegmentMax: 128,
  pathTotalMax: 255,
  packFileCountMax: 200,
  singleFileMaxBytes: 512 * 1024,
  packTotalMaxBytes: 2 * 1024 * 1024,
  listPageSizeMax: 200,
  listPageSizeDefault: 50,
} as const

/** ID 前缀（design D12：前缀 + nanoid，日志与外键肉眼可辨） */
export const ID_PREFIXES = {
  prompt: 'prm_',
  promptVersion: 'pvr_',
  skill: 'sk_',
  skillVersion: 'skv_',
  term: 'trm_',
  flowTemplate: 'flw_',
  project: 'prj_',
  checkState: 'cks_',
  task: 'tsk_',
  devLog: 'log_',
  pack: 'pk_',
  packExport: 'pex_',
  injection: 'inj_',
} as const
export type IdKind = keyof typeof ID_PREFIXES
