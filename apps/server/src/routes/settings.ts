import type { FastifyInstance } from 'fastify'
import { APP_META_KEYS, AppMetaRepo, TelemetryRepo, type SqliteDatabase } from '@openvibe/core'
import {
  TELEMETRY_EVENTS,
  TelemetryEventInput,
  TelemetryToggleInput,
  telemetryDay,
  telemetryOs,
  type TelemetryAskState,
  type TelemetrySettingsOut,
} from '@openvibe/shared'
import { parseOrThrow } from '../lib/validate'

/**
 * 设置路由的遥测半边（dev-plan §3.10 + §4.6 的 C-3 两端点，加 C-41 的入队端点）。
 * `GET /settings` 与 `POST /settings/reseed` 属 T8 的设置页，尚未实现。
 *
 * C-41：CLI 是薄客户端、不碰 SQLite（design §9），所以它的 reportEvent() 只能经服务端入队；
 * dev-plan §6.5 写了「写 telemetry_events 队列」却没给通道，这里补上 POST /api/telemetry/events。
 */
export interface SettingsRouteDeps {
  db: SqliteDatabase
  appVersion: string
  /** process.platform 的注入点：遥测 os 标签归一用（测试夹具传别名） */
  platform?: string
  now?: () => Date
}

/** 默认关闭（design §11.5）：两个 app_meta 键缺行即为 unset/false */
function view(meta: AppMetaRepo): TelemetrySettingsOut {
  return {
    enabled: meta.read<boolean>(APP_META_KEYS.telemetryEnabled, false),
    askState: meta.read<TelemetryAskState>(APP_META_KEYS.telemetryAskState, 'unset'),
    whitelist: [...TELEMETRY_EVENTS],
  }
}

export function registerSettingsRoutes(app: FastifyInstance, deps: SettingsRouteDeps): void {
  const meta = new AppMetaRepo(deps.db)
  const telemetry = new TelemetryRepo(deps.db)
  const now = deps.now ?? (() => new Date())
  const platform = deps.platform ?? process.platform

  app.get('/api/settings/telemetry', async () => view(meta))

  /** D13：一次询问的落点。accepted=开关打开，declined=关掉且永不再问，故由 enabled 反推 askState */
  app.post('/api/settings/telemetry', async (req) => {
    const { enabled } = parseOrThrow(TelemetryToggleInput, req.body)
    meta.write(APP_META_KEYS.telemetryEnabled, enabled)
    meta.write(APP_META_KEYS.telemetryAskState, enabled ? 'accepted' : 'declined')
    return view(meta)
  })

  /** 事件入队（服务端第二道闸门：开关关闭时连队列都不写，更不会有外联） */
  app.post('/api/telemetry/events', async (req) => {
    const { event, value } = parseOrThrow(TelemetryEventInput, req.body)
    if (!meta.read<boolean>(APP_META_KEYS.telemetryEnabled, false)) {
      return { queued: false, reason: 'disabled' as const }
    }
    const at = now()
    telemetry.enqueue({
      event,
      value,
      day: telemetryDay(at),
      os: telemetryOs(platform),
      appVersion: deps.appVersion,
      queuedAt: at.toISOString(),
    })
    return { queued: true, reason: 'enabled' as const }
  })
}
