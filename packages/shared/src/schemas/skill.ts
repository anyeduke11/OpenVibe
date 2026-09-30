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
  // DEV-0068 起 additive：远程条目的溯源 key（github:owner/repo@branch[:path] / skillhub:slug）
  // 与树级指纹（内容无关，检查更新用）。本地条目两列为 null。
  remoteRef: z.string().nullable().default(null),
  remoteTreeHash: z.string().nullable().default(null),
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
  // DEV-0063 起 additive：实际枚举到的扫描根 / 显式传入但缺失的根（默认模式缺根不产生）
  scannedRoots: z.array(z.string()).default([]),
  missingRoots: z.array(z.string()).default([]),
})
export type SkillScanReport = z.infer<typeof SkillScanReport>

// ---------------------------------------------------------------------------
// 远程获取（DEV-0067）：GitHub 仓库 / SkillHub（skillhub.cn）
// ---------------------------------------------------------------------------

/** GitHub 导入：`owner/repo`（也接受完整仓库 URL，服务端归一）；ref 缺省=默认分支（即最新）；
 *  path 缺省=整仓，指定则只导入该子目录（DEV-0068） */
export const SkillRemoteImportInput = z.discriminatedUnion('source', [
  z.object({
    source: z.literal('github'),
    repo: z.string().min(1).max(200),
    ref: z.string().min(1).max(128).optional(),
    path: z.string().min(1).max(300).optional(),
  }),
  z.object({
    source: z.literal('skillhub'),
    slug: z.string().min(1).max(200),
  }),
])
export type SkillRemoteImportInput = z.input<typeof SkillRemoteImportInput>

export const SkillRemoteSearchInput = z.object({
  source: z.literal('skillhub'),
  q: z.string().min(1).max(200),
})
export type SkillRemoteSearchInput = z.infer<typeof SkillRemoteSearchInput>

export const SkillRemoteSearchItem = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  version: z.string().nullable(),
  downloads: z.number().int().min(0),
  stars: z.number().int().min(0),
  updatedAt: z.string(),
})
export type SkillRemoteSearchItem = z.infer<typeof SkillRemoteSearchItem>

export const SkillRemoteSearchReport = z.object({
  items: z.array(SkillRemoteSearchItem),
  total: z.number().int().min(0),
})
export type SkillRemoteSearchReport = z.infer<typeof SkillRemoteSearchReport>

export const SkillRemoteImportReport = z.object({
  source: z.enum(['github', 'skillhub']),
  /** 溯源串：`owner/repo@ref` 或 `skillhub.cn/skills/{slug}@{version}`（进版本线 version_label） */
  origin: z.string(),
  discovered: z.number().int().min(0),
  created: z.number().int().min(0),
  updated: z.number().int().min(0),
  skipped: z.number().int().min(0),
  warnings: z.array(z.string()),
})
export type SkillRemoteImportReport = z.infer<typeof SkillRemoteImportReport>

// ---------------------------------------------------------------------------
// 检查更新（DEV-0068）：树指纹对比，GitHub 整仓一次 trees 调用，零内容下载
// ---------------------------------------------------------------------------

export const SkillUpdateCheckInput = z.object({
  ids: z.array(z.string()).optional(),
})
export type SkillUpdateCheckInput = z.infer<typeof SkillUpdateCheckInput>

export const SkillUpdateCheckItem = z.object({
  skillId: z.string(),
  name: z.string(),
  source: z.enum(['github', 'skillhub']),
  /** 溯源 key（github:owner/repo@branch[:path] / skillhub:slug）；存量远程条目可能为 null */
  remoteRef: z.string().nullable(),
  status: z.enum(['upToDate', 'remoteChanged', 'notTracked', 'checkFailed']),
  /** 检查失败原因（status=checkFailed 时非空） */
  note: z.string().optional(),
})
export type SkillUpdateCheckItem = z.infer<typeof SkillUpdateCheckItem>

export const SkillUpdateCheckReport = z.object({
  items: z.array(SkillUpdateCheckItem),
  summary: z.object({
    upToDate: z.number().int().min(0),
    remoteChanged: z.number().int().min(0),
    notTracked: z.number().int().min(0),
    checkFailed: z.number().int().min(0),
  }),
})
export type SkillUpdateCheckReport = z.infer<typeof SkillUpdateCheckReport>

/** 补档（DEV-0069）：对未建档的存量远程条目按版本线溯源串重导一次，写入树指纹 */
export const SkillRetrackInput = z.object({
  ids: z.array(z.string()).optional(),
})
export type SkillRetrackInput = z.infer<typeof SkillRetrackInput>

export const SkillRetrackItem = z.object({
  skillId: z.string(),
  name: z.string(),
  /** retracked=建档成功；failed=溯源串不可解析或远端失败 */
  status: z.enum(['retracked', 'failed']),
  note: z.string().optional(),
})
export type SkillRetrackItem = z.infer<typeof SkillRetrackItem>

export const SkillRetrackReport = z.object({
  items: z.array(SkillRetrackItem),
  summary: z.object({ retracked: z.number().int().min(0), failed: z.number().int().min(0) }),
})
export type SkillRetrackReport = z.infer<typeof SkillRetrackReport>

// ---------------------------------------------------------------------------
// 重复整理（DEV-0067）：报告 + 由客户端按 id 逐条走既有 DELETE
// ---------------------------------------------------------------------------

export const SkillDuplicatesReport = z.object({
  /** 最新版本内容完全一致（dir_hash 相同且非空）的不同条目组——同名已被扫描去重，剩下的是「同内容不同名」或跨源副本 */
  sameContent: z.array(
    z.object({
      dirHash: z.string(),
      fileCount: z.number().int().min(0),
      skills: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          source: z.string(),
          skillDir: z.string().nullable(),
        }),
      ),
    }),
  ),
  /** source=local 且 skill_dir 在磁盘上已消失（目录被删/移动） */
  stale: z.array(
    z.object({ id: z.string(), name: z.string(), skillDir: z.string() }),
  ),
  /** 名称不符合 SKILL.md 规范（带引号残留 / 不在小写连字符约定内）——报告级，删除后重扫即归一 */
  nameAnomalies: z.array(
    z.object({ id: z.string(), name: z.string(), issue: z.string() }),
  ),
})
export type SkillDuplicatesReport = z.infer<typeof SkillDuplicatesReport>

// ---------------------------------------------------------------------------
// 内置审查（DEV-0067）：SKILL.md 规范 + 泄漏面检查
// ---------------------------------------------------------------------------

export const SkillReviewInput = z.object({
  ids: z.array(z.string()).optional(),
})
export type SkillReviewInput = z.infer<typeof SkillReviewInput>

export const SkillReviewIssue = z.object({
  severity: z.enum(['info', 'warn', 'fail']),
  code: z.string(),
  message: z.string(),
})
export type SkillReviewIssue = z.infer<typeof SkillReviewIssue>

export const SkillReviewItem = z.object({
  skillId: z.string(),
  name: z.string(),
  /** ok=无问题；其余取最重 issue 档位 */
  level: z.enum(['ok', 'info', 'warn', 'fail']),
  issues: z.array(SkillReviewIssue),
})
export type SkillReviewItem = z.infer<typeof SkillReviewItem>

export const SkillReviewReport = z.object({
  items: z.array(SkillReviewItem),
  summary: z.object({
    ok: z.number().int().min(0),
    info: z.number().int().min(0),
    warn: z.number().int().min(0),
    fail: z.number().int().min(0),
  }),
})
export type SkillReviewReport = z.infer<typeof SkillReviewReport>
