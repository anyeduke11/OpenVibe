// `packages/shared/src/m9-source-ai.ts` —— M9 v1.6 **P5 的 T2 解读契约**
// （`m9-dev-language-roadmap.md` §3.8 / §5.5 / §7 DL-08 / DL-09 / DL-16 / DL-18 ·
//   dev-plan §6.11 P5.1 ~ P5.4）
//
// ## 它是什么
//
// 「**源码解读**」这件事的形状定义：**请求**（送什么出去）· **结果**（回来什么）·
// **分歧**（AI 的说法与确定性层的说法不一致时怎么记）· **摘要**（出参）。
//
// ⚠️ **形状只有一处**：core 装配它、server 出参按它、web 按它收参。
//
// ## ⚠️ 三条不可越的线（§3.8）
//
// 1. **片段不出仓** —— 解读结果**只展示不留存**（§3.8 三条线第 3 条）⇒
//    结果**不落库**：台账只留**指纹与计数**（DL-16 / FR-9.3）。
// 2. **路径不出网** —— 送出去的内容里**不得出现本机绝对路径**（DL-18）。
// 3. **T0 不依赖 AI** —— 解读层挂了，确定性层照常（DL-08）。
//
// ## ⚠️ 「结果只展示不留存」怎么在形状上成立
//
// `SourceInterpretResult` **没有**「落库用的字段」—— 它是**给界面看**的形状，
// 唯一的落库产物是 `SourceInterpretSummary`（指纹 ＋ 计数 ＋ 分歧条数），
// 而那个形状里**没有任何一个字段能装下正文**（全是数字、枚举与短串）。
// ⇒ 「只展示不留存」不是靠约定，是靠**类型上装不下**。
import { z } from 'zod'
import { MasteryStateSchema } from './schemas/lang'

/**
 * **T2 解读契约的版本号**（增强 3）。
 *
 * ⚠️ **为什么要有版本号**：契约是「宿主侧实现、应用侧消费」的**双边约定**——
 *   宿主换掉 Pi、换掉包装脚本、或改字段名时，应用侧**无从察觉**，
 *   失败会以「解析出错」的面貌出现（分不清「工具挂了」与「版本对不上」）。
 * ⇒ 请求与响应**各带一个**版本号，适配器解析后**先比版本**，
 *   再谈字段校验 ⇒ 不兼容有**自己的**失败原因（`version_mismatch`）。
 *
 * ⚠️ **改契约就要改这个数**，并同步 dev-plan 的台账。
 */
export const SOURCE_INTERPRET_SCHEMA_VERSION = 1

/**
 * 校验响应里的版本号，**先比版本，再谈字段**（增强 3）。
 *
 * 三个实现共用同一句文案（HTTP runner、命令适配器、Pi 包装脚本）：
 * 版本对不上要归一成「契约变了」的**自有**失败原因，而不是笼统的「不合 schema」——
 * 后者会让人误判成「工具坏了」。
 *
 * @param parsed 已 `JSON.parse` 的原始响应（任意形态）
 * @returns 版本不一致时的错误文案；一致时返回 `null`
 */
export function schemaVersionMismatch(parsed: unknown): string | null {
  const version =
    typeof parsed === 'object' && parsed !== null
      ? (parsed as { schema_version?: unknown }).schema_version
      : undefined
  if (version === SOURCE_INTERPRET_SCHEMA_VERSION) return null
  return `解读契约版本对不上（期望 ${String(SOURCE_INTERPRET_SCHEMA_VERSION)}，收到 ${String(version ?? '缺失')}）`
}

/**
 * 送出去的一条片段（**只含勾选过的**）。
 *
 * ⚠️ `path` 必须是**相对项目根**的路径；`content` 是**脱敏后**的片段正文
 *   （绝对路径已替换，见 DL-18）⇒ 送出去的字节里没有本机路径。
 */
