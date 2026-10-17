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
/**
 * 术语难度（m3-terms-learning FR-1.2）：L1 入门 / L2 进阶 / L3 深入。
 * ⚠️ 本数组的三个字面量必须与 `packages/core/src/db/migrations/0008_terms_learning.sql`
 * 里 `level` 的 CHECK 字面量**逐字相同**，由 core-db 同族测试解析该文件比对。
 */
export const TERM_LEVELS = ['L1', 'L2', 'L3'] as const
export type TermLevel = (typeof TERM_LEVELS)[number]
/**
 * 术语领域（FR-3.1）：**直接复用 vibe-hub 既成的 tags[0] 词表，不新造** ——
 * 造两套的结果就是两套都对不上。用于筛选条与卡片的枚举，不是 DB 约束：
 * `terms.domain` 列刻意不设 CHECK（理由见 0008 迁移注释），口径靠写入边界的 Zod 收口。
 */
export const TERM_DOMAINS = ['前端', '后端', 'AI', '产品', '测试', '技术栈', 'Git', '设计风格'] as const
export type TermDomain = (typeof TERM_DOMAINS)[number]
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

/**
 * 台账事件的 `payload_json` **形状**（`m8-agent-bridge.md` FR-5.1.1）。
 *
 * **这是键与类型的唯一出处** —— 键集由它派生（`AGENT_PAYLOAD_KEYS`），类型也由它给出。
 * ⚠️ 刻意**不做成两张表**：键与类型同属一份契约，分成两张就等于把「改了键忘了改类型」
 * 重新变成一种可能 —— 而值类型恰恰是键名判据**看不见**的那一半（2026-10-17 实测：
 * `agent_context_served.truncated` 规格写 bool、实现写数字，键名一致 ⇒ 所有既有守卫全绿）。
 */
const AGENT_PAYLOAD_SHAPE = {
  agent_ingest_accepted: { kind: 'string', sourcePlatform: 'string' },
  agent_ingest_rejected: { kind: 'string', reasonCode: 'string' },
  /** ⚠️ `truncated` 是**计数**（`TruncationNote[]` 的 `.length`），不是 bool —— owner 2026-10-17 裁定 */
  agent_context_served: { fieldsCount: 'number', truncated: 'number', platform: 'string' },
  cli_agent_command_run: { command: 'string', exitCode: 'number', agent: 'string' },
  /** 声明态：写入点属 M8-A（Phase 2），本轮无生产写入点 */
  agent_bridge_installed: { adapter: 'string', packVersion: 'string' },
} as const

/** 台账 payload 允许的值类型 */
export type AgentPayloadValueType = 'string' | 'number' | 'boolean'

export const AGENT_PAYLOAD_TYPES = AGENT_PAYLOAD_SHAPE as unknown as Record<
  string,
  Record<string, AgentPayloadValueType>
>

/** 台账事件的 `payload_json` **允许键闭集**（由上面的形状派生） */
export const AGENT_PAYLOAD_KEYS = Object.fromEntries(
  Object.entries(AGENT_PAYLOAD_SHAPE).map(([k, v]) => [k, Object.keys(v).sort()]),
) as unknown as { readonly [K in keyof typeof AGENT_PAYLOAD_SHAPE]: readonly string[] }

/**
 * 2026-10-17 实测的三个结构问题，此处逐一登记（理由详见 dev-plan §4.2 的 DEV-0109）：
 *
 * ## 1. 为什么收在这里，而不是跟着各自的 service 走
 *
 * 此前这三张表散在三个地方 —— `agentService` 一张（**且零消费者**）、`commandRunService`
 * 一张、`contextService` 根本没有。而三处测试各自**硬编码**键名，于是「规格说五类、
 * 代码只验一类」能长期绿着。改规格不会红、改代码也不会红。
 *
 * ## 2. 「闭集」是等式不是包含
 *
 * 写入点按白名单构造、不 spread 入参 ⇒ 实际键集**恰好等于**表内那一组。
 * 故测试断言用 `toEqual` 而非 `toContain`：写成包含关系时，多出一个键仍会绿，
 * 而多出的键正是 `payload` 里混进业务数据的入口。
 *
 * ## 3. 键名一律 camelCase（口径已对齐）
 *
 * 历史：FR-5.1.1 初版原文写的是 snake_case（`exit_code` / `source_platform` /
 * `reason_code`），与仓内全部实现相反。**2026-10-15 已以实现为准把 spec 改成 camelCase**，
 * 故此处不再有「规格待对齐」这回事 —— ⚠️ 下一轮若再看到有注释声称「spec 仍写 snake_case、
 * 待对齐」，那是**陈述性腐烂**，不是新的债：以本表为准。
 *
 * ⚠️ `agent_bridge_installed` 属**半落地态**（2026-10-17 更新）——服务层写入点已存在
 *   （`packages/core/src/services/bridgeInstallService.ts`，含 PRD §6.4 的去重键与本表的键闭集，
 *   18 支单测 ＋ 双向变异实测），但**触发条件仍未接线**。
 *   PRD 的触发点是「检测到项目内存在 skill 目录」，而 skill 目录的**目录名与格式**正是 M8-A
 *   未闭合的形态三问之一（`m8-agent-bridge.md:51` 登记：核心形态取决于 Trae/CodeBuddy 的
 *   skill 发现约定，而该约定的**运行半边未经真机核验** —— 即探针 Q3/Q4，至今全空）。
 *   在那两问闭合前没有任何代码知道「skill 目录」长什么样，硬造触发点等于凭空发明约定。
 *   故此处登记形状，**当前仍无生产调用方**。
 */
export type AgentPayloadKind = keyof typeof AGENT_PAYLOAD_SHAPE


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
   * （packTotalMaxBytes 同值）——不是照抄，是上面两值的相乘约束。
   *
   * ⚠️ **这是「域内」口径，与传输层口径不是同一个数**（m8-agent-bridge.md FR-2.6.2）。
   * 传输层量的是整个序列化请求包的 `content-length`，本值量的是**各条 payload 字节数之和**，
   * 差额来自包封层（`projectId` / `items` 数组 / 每条的 `kind`+`idempotencyKey`+`sourcePlatform`
   * 键名与引号），且 `idempotencyKey` 的 schema 只有 `min(1)`、**无上限**
   * （`schemas/agent.ts`），键可以任意长。
   *
   * **2026-10-15 更新**：本值此前经 HTTP **永远触达不到** —— `app.ts` 不设 `bodyLimit`，
   * Fastify 默认 1 MB，请求在到达服务层前就被 413 拒掉。owner 已裁「抬」，现按**端点**放宽：
   * `POST /api/agent/ingest` 单条路由带 `bodyLimit = 8 MiB`（域内 2 MiB 的 4 倍，
   * 覆盖实测的包封层开销），**其余端点仍保持 1 MB**。⇒ 本值**第一次真正经由 HTTP 生效**。
   *
   * ⛔ **不要据此认为「agent 可以推 2 MB」**：8 MiB 是**传输层**余量，本值才是**域内**规则，
   * 超本值的批次由服务层逐条裁决（见 FR-2.6.2 与 FR-2.7）。
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
