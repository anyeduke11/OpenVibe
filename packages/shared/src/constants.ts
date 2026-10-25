/** 当前标准包契约 schemaVersion（design §7 v1.3，A 级变更红线） */
export const SCHEMA_VERSION = 1 as const

export const APP_NAME = 'openvibe' as const
export const APP_ID = 'openvibe-cli' as const
export const DEFAULT_PORT = 8787

/**
 * 前端唯一约定端口（owner 2026-09-30 定）：dev 与 preview 都锁 5144。
 * strictPort=true → 端口被占时 vite 直接报错退出，绝不静默漂移到 5174 等备用端口；
 * 「禁止使用其他端口」由此机制保证，而不是靠约定。
 *
 * ⚠️ **2026-10-19 从 `apps/web/vite.config.ts` 迁到这里**：原先它只住在 vite 配置里，
 *    于是 server 侧无从知道「用户该打开哪个地址」—— 启动日志只写 API 那个端口，
 *    而浏览器打开它是打不到界面的（那是 API 口）。把常量留在只有 vite 看得见的地方，
 *    等于让「应用入口」这个事实没有可被复用的出处。
 *
 * ⚠️ **但 vite 配置并没有改成 import 这里**（实测起不来，理由见 `apps/web/vite.config.ts`
 *    的同款说明：它由 Node 原生 ESM 加载，而本包的相对导入不带扩展名）。
 *    ⇒ 形态是「**这里为准 ＋ vite 配置那一份被守卫锁死**」，由 `tests/dev-ports.test.ts` 断。
 */
export const WEB_PORT = 5144

/** 两个端口的本机基址 —— 启动横幅与 CLI 文案共用，避免各处拼字符串拼出第三种写法 */
export const LOOPBACK_HOST = '127.0.0.1' as const
export const WEB_URL = `http://${LOOPBACK_HOST}:${WEB_PORT}` as const
export const API_URL = `http://${LOOPBACK_HOST}:${DEFAULT_PORT}` as const

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
const AGENT_CORE_EVENT_KINDS = [
  'agent_ingest_accepted',
  'agent_ingest_rejected',
  'agent_context_served',
  'cli_agent_command_run',
  'agent_bridge_installed',
] as const

/**
 * ⚠️ 声明态：**生产写入点属 P4**（AI 增强层），本轮无写入点，与
 * `agent_bridge_installed` 同形（同样声明在先、写入在后）。
 *
 * ⚠️ 这一项在**单独一个数组**里而不是并进上面的 5 项：CHECK 约束是**有序字面量表**，
 * 迁移 0010 把它放在 M8 五项**之后**。若直接往 `AGENT_EVENT_KINDS` 里 append，
 * 顺序自然也对；但把它单列出来，是为了让「6 项」这个计数变化在 diff 里一眼可见 ——
 * 它正是 §8 待裁第 8 条说的「M8 后续还要扩 kind ⇒ 先合 P5 的 0010」那笔。
 */
export const AGENT_AI_EVENT_KINDS = [
  'ai_recommend_call',
  // M10/D 批次：提取 / 问答出网台账（payload 白名单 9 键，无正文容器）
  'ai_extract_call',
  'ai_discuss_call',
] as const

/**
 * M9 语言学习模块的台账 kind（m9-dev-language-roadmap.md §3.14–§3.16 / §3.17.1 / §3.21）。
 *
 * ⚠️ **本版（v1.6 P0）只是声明 `lang_*` 命名空间**：
 * - SQLite CHECK 约束的实际落地在 P1（迁移 `0011_lang_topics.sql`），**M9 之前不存在
 *   任何 `lang_*` 的写点**，所以本数组在 P0 还不会被任何 `INSERT` 引用。
 * - 落地步骤：P1.1 写迁移 → P1b 写 `LocalEventsRepo`-like 写入点（lang_events_repo）→
 *   这一刻才把 `LANG_EVENT_KINDS` 与 `LOCAL_EVENT_KINDS` 接上。
 *
 * **为什么 P0 就要先声明**：禁列扫描器的覆盖表（`FORBIDDEN_COVERAGE`）必须**预先**
 * 把 lang_* 写点登记进表，否则下一轮写 `lang_*` 的写入点时，覆盖表漏了，扫描器没扫，
 * 没有任何东西会变红 —— 这正是 FR-6.3 守卫当初被复制两份、漂移没人知道的那次教训。
 */
export const LANG_EVENT_KINDS = [
  /** P4 源码扫描的每条命中（`lang_topic_findings` 表对应） */
  'lang_topic_findings',
  /** P4 「记住不发」开关（DL-21：清除后立刻回到全不勾） */
  'lang_source_consent',
  /** P4 每次出网计数（DL-23：consent_source 二分） */
  'lang_source_shares',
  /** P1b 资源失效巡检（DL-30：HEAD only，状态码与计数落库） */
  'lang_resource_probe',
] as const

