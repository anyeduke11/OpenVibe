// `packages/core/src/db/m9-time-window-guard.test.ts` —— **「日历漂移型红」守卫**的判据测试
//
// ## 它断什么
//
// | 断的事 | 为什么必须断 |
// |---|---|
// | 生产侧的「相对窗口」能被认出来 | 认不出来 ⇒ 后面全都无从谈起 |
// | **断言里的日期不算** | 算进去 ⇒ 满仓误报 ⇒ 守卫会被无视 |
// | **同一个用例**里既有调用又有写死日期才算风险 | 不同用例互不相干 |
// | **变异腿**：真把日期写死进去 ⇒ 守卫必须红 | 守卫自己也得能被证伪 |
// | **全仓零风险** | 这才是这条守卫在真实仓库里的意义 |
//
// ⚠️ **实现层测试，不计入 §7 的五十条判据**（判据数不变，DL-44 守着）。
import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  findHardCodedDateUses,
  findRelativeWindowUses,
  findTimeDriftRisks,
  splitTestBlocks,
  type SourceFile,
} from './m9-time-window-guard'

// ⚠️ 本文件在 `packages/core/src/db/` ⇒ 往上四层才是仓根
const REPO_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..', '..')

/** 一段生产代码（相对窗口 ＋ 表名 ＋ 方法名）。 */
const PROD: SourceFile = {
  file: 'packages/core/src/repos/localEvents.ts',
  text: [
    'export class LocalEventsRepo {',
    '  summary(days: number): LocalEventSummary[] {',
    '    const rows = this.db',
    "      .prepare(`SELECT kind, day, COUNT(*) AS count FROM local_events WHERE day >= date('now', ?)`)",
    '      .all(`-${n} days`)',
    '    return rows',
    '  }',
    '}',
  ].join('\n'),
}

/** 一个测试文件（**用例会切块**）。 */
const TEST: SourceFile = {
  file: 'packages/core/src/repos/x.test.ts',
  text: [
    "it('① 相对窗口的用例（日期跟随当天 ⇒ 不该被报）', () => {",
    '  const at = new Date()',
    '  repo.record({ kind: "pack_exported" }, at)',
    '  const s = repo.summary(7)',
    '  expect(s.length).toBe(1)',
    '})',
    '',
    "it('② 写死日期的用例（日期写死 ⇒ 该被报）', () => {",
    "  const at = new Date('2026-10-14T00:00:00.000Z')",
    '  repo.record({ kind: "pack_exported" }, at)',
    '  const s = repo.summary(7)',
    '  expect(s.length).toBe(1)',
    '})',
  ].join('\n'),
}

describe('M9 · 时间派生量守卫 · 生产侧', () => {
  it('① 相对窗口（`date("now")`）能被认出来，**并带上表名与方法名**', () => {
    const uses = findRelativeWindowUses([PROD])
    expect(uses).toHaveLength(1)
    expect(uses[0]?.table).toBe('local_events')
    expect(uses[0]?.method).toBe('summary')
    expect(uses[0]?.file).toBe(PROD.file)
  })

  it('② ⚠️ **断言里的日期不算「写死」**（它不写库 ⇒ 不会漂）', () => {
    const uses = findHardCodedDateUses([
      {
        file: 'x.test.ts',
        text: ["it('a', () => {", "  expect(row.day).toBe('2026-10-14')", '})'].join('\n'),
      },
    ])
    expect(uses).toHaveLength(0)
  })

  it('③ `new Date("写死的")` **算**「写死」', () => {
    const uses = findHardCodedDateUses([
      {
        file: 'x.test.ts',
        text: ["it('a', () => {", "  const at = new Date('2026-10-14T00:00:00.000Z')", '})'].join('\n'),
      },
    ])
    expect(uses).toHaveLength(1)
    expect(uses[0]?.date).toBe('2026-10-14')
  })

  it('④ 用例切块（`it(` 是边界）', () => {
    const blocks = splitTestBlocks(TEST)
    expect(blocks).toHaveLength(2)
    expect(blocks[0]?.startLine).toBe(1)
  })
})

