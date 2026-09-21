import { z } from 'zod'
import { FLOW_KINDS } from '../constants'

export const StageSchema = z.object({
  name: z.string().min(1),
  checklist: z
    .array(z.object({ id: z.string().min(1), text: z.string().min(1) }))
    .default([]),
  artifacts: z.array(z.string()).default([]),
})
export type Stage = z.infer<typeof StageSchema>

export const FlowTemplateCreateInput = z.object({
  name: z.string().min(1),
  kind: z.enum(FLOW_KINDS),
  stages: z.array(StageSchema).min(1),
})
export type FlowTemplateCreateInput = z.infer<typeof FlowTemplateCreateInput>

export const FlowTemplateOut = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(FLOW_KINDS),
  stages: z.array(StageSchema),
  builtin: z.boolean(),
  seedHash: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type FlowTemplateOut = z.infer<typeof FlowTemplateOut>
