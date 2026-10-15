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
// 术语学习路线（TERM_ROADMAP）在 ./roadmap.ts——constants 被入口 chunk 引用，
// 路线数据只有懒加载的术语视图用，放这里会把 ~1kB 中文数据抬进入口。

export const USE_AS = ['rule', 'reference'] as const
export type UseAs = (typeof USE_AS)[number]

export const PROMPT_STATUS = ['draft', 'active', 'deprecated'] as const
export const TERM_STATUS = ['draft', 'active'] as const
/** m4 §3：published 才是可进包口径（FR-6.2 只渲染 published） */
export const PLAYBOOK_STATUS = ['draft', 'published'] as const
/** TERMS.md 排序口径（m3 FR-4.2）：默认英文 alpha，可选拼音（词典）与手动（选集顺序） */
export const TERMS_ORDER_BY = ['en-alpha', 'pinyin', 'manual'] as const
export type TermsOrderBy = (typeof TERMS_ORDER_BY)[number]
export const PROJECT_STATUS = ['active', 'paused', 'archived'] as const
export type ProjectStatus = (typeof PROJECT_STATUS)[number]
export const TASK_STATUS = ['todo', 'doing', 'done'] as const
export type TaskStatus = (typeof TASK_STATUS)[number]
export const FLOW_KINDS = ['light', 'spec_driven', 'retro', 'custom'] as const
export type FlowKind = (typeof FLOW_KINDS)[number]

export const DEVLOG_TYPES = ['DEV', 'CHECK'] as const
export type DevLogType = (typeof DEVLOG_TYPES)[number]
export const EXPORT_CHANNELS = ['download', 'directory'] as const
/** DEV-0067 起增 github / skillhub 远程源（B 级 additive 枚举扩展，旧消费方需认新值） */
export const SKILL_SOURCES = ['local', 'manual', 'github', 'skillhub'] as const
export type SkillSource = (typeof SKILL_SOURCES)[number]

/** 遥测事件白名单·仅三类（design §11.5，D3/D13） */
export const TELEMETRY_EVENTS = ['pack_injected', 'flow_template_used', 'project_active'] as const
export type TelemetryEvent = (typeof TELEMETRY_EVENTS)[number]

export const TELEMETRY_ASK_STATES = ['unset', 'accepted', 'declined'] as const
export type TelemetryAskState = (typeof TELEMETRY_ASK_STATES)[number]

/** 上报体 os 段只可能是这三值（design §11.5），与 worker 计数维度同源 */
export const TELEMETRY_OS = ['mac', 'linux', 'win'] as const

/* ---------------------------------------------------------------------------
 * 本机事件台账（RF1-5 · local-event-ledger.md FR-2）
 * ⚠️ 与 0007_local_events_and_agent_bridge.sql 的 kind CHECK 字面量**必须逐字相同**，
 *    由 core-db 同族测试解析迁移文本比对（FR-1.4）。遥测那份同样的双源当前无人守，
 *    本项不得再落一个。
 * 与 TELEMETRY_EVENTS 严格不同名，由断言守（FR-2.2）：台账是本机永不出网，
 *    遥测三类默认关 —— 两者混名会让「关了遥测就没记录」这个误解被代码坐实。
 * ------------------------------------------------------------------------- */

/** 台账自身 13 项（FR-2.1 ＝ 分析文十项 ＋ asset_updated / asset_deleted / injection_failed） */
export const LEDGER_EVENT_KINDS = [
  'asset_created',
  'asset_updated',
  'asset_deleted',
  'asset_reflowed',
  'checklist_item_checked',
  'flow_template_run',
  'injection_confirmed',
  'injection_conflict_resolved',
  'injection_failed',
  'pack_composed',
  'pack_exported',
  'stage_advanced',
  'stage_view_switched',
] as const

/** M8 Agent 接入层 5 项（m8-agent-bridge.md FR-5.1） */
export const AGENT_EVENT_KINDS = [
  'agent_ingest_accepted',
  'agent_ingest_rejected',
  'agent_context_served',
  'cli_agent_command_run',
  'agent_bridge_installed',
] as const

/** 台账 kind 全集 18 项 —— 迁移 CHECK 的唯一对照面 */
export const LOCAL_EVENT_KINDS = [...LEDGER_EVENT_KINDS, ...AGENT_EVENT_KINDS] as const
export type LocalEventKind = (typeof LOCAL_EVENT_KINDS)[number]

/** `kind` 与 `day` 的联合索引口径（FR-1.2）；day 落列不现算，照 telemetry_events 先例 */
export const LOCAL_EVENT_INDEXES = ['idx_local_events_kind_day', 'idx_local_events_created_at'] as const

