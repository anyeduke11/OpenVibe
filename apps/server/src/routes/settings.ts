import type { FastifyInstance } from 'fastify'
import {
  agentWriteView,
  countOf as countRows,
  enqueueTelemetryEvent,
  flywheelStats,
  getPack,
  latestPackId,
  onboardingDone as readOnboardingDone,
  packExists,
  setAgentWrite,
  setOnboardingDone,
  setTelemetry,
  telemetryView as readTelemetryView,
  omTimeToValue,
  telemetryEventCount,
  telemetryEvents,
  estimateTokens,
  seedConceptContent,
  seedConceptDeltas,
  seedLangResourceLayer,
  seedLangTopics,
  seedProfilePhases,
  M9_SEEDS_DIR,
  seedTopicEdges,
  seedTopicProfiles,
  runSeed,
  type SeedBundleResult,
  type SqliteDatabase,
} from '@openvibe/core'
import {
  FlywheelStatsOut,
  AgentWriteToggleInput,
  TelemetryEventInput,
  TelemetryLedgerLimit,
  TelemetryToggleInput,
  OnboardingToggleInput,
  TELEMETRY_EVENTS_LIMIT_DEFAULT,
  TELEMETRY_EVENTS_LIMIT_MAX,
  type OmOut,
  type SeedSummary,
  type SettingsOut,
  type TelemetryEvent,
  type TelemetryLedgerOut,
  type TelemetryOs,
} from '@openvibe/shared'
import { AppError } from '@openvibe/shared'
import { DEFAULT_PACK_VERSION, ensureDefaultPack } from '../lib/default-pack'
import { renderPack } from '../lib/pack-assemble'
import { defaultSeedDir } from '../lib/seed-dir'
import { parseOrThrow } from '../lib/validate'
import { reportRoute } from '../lib/route-source'

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
  return {
    appVersion: deps.appVersion,
    dataDir: deps.dataDir ?? '',
    port: deps.port ?? 0,
    seed: {
      terms: countRows({ db: deps.db }, 'terms'),
      flowTemplates: countRows({ db: deps.db }, 'flow_templates'),
      prompts: countRows({ db: deps.db }, 'prompts'),
    },
    db: { status: 'ok', ...(deps.dbPath ? { detail: deps.dbPath } : {}) },
    onboardingDone: readOnboardingDone({ db: deps.db }),
  }
}

