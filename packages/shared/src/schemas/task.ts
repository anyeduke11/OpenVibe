import { z } from 'zod'
import { DEVLOG_TYPES, TASK_STATUS } from '../constants'

export const TaskCreateInput = z.object({
  title: z.string().min(1),
  stageName: z.string().optional(),
})
export type TaskCreateInput = z.infer<typeof TaskCreateInput>

export const TaskUpdateInput = z.object({
  title: z.string().min(1).optional(),
  stageName: z.string().nullable().optional(),
  status: z.enum(TASK_STATUS).optional(),
  order: z.number().int().optional(),
})
export type TaskUpdateInput = z.infer<typeof TaskUpdateInput>

export const TaskOut = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
  stageName: z.string().nullable(),
  status: z.enum(TASK_STATUS),
  order: z.number().int(),
})
export type TaskOut = z.infer<typeof TaskOut>

export const DevLogEvidence = z.object({
  command: z.string(),
  resultSummary: z.string(),
})
export type DevLogEvidence = z.infer<typeof DevLogEvidence>

export const DevLogCreateInput = z.object({
  type: z.enum(DEVLOG_TYPES),
  title: z.string().default(''),
  body: z.string().default(''),
  relatedFiles: z.array(z.string()).default([]),
  evidence: DevLogEvidence.optional(),
})
export type DevLogCreateInput = z.infer<typeof DevLogCreateInput>

export const DevLogOut = z.object({
  id: z.string(),
  projectId: z.string(),
  type: z.enum(DEVLOG_TYPES),
  entryNo: z.number().int().min(1),
  displayNo: z.string(),
  title: z.string(),
  body: z.string(),
  relatedFiles: z.array(z.string()),
  evidence: DevLogEvidence.nullable(),
  linkedAssetIds: z.array(z.string()),
  createdAt: z.string(),
})
export type DevLogOut = z.infer<typeof DevLogOut>