export const SourceInterpretFragment = z.object({
  /** 命中 id（⚠️ **不是**文件 id —— 勾选与计数的单位是「片段」） */
  finding_id: z.number().int(),
  /** 相对项目根的路径（绝不含绝对路径） */
  path: z.string(),
  /** 片段正文（脱敏后） */
  content: z.string(),
  /** 命中行号（1 起） */
  line: z.number().int(),
  /** 命中的知识点 slug（AI 要对着知识点解读） */
  topic_slug: z.string(),
  /** 知识点标题（给人看的语境；AI 侧可忽略） */
  topic_title: z.string(),
})
export type SourceInterpretFragment = z.infer<typeof SourceInterpretFragment>

/** 送出去的请求（**结构化**，不解析自然语言 —— M3 FR-6.3.2 同款纪律）。 */
export const SourceInterpretRequest = z.object({
  /** ⚠️ 契约版本（**必填**）—— 宿主侧要原样带回（见 `SOURCE_INTERPRET_SCHEMA_VERSION`） */
  schema_version: z.number().int(),
  /** 只含勾选过的片段（DL-18 第一道） */
  fragments: z.array(SourceInterpretFragment),
  /** 这次要解读的知识点（slug → 标题） */
  topics: z.array(z.object({ slug: z.string(), title: z.string() })),
})
export type SourceInterpretRequest = z.infer<typeof SourceInterpretRequest>

/**
 * AI 对一条片段的解读。
 *
 * ⚠️ `claim_state` 是**可选**的 —— AI 说「这处你已经掌握了」时才带。
 *   带了就**必须**与确定性层比对（DL-09）：不一致 ⇒ 显式标注分歧，
 *   **绝不许**拿 AI 的说法改写掌握度（§3.8 三条线第 3 条）。
 */
export const SourceInterpretItem = z.object({
  topic_slug: z.string(),
  /** 一句话解读（给人看） */
  summary: z.string(),
  /** 片段里的风险点（竞态 / 泄漏 / `defer` 在循环里 …） */
  risks: z.array(z.string()),
  /** ⚠️ AI **声称**的掌握度（可选）—— 只用于**比对**，不用于改状态 */
  claim_state: MasteryStateSchema.nullable(),
})
export type SourceInterpretItem = z.infer<typeof SourceInterpretItem>

/**
 * 一次解读的**用量**（token 计数）。
 *
 * ⚠️ **只有计数，没有正文**（DL-16 同族）：用量是**数**，不是内容 ⇒
 *   它进台账不违反「片段不得进台账」。
 *
 * ⚠️ **两家的口径不一样，在适配器里归一**：
 *   - OpenAI 兼容接口：`{ prompt_tokens, completion_tokens, total_tokens }`；
 *   - Pi 事件流：`{ input, output, totalTokens }`（还有 cacheRead / cacheWrite / reasoning）。
 *   ⇒ 归一到**这一份**形状 ⇒ 界面与台账只有一种口径。
 */
export const SourceInterpretUsage = z.object({
  /** 送进去的 token 数 */
  prompt_tokens: z.number().int().nonnegative(),
  /** 模型吐出来的 token 数 */
  completion_tokens: z.number().int().nonnegative(),
  /** 合计 */
  total_tokens: z.number().int().nonnegative(),
})
export type SourceInterpretUsage = z.infer<typeof SourceInterpretUsage>

/** 解读结果（**只展示不留存**）。 */
export const SourceInterpretResult = z.object({
  /** ⚠️ 契约版本（**必填**）—— 与请求里的版本不一致 ⇒ `version_mismatch` */
  schema_version: z.number().int(),
  items: z.array(SourceInterpretItem),
  /** 模型标识（台账用） */
  model: z.string(),
  /** provider 标识（台账用） */
  provider: z.string(),
  /**
   * **用量**（**可选** —— runner 拿不到就是没有）。
   *
   * ⚠️ **这是兼容扩展 ⇒ 不升契约版本号**：旧 runner 不带这一列照样通过校验
   *   ⇒ 升版本会把用户已有的包装脚本全部判成 `runner-version-mismatch`。
   *   ⇒ **版本号只留给不兼容的改动**。
   */
  usage: SourceInterpretUsage.optional(),
})
export type SourceInterpretResult = z.infer<typeof SourceInterpretResult>

