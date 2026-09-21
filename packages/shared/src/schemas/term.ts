import { z } from 'zod'
import { LIMITS, TERM_STATUS } from '../constants'
import { utf8ByteLength } from '../utils'

/** source 取值：openvibe-seed | manual | project:<项目名>（m3 §3） */
export const TERM_SOURCE_RE = /^(openvibe-seed|manual|project:.+)$/

const definitionSchema = z.string().min(1).refine(
  (s) => utf8ByteLength(s) <= LIMITS.termDefinitionMaxBytes,
  { message: `definition 超过 ${LIMITS.termDefinitionMaxBytes} 字节上限` },
)

const exampleSchema = z.string().refine((s) => utf8ByteLength(s) <= LIMITS.termExampleMaxBytes, {
  message: `example 超过 ${LIMITS.termExampleMaxBytes} 字节上限`,
})

export const TermCreateInput = z
  .object({
    zh: z.string().max(LIMITS.termZhMax).optional(),
    en: z.string().max(LIMITS.termEnMax).optional(),
    aliases: z.array(z.string().min(1)).default([]),
    definition: definitionSchema,
    example: exampleSchema.default(''),
    relatedTermIds: z.array(z.string()).default([]),
    source: z.string().regex(TERM_SOURCE_RE).default('manual'),
    tags: z.array(z.string().min(1)).default([]),
    status: z.enum(TERM_STATUS).default('draft'),
  })
  .refine((t) => (t.zh ?? '') !== '' || (t.en ?? '') !== '', {
    message: 'zh 与 en 至少一项非空（m3 §6.1）',
    path: ['zh'],
  })
export type TermCreateInput = z.infer<typeof TermCreateInput>

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
  })
  .refine((t) => t.zh !== '' || t.en !== '' || (t.zh === undefined && t.en === undefined), {
    message: 'zh 与 en 不得同时置空',
    path: ['zh'],
  })
export type TermUpdateInput = z.infer<typeof TermUpdateInput>

export const TermOut = TermCreateInput.extend({
  id: z.string(),
  seedHash: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type TermOut = z.infer<typeof TermOut>

/** 搜索结果：词条 + 命中字段清单（高亮偏移由 T4 实现细化） */
export const TermSearchOut = z.object({
  term: TermOut,
  matchedFields: z.array(z.string()),
})
export type TermSearchOut = z.infer<typeof TermSearchOut>

export const RenderTermsMdInput = z.object({
  termIds: z.array(z.string()).min(1, { message: '空选集（EMPTY_SELECTION）' }),
  orderBy: z.enum(['en-alpha', 'pinyin', 'manual']).default('en-alpha'),
})
export type RenderTermsMdInput = z.infer<typeof RenderTermsMdInput>
