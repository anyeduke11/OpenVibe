import { z } from 'zod'
import { TELEMETRY_ASK_STATES, TELEMETRY_EVENTS } from '../constants'

/**
 * `~/.openvibe/config.json`（design §4，serve 首启生成，权限 0600）。
 * CLI 读取与 server 写入共用同一份校验，避免两端对「合法配置」的理解漂移。
 */
export const OpenvibeConfigSchema = z.object({
  serverUrl: z.string().min(1),
  token: z.string().regex(/^[!-~]+$/, 'token 必须是非空可见字符'),
  port: z.number().int().min(1).max(65535),
})
export type OpenvibeConfig = z.infer<typeof OpenvibeConfigSchema>

export const SettingsOut = z.object({
  appVersion: z.string(),
  dataDir: z.string(),
  port: z.number().int(),
  seed: z.object({
    terms: z.number().int(),
    flowTemplates: z.number().int(),
    prompts: z.number().int(),
  }),
  db: z.object({ status: z.enum(['ok', 'pending', 'error']), detail: z.string().optional() }),
  /** 向导完成标记（onboarding FR-2.3）：跳过或走完后不再出现，设置页可重置 */
  onboardingDone: z.boolean(),
})
export type SettingsOut = z.infer<typeof SettingsOut>

/** POST /api/settings/onboarding（onboarding FR-2.3 的写入通道，与 telemetry 开关同构） */
export const OnboardingToggleInput = z.object({
  done: z.boolean(),
})
export type OnboardingToggleInput = z.infer<typeof OnboardingToggleInput>

/** 飞轮统计五项（onboarding FR-3，T8b 新增 GET /api/stats；全本地 SQL 聚合，不参与遥测） */
export const FlywheelStatsOut = z.object({
  /** 资产数：提示词(M1) + 术语(M3) + Skill(M2) 条目之和 */
  assets: z.number().int(),
  /** 标准包数（不含导出次数，导出历史另有 /api/packs/:id/exports） */
  packs: z.number().int(),
  /** 注入次数：injections 记录数 */
  injections: z.number().int(),
  /** 回流条数：linked_asset_ids 非空的开发日志数 */
  reflows: z.number().int(),
  /** 飞轮圈数：同项目「有导出包 → 有注入 → 有 ≥1 条回流」记 1 圈，按项目去重（FR-3.2） */
  loops: z.number().int(),
})
export type FlywheelStatsOut = z.infer<typeof FlywheelStatsOut>

/** default 预置包的组装结论（onboarding FR-1；D-3：只有缺失才重建） */
export const DefaultPackOutcomeOut = z.object({
  status: z.enum(['created', 'exists', 'skipped', 'failed']),
  packId: z.string().nullable(),
  rebuilt: z.boolean(),
  version: z.string().nullable(),
  directoryPath: z.string().nullable(),
  /** 人读原因：skipped=用户已修改，failed=种子未就绪或导出失败 */
  reason: z.string().nullable(),
})
export type DefaultPackOutcomeOut = z.infer<typeof DefaultPackOutcomeOut>

/**
 * 逐 bundle 的幂等播种计数（core 的 SeedBundleResult 折叠形态）。
 * `bundles` 是 bundle 粒度结论（content_hash 未变即 skipped），与逐条 `skipped` 计数含义不同。
 */
export const SeedSummary = z.object({
  created: z.record(z.string(), z.number().int()),
  updated: z.record(z.string(), z.number().int()),
  skipped: z.record(z.string(), z.number().int()),
  bundles: z.record(z.string(), z.enum(['skipped', 'imported', 'error'])),
  warnings: z.array(z.string()),
})
export type SeedSummary = z.infer<typeof SeedSummary>

/** POST /api/settings/reseed：逐 bundle 幂等结果 + 预置包重建结论（dev-plan §607 / FR-1.2） */
export const ReseedOut = z.object({
  seed: SeedSummary,
  defaultPack: DefaultPackOutcomeOut,
  settings: SettingsOut,
})
export type ReseedOut = z.infer<typeof ReseedOut>

/** GET /api/injection-status?dir= 的入参守卫（onboarding FR-2.4 步骤③自动确认，D-5） */
export const InjectionStatusQuery = z.object({
  dir: z.string().min(1, 'dir 必填：待检测的项目根目录绝对路径'),
})
export type InjectionStatusQuery = z.infer<typeof InjectionStatusQuery>

/** C-3（dev-plan §3.10）：遥测开关/询问状态读写 */
export const TelemetrySettingsOut = z.object({
  enabled: z.boolean(),
  askState: z.enum(TELEMETRY_ASK_STATES),
  whitelist: z.array(z.enum(TELEMETRY_EVENTS)),
})
export type TelemetrySettingsOut = z.infer<typeof TelemetrySettingsOut>

export const TelemetryToggleInput = z.object({
  enabled: z.boolean(),
})
export type TelemetryToggleInput = z.infer<typeof TelemetryToggleInput>

/**
 * CLI 侧唯一遥测出口的入参（C-41）：只有事件名与有界值两段——
 * 路径、文件内容、机器标识一律不进请求体，因此即使 CLI 有 bug 也带不出去。
 * day/os/appVersion 由服务端按本机事实补齐（dev-plan §6.5）。
 */
export const TelemetryEventInput = z.object({
  event: z.enum(TELEMETRY_EVENTS),
  value: z.string().max(200).default(''),
})
export type TelemetryEventInput = z.infer<typeof TelemetryEventInput>

/** queued=false 只可能是开关关闭（服务端二次闸门），不是失败 */
export const TelemetryEnqueueOut = z.object({
  queued: z.boolean(),
  reason: z.enum(['enabled', 'disabled']),
})
export type TelemetryEnqueueOut = z.infer<typeof TelemetryEnqueueOut>
