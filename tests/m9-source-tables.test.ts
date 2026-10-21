// `tests/m9-source-tables.test.ts` —— M9 v1.6 **P4 · 「表不越界」闸**（§3.1 十七张）
// （`m9-dev-plan-2026-10.md` §6.10 P4.3 ＋ `m9-dev-language-roadmap.md` §3.1 / §7 DL-26）
//
// ## 它断什么
//
// P4 落了迁移 0016（建三张表）⇒ 必须证明两件事：
//
// 1. **库里没有规格之外的表** —— `lang_*` 表**全部**出现在 spec §3.1 的十七张名单里；
// 2. **规格里的表不全是已建的** —— 缺口要**显式记账**，不能靠「忘了」。
//
// ## ⚠️ 为什么这条闸在仓根而不是 packages/core
//
// 它要**读 spec 正文**（§3.1 的代码块）并**开一个真库**⇒ 两头都跨层：
// `packages/core` 的测试不该依赖仓根目录的文件（包边界），而仓根的 `tests/` 本来就干
// 「跨层对账」这件事（`tests/m9-spec-consistency.test.ts` 读 spec、`tests/order-determinism.test.ts` 开库）。
//
// ## ⚠️ 与 DL-26 的分工
//
// **DL-26**（`tests/support/m9-spec-consistency.ts`）断的是**文档层**：§3.1 代码块里数出来是不是 17 张。
// **本文件**断的是**库层**：库里实际建的表**是不是那 17 张的子集**，以及**缺哪几张**。
// ⚠️ 两层都必须断：文档说 17 张、库里建了 18 张（含一张规格外的）⇒ DL-26 是绿的，本文件会红；
// 反过来库里一张没建 ⇒ DL-26 也是绿的，只有本文件知道「缺口变了」。
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { newDb } from '../packages/core/src/test-support/new-db'
import { spec31TableNames } from './support/m9-spec-consistency'

const SPEC = readFileSync(
  new URL('../docs/specs/m9-dev-language-roadmap.md', import.meta.url),
  'utf8',
)

/** spec §3.1 的十七张表名（**唯一出处**＝ spec 正文，不在本文件另抄一份）。 */
const SPEC_TABLES = spec31TableNames(SPEC.split('\n')).map((t) => t.name)

/**
 * **尚未建表**的 spec 表（缺口台账）。
 *
 * ⚠️ 这是**记账**，不是「允许少建」——
 * `lang_topic_requests`（§3.11 增强③「我要这条的完整内容」的登记）属增强③，
 * **不在 P4 的范围内**（P4 只做源码 T0＋T1）⇒ P4 结束时它还没建。
 * ⇒ **哪天它落地了，这条名单要改**（否则本支会红）—— 那正是它该有的效果。
 */
const NOT_YET_BUILT = ['lang_topic_requests']

describe('M9 P4 · §3.1 「表不越界」闸', () => {
  it('① spec §3.1 的表数复算 ＝ 十七（DL-26 的文档层，这里做交叉确认）', () => {
    expect(SPEC_TABLES).toHaveLength(17)
  })

  it('② 库里**没有规格之外的 `lang_*` 表**', () => {
    const h = newDb()
    try {
      const dbTables = (
        h.db
          .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'lang_%'")
          .all() as { name: string }[]
      ).map((t) => t.name)
      const outside = dbTables.filter((n) => !SPEC_TABLES.includes(n))
      expect(outside, '库里有 spec §3.1 之外的 lang_* 表 ⇒ 有人偷偷建了新表').toEqual([])
    } finally {
      h.close()
    }
  })

  it('③ P4 的三张表都建出来了', () => {
    const h = newDb()
    try {
      const dbTables = (
        h.db
          .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'lang_%'")
          .all() as { name: string }[]
      ).map((t) => t.name)
      expect(dbTables).toContain('lang_topic_findings')
      expect(dbTables).toContain('lang_source_consent')
      expect(dbTables).toContain('lang_source_shares')
    } finally {
      h.close()
    }
  })

  it('④ 缺口是**显式记账**的：spec 里还没建的那几张，与这张台账逐项相等', () => {
    const h = newDb()
    try {
      const dbTables = (
        h.db
          .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'lang_%'")
          .all() as { name: string }[]
      ).map((t) => t.name)
      const missing = SPEC_TABLES.filter((n) => !dbTables.includes(n)).sort()
      expect(
        missing,
        '缺口变了：要么新表落地了（改 NOT_YET_BUILT），要么有人少建了表（不许）',
      ).toEqual([...NOT_YET_BUILT].sort())
    } finally {
      h.close()
    }
  })

  it('变异腿：造一张规格外的 `lang_*` 表 ⇒ 第 ② 支当场红', () => {
    const h = newDb()
    try {
      h.db.exec('CREATE TABLE lang_shadow_spec (id INTEGER PRIMARY KEY)')
      const dbTables = (
        h.db
          .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'lang_%'")
          .all() as { name: string }[]
      ).map((t) => t.name)
      const outside = dbTables.filter((n) => !SPEC_TABLES.includes(n))
      // ⚠️ 变异腿的意义就在这一行：**真建了一张表**，闸要报出来
      expect(dbTables).toContain('lang_shadow_spec')
      expect(outside).toEqual(['lang_shadow_spec'])
    } finally {
      h.close()
    }
  })
})
