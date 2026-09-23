import type { FastifyInstance } from 'fastify'
import {
  APP_META_KEYS,
  AppMetaRepo,
  TelemetryRepo,
  runSeed,
  type SeedBundleResult,
  type SqliteDatabase,
} from '@openvibe/core'
import {
  FlywheelStatsOut,
  TELEMETRY_EVENTS,
  TelemetryEventInput,
  TelemetryToggleInput,
  OnboardingToggleInput,
  telemetryDay,
  telemetryOs,
  type SeedSummary,
  type SettingsOut,
  type TelemetryAskState,
  type TelemetrySettingsOut,
} from '@openvibe/shared'
import { ensureDefaultPack } from '../lib/default-pack'
import { defaultSeedDir } from '../lib/seed-dir'
import { parseOrThrow } from '../lib/validate'

/**
 * 设置路由（dev-plan §3.12 / §607）：服务信息 + 遥测（C-3）+ 向导标记 + 种子重播。
 * `GET /settings`、`POST /settings/reseed` 补 T8b（C-56 遗留）；
 * `POST /settings/onboarding` 是向导完成标记的写入通道，与 telemetry 开关同构（design §6 已补行）。
 */
export interface SettingsRouteDeps {
  db: SqliteDatabase
  appVersion: string
  /** 数据目录（design §4 的 ~/.openvibe），设置页展示用 */
  dataDir?: string
  /** 监听端口；缺省按 DEFAULT_PORT 报（测试未 listen 时也是这个值） */
  port?: number
  /** 种子目录：bootstrap 传自己的，测试可用 OPENVIBE_SEED_DIR 指向夹具 */
  seedDir?: string
  /** SQLite 文件路径，settings.db.detail 用 */
  dbPath?: string
  /** process.platform 的注入点：遥测 os 标签归一用（测试夹具传别名） */
  platform?: string
  now?: () => Date
}

/** buildApp 可注入的 settings 入参（db / appVersion 由 buildApp 自己持有） */
export type SettingsRouteInput = Omit<SettingsRouteDeps, 'db'>

/** 默认关闭（design §11.5）：两个 app_meta 键缺行即为 unset/false */
function telemetryView(meta: AppMetaRepo): TelemetrySettingsOut {
  return {
    enabled: meta.read<boolean>(APP_META_KEYS.telemetryEnabled, false),
    askState: meta.read<TelemetryAskState>(APP_META_KEYS.telemetryAskState, 'unset'),
    whitelist: [...TELEMETRY_EVENTS],
  }
}

const countOf = (db: SqliteDatabase, table: string): number =>
  (db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c

export function seedSummaryOf(results: SeedBundleResult[]): SeedSummary {
  const seed: SeedSummary = { created: {}, updated: {}, skipped: {}, bundles: {}, warnings: [] }
  for (const r of results) {
    seed.created[r.bundle] = r.created
    seed.updated[r.bundle] = r.updated
    seed.skipped[r.bundle] = r.skipped
    seed.bundles[r.bundle] = r.status
    for (const w of r.warnings) seed.warnings.push(`${r.bundle}: ${w}`)
  }
  return seed
}

export function settingsView(deps: SettingsRouteDeps): SettingsOut {
  const meta = new AppMetaRepo(deps.db)
  return {
    appVersion: deps.appVersion,
    dataDir: deps.dataDir ?? '',
    port: deps.port ?? 0,
    seed: {
      terms: countOf(deps.db, 'terms'),
      flowTemplates: countOf(deps.db, 'flow_templates'),
      prompts: countOf(deps.db, 'prompts'),
    },
    db: { status: 'ok', ...(deps.dbPath ? { detail: deps.dbPath } : {}) },
    onboardingDone: meta.read<boolean>(APP_META_KEYS.onboardingDone, false),
  }
}

export function registerSettingsRoutes(app: FastifyInstance, deps: SettingsRouteDeps): void {
  const meta = new AppMetaRepo(deps.db)
  const telemetry = new TelemetryRepo(deps.db)
  const now = deps.now ?? (() => new Date())
  const platform = deps.platform ?? process.platform
  const seedDir = deps.seedDir ?? defaultSeedDir()

  app.get('/api/settings', async () => settingsView(deps))

  /** 重置/完成向导（onboarding FR-2.3）：done=false 即设置页「重新显示向导」 */
  app.post('/api/settings/onboarding', async (req) => {
    const { done } = parseOrThrow(OnboardingToggleInput, req.body)
    meta.write(APP_META_KEYS.onboardingDone, done)
    return { onboardingDone: done }
  })

  app.get('/api/settings/telemetry', async () => telemetryView(meta))

  /** D13：一次询问的落点。accepted=开关打开，declined=关掉且永不再问，故由 enabled 反推 askState */
  app.post('/api/settings/telemetry', async (req) => {
    const { enabled } = parseOrThrow(TelemetryToggleInput, req.body)
    meta.write(APP_META_KEYS.telemetryEnabled, enabled)
    meta.write(APP_META_KEYS.telemetryAskState, enabled ? 'accepted' : 'declined')
    return telemetryView(meta)
  })

  /**
   * 重播种子（dev-plan §607，幂等规则同 §7.4）+ 重建预置包（FR-1.2，同一 D-3 口径：
   * 用户改过的条目与改过的包都只跳过并如实报 reason，不静默覆盖）。
   */
  app.post('/api/settings/reseed', async () => {
    const seed = seedSummaryOf(runSeed(deps.db, seedDir))
    const defaultPack = ensureDefaultPack(deps.db)
    return { seed, defaultPack, settings: settingsView(deps) }
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

  /**
   * 飞轮五项（onboarding FR-3，D-4 新增）：全本地 SQL 聚合，不参与遥测。
   * 圈数口径 FR-3.2：同一项目「登记了标准包且该包有导出 → 该路径有注入记录 → 有 ≥1 条回流资产」记 1 圈。
   */
  app.get('/api/stats', async (): Promise<FlywheelStatsOut> => {
    const one = (sql: string): number => (deps.db.prepare(sql).get() as { c: number }).c
    return {
      assets:
        countOf(deps.db, 'prompts') + countOf(deps.db, 'terms') + countOf(deps.db, 'skills'),
      packs: countOf(deps.db, 'standard_packs'),
      injections: countOf(deps.db, 'injections'),
      reflows: one(
        `SELECT COUNT(*) AS c FROM dev_log_entries WHERE json_array_length(linked_asset_ids) > 0`,
      ),
      loops: one(
        `SELECT COUNT(*) AS c FROM projects p
          WHERE p.standard_pack_id IS NOT NULL
            AND p.local_path IS NOT NULL
            AND EXISTS (SELECT 1 FROM pack_exports e WHERE e.pack_id = p.standard_pack_id)
            AND EXISTS (SELECT 1 FROM injections i
                         WHERE i.project_path = p.local_path
                           AND i.pack_id = p.standard_pack_id)
            AND EXISTS (SELECT 1 FROM dev_log_entries d
                         WHERE d.project_id = p.id
                           AND json_array_length(d.linked_asset_ids) > 0)`,
      ),
    }
  })
}
