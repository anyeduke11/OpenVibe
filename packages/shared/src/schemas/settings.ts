import { z } from 'zod'
import {
  TELEMETRY_ASK_STATES,
  TELEMETRY_EVENTS,
  TELEMETRY_FLUSH_BATCH,
  TELEMETRY_OS,
} from '../constants'

/**
 * 遥测端点 URL（T8d）：公网只收 https；回环 http 放行，好让本地端到端用例
 * 能起一个真 HTTP 接收端而不必为此配证书。
 */
export const TelemetryEndpointUrl = z
  .string()
  .refine((v) => {
    try {
      const u = new URL(v)
      if (u.protocol === 'https:') return true
      return u.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(u.hostname)
    } catch {
      return false
    }
  }, 'telemetryEndpoint 需是 https URL（回环 http 仅限本机自测）')

/**
 * `~/.openvibe/config.json`（design §4，serve 首启生成，权限 0600）。
 * CLI 读取与 server 写入共用同一份校验，避免两端对「合法配置」的理解漂移。
 */
export const OpenvibeConfigSchema = z.object({
  serverUrl: z.string().min(1),
  token: z.string().regex(/^[!-~]+$/, 'token 必须是非空可见字符'),
  port: z.number().int().min(1).max(65535),
  /**
   * 匿名遥测计数端点（design §11.5 的 D12 自部署端点，T8d）。
   * 缺省或空串 = 永不外发：serve 连上报定时器都不建，「关闭即零外联」是结构性的。
   */
  telemetryEndpoint: TelemetryEndpointUrl.optional(),
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

/** OM1 单包密度（v0.2.3 批次 B RQ5；全本机现算，零出网）。perAsset = managedTokens ÷ assetCount，除零为 null */
export const OmDensityOut = z.object({
  packId: z.string(),
  packName: z.string(),
  packVersion: z.string(),
  /** 渲染产物（不含 manifest）的估算 token 合计（estimateTokens.approxTokens 口径，面板须标「估算」） */
  managedTokens: z.number().int(),
  /** 该包选中的资产数（四类资产条目 + 流程模板 0/1） */
  assetCount: z.number().int(),
  perAsset: z.number().nullable(),
  /** 按产物文件的 token 归因 Top5（哪几个文件最占上下文） */
  top5: z.array(z.object({ path: z.string(), tokens: z.number().int() })),
})
export type OmDensityOut = z.infer<typeof OmDensityOut>

/**
 * 输出侧度量两件（PRD-v0.2.3 RQ5 / OM1+OM2，GET /api/om）。
 * OM2 首次见效时间 = 首次本机事件（台账 MIN(created_at)，M8 起无条件记）→
 * 第一次注入（injections MIN(injected_at)）的墙钟差；任一端缺失为 null（面板显示「待采集」）。
 */
export const OmOut = z.object({
  density: OmDensityOut.nullable(),
  timeToValue: z.object({
    firstEventAt: z.string().nullable(),
    firstInjectionAt: z.string().nullable(),
    seconds: z.number().int().nullable(),
  }),
})
export type OmOut = z.infer<typeof OmOut>

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

/**
 * 出队批次（design §11.5 的固定上报体，T8d）：serve 每 60s 取 pending ≤100 条 POST 到
 * config.telemetryEndpoint。五段之外一律不进请求体——路径、文件内容、机器标识不带出去。
 */
export const TelemetryBatchEvent = z.object({
  event: z.enum(TELEMETRY_EVENTS),
  value: z.string(),
  day: z.string(),
  os: z.enum(TELEMETRY_OS),
  appVersion: z.string(),
})
export type TelemetryBatchEvent = z.infer<typeof TelemetryBatchEvent>

export const TelemetryBatch = z.object({
  events: z.array(TelemetryBatchEvent).min(1).max(TELEMETRY_FLUSH_BATCH),
})
export type TelemetryBatch = z.infer<typeof TelemetryBatch>

/**
 * 本机事件台账（DB-1 批的 GET /api/telemetry/events）：append-only 的本地队列只读视图。
 *
 * **字段名与表列的映射（telemetry_events 无 name/ts/props 三列，别按名字猜）**：
 * | 本字段   | 表列（migrations/0002_app_meta_telemetry.sql:7-16） |
 * |----------|--------------------------------------------------|
 * | `name`   | `event`   CHECK 枚举，恒为 TELEMETRY_EVENTS 之一 |
 * | `ts`     | `queued_at` 入队时刻（ISO）                    |
 * | `props`  | 该行其余已存列的逐字透出（见下）               |
 * props 装的是「除 id/name/ts 之外该行已存的内容」，不是自造结构：
 * value（客户端自报，≤200 字）/ day / os / appVersion / sent_at（null = 尚未外发）。
 *
 * 隐私口径（D-3 遥测默认关闭）：本端点**只读本地 SQLite，绝不出网**，返回值不含用户标识与本机路径
 * ——表里本来就没有这两类列，props 也不做任何拼接/推断。
 */
export const TELEMETRY_EVENTS_LIMIT_DEFAULT = 50
export const TELEMETRY_EVENTS_LIMIT_MAX = 200

export const TelemetryLedgerItemOut = z.object({
  id: z.number().int(),
  name: z.enum(TELEMETRY_EVENTS),
  ts: z.string().min(1),
  props: z.object({
    /** 客户端自报的有界值（TelemetryEventInput.value，≤200 字） */
    value: z.string(),
    day: z.string(),
    os: z.enum(TELEMETRY_OS),
    appVersion: z.string(),
    /** null = 仍在本地队列（尚未被 flush 端点收下） */
    sentAt: z.string().nullable(),
  }),
})
export type TelemetryLedgerItemOut = z.infer<typeof TelemetryLedgerItemOut>

export const TelemetryLedgerOut = z.object({
  items: z.array(TelemetryLedgerItemOut),
  /** 表总行数（含已外发），与 items 长度无关 */
  total: z.number().int(),
})
export type TelemetryLedgerOut = z.infer<typeof TelemetryLedgerOut>

/**
 * `?limit=` 的解析口径：**非法值回落默认**，不是 422。
 * 本端点契约要求 `limit=abc` / `limit=0` / 缺省一律回落到 50，与仓内「入参失败即 422」的默认姿态
 * 有意不同——它是个纯读端点，坏参数不该把整个侧栏打挂。
 * 上限 200 是硬夹取：超限按 200 返回，不回落 50。
 */
export const TelemetryLedgerLimit = z.preprocess(
  (raw) => {
    const n = Number(raw)
    return Number.isInteger(n) ? n : Number.NaN
  },
  z.number().int().min(1).max(TELEMETRY_EVENTS_LIMIT_MAX),
)
export type TelemetryLedgerLimit = z.infer<typeof TelemetryLedgerLimit>

/** M8-E 的写侧总闸（`m8-agent-panel.md` FR-5.5.2.1）。**默认关**（缺行即 false） */
export const AgentWriteToggleInput = z.object({
  enabled: z.boolean(),
})
export type AgentWriteToggleInput = z.infer<typeof AgentWriteToggleInput>

export const AgentWriteSettingsOut = z.object({
  enabled: z.boolean(),
})
export type AgentWriteSettingsOut = z.infer<typeof AgentWriteSettingsOut>