/* ---------------------------------------------------------------------------
 * M8 · 回流写入面（m8-agent-bridge.md FR-2.1）
 * 单一端点 + 五项 kind 闭集，**不按类型开五个端点** —— 五个端点意味着五套鉴权、
 * 五套校验、五套出参断言，而五类数据的差异只在 payload_json 内部。
 * ------------------------------------------------------------------------- */
export const AGENT_INGEST_KINDS = [
  'dev_log',
  'session',
  'requirement',
  'task_status',
  'check_state',
] as const
export type AgentIngestKind = (typeof AGENT_INGEST_KINDS)[number]

/**
 * agent_ingests.status 四态闭集（FR-1.2.3）。
 * ⚠️ **不得引入第五态**（「已过期」等）—— 过期是 created_at + 时间窗的**读侧**判据，
 *    不是存储态。加第五态会让「pending 积压」与「已过期」两个概念挤进一个字符串。
 */
export const AGENT_INGEST_STATUSES = ['pending', 'published', 'rejected', 'conflict'] as const
export type AgentIngestStatus = (typeof AGENT_INGEST_STATUSES)[number]

/** requirements.status 四态（m8-agent-bridge.md FR-1.1a） */
export const REQUIREMENT_STATUSES = ['draft', 'confirmed', 'done', 'dropped'] as const
export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number]

/** requirements.priority 三态（m8-agent-bridge.md FR-1.1a） */
export const REQUIREMENT_PRIORITIES = ['P0', 'P1', 'P2'] as const

/** 回流体量上限（m8-agent-bridge.md FR-2.6，owner 裁③已定三值） */
export const AGENT_INGEST_LIMITS = {
  /** 单条 payload_json 序列化后上限 —— 与 constants.ts 的 singleFileMaxBytes 同族 */
  singleEntryMaxBytes: 512 * 1024,
  /** 单请求条目数 */
  maxEntries: 20,
  /**
   * 单请求总量上限。取 2 MB 是为使「20 × 512 KB」的理论上限**不可能突破整包预算**
   * （packTotalMaxBytes 同值）——不是照抄，是上面两值的相容性约束。
   *
   * ⚠️ **这是「域内」上限，不是「传输层」上限**（m8-agent-bridge.md FR-2.6.2）。
   * server 侧 Fastify 未设 `bodyLimit`，默认 1 MB ⇒ 经 HTTP 的请求在到达服务层前就被 413 拒掉，
   * **本值目前只有绕开传输层（CLI 直调 / 服务层单测）时才吃得到**。
   * 要让 2 MB 真正可达须先裁 `bodyLimit`，见 FR-2.6.2 的处置条。
   */
  requestTotalMaxBytes: 2 * 1024 * 1024,
} as const

export type TelemetryOs = (typeof TELEMETRY_OS)[number]

/** 外发批量口径（dev-plan §4.6：每 60s 一批，每批 ≤100 条） */
export const TELEMETRY_FLUSH_INTERVAL_MS = 60_000
export const TELEMETRY_FLUSH_BATCH = 100

/** 字段与规模限制（各 spec 边界节 + design §7.7 的单一出处） */
export const LIMITS = {
  promptTitleMax: 200,
  promptDescriptionMax: 500,
  promptContentMaxBytes: 512 * 1024,
  termZhMax: 100,
  termEnMax: 100,
  termDefinitionMaxBytes: 4 * 1024,
  termExampleMaxBytes: 2 * 1024,
  // m4 §3 四段全按字节族（owner 2026-10-01 裁 [DEV-0088]）；键名即单位，不留「KB 是字符还是字节」的第二读法
  playbookScenarioMaxBytes: 1024,
  playbookProblemMaxBytes: 1024,
  playbookPracticeMaxBytes: 4 * 1024,
  playbookAntiPracticeMaxBytes: 2 * 1024,
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

/**
 * manifest.pack.generator（design §7.2）。刻意写死而非读 package.json：
 * 该串进入 manifest 因而参与指纹与 golden 快照，必须跨发布字节稳定，只有契约变更才动。
 */
export const PACK_GENERATOR = 'openvibe/0.1.0'

/** ID 前缀（design D12：前缀 + nanoid，日志与外键肉眼可辨） */
export const ID_PREFIXES = {
  prompt: 'prm_',
  promptVersion: 'pvr_',
  skill: 'sk_',
  skillVersion: 'skv_',
  term: 'trm_',
  playbook: 'pbx_',
  flowTemplate: 'flw_',
  project: 'prj_',
  checkState: 'cks_',
  task: 'tsk_',
  devLog: 'log_',
  pack: 'pk_',
  packExport: 'pex_',
  injection: 'inj_',
  /* --- M8 Agent 接入层（0007 迁移新增的三张表；前缀与既有同族，肉眼可辨）--- */
  agentSession: 'asn_',
  agentIngest: 'ain_',
  requirement: 'rqm_',
} as const
export type IdKind = keyof typeof ID_PREFIXES
