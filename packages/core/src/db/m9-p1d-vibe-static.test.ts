// `packages/core/src/db/m9-p1d-vibe-static.test.ts` —— M9 v1.6 **P1d.5 出口**
// （`m9-dev-plan-2026-10.md` §6.5 的 P1d.5 ＋ `m9-dev-language-roadmap.md` §3.17 / §3.17.2 · **DL-35**）
//
// ## 它断四件事
//
// ① **四块静态内容与 spec §3.17.2 逐格相等**（模块 ↔ 文档对账，同 DL-49 的手法）：
//    6 项能力 · 每门 7 项最小知识 · 4 步工作流 · 6 个翻车点。
// ② **它们没有建表**（§3.17 的裁定：不建表、不进 DAG、不参与掌握度）——
//    库里 `lang_*` 表**一张不多**，也没有任何表是为这四块建的。
// ③ **6 段时间线照常显示**（§3.17.1 的 21 段里有 6 段是速成段）——
//    时间线是**时间**，其余四块是**叙述**，两者不混。
// ④ **DL-35 的反证那一半**：速成专区**不得空白** ⇒ 静态内容恒有内容 ＋ 有兜底文案。
//
// ⚠️ **DL-35 的反证为什么写在这里**：DL-35 原文说「切到某模式得到空列表时
//   **必须显示文案**，不许空白（空白会被读成『功能坏了』）」——
//   界面那半是 P3 的活，但「**恒有内容**」这一半是数据层现在就该保证的。
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { newDb } from '../test-support/new-db'
import { seedLangTopics } from './m9-p1-seed-lang-topics'
import { seedProfilePhases } from './m9-p1d-seed-profiles'
import { parseSpecVibeStatic } from '../tooling/m9-p1d-spec'
import {
  VIBE_ABILITIES,
  VIBE_EMPTY_STATE_TEXT,
  VIBE_MINIMAL_KNOWLEDGE,
  VIBE_PITFALLS,
  VIBE_STATIC_BLOCK_SIZES,
  VIBE_WORKFLOW,
} from './m9-vibe-static'

const SEEDS_DIR = fileURLToPath(new URL('./seeds', import.meta.url))
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const SPEC_FILE = join(REPO_ROOT, 'docs/specs/m9-dev-language-roadmap.md')
const SPEC_TEXT = readFileSync(SPEC_FILE, 'utf8')

describe('M9 P1d.5 · 速成专区四块静态内容', () => {
  it('① 与 spec §3.17.2 逐格相等（6 能力 / 7＋7 最小知识 / 4 步 / 6 翻车点）', () => {
    const spec = parseSpecVibeStatic(SPEC_TEXT)
    expect(spec, 'spec §3.17.2 读不出来').not.toBeNull()

    // ① 6 项能力
    expect(spec!.abilities).toEqual(
      VIBE_ABILITIES.map((a) => ({ name: a.name, detail: a.detail })),
    )
    // ② 最小知识（Python 7 + Go 7）
    expect(spec!.minimalKnowledge).toEqual([
      ...VIBE_MINIMAL_KNOWLEDGE.python.map((k) => ({
        lang: 'python',
        name: k.name,
        detail: k.detail,
      })),
      ...VIBE_MINIMAL_KNOWLEDGE.go.map((k) => ({
        lang: 'go',
        name: k.name,
        detail: k.detail,
      })),
    ])
    // ③ 4 步工作流
    expect(spec!.workflow).toEqual(
      VIBE_WORKFLOW.map((s) => ({ step: s.step, title: s.title, detail: s.detail })),
    )
    // ④ 6 个翻车点
    expect(spec!.pitfalls).toEqual(
      VIBE_PITFALLS.map((p) => ({ name: p.name, detail: p.detail })),
    )
  })

  it('② 它们没有建表（库里 lang_* 表一张不多，也没有为这四块建的表）', () => {
    const h = newDb()
    try {
      const before = (
        h.db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'lang_%' ORDER BY name",
          )
          .all() as { name: string }[]
      ).map((r) => r.name)
      // 装载模式层（静态内容不进这一步，但这一步也不许多出表）
      seedLangTopics(h.db, SEEDS_DIR)
      seedProfilePhases(h.db, SEEDS_DIR)
      const after = (
        h.db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'lang_%' ORDER BY name",
          )
          .all() as { name: string }[]
      ).map((r) => r.name)
      expect(after).toEqual(before)
      // ⚠️ 且没有任何表是为这四块建的
      //   （`lang_vibe_resources` 是 §3.1 里的**速成专区资源表**（P1b 的产物），
      //     它装的是 11 条速成资源，**不是**这四块静态内容 ⇒ 不在嫌疑名单里）
      const suspicious = after.filter(
        (n) =>
          n !== 'lang_vibe_resources' && /abilit|workflow|pitfall|minimal|static/i.test(n),
      )
      expect(suspicious, '静态内容被建了表').toEqual([])
      h.close()
    } catch (err) {
      try {
        h.close()
      } catch {
        /* ignore */
      }
      throw err
    }
  })

  it('③ 6 段时间线照常显示（vibe 段 3＋3 在 lang_profile_phases 里）', () => {
    const h = newDb()
    try {
      seedProfilePhases(h.db, SEEDS_DIR)
      const vibe = h.db
        .prepare(
          `SELECT lang, ord, label, title FROM lang_profile_phases
           WHERE profile='vibe' ORDER BY lang, ord`,
        )
        .all() as { lang: string; ord: number; label: string; title: string }[]
      expect(vibe).toHaveLength(6)
      expect(vibe.filter((r) => r.lang === 'python')).toHaveLength(3)
      expect(vibe.filter((r) => r.lang === 'go')).toHaveLength(3)
      // 速成段的标签是 Day 1 / Day 2–3 / Day 4–7（时间线对用户可见）
      for (const r of vibe) {
        expect(r.label, `速成段 ${r.lang}/${String(r.ord)} 的标签不像时间线`).toContain('Day')
      }
      h.close()
    } catch (err) {
      try {
        h.close()
      } catch {
        /* ignore */
      }
      throw err
    }
  })

  it('④ 速成专区恒有内容 ＋ 有兜底文案（DL-35 的反证那一半：空白会被读成「功能坏了」）', () => {
    expect(VIBE_STATIC_BLOCK_SIZES).toEqual({
      能力: 6,
      最小知识: 14,
      工作流: 4,
      翻车点: 6,
    })
    for (const [name, n] of Object.entries(VIBE_STATIC_BLOCK_SIZES)) {
      expect(n, `${name} 块是空的`).toBeGreaterThan(0)
    }
    expect(VIBE_EMPTY_STATE_TEXT.length).toBeGreaterThan(0)
    // ⚠️ 安全红线不许被折叠掉 ⇒ 它必须在翻车点里且排在最后
    expect(VIBE_PITFALLS[VIBE_PITFALLS.length - 1]!.name).toBe('安全红线')
  })

  it('变异：spec §3.17.2 的一格被改动 ⇒ 对账腿必须红（证明它比的是文档，不是自己）', () => {
    const tampered = SPEC_TEXT.replace('幻觉 API', '幻觉 api')
    const spec = parseSpecVibeStatic(tampered)
    expect(spec).not.toBeNull()
    const diff = spec!.pitfalls.filter(
      (p, i) =>
        p.name !== VIBE_PITFALLS[i]?.name || p.detail !== VIBE_PITFALLS[i]?.detail,
    )
    expect(diff.length, 'spec 与模块分叉没有被检出').toBeGreaterThan(0)
  })
})
