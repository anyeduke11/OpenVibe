// `packages/core/src/db/m9-p1f-stage-guards.ts` —— M9 v1.6 **P1f · DL-40 的三道闸**
// （`m9-dev-plan-2026-10.md` §6.7 ＋ `m9-dev-language-roadmap.md` §1.7 第 ② 条 / §3.21）
//
// ## 它断什么
//
// | 闸 | 断的是 | 判据出处 |
// |---|---|---|
// | `findStageTrackViolations` | 库里的行**逐格等于**源文档（八格对照面 ⇒ 6 行） | DL-40 主条 |
// | `findSpecTrackViolations` | 库里的行**逐格等于** spec §1.7 第 ② 条那张表 | DL-40 主条 |
// | `findEmptyGoTrackViolations` | **阶段 0/1 的 `lang='go'` 行数 = 0** | DL-40 反证腿 |
//
// ## ⚠️ 第三道闸为什么必须单独存在
//
// 「阶段 0/1 不建 Go 行」是**关于阶段的结论**，不是可选项 ——
// 建了空行再标 `required=0`，那一行就会出现在筛选器里，而「这个阶段没有 Go 轨道」
// 是**关于阶段的结论**，不是一个可选项（spec §3.21 第 2 条）。
// ⇒ 反证腿要断的**不是**「那些行 required=0」，而是「**那些行根本不存在**」。
//
// ⚠️ **比较的是成员集合，不是计数** —— 计数相等但成员错位是最常见的漏网形态。
import {
  normalizeModeWord,
  normalizePeriod,
  normalizeStageName,
  type SpecTrackCell,
} from './m9-p1f-spec'
import type { StageTrack, StageTrackSeed } from '@openvibe/shared'

/**
 * 库里的一行。
 *
 * ⚠️ `StageTrack` 已含全部列（源逐字列 `stage_name` / `period` / `goals` ＋ 派生列）
 *   ⇒ 这里**不再重复声明**（重复声明会让「表里有哪些列」有两个出处）。
 */
export type StageTrackRow = StageTrack

const key = (stageId: number, lang: string): string => `${stageId}|${lang}`

/**
 * 闸 ①：库里的行**逐格等于**源文档。
 *
 * @param rows 库里的行
 * @param seeds 源文档逐字的那几行（种子的 `items`）
 */
export function findStageTrackViolations(
  rows: readonly StageTrackRow[],
  seeds: readonly StageTrackSeed[],
): string[] {
  const out: string[] = []
  if (rows.length !== seeds.length) {
    out.push(`行数 ${rows.length} ≠ 源文档 ${seeds.length}（八格对照面 ⇒ 阶段 0/1 不建 Go 行 ⇒ 6 行）`)
  }
  for (const seed of seeds) {
    const row = rows.find((r) => r.stage_id === seed.stage_id && r.lang === seed.lang)
    if (row === undefined) {
      out.push(`缺一行：阶段 ${seed.stage_id}/${seed.lang}`)
      continue
    }
    if (row.source_mode !== seed.source_mode) {
      out.push(`阶段 ${seed.stage_id}/${seed.lang} 的 source_mode 不符：库「${row.source_mode}」≠ 源「${seed.source_mode}」`)
    }
    if (row.mode_name !== seed.mode_name) {
      out.push(`阶段 ${seed.stage_id}/${seed.lang} 的 mode_name 不符：库「${row.mode_name}」≠ 源「${seed.mode_name}」`)
    }
    if (row.stage_name !== seed.stage_name) {
      out.push(`阶段 ${seed.stage_id}/${seed.lang} 的 stage_name 不符：库「${row.stage_name}」≠ 源「${seed.stage_name}」`)
    }
    if (row.period !== seed.period) {
      out.push(`阶段 ${seed.stage_id}/${seed.lang} 的 period 不符：库「${row.period}」≠ 源「${seed.period}」`)
    }
    if (row.goals.join('') !== seed.goals.join('')) {
      out.push(`阶段 ${seed.stage_id}/${seed.lang} 的 goals 不符（逐条比）`)
    }
  }
  for (const row of rows) {
    if (!seeds.some((s) => s.stage_id === row.stage_id && s.lang === row.lang)) {
      out.push(`多一行：阶段 ${row.stage_id}/${row.lang}（源文档没有这一行）`)
    }
  }
  return out
}

/**
 * 闸 ②：库里的行**逐格等于** spec §1.7 第 ② 条那张表（八格）。
 *
 * ⚠️ 源文档是**完整句**、§1.7 是**摘要** ⇒ 两侧各走**同一个**归一化函数再比
 *   （`m9-p1f-spec.ts` 里的三个 `normalize*`）。
 */
export function findSpecTrackViolations(
  rows: readonly StageTrackRow[],
  cells: readonly SpecTrackCell[],
): string[] {
  const out: string[] = []
  if (cells.length !== 8) {
    out.push(`§1.7 第 ② 条解析出 ${cells.length} 格 ≠ 8`)
    return out
  }
  for (const cell of cells) {
    const row = rows.find((r) => r.stage_id === cell.stageId && r.lang === cell.lang)
    if (cell.modeWord === null) {
      // 「无轨道」⇒ 库里**不得**有这一行（DL-40 的反证腿）
      if (row !== undefined) {
        out.push(`§1.7 说阶段 ${cell.stageId} 的 ${cell.lang} 无轨道，库里却有这一行`)
      }
      continue
    }
    if (row === undefined) {
      out.push(`§1.7 有阶段 ${cell.stageId} 的 ${cell.lang} 轨道，库里没有`)
      continue
    }
    if (normalizeStageName(row.stage_name) !== cell.stageName) {
      out.push(`阶段 ${cell.stageId} 名称不符：库「${normalizeStageName(row.stage_name)}」≠ spec「${cell.stageName}」`)
    }
    if (normalizePeriod(row.period) !== cell.period) {
      out.push(`阶段 ${cell.stageId} 周期不符：库「${normalizePeriod(row.period)}」≠ spec「${cell.period}」`)
    }
    const rowWord = normalizeModeWord(row.mode_name.split('（')[0] ?? row.mode_name)
    if (rowWord !== cell.modeWord) {
      out.push(`阶段 ${cell.stageId}/${cell.lang} 模式词不符：库「${rowWord}」≠ spec「${cell.modeWord}」`)
    }
  }
  return out
}

/**
 * 闸 ③（**反证腿**）：阶段 0 与 1 的 `lang='go'` 行数必须**为 0**。
 *
 * ⚠️ 断的是「**那些行根本不存在**」，不是「那些行 `required=0`」——
 *   后者正是本判据要防的那种「建了空行再标 0」的做法。
 */
export function findEmptyGoTrackViolations(rows: readonly StageTrackRow[]): string[] {
  const out: string[] = []
  for (const stageId of [0, 1]) {
    const goRows = rows.filter((r) => r.stage_id === stageId && r.lang === 'go')
    if (goRows.length > 0) {
      out.push(
        `阶段 ${stageId} 有 ${goRows.length} 条 Go 轨道（源文档没有该轨道 ⇒ 不建行，不是建行再标 required=0）`,
      )
    }
  }
  return out
}

/** 闸 ① 的行数常量（八格对照面 ⇒ 6 行）。 */
export const EXPECTED_STAGE_TRACK_ROWS = 6

/** 闸 ③ 的阶段常量。 */
export const STAGES_WITHOUT_GO_TRACK = [0, 1] as const

/** 供守卫自证用：把一行拼成稳定的键（查重用）。 */
export function stageTrackKey(row: { stage_id: number; lang: string }): string {
  return key(row.stage_id, row.lang)
}
