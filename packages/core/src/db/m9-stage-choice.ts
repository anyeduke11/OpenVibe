// `packages/core/src/db/m9-stage-choice.ts` —— M9 v1.6 **P1g · 阶段选择的落库与生效模式的读取**
// （`m9-dev-language-roadmap.md` §3.21）
//
// ## 它做什么
//
// 把「用户处在成长路线的哪一阶段」落到 `app_meta`，并按 §3.21 的优先级
// **现算**当前生效的学习模式：
//
// ```
// 生效模式 = 用户自选（`langModeChoice`） ?? 阶段推荐（`langStageChoice` ⇒ `lang_stage_tracks`） ?? 尚未选定
// ```
//
// ## ⚠️ 为什么阶段也落 `app_meta`（不进 `lang_*`）
//
// §3.19 第 3 条的纪律对阶段**同样成立**：阶段是**用户偏好**
// （我处在成长路线的哪一阶段），**不是**语言学习状态 ⇒ 一旦它能写进 `lang_*`，
// 「我在第几阶段」就会反过来影响「哪些知识点被算作已掌握」。
// ⇒ 落 `app_meta`（跨进程共享的 KV 归口），**零新增表**。
//
// ## ⚠️ 为什么**读取**在这里、**判定**在 shared
//
// 判定式 `resolveEffectiveProfile` 是**纯计算**（吃阶段号 ＋ 轨道行 ＋ 自选值）⇒ 住在
// `@openvibe/shared`（界面侧也要现算「你覆盖了推荐」这件事）。
// 本模块只负责**读库 ＋ 写库**，不复制判定 ⇒ **口径只留一处**。
import type { SqliteDatabase } from '../db'
import { APP_META_KEYS, AppMetaRepo } from '../repos/appMeta'
import { readStageTracks } from './m9-p1f-stage-tracks'
import {
  resolveEffectiveProfile,
  type EffectiveProfile,
  type LangProfile,
  type ProfileChoice,
} from '@openvibe/shared'

/**
 * 阶段的取值域（§3.21：`stage_id ∈ {0,1,2,3}`）。
 *
 * ⚠️ **常量只此一处** —— 端点的入参校验与这里共用同一个集合，
 *   免得「端点放行 5、库里没有 5」这种半截状态。
 */
export const LANG_STAGE_IDS: readonly number[] = [0, 1, 2, 3]

/** 读当前阶段（`null` = 还没进阶段）。 */
export function readStageChoice(db: SqliteDatabase): number | null {
  const raw = new AppMetaRepo(db).read<number | null>(APP_META_KEYS.langStageChoice, null)
  // ⚠️ **越界值当没选** —— 库里存了一个不存在的阶段（手改库／旧版本残留）时，
  //   宁可回到「没进阶段」，也不要拿它去算推荐（那会推出一档无来由的模式）。
  if (raw === null || !LANG_STAGE_IDS.includes(raw)) return null
  return raw
}

/**
 * 记一次阶段选择（`null` = 回到「还没进阶段」）。
 *
 * ⚠️ **不进 `lang_*`**（同 `langModeChoice` 的纪律）。
 */
export function writeStageChoice(db: SqliteDatabase, stage: number | null): void {
  if (stage !== null && !LANG_STAGE_IDS.includes(stage)) {
    throw new Error(`阶段越界（须为 ${LANG_STAGE_IDS.join(' / ')} 之一）: ${String(stage)}`)
  }
  new AppMetaRepo(db).write(APP_META_KEYS.langStageChoice, stage)
}

/** 读用户自选的学习模式（`null` = 还没自选）。 */
export function readModeChoice(db: SqliteDatabase): ProfileChoice | null {
  const raw = new AppMetaRepo(db).read<ProfileChoice | null>(APP_META_KEYS.langModeChoice, null)
  // ⚠️ **越界值当没选**（同 `readStageChoice` 的口径）：三档之外的一律不认。
  if (raw === null) return null
  if (raw !== 'master' && raw !== 'familiar' && raw !== 'vibe') return null
  return raw
}

/**
 * **算当前生效的学习模式**（§3.21）。
 *
 * ⚠️ **这是全模块唯一的「当前模式」出口** —— `/api/lang/modes` 与
 *   `/api/lang/resources` 都调它 ⇒ 两处不会各算一套。
 */
export function readEffectiveProfile(db: SqliteDatabase): EffectiveProfile {
  return resolveEffectiveProfile({
    stageChoice: readStageChoice(db),
    tracks: readStageTracks(db),
    modeChoice: readModeChoice(db),
  })
}

/**
 * 生效模式（带界面兜底）—— 给「必须给出一档」的场合用。
 *
 * ⚠️ **兜底值是「精通」** —— 与资源页既有口径一致（缺省 ⇒ 精通）；
 *   ⚠️ 但**「尚未选定」这件事本身不会被抹掉**：调用方要区分「用户选了精通」
 *   与「还没定、暂且按精通渲染」，得用 `readEffectiveProfile` 的 `source`。
 */
export function readEffectiveProfileOr(db: SqliteDatabase, fallback: LangProfile): LangProfile {
  const eff = readEffectiveProfile(db)
  return eff.profile ?? fallback
}
