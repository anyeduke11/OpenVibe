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

/** 解读结果（**只展示不留存**）。 */
export const SourceInterpretResult = z.object({
  /** ⚠️ 契约版本（**必填**）—— 与请求里的版本不一致 ⇒ `version_mismatch` */
  schema_version: z.number().int(),
  items: z.array(SourceInterpretItem),
  /** 模型标识（台账用） */
  model: z.string(),
  /** provider 标识（台账用） */
  provider: z.string(),
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
  /** 失败原因（失败/不可用时才有） */
  failure_reason: z.string().nullable(),
})
export type SourceInterpretSummary = z.infer<typeof SourceInterpretSummary>

/** AI 能力是否可用（界面据此决定**要不要渲染 T2 区** —— DL-08）。 */
export const InterpretCapability = z.object({
  /** 不可用 ⇒ 界面**不渲染** T2 区（不是渲染一个失败态） */
  available: z.boolean(),
  /** runner 标识（可用的才有） */
  runner_id: z.string().nullable(),
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