/**
 * 一条**分歧**（DL-09）。
 *
 * ⚠️ 分歧**必须两处并列**：确定性层的状态 ＋ AI 的声称 都要在界面上显示，
 *   不能只说「有分歧」（demo 那条判据的形态：两处并列提示）。
 */
export const InterpretDivergence = z.object({
  topic_slug: z.string(),
  /** 确定性层的判定（**权威**） */
  deterministic_state: MasteryStateSchema,
  /** AI 的声称 */
  ai_state: MasteryStateSchema,
})
export type InterpretDivergence = z.infer<typeof InterpretDivergence>

/** 解读的**状态**（三档，**不许混**）。 */
export const InterpretStatus = z.enum(['ok', 'failed', 'unavailable'])
export type InterpretStatus = z.infer<typeof InterpretStatus>

/**
 * 解读端点的出参。
 *
 * ⚠️ 这个形状里**没有任何字段能装下源码正文** ⇒ 「只展示不留存」在类型上成立。
 */
export const SourceInterpretSummary = z.object({
  status: InterpretStatus,
  project_id: z.string(),
  /**
   * **这次是哪个 provider 答的**（**空串** = 未知 / 没有 provider）。
   *
   * ⚠️ **为什么要带它**：provider 一旦可多份（多份配置并存），
   *   「哪一家答的」就是**复盘的第一问题** ⇒ 不带它就没法按 provider 聚合。
   */
  provider: z.string(),
  /** 送出去的片段条数 */
  fragment_count: z.number().int(),
  /** 解读回来的条数 */
  item_count: z.number().int(),
  /** 收到的风险条数 */
  risk_count: z.number().int(),
  /** 分歧条数（⚠️ **0 也要显示**，不许空白 —— P5 出口条件） */
  divergence_count: z.number().int(),
  /** 分歧明细（两处并列：确定性层 ＋ AI 的声称） */
  divergences: z.array(InterpretDivergence),
  /** 解读结果（**只展示不留存**） */
  items: z.array(SourceInterpretItem),
  /** 台账里的入参指纹（**不含正文**） */
  input_hash: z.string().nullable(),
  /**
   * **用量**（`null` = runner 没给）。
   *
   * ⚠️ **只落计数**（DL-16 同族）—— 台账里出现的是数字，不是任何内容。
   */
  usage: SourceInterpretUsage.nullable(),
  /** 失败原因（失败/不可用时才有） */
  failure_reason: z.string().nullable(),
})
export type SourceInterpretSummary = z.infer<typeof SourceInterpretSummary>

/**
 * AI 能力是否可用（界面据此决定**要不要渲染 T2 区** —— DL-08）。
 *
 * ⚠️ **口径只此一处**（owner 2026-10-22 裁决一「手动调控」带来的扩展）：
 *   以前只有「可用 / 不可用」两个字段，现在多了**三档状态**与**人话原因** ——
 *   因为设置页要能告诉用户「**为什么**不可用」，
 *   否则用户只看到「AI 不可用」，不知道是自己没填、填错了、还是服务没起。
 *
 * ⚠️ **`available` 与 `status` 不许各说各话**：`available` 是 `status` 的**布尔投影**
 *   （`status === 'ready'` ⇔ `available`），由**同一处**算出来，不许各写一遍。
 */
export const InterpretCapability = z.object({
  /** 不可用 ⇒ 界面**不渲染** T2 区（不是渲染一个失败态） */
  available: z.boolean(),
  /** runner 标识（可用的才有） */
  runner_id: z.string().nullable(),
  /** 三档：没配 / 配好了能用 / 配了但用不了 */
  status: z.enum(['unconfigured', 'ready', 'misconfigured']),
  /** 人话原因（**不许空**）—— 为什么是这一档 */
  detail: z.string(),
})
export type InterpretCapability = z.infer<typeof InterpretCapability>

/**
 * 片段**读不到**的原因（界面据此说明「为什么读不到」）。
 *
 * ⚠️ **为什么要枚举化**：只回一个 `null` 的话，界面只能说「读不到」，
 *   用户分不清是「文件被删了」「文件被改短了（行号越界）」「路径越出了项目」
 *   还是「这次批量太多、这条没加载」⇒ 四种情况对用户的动作完全不同
 *   （重新扫描 / 换项目 / 等一等 / 缩小范围）。
 *
 * ⚠️ **不许塌成一个兜底分支**：界面上四种原因必须显示**不同的文案**
 *   （有变异腿守着：把映射改成同一个文案 ⇒ 生产断言当场红）。
 */
