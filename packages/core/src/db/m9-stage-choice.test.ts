import { describe, expect, it } from 'vitest'
import { newDb } from '../test-support'
import {
  LANG_STAGE_IDS,
  readEffectiveProfile,
  readModeChoice,
  readStageChoice,
  writeStageChoice,
} from './m9-stage-choice'
import { APP_META_KEYS, AppMetaRepo } from '../repos/appMeta'

/**
 * M9 P1g · 阶段选择的落库与生效模式的读取（`m9-dev-language-roadmap.md` §3.21）
 *
 * ## 它断什么
 *
 * | 判据 | 一句话 | 对应的那支 |
 * |---|---|---|
 * | **§3.21** | 阶段选择落 `app_meta`，**不进 `lang_*`** | 「落点」组 |
 * | **§3.21** | 生效模式 = 用户自选 ?? 阶段推荐 ?? 尚未选定 | 「生效模式」组 |
 * | **纵深防御** | 库里存了越界值 ⇒ **当没选**，不拿它算推荐 | 「越界」组 |
 */

function seedTracks(db: ReturnType<typeof newDb>['db']): void {
  db.prepare(
    `INSERT INTO lang_stage_tracks
       (stage_id, lang, source_mode, mode_name, profile, stage_name, period, goals, required, is_default, note)
     VALUES (1, 'python', 'fam', '熟悉', 'familiar', '阶段 1 · 评测基本功', '第 4–9 个月', '[]', 1, 1, NULL)`,
  ).run()
  db.prepare(
    `INSERT INTO lang_stage_tracks
       (stage_id, lang, source_mode, mode_name, profile, stage_name, period, goals, required, is_default, note)
     VALUES (3, 'python', 'mas', '精通', 'master', '阶段 3 · 专家化', '第 16–24 个月', '[]', 1, 1, NULL)`,
  ).run()
}

describe('M9 P1g · 阶段选择的落点（§3.21：落 app_meta，不进 lang_*）', () => {
  it('① 记一次 ⇒ 读回来是同一个值', () => {
    const h = newDb()
    try {
      expect(readStageChoice(h.db)).toBeNull()
      writeStageChoice(h.db, 1)
      expect(readStageChoice(h.db)).toBe(1)
    } finally {
      h.close()
    }
  })

  it('② 落点是 `app_meta`（**不是**任何 `lang_*` 表）', () => {
    const h = newDb()
    try {
      writeStageChoice(h.db, 3)
      const meta = h.db
        .prepare('SELECT value FROM app_meta WHERE key = ?')
        .get(APP_META_KEYS.langStageChoice) as { value: string } | undefined
      expect(meta?.value).toBe('3')
      const rows = h.db.prepare('SELECT COUNT(*) AS n FROM lang_topic_state').get() as { n: number }
      expect(rows.n).toBe(0)
    } finally {
      h.close()
    }
  })

  it('③ 写越界阶段 ⇒ 抛错（不是静默写进去）', () => {
    const h = newDb()
    try {
      expect(() => {
        writeStageChoice(h.db, 9)
      }).toThrow()
      expect(readStageChoice(h.db)).toBeNull()
    } finally {
      h.close()
    }
  })

  it('④ ⚠️ 库里存了越界值 ⇒ **当没选**（不拿它算推荐）', () => {
    const h = newDb()
    try {
      new AppMetaRepo(h.db).write(APP_META_KEYS.langStageChoice, 9)
      expect(readStageChoice(h.db)).toBeNull()
    } finally {
      h.close()
    }
  })

  it('⑤ 阶段号取值域是 0–3（与端点校验共用同一份）', () => {
    expect(LANG_STAGE_IDS).toEqual([0, 1, 2, 3])
  })
})

describe('M9 P1g · 生效模式的读取（自选 ?? 阶段推荐 ?? 尚未选定）', () => {
  it('① 没有自选 ⇒ 来自阶段推荐（阶段 1 ⇒ 熟悉）', () => {
    const h = newDb()
    try {
      seedTracks(h.db)
      writeStageChoice(h.db, 1)
      const eff = readEffectiveProfile(h.db)
      expect(eff.profile).toBe('familiar')
      expect(eff.source).toBe('stage')
      expect(eff.differsFromRecommendation).toBe(false)
    } finally {
      h.close()
    }
  })

  it('② 用户自选**优先**于阶段推荐（§3.21：自选降级为覆盖手段）', () => {
    const h = newDb()
    try {
      seedTracks(h.db)
      writeStageChoice(h.db, 3)
      new AppMetaRepo(h.db).write(APP_META_KEYS.langModeChoice, 'vibe')
      const eff = readEffectiveProfile(h.db)
      expect(eff.profile).toBe('vibe')
      expect(eff.source).toBe('user')
      expect(eff.differsFromRecommendation).toBe(true)
    } finally {
      h.close()
    }
  })

  it('③ 三档自选都能读回来（含「熟悉」）', () => {
    const h = newDb()
    try {
      for (const p of ['master', 'familiar', 'vibe'] as const) {
        new AppMetaRepo(h.db).write(APP_META_KEYS.langModeChoice, p)
        expect(readModeChoice(h.db)).toBe(p)
      }
    } finally {
      h.close()
    }
  })

  it('④ ⚠️ 库里存了越界模式 ⇒ 当没选', () => {
    const h = newDb()
    try {
      new AppMetaRepo(h.db).write(APP_META_KEYS.langModeChoice, '随便')
      expect(readModeChoice(h.db)).toBeNull()
      expect(readEffectiveProfile(h.db).source).toBe('unset')
    } finally {
      h.close()
    }
  })

  it('⑤ 既没自选也没进阶段 ⇒ **尚未选定**（profile 是 null）', () => {
    const h = newDb()
    try {
      const eff = readEffectiveProfile(h.db)
      expect(eff.profile).toBeNull()
      expect(eff.source).toBe('unset')
      expect(eff.recommendation).toBeNull()
    } finally {
      h.close()
    }
  })
})
