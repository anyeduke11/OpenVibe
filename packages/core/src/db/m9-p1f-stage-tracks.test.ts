// `packages/core/src/db/m9-p1f-stage-tracks.test.ts` —— M9 v1.6 **P1f 出口**（计算层与守卫）
// （`m9-dev-plan-2026-10.md` §6.7 ＋ `m9-dev-language-roadmap.md` §1.7 第 ② 条 / §3.21
//  · **DL-40 / DL-41 / DL-42**）
//
// ## 它断什么
//
// | 判据 | 一句话 | 本文件里对应的那支 |
// |---|---|---|
// | **DL-40** | 阶段 → 轨道映射与源文档逐格相等；阶段 0/1 没有 Go 行 | 「DL-40」组 |
// | **DL-41** | 速成专区那 11 条在库，且纳入 DL-30 巡检 | 「DL-41」组 |
// | **DL-42** | 界面不得出现越过编程证据的职业等级断言 | 「DL-42」组 |
//
// ## ⚠️ 每条判据都配一条**真动数据 / 真改代码**的变异腿
//
// 反向判据（"不得存在 X"）天然没有正向痕迹 ⇒ 只有专门那条检查会红。
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { newDb } from '../test-support/new-db'
import { seedLangResourceLayer } from './m9-p1b-seed-resources'
import { PROBE_TABLE_NAMES } from './m9-p1b-probe'
import { readStageTracks, seedStageTracks } from './m9-p1f-stage-tracks'
import {
  EXPECTED_STAGE_TRACK_ROWS,
  findEmptyGoTrackViolations,
  findSpecTrackViolations,
  findStageTrackViolations,
} from './m9-p1f-stage-guards'
import { parseSpecTrackCells } from './m9-p1f-spec'
import { findGradeAssertions, findGradeAssertionsInText } from './m9-p1f-grade-guard'
import type { StageTrackSeed } from '@openvibe/shared'

const SEEDS_DIR = fileURLToPath(new URL('./seeds', import.meta.url))
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const SPEC_FILE = join(REPO_ROOT, 'docs/specs/m9-dev-language-roadmap.md')
const SEED_FILE = join(SEEDS_DIR, 'lang_stage_tracks.json')

const SPEC_CELLS = parseSpecTrackCells(readFileSync(SPEC_FILE, 'utf8'))
const SEED_ITEMS = (JSON.parse(readFileSync(SEED_FILE, 'utf8')) as { items: StageTrackSeed[] }).items

function seedAll(h: { db: Parameters<typeof seedStageTracks>[0] }): void {
  seedStageTracks(h.db, SEEDS_DIR)
  seedLangResourceLayer(h.db, SEEDS_DIR)
}

describe('M9 P1f · DL-40 阶段 → 轨道映射', () => {
  it('① 库里的 6 行与源文档逐格相等（八格对照面 ⇒ 阶段 0/1 不建 Go 行）', () => {
    const h = newDb()
    try {
      seedAll(h)
      const rows = readStageTracks(h.db)
      expect(rows).toHaveLength(EXPECTED_STAGE_TRACK_ROWS)
      expect(SEED_ITEMS).toHaveLength(EXPECTED_STAGE_TRACK_ROWS)
      expect(findStageTrackViolations(rows, SEED_ITEMS)).toEqual([])
    } finally {
      h.close()
    }
  })

  it('② 库里的 6 行与 spec §1.7 第 ② 条那张八格表逐格相等', () => {
    const h = newDb()
    try {
      seedAll(h)
      expect(SPEC_CELLS).toHaveLength(8)
      expect(findSpecTrackViolations(readStageTracks(h.db), SPEC_CELLS)).toEqual([])
    } finally {
      h.close()
    }
  })

  it('③ 反证：阶段 0 与 1 的 `lang="go"` 行数为 0（不是建行再标 required=0）', () => {
    const h = newDb()
    try {
      seedAll(h)
      const rows = readStageTracks(h.db)
      for (const stageId of [0, 1]) {
        expect(rows.filter((r) => r.stage_id === stageId && r.lang === 'go')).toHaveLength(0)
      }
      expect(findEmptyGoTrackViolations(rows)).toEqual([])
    } finally {
      h.close()
    }
  })

  it('④ 变异腿：删掉阶段 2 的 Go 行 ⇒ 闸红', () => {
    const h = newDb()
    try {
      seedAll(h)
      h.db.prepare(`DELETE FROM lang_stage_tracks WHERE stage_id = 2 AND lang = 'go'`).run()
      const rows = readStageTracks(h.db)
      expect(findStageTrackViolations(rows, SEED_ITEMS).length).toBeGreaterThan(0)
      expect(findSpecTrackViolations(rows, SPEC_CELLS).length).toBeGreaterThan(0)
    } finally {
      h.close()
    }
  })

  it('⑤ 变异腿：给阶段 0 补一条 Go 行（标 required=0）⇒ **反证闸**红', () => {
    const h = newDb()
    try {
      seedAll(h)
      // ⚠️ 这正是「建了空行再标 required=0」的做法 —— 数值上看着无害，
      //   但「这个阶段没有 Go 轨道」是**关于阶段的结论**，不是一个可选项。
      h.db
        .prepare(
          `INSERT INTO lang_stage_tracks
             (stage_id, lang, source_mode, mode_name, profile, stage_name, period, goals, required, is_default, note)
           VALUES (0, 'go', 'vibe', '了解 · 速成（选学）', 'vibe', '阶段 0 · 基础与入场', '第 1–3 个月', '[]', 0, 0, NULL)`,
        )
        .run()
      const rows = readStageTracks(h.db)
      expect(findEmptyGoTrackViolations(rows).length).toBeGreaterThan(0)
    } finally {
      h.close()
    }
  })

  it('⑥ 阶段 2 的 Python：源 mode 是 mas（精通）而派生 profile 是「熟悉」＋ 有标注（§6.3 第 8 条）', () => {
    const h = newDb()
    try {
      seedAll(h)
      const rows = readStageTracks(h.db)
      const s2 = rows.find((r) => r.stage_id === 2 && r.lang === 'python')
      expect(s2).toBeTruthy()
      // ⚠️ 源文档的两个字段**都逐字保留**（矛盾留在数据里）
      expect(s2!.source_mode).toBe('mas')
      expect(s2!.mode_name).toContain('熟悉 → 精通')
      // ⚠️ 派生取值按 §6.3 第 8 条的兜底：**不偷偷选一个**
      expect(s2!.profile).toBe('familiar')
      expect(s2!.note).toBeTruthy()
      expect(s2!.note).toContain('§6.3 第 8 条')
    } finally {
      h.close()
    }
  })

  it('⑦ 阶段 2/3 的 Go 是「选学」⇒ required=0；Python 恒 is_default=1', () => {
    const h = newDb()
    try {
      seedAll(h)
      const rows = readStageTracks(h.db)
      for (const r of rows) {
        if (r.lang === 'python') {
          expect(r.is_default).toBe(1)
          expect(r.required).toBe(1)
        } else {
          expect(r.is_default).toBe(0)
          expect(r.required).toBe(0)
        }
      }
    } finally {
      h.close()
    }
  })
  it('⑧ 六行的 `profile` 逐行钉死（真实种子 → 派生值的硬绑定）', () => {
    const h = newDb()
    try {
      seedAll(h)
      const rows = readStageTracks(h.db)
      const pinned = rows.map((r) => `${r.stage_id}/${r.lang}=${r.profile}`).sort()
      expect(pinned).toEqual([
        '0/python=vibe',
        '1/python=familiar',
        '2/go=vibe',
        '2/python=familiar',
        '3/go=familiar',
        '3/python=master',
      ])
    } finally {
      h.close()
    }
  })
})

