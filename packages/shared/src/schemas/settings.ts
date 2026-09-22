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
})
export type SettingsOut = z.infer<typeof SettingsOut>

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
