import { z } from 'zod'
import { ADAPTER_IDS, LIMITS, SCHEMA_VERSION, USE_AS } from '../constants'
import {
  PACK_NAME_RE,
  SEMVER_RE,
  SHA256_HEX_RE,
  isValidPackRelativePath,
} from '../utils'
import { StageSchema } from './flow'

export const PackSelection = z.object({
  promptIds: z.array(z.string()).default([]),
  termIds: z.array(z.string()).default([]),
  skillIds: z.array(z.string()).default([]),
  playbookIds: z.array(z.string()).default([]),
  flowTemplateId: z.string().nullable().default(null),
})
export type PackSelection = z.infer<typeof PackSelection>

export const PackCreateInput = z.object({
  name: z
    .string()
    .min(1)
    .max(LIMITS.packNameMax)
    .regex(PACK_NAME_RE, { message: 'name 需为 [a-z0-9-] slug（m6a §6.1）' }),
  description: z.string().default(''),
  selection: PackSelection,
  targets: z.array(z.enum(ADAPTER_IDS)).min(1, { message: 'targets 至少一个平台（m6a §6.3）' }),
})
export type PackCreateInput = z.infer<typeof PackCreateInput>

export const PackUpdateInput = z.object({
  name: z.string().regex(PACK_NAME_RE).optional(),
  description: z.string().optional(),
  selection: PackSelection.optional(),
  targets: z.array(z.enum(ADAPTER_IDS)).min(1).optional(),
})
export type PackUpdateInput = z.infer<typeof PackUpdateInput>

export const PackOut = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  selection: PackSelection,
  targets: z.array(z.enum(ADAPTER_IDS)),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type PackOut = z.infer<typeof PackOut>

export const ExportInput = z.object({
  version: z.string().regex(SEMVER_RE, { message: 'version 需为 MAJOR.MINOR.PATCH' }),
  channel: z.enum(['download', 'directory']),
})
export type ExportInput = z.infer<typeof ExportInput>

export const PackExportOut = z.object({
  id: z.string(),
  packId: z.string(),
  version: z.string(),
  fingerprint: z.string(),
  channel: z.enum(['download', 'directory']),
  exportedAt: z.string(),
})
export type PackExportOut = z.infer<typeof PackExportOut>

export const PlannedFileOut = z.object({
  path: z.string(),
  sha256: z.string(),
  content: z.string(),
})
export type PlannedFileOut = z.infer<typeof PlannedFileOut>

export const PreviewOut = z.object({
  files: z.array(PlannedFileOut),
  fingerprint: z.string(),
  warnings: z.array(z.string()),
  coveredPlatforms: z.array(z.string()),
})
export type PreviewOut = z.infer<typeof PreviewOut>

// ============ 标准包契约（design §7 v1.3 冻结，A 级变更红线） ============

const packPathSchema = z.string().refine(isValidPackRelativePath, {
  message: '非法相对路径（design §7.7：无 ..、无 \\、不以 / 开头、单段≤128、总长≤255）',
})

export const ManifestPrompt = z.object({
  title: z.string(),
  useAs: z.enum(USE_AS),
  platformMarks: z.array(z.string()),
  contentHash: z.string(),
  content: z.string(),
})
export type ManifestPrompt = z.infer<typeof ManifestPrompt>

export const ManifestTerm = z.object({
  zh: z.string().optional(),
  en: z.string().optional(),
  aliases: z.array(z.string()).default([]),
  definition: z.string(),
  example: z.string().default(''),
})
export type ManifestTerm = z.infer<typeof ManifestTerm>

export const ManifestSkill = z.object({
  name: z.string(),
  description: z.string().default(''),
  skillDir: z.string().default(''),
  versionLabel: z.string().default(''),
})
export type ManifestSkill = z.infer<typeof ManifestSkill>

/** openvibe.pack.json（manifest，design §7.2） */
export const PackManifestSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  pack: z.object({
    id: z.string(),
    name: z.string().regex(PACK_NAME_RE),
    version: z.string().regex(SEMVER_RE),
    description: z.string(),
    exportedAt: z.string(),
    generator: z.string(),
  }),
  targets: z.array(z.enum(ADAPTER_IDS)).min(1),
  flow: z
    .object({
      templateName: z.string(),
      kind: z.string(),
      stages: z.array(StageSchema),
    })
    .nullable(),
  prompts: z.array(ManifestPrompt),
  terms: z.array(ManifestTerm),
  skills: z.array(ManifestSkill),
  files: z
    .array(
      z.object({
        path: packPathSchema,
        sha256: z.string().regex(SHA256_HEX_RE),
      }),
    )
    .max(LIMITS.packFileCountMax),
  fingerprint: z.string().regex(SHA256_HEX_RE),
})
export type PackManifest = z.infer<typeof PackManifestSchema>

/** 单文件 bundle（design §7.1，CLI sync --file 直接消费） */
export const PackBundleSchema = z.object({
  bundleSchemaVersion: z.literal(1),
  manifest: PackManifestSchema,
  files: z.array(
    z.object({
      path: packPathSchema,
      content: z.string(),
    }),
  ),
})
export type PackBundle = z.infer<typeof PackBundleSchema>

/** 目标项目注入登记 <project>/.openvibe/pack.lock.json（design §7.5） */
export const PackLockSchema = z.object({
  schemaVersion: z.literal(1),
  pack: z.object({
    id: z.string(),
    name: z.string().regex(PACK_NAME_RE),
    version: z.string().regex(SEMVER_RE),
    fingerprint: z.string().regex(SHA256_HEX_RE),
  }),
  injectedAt: z.string(),
  files: z.array(
    z.object({
      path: packPathSchema,
      sha256: z.string().regex(SHA256_HEX_RE),
      managed: z.boolean().default(true),
    }),
  ),
})
export type PackLock = z.infer<typeof PackLockSchema>
