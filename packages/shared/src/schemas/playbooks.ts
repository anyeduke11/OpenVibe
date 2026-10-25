import { z } from 'zod'
import { LIMITS, PLAYBOOK_STATUS } from '../constants'
import { utf8ByteLength } from '../utils'
import { DevLogEvidence } from './task'

/**
 * source 取值：openvibe-seed | manual | reflow（m4 §3 + FR-5.4）。
 * `openvibe-seed` 比 spec 多一档，为的是 seed 行可追溯——与 TERM_SOURCE_RE 同源的镜像选择。
 */
export const PLAYBOOK_SOURCE_RE = /^(openvibe-seed|manual|reflow|ai-extract)$/

/** 四段长度一律按 UTF-8 字节比 LIMITS（m4 §3 字节族口径，与 termDefinitionMaxBytes 同法） */
const scenarioSchema = z.string().min(1).refine(
  (s) => utf8ByteLength(s) <= LIMITS.playbookScenarioMaxBytes,
  { message: `scenario 超过 ${LIMITS.playbookScenarioMaxBytes} 字节上限` },
)

const problemSchema = z.string().min(1).refine(
  (s) => utf8ByteLength(s) <= LIMITS.playbookProblemMaxBytes,
  { message: `problem 超过 ${LIMITS.playbookProblemMaxBytes} 字节上限` },
)

const practiceSchema = z.string().min(1).refine(
  (s) => utf8ByteLength(s) <= LIMITS.playbookPracticeMaxBytes,
  { message: `practice 超过 ${LIMITS.playbookPracticeMaxBytes} 字节上限` },
)

/** 反例可空（FR-1.1），但给上限：空串与超长都是同一个键把守 */
const antiPracticeSchema = z.string().refine(
  (s) => utf8ByteLength(s) <= LIMITS.playbookAntiPracticeMaxBytes,
  { message: `antiPractice 超过 ${LIMITS.playbookAntiPracticeMaxBytes} 字节上限` },
)

/** 字段本体单源：入参 / 出参共用，避免三处各写一遍形状 */
const playbookFields = z.object({
  scenario: scenarioSchema,
  problem: problemSchema,
  practice: practiceSchema,
  antiPractice: antiPracticeSchema.default(''),
  relatedPromptIds: z.array(z.string()).default([]),
  relatedTermIds: z.array(z.string()).default([]),
  relatedSkillIds: z.array(z.string()).default([]),
  verified: z.boolean().default(false),
  evidence: z.array(DevLogEvidence).default([]),
  source: z.string().regex(PLAYBOOK_SOURCE_RE).default('manual'),
  tags: z.array(z.string().min(1)).default([]),
  status: z.enum(PLAYBOOK_STATUS).default('draft'),
})

export const PlaybookCreateInput = playbookFields
  // FR-4.1 收紧（方向与 pack.ts 的 loosen 相反）：亲测有效必须带证据，否则「亲测」是谎报
  .superRefine((p, ctx) => {
    if (p.verified === true && p.evidence.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['verified'],
        message: 'verified=true 必须随带至少 1 条 evidence（m4 §6.1）',
      })
    }
  })
export type PlaybookCreateInput = z.input<typeof PlaybookCreateInput>

export const PlaybookUpdateInput = z
  .object({
    scenario: scenarioSchema.optional(),
    problem: problemSchema.optional(),
    practice: practiceSchema.optional(),
    antiPractice: antiPracticeSchema.optional(),
    relatedPromptIds: z.array(z.string()).optional(),
    relatedTermIds: z.array(z.string()).optional(),
    relatedSkillIds: z.array(z.string()).optional(),
    verified: z.boolean().optional(),
    evidence: z.array(DevLogEvidence).optional(),
    tags: z.array(z.string().min(1)).optional(),
    status: z.enum(PLAYBOOK_STATUS).optional(),
  })
  // 收紧同样覆盖 PATCH：证据可随本次请求补齐，但不补就不许置真
  .superRefine((p, ctx) => {
    if (p.verified === true && p.evidence !== undefined && p.evidence.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['verified'],
        message: 'verified=true 必须随带至少 1 条 evidence（m4 §6.1）',
      })
    }
  })
export type PlaybookUpdateInput = z.infer<typeof PlaybookUpdateInput>

export const PlaybookOut = playbookFields.extend({
  id: z.string(),
  seedHash: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type PlaybookOut = z.infer<typeof PlaybookOut>

/** 搜索命中字段（与 fts_playbooks 的五列同序） */
export const PLAYBOOK_MATCH_FIELDS = [
  'scenario',
  'problem',
  'practice',
  'antiPractice',
  'tags',
] as const

export const PlaybookMatch = z.object({
  field: z.enum(PLAYBOOK_MATCH_FIELDS),
  start: z.number().int().min(0),
  end: z.number().int().min(0),
})
export type PlaybookMatch = z.infer<typeof PlaybookMatch>

export const PlaybookSearchOut = z.object({
  playbook: PlaybookOut,
  matchedFields: z.array(z.string()),
  matches: z.array(PlaybookMatch),
})
export type PlaybookSearchOut = z.infer<typeof PlaybookSearchOut>

export const RenderPlaybooksMdInput = z.object({
  playbookIds: z.array(z.string()).min(1, { message: '空选集（EMPTY_SELECTION）' }),
})
export type RenderPlaybooksMdInput = z.input<typeof RenderPlaybooksMdInput>