export function registerSettingsRoutes(app: FastifyInstance, deps: SettingsRouteDeps): void {
  // F-1：app_meta / telemetry 的读写全部经 settingsService（FR-3.1：路由只做「解析 → 调 service → 序列化」）
  const now = deps.now ?? (() => new Date())
  const platform = deps.platform ?? process.platform
  const seedDir = deps.seedDir ?? defaultSeedDir()

  app.get('/api/settings', reportRoute('/api/settings', 'db'), async () => settingsView(deps))

  /** 重置/完成向导（onboarding FR-2.3）：done=false 即设置页「重新显示向导」 */
  app.post('/api/settings/onboarding', async (req) => {
    const { done } = parseOrThrow(OnboardingToggleInput, req.body)
    return setOnboardingDone({ db: deps.db }, done)
  })

  app.get('/api/settings/telemetry', reportRoute('/api/settings/telemetry', 'db'), async () =>
    readTelemetryView({ db: deps.db }),
  )

  /**
   * M8-E 写侧总闸（`m8-agent-panel.md` FR-5.5.2.1）。
   *
   * **为什么单独一个端点而不是并进 `/api/settings/telemetry`**：FR-5.5.2 明写
   * 「台账总开关与遥测总开关**不在此处重复**」—— 混进同一个端点，
   * 前端就得维护一份「哪些键属于哪节」的映射，而那正是重复开关的成因。
   */
  app.get(
    '/api/settings/agent-write',
    reportRoute('/api/settings/agent-write', 'db'),
    async () => ({
      ...agentWriteView({ db: deps.db }),
    }),
  )

  app.post('/api/settings/agent-write', async (req) => {
    const { enabled } = parseOrThrow(AgentWriteToggleInput, req.body)
    return setAgentWrite({ db: deps.db }, enabled)
  })

  /** D13：一次询问的落点。accepted=开关打开，declined=关掉且永不再问，故由 enabled 反推 askState */
  app.post('/api/settings/telemetry', async (req) => {
    const { enabled } = parseOrThrow(TelemetryToggleInput, req.body)
    return setTelemetry({ db: deps.db }, enabled)
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

  /**
   * C 收尾①（owner 增强项）：m9 六播种器按 CS2 合并语义统一重放。
   * 顺序 = 依赖序：topics → concepts/content → deltas → edges → profiles → resources；
   * 返回各 bundle 的三态计数（created/updated/ignored/userModified），供 UI 汇总。
   * 全部本机现算、零出网、零删除（合并永不 clobber 用户态）。
   */
  app.post('/api/settings/reseed/m9', async () => {
    // M9 语言线的种子目录是 core/db/seeds（采集脚本写、reseed 读），不是主通道的 content/seed
    const dir = M9_SEEDS_DIR
    const run = (r: {
      bundle: string
      status: string
      created: number
      updated?: number
      ignored?: number
      userModified?: number
      warnings?: string[]
    }): unknown => ({
      bundle: r.bundle,
      status: r.status,
      created: r.created,
      updated: r.updated ?? 0,
      ignored: r.ignored ?? 0,
      userModified: r.userModified ?? 0,
      warnings: r.warnings ?? [],
    })
    return {
      results: [
        ...seedLangTopics(deps.db, dir).map(run),
        ...seedConceptContent(deps.db, dir).map(run),
        run(seedConceptDeltas(deps.db, dir)),
        run(seedTopicEdges(deps.db, dir)),
        ...seedProfilePhases(deps.db, dir).map(run),
        ...seedTopicProfiles(deps.db).map(run),
        ...seedLangResourceLayer(deps.db, dir).map(run),
      ],
    }
  })

  /** 事件入队（服务端第二道闸门：开关关闭时连队列都不写，更不会有外联） */
  app.post('/api/telemetry/events', async (req) => {
    const { event, value } = parseOrThrow(TelemetryEventInput, req.body)
    // F-1：入队连同「开关关闭就不入队」这条闸门一起迁进 settingsService
    return enqueueTelemetryEvent(
      { db: deps.db },
      { event, value, appVersion: deps.appVersion, at: now(), platform },
    )
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
  app.get(
    '/api/telemetry/events',
    reportRoute('/api/telemetry/events', 'db'),
    async (req): Promise<TelemetryLedgerOut> => {
      const { limit } = req.query as { limit?: unknown }
      // F-1：分页与计数迁入 statsService（FR-3.1：路由只做「解析 → 调 service → 序列化」）
      const rows = telemetryEvents({ db: deps.db }, ledgerLimit(limit)) as Array<{
        id: number
        event: TelemetryEvent
        value: string
        day: string
        os: TelemetryOs
        app_version: string
        queued_at: string
        sent_at: string | null
      }>
      const total = telemetryEventCount({ db: deps.db })
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
    },
  )

  /**
   * 飞轮五项（onboarding FR-3，D-4 新增）：全本地 SQL 聚合，不参与遥测。
   * 圈数口径 FR-3.2：同一项目「登记了标准包且该包有导出 → 该路径有注入记录 → 有 ≥1 条回流资产」记 1 圈。
   */
  app.get('/api/stats', reportRoute('/api/stats', 'db'), async (): Promise<FlywheelStatsOut> => {
    // F-1（service-layer FR-3.1/FR-3.2）：聚合 SQL 整体迁入 `statsService`——
    // 圈数的三条 EXISTS 判定与「达成日取三时间戳最大值」是**业务规则**，
    // 留在 route 里等于把判定规则的实现处数从 1 摊成 N（spec §1 的价值判据）。
    // 圈数台账（逐项目求值）与 `loops` 同源判定，只把「数项目」换成「列项目」。
    return flywheelStats({ db: deps.db })
  })

  /**
   * 输出侧度量两件（v0.2.3 批次 B RQ5，GET /api/om；全本机现算，零出网，不参与遥测）。
   * OM1 密度：一个标准包的渲染产物（不含 manifest）估算 token ÷ 选中资产数——
   * 缺省取最新建包（created_at 口径），`?pack_id=` 可指定（未知 id 404）；包侧渲染
   * 走与 preview/export 同一 renderPack（字节同源）。OM2 首次见效：
   * 台账首次事件 → injections 首次注入的墙钟差；台账被清空或从未注入 ⇒ null（面板显示待采集）。
   */
  app.get('/api/om', reportRoute('/api/om', 'db'), async (req): Promise<OmOut> => {
    const askedPackId = (req.query as { pack_id?: string } | undefined)?.pack_id
    let packRow: { id: string } | undefined
    if (askedPackId !== undefined && askedPackId !== '') {
      if (!packExists({ db: deps.db }, askedPackId)) {
        throw new AppError('NOT_FOUND', `标准包不存在: ${askedPackId}`)
      }
      packRow = { id: askedPackId }
    } else {
      // ⚠️ 2026-11-07 修 DEV-0202 登记的 flaky（OM-05 偶发失败）。
      //   原实现 `ORDER BY created_at DESC, id DESC`：`created_at` 是 ISO **毫秒**字符串，
      //   两次快速建包会落在同一毫秒（实测 repo 直调：间隔 0–1 ms，`created_at` 去重后 = 1）；
      //   此时 tiebreak 是 `id DESC`，而 `id` 是 **nanoid（随机）** ⇒「最新」由随机数决定。
      //   ⇒ tiebreak 换成 `rowid DESC`：`standard_packs` 是普通 rowid 表（非 WITHOUT ROWID），
      //     `rowid` 即落库序，同毫秒时后插者赢，与「最新建包」的语义一致。
      //   （同仓先例：`repos/skills.ts:606` 的 `versions()` 早已因同一理由改用 rowid。）
      packRow = latestPackId({ db: deps.db })
    }
    let density: OmOut['density'] = null
    if (packRow) {
      const pack = getPack({ db: deps.db }, packRow.id)
      if (pack) {
        const rendered = renderPack(deps.db, pack, DEFAULT_PACK_VERSION, pack.updatedAt)
        const per = rendered.files
          .filter((f) => f.path !== 'openvibe.pack.json')
          .map((f) => ({ path: f.path, tokens: estimateTokens(f.content).approxTokens }))
        const managedTokens = per.reduce((sum, p) => sum + p.tokens, 0)
        const sel = pack.selection
        const assetCount =
          sel.promptIds.length +
          sel.termIds.length +
          sel.skillIds.length +
          sel.playbookIds.length +
          (sel.flowTemplateId === null ? 0 : 1)
        density = {
          packId: pack.id,
          packName: pack.name,
          packVersion: DEFAULT_PACK_VERSION,
          managedTokens,
          assetCount,
          perAsset: assetCount > 0 ? Math.round((managedTokens / assetCount) * 10) / 10 : null,
          top5: [...per].sort((a, b) => b.tokens - a.tokens).slice(0, 5),
        }
      }
    }

    // F-1：OM2 的两个 MIN + 墙钟差整体迁入 statsService（判定规则只此一处实现）
    return { density, timeToValue: omTimeToValue({ db: deps.db }) }
  })
}
