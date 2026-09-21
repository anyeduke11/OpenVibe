import { z } from 'zod'
import { LIMITS, PROJECT_STATUS } from '../constants'
import { StageSchema } from './flow'

export const ProjectCreateInput = z.object({
  name: z.string().min(1).max(LIMITS.projectNameMax),
  localPath: z.string().optional(),
  flowTemplateId: z.string(),
})
export type ProjectCreateInput = z.infer<typeof ProjectCreateInput>

export const ProjectUpdateInput = z.object({
  name: z.string().min(1).max(LIMITS.projectNameMax).optional(),
  localPath: z.string().nullable(),
  status: z.enum(PROJECT_STATUS).optional(),
  currentStage: z.string().nullable().optional(),
  standardPackId: z.string().nullable().optional(),
  standardPackVersion: z.string().nullable().optional(),
})
export type ProjectUpdateInput = z.infer<typeof ProjectUpdateInput>

export const ProjectOut = z.object({
  id: z.string(),
  name: z.string(),
  localPath: z.string().nullable(),
  flowTemplateId: z.string().nullable(),
  stagesSnapshot: z.array(StageSchema),
  currentStage: z.string().nullable(),
  status: z.enum(PROJECT_STATUS),
  standardPackId: z.string().nullable(),
  standardPackVersion: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type ProjectOut = z.infer<typeof ProjectOut>

/** 注入状态（只读解析 lock，dev-plan §3.5；lock 缺失/损坏不影响其余字段） */
export const InjectionStatusOut = z.object({
  lockPresent: z.boolean(),
  pack: z
    .object({
      name: z.string(),
      version: z.string(),
      fingerprint: z.string(),
    })
    .optional(),
  injectedAt: z.string().optional(),
  registered: z
    .object({
      packId: z.string(),
      version: z.string(),
    })
    .optional(),
  upToDate: z.boolean().optional(),
  suggestedCommand: z.string().optional(),
  error: z.string().optional(),
})
export type InjectionStatusOut = z.infer<typeof InjectionStatusOut>
