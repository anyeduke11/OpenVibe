import { APP_META_KEYS, AppMetaRepo } from '../repos/appMeta'
import type { SqliteDatabase } from '../db'
import { PacksRepo } from '../repos/packs'
import type { PackOut } from '@openvibe/shared'
import { TelemetryRepo } from '../repos/telemetry'
import {
  TELEMETRY_EVENTS,
  telemetryDay,
  telemetryOs,
  type TelemetryAskState,
  type TelemetryEvent,
  type TelemetrySettingsOut,
} from '@openvibe/shared'

/**
 * 设置域服务（F-1 · service-layer.md FR-3 的服务层收敛）。
 *
 * ## 为什么单独一个服务
 *
 * FR-3.1 的机判口径是「routes 里 `new *Repo(` 与 `db.prepare(` 命中归零」。设置路由是命中最密的
 * 一个文件（9 处），而它的写侧全部是**同一件事**：读写 `app_meta` 的几个布尔/枚举键
 * （向导完成标记、遥测开关与询问态、Agent 写侧总闸、提取总闸）。
 * 把它们收进服务层后：
 * - 「某个键的默认值是什么」只有**一处**定义（服务层），路由不再各自 `meta.read(key, false)`；
 * - 「遥测开关打开后询问态怎么变」这条规则也只有**一处**实现。
 *
 * ## 边界
 *
 * - FR-1.3 传输无关：不 import fastify／@clack／commander。
 * - FR-1.1 一次用户意图级入口：对外是 `telemetryView()` / `setTelemetry()` / `agentWriteView()` /
 *   `setAgentWrite()` / `onboardingDone()` / `latestPackId()` 这六个，不是 10 个 repo 方法的代理。
 * - **不做写入侧的统一门面**：种子重播、提取总闸等需要外部能力的入口仍留在路由（它们要注入
 *   seed 目录、runner 等外部能力，搬进 core 会破 FR-5 的 R2 红线）。
 */

export interface SettingsServiceDeps {
  db: SqliteDatabase
}

/** 遥测设置视图（缺省关闭——design §11.5：两个 app_meta 键缺行即为 unset/false） */
export function telemetryView(deps: SettingsServiceDeps): TelemetrySettingsOut {
  const meta = new AppMetaRepo(deps.db)
  return {
    enabled: meta.read<boolean>(APP_META_KEYS.telemetryEnabled, false),
    askState: meta.read<TelemetryAskState>(APP_META_KEYS.telemetryAskState, 'unset'),
    whitelist: [...TELEMETRY_EVENTS],
  }
}

/**
 * 遥测总开关的写入（D13：一次询问的落点）。
 *
 * ⚠️ `accepted=开关打开`、`declined=关掉且永不再问`——**询问态由开关反推**，两个键同批写。
 */
export function setTelemetry(deps: SettingsServiceDeps, enabled: boolean): TelemetrySettingsOut {
  const meta = new AppMetaRepo(deps.db)
  meta.write(APP_META_KEYS.telemetryEnabled, enabled)
  meta.write(APP_META_KEYS.telemetryAskState, enabled ? 'accepted' : 'declined')
  return telemetryView(deps)
}

/** Agent 写侧总闸（M8-E；与遥测总闸**不在同一端点**，FR-5.5.2 的要求） */
export function agentWriteView(deps: SettingsServiceDeps): { enabled: boolean } {
  const meta = new AppMetaRepo(deps.db)
  return { enabled: meta.read<boolean>(APP_META_KEYS.agentWriteEnabled, false) }
}

/** Agent 写侧总闸的写入 */
export function setAgentWrite(deps: SettingsServiceDeps, enabled: boolean): { enabled: boolean } {
  const meta = new AppMetaRepo(deps.db)
  meta.write(APP_META_KEYS.agentWriteEnabled, enabled)
  return { enabled }
}