export const SnippetFailureReason = z.enum([
  /** 文件不在了（删了 / 移走了） */
  'file_missing',
  /** 路径越出了项目根（当前项目根与扫描时不是同一个） */
  'out_of_project',
  /** 命中行号超出了文件现在的行数（文件被改短了） */
  'line_out_of_range',
  /** 文件超过读取上限（不读） */
  'too_large',
  /** 读不了（权限 / 编码 / 其它 IO 错误） */
  'unreadable',
  /** 这次批量读取的上限到了，这条**没读**（后面还有） */
  'not_loaded',
])
export type SnippetFailureReason = z.infer<typeof SnippetFailureReason>

/**
 * 一条命中的**本地片段**（命中行 ＋ 上下文）。
 *
 * ⚠️ `lines` 为 `null` = **读不到**（文件被删了 / 读不了）⇒
 *   界面必须**禁用它的勾选框**（看不见内容就不许勾 —— §3.8 T1 硬要求：
 *   用户要在**看到全文**的前提下勾选，否则「勾选」是在盲签）。
 */
export const SourceSnippet = z.object({
  finding_id: z.number().int(),
  /** 相对项目根的路径 */
  path: z.string(),
  start_line: z.number().int().nullable(),
  end_line: z.number().int().nullable(),
  /** 片段正文（逐行）；`null` = 读不到 */
  lines: z.array(z.string()).nullable(),
  /** ⚠️ 读不到的原因（`lines` 为 `null` 时才有值） */
  failure: SnippetFailureReason.nullable(),
  topic_slug: z.string(),
  topic_title: z.string(),
})
export type SourceSnippet = z.infer<typeof SourceSnippet>

/** `GET /api/lang/snippets` 的出参（一次读完抽屉里所有命中）。 */
export const LangSnippetsResponse = z.object({
  snippets: z.array(SourceSnippet),
})
export type LangSnippetsResponse = z.infer<typeof LangSnippetsResponse>

// ============ provider 配置（owner 2026-10-22 裁决一：手动调控 ＋ 支持本地模型与 LLM API）============

/**
 * provider 的**形态**（两种，各自对应一类真实接入）。
 *
 * ⚠️ **为什么现在有两种**（此前只有「命令适配器」一种）：
 *   owner 2026-10-22 明确「**增加手动调控设置**」且「**支持本地模型和 LLM API 接入**」⇒
 *   命令适配器覆盖不了「本机跑一个 OpenAI 兼容服务」与「直接调云端 API」这两种。
 *
 * | 形态 | 覆盖的接入方式 |
 * |---|---|
 * | `command` | 任何能遵守「stdin 收 JSON / stdout 出 JSON」的 CLI（Pi 的包装脚本、Mavis 的包装脚本、别的 agent CLI） |
 * | `openai_http` | **OpenAI 兼容**的 HTTP 接口 —— 本机模型（Ollama / LM Studio / vLLM …）与云端 API **同一种协议** |
 */
export const InterpretProviderKind = z.enum(['command', 'openai_http'])
export type InterpretProviderKind = z.infer<typeof InterpretProviderKind>

/**
 * provider 的**配置**（存在 `app_meta` 里；**不进任何 `lang_` 表** ——
 * 它是用户偏好，不是语言学习状态，同 §3.19 第 3 条的纪律）。
 *
 * ⚠️ **字段全是标量 ＋ 一串命令参数**：没有嵌套对象 ⇒ 序列化与读回都不会出现
 * 「半个结构」的中间态。
 */
/**
 * `Config` 与 `View` 的**共有字段** —— 只声明一次。
 *
 * ⚠️ **共有字段不许抄两份**：读端（View）若另抄一遍，将来加字段时必然只改一边，
 *   于是「写进去的」与「读出来的」悄悄分叉。
 */
