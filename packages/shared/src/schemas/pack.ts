import { z } from 'zod'
import {
  ADAPTER_IDS,
  BUNDLE_SCHEMA_VERSION,
  HOOK_DEFAULT_TIMEOUT_MS,
  HOOK_FAIL_POLICIES,
  LIMITS,
  PLAYBOOK_STATUS,
  SCHEMA_VERSION,
  USE_AS,
} from '../constants'
import { PACK_NAME_RE, SEMVER_RE, SHA256_HEX_RE, isValidPackRelativePath } from '../utils'
import { StageSchema } from './flow'

/**
 * N3 HookDef 契约（docs/specs/n3-hooks.md §3.1 / FR-1）：manifest 与 selection 共用同一 schema。
 * 校验：name 非空且不含控制字符、command 非空、timeoutMs 正数且不超上限、failPolicy 枚举。
 * 默认值（FR-1.2）：timeoutMs=30000、failPolicy='continue'，配置缺省字段按默认补齐。
 */
export const HookDefSchema = z.object({
  name: z
    .string()
    .min(1)
    // 正则的用途就是拒绝控制字符（FR-1.3）——no-control-regex 在此是误报
    // eslint-disable-next-line no-control-regex
    .refine((s) => !/[\u0000-\u001f\u007f]/.test(s), {
      message: 'name 不得含控制字符（n3-hooks.md FR-1.3）',
    }),
  command: z.string().min(1, { message: 'command 不得为空' }),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .max(LIMITS.hooks.maxTimeoutMs, {
      message: `timeoutMs 不得超过 LIMITS.hooks.maxTimeoutMs=${LIMITS.hooks.maxTimeoutMs}`,
    })
    .default(HOOK_DEFAULT_TIMEOUT_MS),
  failPolicy: z.enum(HOOK_FAIL_POLICIES).default('continue'),
})
export type HookDef = z.infer<typeof HookDefSchema>

/**
 * N4 特性位部分记录（m11 FR-3.5）：键 ⊆ AdapterId、值 boolean。
 * 用 partial object 而非 `z.record(z.enum(ADAPTER_IDS), z.boolean())`——
 * zod v4 下该写法对空对象 `{}` 的校验行为不稳定（会要求所有枚举键存在），
 * 与「仅声明能力位非 false 平台」的部分记录语义不符。
 */
const L1_PARTIAL = z
  .object({
    'claude-code': z.boolean(),
    cursor: z.boolean(),
    'generic-agents': z.boolean(),
    codebuddy: z.boolean(),
    trae: z.boolean(),
    minicode: z.boolean(),
  })
  .partial()

/**
 * N3 hooks 分组（n3-hooks.md §3.2）：pre（注入前）/ post（注入后）两组。
 * pre/post 各自独立命名空间（FR-1.3：pre 与 post 可重名），组内 name 包内唯一。
 */
export const HooksSchema = z
  .object({
    pre: z.array(HookDefSchema).default([]),
    post: z.array(HookDefSchema).default([]),
  })
  .superRefine((hooks, ctx) => {
    for (const phase of ['pre', 'post'] as const) {
      const seen = new Set<string>()
      for (const hook of hooks[phase]) {
        if (seen.has(hook.name)) {
          ctx.addIssue({
            code: 'custom',
            message: `hooks.${phase} 内 name 重复：${hook.name}（包内唯一，FR-1.3）`,
          })
        }
        seen.add(hook.name)
      }
    }
  })
export type Hooks = z.infer<typeof HooksSchema>

export const PackSelection = z.object({
  promptIds: z.array(z.string()).default([]),
  termIds: z.array(z.string()).default([]),
  skillIds: z.array(z.string()).default([]),
  // 技巧选集（m4 FR-8.1）：闸已拆，字段保留为真实通道——选中的技巧进 PLAYBOOKS.md 产物。
  // 曾有的 `.refine(ids.length === 0)` 是「M4 未上线」的占位闸，按 owner 裁 ⑫ 在 M4 那笔拆除；
  // 现语义见 docs/specs/m4-playbook.md FR-8（拆闸只影响此后新建/重导的版本，历史实例不回溯）。
  playbookIds: z.array(z.string()).default([]),
  flowTemplateId: z.string().nullable().default(null),
  /**
   * N3 钩子配置（n3-hooks.md FR-2.3）：Web 组包时配置。
   * **可选**——缺省不写，由解析层（resolvePack）按空集补齐，避免对既有
   * seed/repo 构造 selection 的调用点造成必填破坏（A 级链：旧形态兼容）。
   */
  hooks: HooksSchema.optional(),
  /**
   * N4 特性位（m11 FR-3.5）：平台级 L1 开关，`Record<AdapterId, boolean>`。
   * **可选**——缺省 = 产品默认（claude-code=true，其余关），由解析层（resolvePack）补齐。
   */
  l1: L1_PARTIAL.optional(),
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

/** 某平台「实际读进上下文」的量：它的主文件 + `PACK_CONTEXT_AUX_FILES`（清单以契约层为准，此处不重复枚举） */
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

/** 组包快照里的技巧条目（m4 FR-7.1）：只带渲染要用的字段，证据不进包 */
export const ManifestPlaybook = z.object({
  scenario: z.string(),
  problem: z.string(),
  practice: z.string(),
  antiPractice: z.string().default(''),
  verified: z.boolean().default(false),
  status: z.enum(PLAYBOOK_STATUS),
})
export type ManifestPlaybook = z.infer<typeof ManifestPlaybook>

/** openvibe.pack.json（manifest，design §7.2） */
export const PackManifestSchema = z.object({
  // ⚠️ 1 与 2 并收（decisions ㊾ / D33 兼容读 · docs/specs/n3-hooks.md FR-5.2）：
  // pack-source.ts 的版本闸以「> 本 CLI 支持版才拒」声明「< 兼容（旧版可读）」，
  // 若这里仍是 z.literal(SCHEMA_VERSION)=2，schemaVersion=1 的旧导出包会**过闸后被 schema 拒**
  // ——闸的兼容声明与实现矛盾（DEV-0281 GAP-1）。1 的语义 = 旧包：hooks/l1 两字段缺省
  // （两字段本就 .optional()，其余形状在 1→2 间零分叉），读侧无需归一。
  schemaVersion: z.union([z.literal(1), z.literal(SCHEMA_VERSION)]),
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
  /**
   * N3 hooks（n3-hooks.md FR-2.1）：**可选**——无钩子包不写此字段，
   * 与「写 hooks: { pre: [], post: [] }」在校验层等价（缺省 = 空集，兼容旧包）。
   */
  hooks: HooksSchema.optional(),
  /**
   * N4 特性位（m11 FR-3.5）：平台级 L1 开关，`Record<AdapterId, boolean>`。
   * **可选**：缺省 = 产品默认（claude-code=true，其余关）。
   * 只声明能力位非 false 的平台（能力位表在 adapters，schema 层只守形状）。
   */
  l1: L1_PARTIAL.optional(),
  fingerprint: z.string().regex(SHA256_HEX_RE),
})
export type PackManifest = z.infer<typeof PackManifestSchema>

/** 单文件 bundle（design §7.1，CLI sync --file 直接消费） */
export const PackBundleSchema = z.object({
  bundleSchemaVersion: z.literal(BUNDLE_SCHEMA_VERSION),
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