/** 向导完成标记（设置页「重新显示向导」= 写 false） */
export function setOnboardingDone(
  deps: SettingsServiceDeps,
  done: boolean,
): { onboardingDone: boolean } {
  const meta = new AppMetaRepo(deps.db)
  meta.write(APP_META_KEYS.onboardingDone, done)
  return { onboardingDone: done }
}

/** 向导完成标记的读取 */
export function onboardingDone(deps: SettingsServiceDeps): boolean {
  const meta = new AppMetaRepo(deps.db)
  return meta.read<boolean>(APP_META_KEYS.onboardingDone, false)
}

/** AI 提取总闸（M10/D；与遥测总闸正交，缺省关） */
export function aiExtractEnabled(deps: SettingsServiceDeps): boolean {
  const meta = new AppMetaRepo(deps.db)
  return meta.read<boolean>(APP_META_KEYS.aiExtractEnabled, false)
}

/** AI 提取总闸的写入 */
export function setAiExtractEnabled(deps: SettingsServiceDeps, enabled: boolean): void {
  const meta = new AppMetaRepo(deps.db)
  meta.write(APP_META_KEYS.aiExtractEnabled, enabled)
}

/**
 * 遥测事件入队（服务端第二道闸门：开关关闭时**连队列都不写**，更不会有外联）。
 *
 * ⚠️ 「关闭 ⇒ 不入队」这条规则收进服务层后只有**一处**实现：路由不再各自读一次开关再决定
 * 是否入队（两处实现就意味着将来某一处忘了改，关闭时仍会留下事件行）。
 *
 * @param at 时间源注入（FR-1.2）——测试要能钉住 `day` 与 `queued_at`。
 * @param platform `process.platform` 的注入点（遥测 os 标签归一用）。
 */
export function enqueueTelemetryEvent(
  deps: SettingsServiceDeps,
  input: { event: string; value: string; appVersion: string; at: Date; platform: string },
): { queued: boolean; reason: 'enabled' | 'disabled' } {
  if (!telemetryView(deps).enabled) return { queued: false, reason: 'disabled' }
  new TelemetryRepo(deps.db).enqueue({
    event: input.event as TelemetryEvent,
    value: input.value,
    day: telemetryDay(input.at),
    os: telemetryOs(input.platform),
    appVersion: input.appVersion,
    queuedAt: input.at.toISOString(),
  })
  return { queued: true, reason: 'enabled' }
}

/**
 * 最新的标准包 id（OM1 缺省口径：取最新建包）。
 *
 * ⚠️ 2026-11-07 修 DEV-0202 登记的 flaky（OM-05 偶发失败）。
 *   原实现 `ORDER BY created_at DESC, id DESC`：`created_at` 是 ISO **毫秒**字符串，
 *   两次快速建包会落在同一毫秒（实测 repo 直调：间隔 0–1 ms，`created_at` 去重后 = 1）；
 *   此时 tiebreak 是 `id DESC`，而 `id` 是 **nanoid（随机）** ⇒「最新」由随机数决定。
 *   ⇒ tiebreak 换成 `rowid DESC`：`standard_packs` 是普通 rowid 表（非 WITHOUT ROWID），
 *     `rowid` 即落库序，同毫秒时后插者赢，与「最新建包」的语义一致。
 *   （同仓先例：`repos/skills.ts:606` 的 `versions()` 早已因同一理由改用 rowid。）
 */
export function latestPackId(deps: SettingsServiceDeps): { id: string } | undefined {
  return deps.db
    .prepare(`SELECT id FROM standard_packs ORDER BY created_at DESC, rowid DESC LIMIT 1`)
    .get() as { id: string } | undefined
}

/** 指定 id 的标准包是否存在（OM1 `?pack_id=` 的 404 判定） */
export function packExists(deps: SettingsServiceDeps, packId: string): boolean {
  return new PacksRepo(deps.db).get(packId) !== null
}

/** 取标准包本体（OM1 渲染用；不存在返回 null） */
export function getPack(deps: SettingsServiceDeps, packId: string): PackOut | null {
  return new PacksRepo(deps.db).get(packId)
}
