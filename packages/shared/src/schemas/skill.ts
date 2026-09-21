import { z } from 'zod'
import { SKILL_SOURCES } from '../constants'

export const SkillCreateInput = z.object({
  name: z.string().min(1),
  description: z.string().default(''),
  source: z.enum(SKILL_SOURCES).default('manual'),
  skillDir: z.string().optional(),
  installedTargets: z.array(z.string()).default([]),
})
export type SkillCreateInput = z.input<typeof SkillCreateInput>

export const SkillOut = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  source: z.enum(SKILL_SOURCES),
  skillDir: z.string().nullable(),
  latestVersionId: z.string().nullable(),
  installedTargets: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type SkillOut = z.infer<typeof SkillOut>

/** 台账维护：仅描述与安装标记可改（name/来源由扫描或创建决定，m2 FR-3.2） */
export const SkillUpdateInput = z.object({
  description: z.string().optional(),
  installedTargets: z.array(z.string()).optional(),
})
export type SkillUpdateInput = z.infer<typeof SkillUpdateInput>

export const SkillVersionOut = z.object({
  id: z.string(),
  skillId: z.string(),
  versionLabel: z.string(),
  dirHash: z.string(),
  fileCount: z.number().int().min(0),
  scannedAt: z.string(),
})
export type SkillVersionOut = z.infer<typeof SkillVersionOut>

export const SkillScanInput = z.object({
  roots: z.array(z.string()).optional(),
})
export type SkillScanInput = z.infer<typeof SkillScanInput>

export const SkillScanReport = z.object({
  discovered: z.number().int().min(0),
  created: z.number().int().min(0),
  updated: z.number().int().min(0),
  skipped: z.number().int().min(0),
  warnings: z.array(z.string()),
})
export type SkillScanReport = z.infer<typeof SkillScanReport>
