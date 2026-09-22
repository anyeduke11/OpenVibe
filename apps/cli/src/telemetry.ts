import { confirm, isCancel } from '@clack/prompts'
import type { TelemetryEvent, TelemetrySettingsOut } from '@openvibe/shared'
import type { ApiClient } from './client'

/**
 * 匿名遥测的唯一出口（design §11.5 / dev-plan §6.5）。
 * 默认关闭：reportEvent() 先读一次开关，关闭即返回——不写队列、不外联，
 * 单测据此断言「关闭态零事件请求」。任何网络失败都收敛成 sent:false，
 * 因为遥测永远不该让一次已经成功的注入变成失败。
 */

export const TELEMETRY_ASK_MESSAGE =
  '开启匿名统计？只上报三类事件（包名@版本 / 模板 kind / 日活计数），不含路径与文件内容，可随时在 Web 设置页关闭。'

export type ReportReason = 'queued' | 'disabled' | 'offline' | 'error'

export interface TelemetryReport {
  sent: boolean
  reason: ReportReason
  detail?: string
  /** 读到的开关态，供 D13 询问复用（避免第二次 GET） */
  settings?: TelemetrySettingsOut
}

const detailOf = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/** event 只能是白名单三类（shared 的 zod 兜底），value 由调用方给「包名@版本」这类有界值 */
export async function reportEvent(
  client: ApiClient | undefined,
  event: TelemetryEvent,
  value: string,
): Promise<TelemetryReport> {
  if (!client) return { sent: false, reason: 'offline' }
  let settings: TelemetrySettingsOut
  try {
    settings = await client.getJson<TelemetrySettingsOut>('/api/settings/telemetry')
  } catch (e) {
    return { sent: false, reason: 'error', detail: detailOf(e) }
  }
  if (!settings.enabled) return { sent: false, reason: 'disabled', settings }
  try {
    await client.postJson('/api/telemetry/events', { event, value })
    return { sent: true, reason: 'queued', settings }
  } catch (e) {
    return { sent: false, reason: 'error', detail: detailOf(e), settings }
  }
}

export type ConfirmAnswer = 'yes' | 'no' | 'cancel'
export type ConfirmFn = (message: string) => Promise<ConfirmAnswer>

/** design §9 的交互组件：@clack 的单行 confirm，Ctrl-C 与「不」分开处理 */
export const clackConfirm: ConfirmFn = async (message) => {
  const answer = await confirm({ message, active: '开启', inactive: '不开启' })
  if (isCancel(answer)) return 'cancel'
  return answer ? 'yes' : 'no'
}

export type AskReason =
  'accepted' | 'declined' | 'cancelled' | 'offline' | 'asked' | 'non-tty' | 'json' | 'error'

export interface AskTelemetryResult {
  /** 是否真的打扰了用户 */
  asked: boolean
  reason: AskReason
}

/**
 * D13 一次性询问：仅在首次注入成功、开关从未表态、且真的在交互终端时发生一次。
 * 非 TTY / --json / 离线一律跳过（C-4：单一数据源是 app_meta，延迟到 Web 向导③的卡片）。
 */
export async function askTelemetryOnce(
  client: ApiClient | undefined,
  settings: TelemetrySettingsOut | undefined,
  options: { isTTY: boolean; json: boolean; confirmFn?: ConfirmFn },
): Promise<AskTelemetryResult> {
  if (!client || !settings) return { asked: false, reason: 'offline' }
  if (settings.askState !== 'unset') return { asked: false, reason: 'asked' }
  if (options.json) return { asked: false, reason: 'json' }
  if (!options.isTTY) return { asked: false, reason: 'non-tty' }

  const answer = await (options.confirmFn ?? clackConfirm)(TELEMETRY_ASK_MESSAGE)
  if (answer === 'cancel') return { asked: true, reason: 'cancelled' }
  const enabled = answer === 'yes'
  try {
    await client.postJson<TelemetrySettingsOut>('/api/settings/telemetry', { enabled })
  } catch {
    return { asked: true, reason: 'error' }
  }
  return { asked: true, reason: enabled ? 'accepted' : 'declined' }
}
