import { z } from 'zod'
import { LIMITS, TERM_DOMAINS, TERM_LEVELS, TERM_STATUS, TERMS_ORDER_BY } from '../constants'
import { utf8ByteLength } from '../utils'

/** source 取值：openvibe-seed | manual | vibe-hub | project:<项目名>（m3 §3；vibe-hub 为 DEV-0075 外部术语源溯源） */
export const TERM_SOURCE_RE = /^(openvibe-seed|manual|vibe-hub|ai-extract|project:.+)$/

const definitionSchema = z
  .string()
  .min(1)
  .refine((s) => utf8ByteLength(s) <= LIMITS.termDefinitionMaxBytes, {
    message: `definition 超过 ${LIMITS.termDefinitionMaxBytes} 字节上限`,
  })

const exampleSchema = z.string().refine((s) => utf8ByteLength(s) <= LIMITS.termExampleMaxBytes, {
  message: `example 超过 ${LIMITS.termExampleMaxBytes} 字节上限`,
})

/**
 * 大白话场景句（m3-terms-learning FR-4.2 ①）。刻意**允许空串**：
 * spec §6.2 定的形态是「没写到的走定义直出」，未写是合法状态而非缺失，
 * 因此默认值给 `''` 而不是让每个读取点写兜底（与 FR-1.3 对 level/starter 的取舍同一条纪律）。
 */
const scenarioSchema = z.string().refine((s) => utf8ByteLength(s) <= LIMITS.termScenarioMaxBytes, {
  message: `scenario 超过 ${LIMITS.termScenarioMaxBytes} 字节上限`,
})

/**
 * 字段体单源：入参与出参共用。**必须是裸 `z.object`，不得在它上面挂 refine。**
 *
 * ⚠️ 这条是本轮修掉的一个 HEAD 既有破损（Zod v4 升上来时漏改的）：`TermOut` 原本写作
 * `TermCreateInput.extend({...})`，而 `TermCreateInput` 尾部有 `.refine` ⇒ Zod v4 的
 * `.extend` 直接抛 `Cannot overwrite keys on object schemas containing refinements`。
 * 那不是类型错误而是**导入期就抛的运行时错误**：整个 `schemas/term.ts` 连同所有 import
 * 它的测试与路由一起起不来（实测 79 个测试文件收集失败）。
 *
 * 修法取「拆基座」而不是 `safeExtend`：把字段体提成 `termFields`，入参在其上 `.refine`，
 * 出参从裸 `termFields.extend` 走 —— 结构上不可能再踩同一个坑，也不必依赖 `safeExtend`
 * 在 refine 下的行为。（`safeExtend` 能跑通，但它的类型签名会把覆写键推成 `never`，
 * 类型检查当场就红；拆基座则类型与运行时都自然。）
 */
const termFields = z.object({
  zh: z.string().max(LIMITS.termZhMax).optional(),
  en: z.string().max(LIMITS.termEnMax).optional(),
  aliases: z.array(z.string().min(1)).default([]),
  definition: definitionSchema,
  example: exampleSchema.default(''),
  relatedTermIds: z.array(z.string()).default([]),
  source: z.string().regex(TERM_SOURCE_RE).default('manual'),
  tags: z.array(z.string().min(1)).default([]),
  status: z.enum(TERM_STATUS).default('draft'),
  // ---- m3-terms-learning FR-1：学习化三列。写入边界收口，domain 用受控词表 ----
  level: z.enum(TERM_LEVELS).default('L2'),
  starter: z.boolean().default(false),
  /** 领域刻意可空：未归类是合法状态（用户自建词条、上游新增领域），不编造默认值 */
  domain: z.enum(TERM_DOMAINS).nullable().default(null),
  /** 大白话场景句：未写即空串，卡片走「定义直出」（FR-4.2 ① / §6.2） */
  scenario: scenarioSchema.default(''),
})

export const TermCreateInput = termFields.refine(
  (t) => (t.zh ?? '') !== '' || (t.en ?? '') !== '',
  {
    message: 'zh 与 en 至少一项非空（m3 §6.1）',
    path: ['zh'],
  },
)
export type TermCreateInput = z.input<typeof TermCreateInput>

export const TermUpdateInput = z
  .object({
    zh: z.string().max(LIMITS.termZhMax).optional(),
    en: z.string().max(LIMITS.termEnMax).optional(),
    aliases: z.array(z.string().min(1)).optional(),
    definition: definitionSchema.optional(),
    example: exampleSchema.optional(),
    relatedTermIds: z.array(z.string()).optional(),
    tags: z.array(z.string().min(1)).optional(),
    status: z.enum(TERM_STATUS).optional(),
    level: z.enum(TERM_LEVELS).optional(),
    starter: z.boolean().optional(),
    domain: z.enum(TERM_DOMAINS).nullable().optional(),
    scenario: scenarioSchema.optional(),
  })
  .refine((t) => t.zh !== '' || t.en !== '' || (t.zh === undefined && t.en === undefined), {
    message: 'zh 与 en 不得同时置空',
    path: ['zh'],
  })
export type TermUpdateInput = z.infer<typeof TermUpdateInput>

/**
 * 出参：在裸字段体 `termFields` 上 extend（理由见该常量注释），refine 自行挂载。
 * refine 与 `TermCreateInput` 同一条：原先 `TermOut` 从 `TermCreateInput.extend` 派生因而
 * 天然带着它，拆基座后必须显式补回，否则「zh 与 en 同时为空」的出参会静默放行 —— 那是
 * 行为退化，且没有任何用例会红。
 */
export const TermOut = termFields
  .extend({
    /**
     * 读侧刻意比写入侧宽松（`string` 而非 TERM_DOMAINS 的 enum）：`terms.domain` 列上
     * 刻意没有 DB CHECK（理由见 0008 迁移注释），外部来源可能写进词表外的值。
     * 读到就原样返回、由界面归入「未归类」，**不要在这里抛** —— 那会让一条上游新领域
     * 直接 500 掉整个词库列表。
     */
    domain: z.string().nullable().default(null),
    scenario: z.string().default(''),
    id: z.string(),
    seedHash: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    /** 派生只读：zh 的带声调注音串（词级，供头词 ruby）；zh 缺省时为空串 */
    pinyin: z.string(),
  })
  .refine((t) => (t.zh ?? '') !== '' || (t.en ?? '') !== '', {
    message: 'zh 与 en 至少一项非空（m3 §6.1）',
    path: ['zh'],
  })
export type TermOut = z.infer<typeof TermOut>

/** 搜索结果：词条 + 命中字段清单 + 各字段内的高亮区间（dev-plan §3.3 matches） */
export const TermMatch = z.object({
  field: z.enum(['zh', 'en', 'aliases', 'definition']),
  start: z.number().int().min(0),
  end: z.number().int().min(0),
})
export type TermMatch = z.infer<typeof TermMatch>

export const TermSearchOut = z.object({
  term: TermOut,
  matchedFields: z.array(z.string()),
  matches: z.array(TermMatch),
})
export type TermSearchOut = z.infer<typeof TermSearchOut>

export const RenderTermsMdInput = z.object({
  termIds: z.array(z.string()).min(1, { message: '空选集（EMPTY_SELECTION）' }),
  orderBy: z.enum(TERMS_ORDER_BY).default('en-alpha'),
})
export type RenderTermsMdInput = z.input<typeof RenderTermsMdInput>