describe('M9 P1f · DL-41 速成专区那 11 条在库且纳入巡检', () => {
  it('① 11 条在库（tools 6 ＋ tuts 5），且**不与主清单混表**', () => {
    const h = newDb()
    try {
      seedAll(h)
      const vibe = h.db
        .prepare(`SELECT COUNT(*) AS n FROM lang_vibe_resources`)
        .get() as { n: number }
      expect(vibe.n).toBe(11)
      const groups = h.db
        .prepare(`SELECT "group" AS g, COUNT(*) AS n FROM lang_vibe_resources GROUP BY "group"`)
        .all() as { g: string; n: number }[]
      expect(groups).toEqual([
        { g: 'tools', n: 6 },
        { g: 'tuts', n: 5 },
      ])
      // 不与主清单混表：这 11 条**不得**出现在 lang_resources 里
      const mixed = h.db
        .prepare(
          `SELECT COUNT(*) AS n FROM lang_vibe_resources v
             JOIN lang_resources r ON r.url = v.url AND r.name = v.name`,
        )
        .get() as { n: number }
      expect(mixed.n).toBe(0)
    } finally {
      h.close()
    }
  })

  it('② DL-30 的失效纪律对它**同样成立**（这 11 条在巡检目标里）', () => {
    expect(PROBE_TABLE_NAMES).toContain('lang_vibe_resources')
    const h = newDb()
    try {
      seedAll(h)
      // 巡检所需的三列都在（否则巡检脚本读不到）
      const cols = h.db
        .prepare(`SELECT name FROM pragma_table_info('lang_vibe_resources')`)
        .all() as { name: string }[]
      const names = cols.map((c) => c.name)
      for (const c of ['last_status_code', 'consecutive_fails', 'alive', 'last_checked_at']) {
        expect(names).toContain(c)
      }
    } finally {
      h.close()
    }
  })
})

describe('M9 P1f · DL-42 职业等级断言守卫', () => {
  it('① 全仓 0 命中（界面不得出现越过编程证据的职业等级断言）', () => {
    const hits = findGradeAssertions(REPO_ROOT)
    expect(hits, hits.map((h) => `${h.file}:${h.line} ${h.pattern} — ${h.text}`).join('\n')).toEqual([])
  })

  it('② 守卫自证：注入一条必被报出（DL-42 的反证腿）', () => {
    const hits = findGradeAssertionsInText('你已经达成 L1，可以接高级任务了。')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0]!.pattern).toContain('L[0-3]')
  })

  it('③ 守卫自证：「你已到专家级」与「你已具备 L2」也必须被报出', () => {
    expect(findGradeAssertionsInText('恭喜，你已到专家级。').length).toBeGreaterThan(0)
    expect(findGradeAssertionsInText('你已具备 L2 的能力。').length).toBeGreaterThan(0)
  })

  it('④ 反证：**规则说明里**提到这些词不算命中（主语必须是对人的称呼）', () => {
    expect(findGradeAssertionsInText('本模块不判断你是否达到专家级。')).toEqual([])
    expect(findGradeAssertionsInText('DL-42：界面不得出现「你已达成 L1」这类文案。')).toEqual([])
  })
})