const InterpretProviderBase = z.object({
  /** 总闸（**默认关**）—— 关掉 ⇒ DL-08 的下限：AI 不可用，确定性层照常 */
  enabled: z.boolean(),
  kind: InterpretProviderKind,
  /** `command` 形态的命令（**不含参数**） */
  cmd: z.string(),
  /** `command` 形态的参数（**逐个**给，不是一整串 shell 命令 —— 免得参数里能塞注入） */
  args: z.array(z.string()),
  /** `openai_http` 形态的端点（**完整 URL**，如 `http://127.0.0.1:11434/v1/chat/completions`） */
  endpoint: z.string(),
  /** 模型标识（台账用；本地模型也填，如 `qwen2.5-coder:7b`） */
  model: z.string(),
  /** provider 标识（台账用，如 `ollama` / `openai` / `pi`） */
  provider: z.string(),
})

export const InterpretProviderConfig = InterpretProviderBase.extend({
  /**
   * API key（⚠️ **只有「明文降级」时这里才非空** —— 见 `api_key_storage`）。
   *
   * ⚠️ **为什么这个字段还在**：它是**降级路径**的落点 ——
   *   本机没有可用的系统钥匙串时，key 只能存在 `app_meta` 里
   *   （`app_meta` 是本机 SQLite 的明文 KV）。
   *   ⇒ **此时界面必须如实显示「以明文存」**（`api_key_storage === 'inline'`）。
   *
   * ⚠️ **绝不进任何台账**（DL-16 同族：凭据不属于审计面）。
   */
  api_key: z.string(),
  /**
   * **key 存在哪**（三档）。
   *
   * ⚠️ **为什么要有这一档**：光看「有没有 key」看不出**凭据落在什么保护级别下** ——
   *   系统钥匙串（系统级保护）vs 本地数据库明文（任何能读这个库的人都能拿到），
   *   是**两件必须让用户知道的事**。
   *
   * | 值 | 含义 |
   * |---|---|
   * | `none` | 没有 key |
   * | `keychain` | key 在 **macOS 系统钥匙串**里 ⇒ `app_meta` **只留一个标记** |
   * | `inline` | **降级**：本机没有可用的钥匙串 ⇒ key 以明文存在 `app_meta` 里 |
   *
   * ⚠️ **缺省是 `none`**（不是 `inline`）—— 老配置（没有这一列）里若 `api_key` 非空，
   *   读端会**认成 `inline`**（那是它当初的真实处境）⇒ 见 core 的 `readProviderConfig`。
   */
  api_key_storage: z.enum(['none', 'keychain', 'inline']).default('none'),
  /** 超时（毫秒） */
  timeout_ms: z.number().int(),
})
export type InterpretProviderConfig = z.infer<typeof InterpretProviderConfig>

/** key 的存储位置（三档 —— 与 `InterpretProviderConfig.api_key_storage` 同源）。 */
export const InterpretProviderKeyStorage = z.enum(['none', 'keychain', 'inline'])
export type InterpretProviderKeyStorage = z.infer<typeof InterpretProviderKeyStorage>

/**
 * provider 配置的**对外视图**（读端出参）。
 *
 * ⚠️ **这个形状里装不下 key 全文** —— 只有 `has_api_key`（有没有）与
 *   `api_key_hint`（末 4 位，给人眼确认「配的是不是这一把」）。
 * ⇒ 「回显密钥」这件事在**类型上**就不可能发生，与「解读结果只展示不留存」同款纪律。
 */
export const InterpretProviderView = InterpretProviderBase.extend({
  /** 有没有配 key */
  has_api_key: z.boolean(),
  /** key 的末 4 位（没配则是空串） */
  api_key_hint: z.string(),
  /**
   * **key 存在哪**（`none` / `keychain` / `inline`）。
   *
   * ⚠️ **必须让用户看得见** —— 「key 在系统钥匙串里」与「key 明文躺在本地库里」
   *   是**两个保护级别**，界面不说就是隐瞒。
   */
  api_key_storage: InterpretProviderKeyStorage,
  /** 存储位置的**人话说明**（服务端生成 —— 「本机有没有钥匙串」是服务端的事实） */
  api_key_storage_detail: z.string(),
  /** 超时（毫秒） */
  timeout_ms: z.number().int(),
})
export type InterpretProviderView = z.infer<typeof InterpretProviderView>

