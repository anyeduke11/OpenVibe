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
export type PackCreateInput = z.input<typeof PackCreateInput>

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

/** POST /api/injections（CLI sync 成功后上报，m6a FR-5.1 / dev-plan §3.8） */
export const InjectionCreateInput = z.object({
  packId: z.string().nullable().default(null),
  packVersion: z.string().nullable().default(null),
  projectPath: z.string().min(1),
})
export type InjectionCreateInput = z.input<typeof InjectionCreateInput>

export const PackExportOut = z.object({
  id: z.string(),
  packId: z.string(),
  version: z.string(),
  fingerprint: z.string(),
  channel: z.enum(['download', 'directory']),
  exportedAt: z.string(),
})
export type PackExportOut = z.infer<typeof PackExportOut>

/**
 * POST /api/packs/:id/export 响应。
 * bundlePath 是相对路径（web 侧拼 base，CLI 侧拼 server origin）。
 */
export const ExportOut = z.object({
  status: z.enum(['created', 'idempotent']),
  export: PackExportOut,
  /** channel=directory 时的落盘绝对路径（design §7.1）；download 通道为 null */
  directoryPath: z.string().nullable(),
  bundlePath: z.string(),
  fingerprint: z.string(),
  warnings: z.array(z.string()),
})
export type ExportOut = z.infer<typeof ExportOut>

/** 注入历史行（m6a FR-5；packId 可空 = 包已删除仍留痕） */
export const InjectionOut = z.object({
  id: z.string(),
  packId: z.string().nullable(),
  packVersion: z.string().nullable(),
  projectPath: z.string(),
  injectedAt: z.string(),
})
export type InjectionOut = z.infer<typeof InjectionOut>

/** 导出实例的存储全文（pack_exports 行含 blob 两列，bundle 下载与物化验证读取） */
export interface PackExportBlob {
  id: string
  packId: string
  packName: string
  version: string
  fingerprint: string
  manifestJson: string
  bundleJson: string
  channel: PackExportOut['channel']
  exportedAt: string
}

export const PlannedFileOut = z.object({
  path: z.string(),
  sha256: z.string(),
  content: z.string(),
})
export type PlannedFileOut = z.infer<typeof PlannedFileOut>

/** 单文件估算（perTarget 与 footprint 共用形状；path 恒为包内相对路径） */
export const SizeEstimateFile = z.object({
  path: z.string(),
  approxTokens: z.number().int().nonnegative(),
})
export type SizeEstimateFile = z.infer<typeof SizeEstimateFile>

/** 某平台「实际读进上下文」的量：它的主文件 + TERMS.md + CHECKLIST.md + SKILLS.md */
export const SizeEstimatePerTarget = z.object({
  adapter: z.string(),
  files: z.array(SizeEstimateFile),
  approxTokens: z.number().int().nonnegative(),
  warn: z.boolean(),
})
export type SizeEstimatePerTarget = z.infer<typeof SizeEstimatePerTarget>

/** 整包落盘足迹（含被各 adapter 复制的主文件与 manifest）——与 perTarget 是两个视图，不许混成一个数 */
export const SizeEstimateFootprint = z.object({
  files: z.array(SizeEstimateFile),
  approxTokens: z.number().int().nonnegative(),
  bytes: z.number().int().nonnegative(),
})
export type SizeEstimateFootprint = z.infer<typeof SizeEstimateFootprint>

export const SizeEstimate = z.object({
  perTarget: z.array(SizeEstimatePerTarget),
  footprint: SizeEstimateFootprint,
})
export type SizeEstimate = z.infer<typeof SizeEstimate>

export const PreviewOut = z.object({
  files: z.array(PlannedFileOut),
  fingerprint: z.string(),
  warnings: z.array(z.string()),
  coveredPlatforms: z.array(z.string()),
  /** P1.1 / m6a FR-6：可选。**只活在 API 响应里**，不进 manifest 也不进 directoryFiles() */
  sizeEstimate: SizeEstimate.optional(),
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
  files: z
    .array(
      z.object({
        path: packPathSchema,
        sha256: z.string().regex(SHA256_HEX_RE),
        managed: z.boolean().default(true),
      }),
    )
    .superRefine((files, ctx) => {
      // 逐字节同名的重复条目是「按条目计」口径的输入（承 clean 侧 CLI-CLEAN-06f），拒不得；
      // 要拒的是同一 path 挂着两套凭据——那样删除循环按条目顺序判定，同盘内容会既 DRIFT 又 IN_SYNC。
      const seen = new Map<string, { sha256: string; managed: boolean }>()
      const conflicted = new Set<string>()
      for (const entry of files) {
        const prev = seen.get(entry.path)
        if (prev && (prev.sha256 !== entry.sha256 || prev.managed !== entry.managed)) {
          conflicted.add(entry.path)
        }
        seen.set(entry.path, { sha256: entry.sha256, managed: entry.managed })
      }
      for (const path of [...conflicted].sort()) {
        ctx.addIssue({
          code: 'custom',
          message: `files[].path 重复登记且期望哈希或 managed 不一致：${path}`,
        })
      }
    }),
})
export type PackLock = z.infer<typeof PackLockSchema>
