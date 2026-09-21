import { z } from 'zod'
import {
  LIMITS,
  PLATFORM_MARKS,
  PROMPT_STATUS,
  USE_AS,
} from '../constants'
import { utf8ByteLength } from '../utils'

export const folderPathSchema = z
  .string()
  .startsWith('/', { message: 'folderPath 必须以 / 开头（根为 /）' })
  .refine((p) => !p.includes('\\'), { message: 'folderPath 不允许反斜杠' })
  .default('/')

const contentSchema = z.string().min(1).refine(
  (s) => utf8ByteLength(s) <= LIMITS.promptContentMaxBytes,
  { message: `content 超过 ${LIMITS.promptContentMaxBytes} 字节上限（m1 §6.1）` },
)

export const PromptCreateInput = z.object({
  title: z.string().min(1).max(LIMITS.promptTitleMax),
  description: z.string().max(LIMITS.promptDescriptionMax).default(''),
  content: contentSchema,
  tags: z.array(z.string().min(1)).default([]),
  folderPath: folderPathSchema,
  platformMarks: z.array(z.enum(PLATFORM_MARKS)).default([]),
  useAs: z.enum(USE_AS).default('reference'),
  status: z.enum(PROMPT_STATUS).default('draft'),
})
export type PromptCreateInput = z.infer<typeof PromptCreateInput>

export const PromptUpdateInput = z.object({
  title: z.string().min(1).max(LIMITS.promptTitleMax).optional(),
  description: z.string().max(LIMITS.promptDescriptionMax).optional(),
  content: contentSchema.optional(),
  tags: z.array(z.string().min(1)).optional(),
  folderPath: folderPathSchema.optional(),
  platformMarks: z.array(z.enum(PLATFORM_MARKS)).optional(),
  useAs: z.enum(USE_AS).optional(),
  status: z.enum(PROMPT_STATUS).optional(),
})
export type PromptUpdateInput = z.infer<typeof PromptUpdateInput>

export const PromptQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(LIMITS.listPageSizeMax).default(LIMITS.listPageSizeDefault),
  tag: z.string().optional(),
  folder: z.string().optional(),
  platform: z.enum(PLATFORM_MARKS).optional(),
  status: z.enum(PROMPT_STATUS).optional(),
  q: z.string().optional(),
})
export type PromptQuery = z.infer<typeof PromptQuery>

export const PromptOut = PromptCreateInput.extend({
  id: z.string(),
  variables: z.array(z.string()),
  contentHash: z.string(),
  seedHash: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type PromptOut = z.infer<typeof PromptOut>

export const PromptVersionOut = z.object({
  id: z.string(),
  promptId: z.string(),
  versionNo: z.number().int().min(1),
  content: z.string(),
  contentHash: z.string(),
  changelog: z.string(),
  createdAt: z.string(),
})
export type PromptVersionOut = z.infer<typeof PromptVersionOut>

/** 导入条目（JSON 互导 / Markdown / 规则文件反向导入统一形状，m1 FR-6） */
export const PromptImportItem = PromptCreateInput
export type PromptImportItem = z.infer<typeof PromptImportItem>
