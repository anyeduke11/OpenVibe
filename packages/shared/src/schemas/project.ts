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
  /** 可选：PATCH 允许只改状态/阶段而不触碰路径（仓储层按 undefined 保留原值） */
  localPath: z.string().nullable().optional(),
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

/**
 * 注入文件状态（原型 inject「产物台账（九文件 + lock）」）。
 *
 * 前四态与 `verifyAgainstLock` 的 `CONSISTENCY_STATES` 逐字一致（service-layer FR-2 的单一词表）：
 * - `IN_SYNC` 磁盘 == 声明
 * - `DRIFT` 受管且磁盘 ≠ 声明（本地手改）
 * - `ABSENT` 磁盘不存在
 * - `FOREIGN` 未受管 / `.openvibe/` 内部条目（本包不据此下结论）
 * `LOCK` 是**合成行**：lock 文件自身不是包产物，但台账要能看见它（原型把它单列一行）。
 */
export const INJECTION_FILE_STATES = ['IN_SYNC', 'DRIFT', 'ABSENT', 'FOREIGN', 'LOCK'] as const
export type InjectionFileState = (typeof INJECTION_FILE_STATES)[number]

export const InjectionFileRow = z.object({
  path: z.string(),
  state: z.enum(INJECTION_FILE_STATES),
  /** 是否受本包管辖（`FOREIGN` 的定义即 `managed !== true`） */
  managed: z.boolean(),
  /** 声明侧哈希（lock 记的期望值），原样回传供核对 */
  declaredSha256: z.string().optional(),
  /** 磁盘实算哈希；`ABSENT` 为 null */
  diskSha256: z.string().nullable().optional(),
})
export type InjectionFileRow = z.infer<typeof InjectionFileRow>

/**
 * 注入文件扫描出参（`GET /api/projects/:id/injection-files`）。
 *
 * ⚠️ 与 `InjectionStatusOut` 的分工：后者答「注入过没有、版本对不对」，
 *   前者答「**每个文件现在对不对得上**」。两者都只读 lock，都不写盘。
 */
export const InjectionFileScanOut = z.object({
  lockPresent: z.boolean(),
  pack: z
    .object({
      name: z.string(),
      version: z.string(),
      fingerprint: z.string(),
    })
    .optional(),
  injectedAt: z.string().optional(),
  files: z.array(InjectionFileRow),
  error: z.string().optional(),
})
export type InjectionFileScanOut = z.infer<typeof InjectionFileScanOut>
