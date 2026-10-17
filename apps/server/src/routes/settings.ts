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
  AgentWriteToggleInput,
  TELEMETRY_EVENTS,
  TelemetryEventInput,
  TelemetryLedgerLimit,
  TelemetryToggleInput,
  OnboardingToggleInput,
  TELEMETRY_EVENTS_LIMIT_DEFAULT,
  TELEMETRY_EVENTS_LIMIT_MAX,
  telemetryDay,
  telemetryOs,
  type SeedSummary,
  type SettingsOut,
  type TelemetryAskState,
  type TelemetryEvent,
  type TelemetryLedgerOut,
  type TelemetryOs,
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

/**
 * `?limit=` 的读侧口径（契约：默认 50、上限 200、非法值回落默认）：
 * 合法整数直接用；超 200 夹到 200（不是回落 50）；其余（缺省 / 非数 / 0 / 负数 / 小数 / 重复键）
 * 一律回落默认。
 */
function ledgerLimit(raw: unknown): number {
  const parsed = TelemetryLedgerLimit.safeParse(raw)
  if (parsed.success) return parsed.data
  const n = typeof raw === 'string' ? Number(raw) : Number.NaN
  return Number.isInteger(n) && n > TELEMETRY_EVENTS_LIMIT_MAX
    ? TELEMETRY_EVENTS_LIMIT_MAX
    : TELEMETRY_EVENTS_LIMIT_DEFAULT
}

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

  /**
   * M8-E 写侧总闸（`m8-agent-panel.md` FR-5.5.2.1）。
   *
   * **为什么单独一个端点而不是并进 `/api/settings/telemetry`**：FR-5.5.2 明写
   * 「台账总开关与遥测总开关**不在此处重复**」—— 混进同一个端点，
   * 前端就得维护一份「哪些键属于哪节」的映射，而那正是重复开关的成因。
   */
  app.get('/api/settings/agent-write', async () => ({
    enabled: meta.read<boolean>(APP_META_KEYS.agentWriteEnabled, false),
  }))

  app.post('/api/settings/agent-write', async (req) => {
    const { enabled } = parseOrThrow(AgentWriteToggleInput, req.body)
    meta.write(APP_META_KEYS.agentWriteEnabled, enabled)
    return { enabled }
  })

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
   * 本机事件台账（V2 批）：append-only 队列的只读视图，本机可查、可清空（清空走既有 DB 通道）。
   *
   * 隐私口径（D-3 遥测默认关闭）：本端点**只读本地 SQLite，绝不出网**，也不写任何东西；
   * 返回值不含用户标识与本机路径——telemetry_events 根本没有这类列（见 0002 迁移的七列），
   * props 只是把该行已存的列逐字搬出来，不做拼接或推断。
   *
   * 字段名与表列的映射（表里没有 name/ts/props）：name←event、ts←queued_at、
   * props←{ value, day, os, app_version→appVersion, sent_at→sentAt }。
   *
   * `?limit=` 走「非法回落默认、超限夹到 200」而非 422（契约要求）：纯读端点不该因坏参数被整体打挂。
   */
  app.get('/api/telemetry/events', async (req): Promise<TelemetryLedgerOut> => {
    const { limit } = req.query as { limit?: unknown }
    const rows = deps.db
      .prepare(
        `SELECT id, event, value, day, os, app_version, queued_at, sent_at
           FROM telemetry_events ORDER BY id DESC LIMIT ?`,
      )
      .all(ledgerLimit(limit)) as {
      id: number
      event: TelemetryEvent
      value: string
      day: string
      os: TelemetryOs
      app_version: string
      queued_at: string
      sent_at: string | null
    }[]
    const total = (
      deps.db.prepare('SELECT COUNT(*) AS c FROM telemetry_events').get() as { c: number }
    ).c
    return {
      items: rows.map((r) => ({
        id: r.id,
        name: r.event,
        ts: r.queued_at,
        props: {
          value: r.value,
          day: r.day,
          os: r.os,
          appVersion: r.app_version,
          sentAt: r.sent_at,
        },
      })),
      total,
    }
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
