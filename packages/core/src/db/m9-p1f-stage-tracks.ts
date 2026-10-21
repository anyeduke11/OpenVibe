// `packages/core/src/db/m9-p1f-stage-tracks.ts` —— M9 v1.6 **P1f.1 · 成长阶段 × 轨道装载器**
// （`m9-dev-plan-2026-10.md` §6.7 ＋ `m9-dev-language-roadmap.md` §1.7 第 ② 条 / §3.21 · **DL-40**）
//
// ## 它做什么
//
// 把配套方案抽出的 **6 行**种子装进 `lang_stage_tracks`：
// 源文档的逐字字段（`stage_name` / `period` / `source_mode` / `mode_name` / `goals`）**原样入库**，
// 派生字段（`profile` / `required` / `is_default` / `note`）**现算**。
//
// ## ⚠️ 为什么派生字段**不落种子**
//
// 派生口径会改（§6.3 第 8 条一旦裁定，阶段 2 的 `profile` 就变）⇒
// 落进种子就变成「快照」，改一次要重采一次。⇒ **种子只存源文档的事实**，
//   派生一律由 `deriveStageTrack`（`@openvibe/shared`）现算 —— **口径只留一处**。
//
// ## ⚠️ 阶段 2 的 Python：矛盾**留在数据里**，不替源文档决定
//
// 源 `mode:"mas"`（精通）却叫「熟悉 → 精通」⇒ 派生取「熟悉」**并带 `note` 标注**
// （§6.3 第 8 条待裁前的兜底，spec §3.21 第 3 条）。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SqliteDatabase } from '../db'
import { deriveStageTrack, type StageTrack, type StageTrackSeed } from '@openvibe/shared'
import type { StageTrackRow } from './m9-p1f-stage-guards'

export interface M9StageTrackSeedResult {
  bundle: 'lang_stage_tracks'
  status: 'ok' | 'skipped' | 'error'
  created: number
  updated: number
  warnings: string[]
}

interface StageTrackSeedFile {
  schemaVersion: number
  items: StageTrackSeed[]
}

/** 源文档的 `mode` 取值域。 */
const SOURCE_MODES = new Set(['vibe', 'fam', 'mas'])
/** 本模块的三值模式。 */
const PROFILES = new Set(['master', 'familiar', 'vibe'])
/** 两门语言。 */
const LANGS = new Set(['python', 'go'])

/**
 * ⚠️ **没有 ORDER BY** —— 主键是复合键 (stage_id, lang)，本仓的 SQL 静态守卫只认
 *   单列唯一键作兜底排序键 ⇒ 排序一律放 JS（`readStageTracks` 里排）。
 */
const UPSERT_SQL = `
  INSERT INTO lang_stage_tracks (
    stage_id, lang, source_mode, mode_name, profile,
    stage_name, period, goals, required, is_default, note
  ) VALUES (
    @stage_id, @lang, @source_mode, @mode_name, @profile,
    @stage_name, @period, @goals, @required, @is_default, @note
  )
  ON CONFLICT (stage_id, lang) DO UPDATE SET
    source_mode = excluded.source_mode,
    mode_name = excluded.mode_name,
    profile = excluded.profile,
    stage_name = excluded.stage_name,
    period = excluded.period,
    goals = excluded.goals,
    required = excluded.required,
    is_default = excluded.is_default,
    note = excluded.note
`

/**
 * 装载 `lang_stage_tracks`。
 *
 * @param db 数据库
 * @param seedDir 种子目录（`packages/core/src/db/seeds`）
 */
export function seedStageTracks(db: SqliteDatabase, seedDir: string): M9StageTrackSeedResult {
  const result: M9StageTrackSeedResult = {
    bundle: 'lang_stage_tracks',
    status: 'skipped',
    created: 0,
    updated: 0,
    warnings: [],
  }
  let parsed: StageTrackSeedFile
  try {
    const raw = readFileSync(join(seedDir, 'lang_stage_tracks.json'), 'utf8')
    parsed = JSON.parse(raw) as StageTrackSeedFile
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.items)) {
      throw new Error('bundle 结构非法（期望 {schemaVersion:1, items:[]}）')
    }
  } catch (err) {
    result.status = 'error'
    result.warnings.push(`种子文件读取失败: lang_stage_tracks.json — ${String(err)}`)
    return result
  }

  const upsert = db.prepare(UPSERT_SQL)
  const exists = db.prepare(`SELECT stage_id FROM lang_stage_tracks WHERE stage_id = ? AND lang = ?`)

  const runOne = db.transaction((it: StageTrackSeed): 'created' | 'updated' => {
    const before = exists.get(it.stage_id, it.lang)
    const d = deriveStageTrack(it)
    upsert.run({
      stage_id: d.stage_id,
      lang: d.lang,
      source_mode: d.source_mode,
      mode_name: d.mode_name,
      profile: d.profile,
      stage_name: d.stage_name,
      period: d.period,
      // ⚠️ `goals` 是 JSON 数组文本（SQLite 没有数组类型）；CHECK json_valid 兜住
      goals: JSON.stringify(it.goals),
      required: d.required,
      is_default: d.is_default,
      note: d.note,
    })
    return before ? 'updated' : 'created'
  })

  for (const it of parsed.items) {
    if (!SOURCE_MODES.has(it.source_mode)) {
      result.warnings.push(`source_mode 越界: ${String(it.source_mode)} (阶段 ${it.stage_id}/${it.lang})`)
      continue
    }
    if (!LANGS.has(it.lang)) {
      result.warnings.push(`lang 越界: ${String(it.lang)} (阶段 ${it.stage_id})`)
      continue
    }
    if (typeof it.stage_id !== 'number' || !Number.isInteger(it.stage_id) || it.stage_id < 0 || it.stage_id > 3) {
      result.warnings.push(`stage_id 越界（须为 0–3 的整数）: ${String(it.stage_id)}`)
      continue
    }
    if (!PROFILES.has(deriveStageTrack(it).profile)) {
      result.warnings.push(`profile 越界: ${deriveStageTrack(it).profile} (阶段 ${it.stage_id}/${it.lang})`)
      continue
    }
    result[runOne(it)] += 1
  }

  result.status = 'ok'
  return result
}

/** 读库里的行（**排序放 JS** —— 复合主键表不许 ORDER BY）。 */
export function readStageTracks(db: SqliteDatabase): StageTrackRow[] {
  const rows = db
    .prepare(
      `SELECT stage_id, lang, source_mode, mode_name, profile, stage_name, period, goals, required, is_default, note
         FROM lang_stage_tracks`,
    )
    .all() as {
    stage_id: number
    lang: 'python' | 'go'
    source_mode: StageTrack['source_mode']
    mode_name: string
    profile: StageTrack['profile']
    stage_name: string
    period: string
    goals: string
    required: 0 | 1
    is_default: 0 | 1
    note: string | null
  }[]
  return rows
    .map((r) => ({
      stage_id: r.stage_id,
      lang: r.lang,
      source_mode: r.source_mode,
      mode_name: r.mode_name,
      profile: r.profile,
      required: r.required,
      is_default: r.is_default,
      note: r.note,
      stage_name: r.stage_name,
      period: r.period,
      goals: JSON.parse(r.goals) as string[],
    }))
    .sort((a, b) => a.stage_id - b.stage_id || (a.lang === b.lang ? 0 : a.lang < b.lang ? -1 : 1))
}