/** Agent 侧全部 kind（M8 五项 ＋ AI 一项），台账 CHECK 的对照面之一 */
export const AGENT_EVENT_KINDS = [...AGENT_CORE_EVENT_KINDS, ...AGENT_AI_EVENT_KINDS] as const

/**
 * 台账 kind 全集 19 项（13 台账 ＋ 6 Agent）—— 迁移 CHECK 的唯一对照面。
 * ⚠️ 18 → 19 是 **P5 的一笔 CHECK 变更**（FR-9.2），不是顺手加一行常量：
 * SQLite 不能 ALTER CHECK，必须靠迁移 0010 建新表复制数据再换名。
 */
/**
 * 台账 kind 全集 19 → 23 项（M9 加 4 项）。
 *
 * ⚠️ 这是**预声明**（M9 P0）—— P1 之前 `LANG_EVENT_KINDS` 不会被任何 `INSERT` 引用。
 *    SQLite 不能 ALTER CHECK，必须靠迁移 0011 建新表复制数据再换名（M8 那一笔的同款教训）。
 *    **数字变了就开迁移**，不是改个常量就够了。
 */
export const LOCAL_EVENT_KINDS = [
  ...LEDGER_EVENT_KINDS,
  ...AGENT_EVENT_KINDS,
  ...LANG_EVENT_KINDS,
] as const
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
  /**
   * AI 推荐调用留痕（m3-terms-learning FR-9.1）。**⚠️ 键集就是「最小可复盘集」，
   * 一个原文容器都不许有**（FR-9.3）：
   * 画像只留 `inputHash` 指纹，输出只留计数 —— 台账是长期留存表，
   * 落进去一行 checklist 文本就等于在用户没同意的地方长期保存项目内容。
   * 键名由 `AGENT_PAYLOAD_KEYS` 派生并被 `payloadKeys()` 守卫逐键断类型，
   * 所以「多写一个键」在这里过不去。
   */
  ai_recommend_call: {
    aiModel: 'string',
    aiProvider: 'string',
    inputHash: 'string',
    candidateCount: 'number',
    passedCount: 'number',
    droppedCount: 'number',
    result: 'string',
    failureReason: 'string',
    durationMs: 'number',
  },
  // M10/D：提取 / 问答出网台账（与 ai_recommend_call 同形制——指纹 + 计数，无正文容器）
  ai_extract_call: {
    aiModel: 'string',
    aiProvider: 'string',
    inputHash: 'string',
    candidateCount: 'number',
    passedCount: 'number',
    droppedCount: 'number',
    result: 'string',
    failureReason: 'string',
    durationMs: 'number',
  },
  ai_discuss_call: {
    aiModel: 'string',
    aiProvider: 'string',
    inputHash: 'string',
    candidateCount: 'number',
    passedCount: 'number',
    droppedCount: 'number',
    result: 'string',
    failureReason: 'string',
    durationMs: 'number',
  },
} as const

/** 台账 payload 允许的值类型 */
export type AgentPayloadValueType = 'string' | 'number' | 'boolean'

export const AGENT_PAYLOAD_TYPES = AGENT_PAYLOAD_SHAPE as unknown as Record<
  string,
  Record<string, AgentPayloadValueType>
>

/** 台账事件的 `payload_json` **允许键闭集**（由上面的形状派生） */
/** M10/D：内部 AI 提取链的来源标记（agent_ingests.source_platform 与候选 tags 共用） */
export const AI_EXTRACT_SOURCE = 'ai-extract'

export const AGENT_PAYLOAD_KEYS = Object.fromEntries(
  Object.entries(AGENT_PAYLOAD_SHAPE).map(([k, v]) => [k, Object.keys(v).sort()]),
) as unknown as { readonly [K in keyof typeof AGENT_PAYLOAD_SHAPE]: readonly string[] }

/**
 * 2026-10-17 实测的三个结构问题，此处逐一登记（理由详见 dev-plan §4.2 的 DEV-0131）：
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
  // M10/D 批次：LLM 候选三类（内部 AI 产出按外部 agent 待遇，pending → 人工确认）
  'term_candidate',
  'prompt_candidate',
  'playbook_candidate',
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
  /**
   * 大白话场景句上限（m3-terms-learning FR-4.2 ①）。口径是 20~45 个汉字，
   * UTF-8 三个字节/字 ⇒ 45 字约 135 B；取 400 B 留一倍以上余量，
   * 免得哪天有人写长句时被静默截断（静默截断比报错更难查）。
   */
  termScenarioMaxBytes: 400,
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