// ============ 多份 provider 配置并存（owner 2026-10-22 增强 2）============

/**
 * **一份** provider 配置（**多份并存**时每份带 id）。
 *
 * ⚠️ **为什么每份要带 id**：多份并存时，「改哪一份」「用哪一份」「钥匙串里取哪一把」
 *   全都靠 id 定位 ⇒ 没有 id 就没有「哪一份」。
 *
 * ⚠️ **`projects` 是「绑定到哪些项目」**（**空数组 = 通用**，任何项目都能用它）——
 *   这是「按项目选」的落点。
 */
export const InterpretProviderEntry = InterpretProviderConfig.extend({
  /** 稳定标识（多份并存 ⇒ 用来选、用来定位钥匙串项；**空串 ⇒ 由服务端生成**） */
  id: z.string().default(''),
  /** 显示名（用户自己起的；空串 ⇒ 界面回退显示 provider/模型名） */
  name: z.string().default(''),
  /** 绑定到哪些项目（**空数组 = 通用**） */
  projects: z.array(z.string()).default([]),
})
export type InterpretProviderEntry = z.infer<typeof InterpretProviderEntry>

/**
 * provider 配置的**集合**（多份并存 ＋ 一个默认）。
 *
 * ⚠️ **存在 `app_meta.langInterpretProvider` 里**（**同一个键**，不是新键）——
 *   老配置是**单条对象** ⇒ 读端认出旧形状并**包成单元素集合**（老配置不许丢）。
 */
export const InterpretProviderCollection = z.object({
  /** 所有配置（**顺序即界面顺序**） */
  providers: z.array(InterpretProviderEntry),
  /** 默认那一份的 id（**空串 = 没有默认**） */
  default_provider_id: z.string(),
})
export type InterpretProviderCollection = z.infer<typeof InterpretProviderCollection>

/** 一份配置的**对外视图**（脱敏 ＋ 绑定信息）。 */
export const InterpretProviderEntryView = InterpretProviderView.extend({
  id: z.string(),
  name: z.string(),
  projects: z.array(z.string()),
})
export type InterpretProviderEntryView = z.infer<typeof InterpretProviderEntryView>

/** 集合的**对外视图**（读端出参）。 */
export const InterpretProviderCollectionView = z.object({
  providers: z.array(InterpretProviderEntryView),
  default_provider_id: z.string(),
})
export type InterpretProviderCollectionView = z.infer<typeof InterpretProviderCollectionView>

/**
 * **保存**用的集合（入参）。
 *
 * ⚠️ **`api_key_storage` 不在入参里** —— 它是**服务端算出来的事实**
 *   （这台机器有没有钥匙串 ⇒ key 落在哪），不是客户端能声明的东西。
 *
 * ⚠️ **`api_key` 缺省 = 保持原值**，**空串 = 清除**（三态口径见 core 的配置层）。
 */
export const InterpretProviderEntrySave = InterpretProviderConfig.omit({
  api_key_storage: true,
}).extend({
  id: z.string().default(''),
  name: z.string().default(''),
  projects: z.array(z.string()).default([]),
  api_key: z.string().optional(),
})
export type InterpretProviderEntrySave = z.infer<typeof InterpretProviderEntrySave>

/** 保存用的集合（入参）。 */
export const InterpretProviderCollectionSave = z.object({
  providers: z.array(InterpretProviderEntrySave),
  default_provider_id: z.string(),
})
export type InterpretProviderCollectionSave = z.infer<typeof InterpretProviderCollectionSave>

/**
 * provider 的**能力探测**结果 ⇒ **就是 `InterpretCapability`**（口径单处）。
 *
 * ⚠️ 这里**不再另立一个类型** —— 「AI 能不能用」与「为什么不能用」
 *   是**同一个问题**的两面，分成两个形状就会有两处口径漂移。
 */
export type InterpretProviderCapability = InterpretCapability