describe('M9 · 时间派生量守卫 · 判定式（三条同时成立才算风险）', () => {
  it('① ⚠️ **同一个用例**里既有调用又有写死日期 ⇒ 报出来', () => {
    const risks = findTimeDriftRisks([PROD], [TEST])
    expect(risks).toHaveLength(1)
    expect(risks[0]?.table).toBe('local_events')
    expect(risks[0]?.method).toBe('summary')
    expect(risks[0]?.test.date).toBe('2026-10-14')
  })

  it('② ⚠️ **日期跟随当天 ⇒ 不报**（第一支用例是安全的）', () => {
    const risks = findTimeDriftRisks([PROD], [TEST])
    // ⚠️ **守卫自证**：先断言「风险确实落在第二支用例」（写死日期那一行）
    expect(risks[0]?.test.line).toBe(9)
  })

  it('③ ⚠️ **调用与写死日期分属不同用例 ⇒ 不报**', () => {
    const split: SourceFile = {
      file: 'x.test.ts',
      text: [
        "it('① 写死日期，但没调相对窗口', () => {",
        "  const at = new Date('2026-10-14T00:00:00.000Z')",
        '  repo.record({ kind: "pack_exported" }, at)',
        '})',
        '',
        "it('② 调了相对窗口，但没写死日期', () => {",
        '  const at = new Date()',
        '  repo.record({ kind: "pack_exported" }, at)',
        '  const s = repo.summary(7)',
        '})',
      ].join('\n'),
    }
    expect(findTimeDriftRisks([PROD], [split])).toHaveLength(0)
  })

  it('④ ⚠️ **变异腿**：把「跟随当天」改成「写死日期」⇒ 风险从 0 变成 1', () => {
    const safe: SourceFile = {
      file: 'x.test.ts',
      text: [
        "it('相对窗口的用例', () => {",
        '  const at = new Date()',
        '  repo.record({ kind: "pack_exported" }, at)',
        '  const s = repo.summary(7)',
        '})',
      ].join('\n'),
    }
    expect(findTimeDriftRisks([PROD], [safe])).toHaveLength(0)

    // ⚠️ **变异**：只把 `new Date()` 改成写死的日期
    const mutatedText = safe.text.replace('new Date()', "new Date('2026-10-14T00:00:00.000Z')")
    // ⚠️ **守卫自证**：断言「变异真的改了文本」（否则「没报出来」可能是因为变异没生效）
    expect(mutatedText).not.toBe(safe.text)
    expect(mutatedText).toContain("new Date('2026-10-14T00:00:00.000Z')")

    const mutated: SourceFile = { ...safe, text: mutatedText }
    const risks = findTimeDriftRisks([PROD], [mutated])
    expect(risks).toHaveLength(1)
    expect(risks[0]?.test.date).toBe('2026-10-14')
  })
})

describe('M9 · 时间派生量守卫 · 全仓扫描（真实仓库）', () => {
  it('⚠️ **全仓零风险**（相对窗口 ＋ 写死日期 的组合不许存在）', () => {
    const production: SourceFile[] = []
    const tests: SourceFile[] = []

    const roots = ['packages/core/src', 'packages/shared/src', 'apps/server/src', 'apps/web/src', 'apps/cli/src']
    const walk = (dir: string): void => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { readdirSync, statSync } = require('node:fs') as typeof import('node:fs')
      let entries: string[]
      try {
        entries = readdirSync(dir)
      } catch {
        return
      }
      for (const name of entries) {
        const full = join(dir, name)
        const st = statSync(full)
        if (st.isDirectory()) {
          if (name === 'node_modules' || name === 'dist' || name === 'build') continue
          walk(full)
          continue
        }
        if (!name.endsWith('.ts') && !name.endsWith('.tsx')) continue
        const isTest = name.endsWith('.test.ts') || name.endsWith('.test.tsx')
        const rel = relative(REPO_ROOT, full)
        const text = readFileSync(full, 'utf8')
        if (isTest) tests.push({ file: rel, text })
        else production.push({ file: rel, text })
      }
    }
    for (const r of roots) walk(join(REPO_ROOT, r))
    // ⚠️ 仓根的 `tests/` 目录也是测试
    walk(join(REPO_ROOT, 'tests'))

    expect(production.length).toBeGreaterThan(0)
    expect(tests.length).toBeGreaterThan(0)

    const risks = findTimeDriftRisks(production, tests)
    const lines = risks.map(
      (r) =>
        `${r.table}.${r.method}（生产 ${r.production.file}:${String(r.production.line)}）` +
        ` ↔ 写死日期 ${r.test.date}（测试 ${r.test.file}:${String(r.test.line)}）`,
    )
    expect(lines).toEqual([])
  })
})
