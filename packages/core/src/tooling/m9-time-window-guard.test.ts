// `packages/core/src/db/m9-time-window-guard.test.ts` —— **「日历漂移型红」守卫**的判据测试
//
// ## 它断什么
//
// | 断的事 | 为什么必须断 |
// |---|---|
// | 生产侧的「相对窗口」能被认出来 | 认不出来 ⇒ 后面全都无从谈起 |
// | **JS 形态的相对窗口**（`Date.now() - 7 * 86_400_000`）也能被认出来 | JS 侧是同一类坑，守卫看不见它 ⇒ 将来会重演「到期变红」 |
// | ⚠️ **只认「减法 ＋ 时长」** | `Date.now()` 单独出现是 scan id，不是窗口 |
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

/**
 * 一段生产代码（相对窗口 ＋ 表名 ＋ 方法名）。
 *
 * ⚠️ **方法名故意叫 `fixtureSummary` 而不是 `summary`** ——
 *   真实仓库里 `LocalEventsRepo.summary` **确实**有相对窗口（`date('now', ?)`）
 *   ⇒ 守卫自带的夹具若也叫 `summary`，**本文件自己就会被判成风险**（自我命中）
 *   ⇒ 全仓扫描那支会被夹具带红 ⇒ 守卫失效。
 *   ⇒ 夹具用**别的名字** ⇒ 夹具与真实生产代码互不干扰。
 */
const PROD: SourceFile = {
  file: 'packages/core/src/repos/localEvents.ts',
  text: [
    'export class LocalEventsRepo {',
    '  fixtureSummary(days: number): LocalEventSummary[] {',
    '    const rows = this.db',
    "      .prepare(`SELECT kind, day, COUNT(*) AS count FROM local_events WHERE day >= date('now', ?)`)",
    '      .all(`-${n} days`)',
    '    return rows',
    '  }',
    '}',
  ].join('\n'),
}

/**
 * **跨行 SQL**（表名与 `date('now')` **不在同一行** —— 本仓真实形状）。
 *
 * ⚠️ 这正是逐行取表名会**整片漏报**的那种形状。
 */
const PROD_MULTILINE: SourceFile = {
  file: 'packages/core/src/repos/localEvents.ts',
  text: [
    'export class LocalEventsRepo {',
    '  summary(days: number): LocalEventSummary[] {',
    '    const rows = this.db',
    '      .prepare(`SELECT kind, day, COUNT(*) AS count',
    '           FROM local_events',
    "          WHERE day >= date('now', ?)",
    '          GROUP BY kind, day`)',
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
    '  const s = repo.fixtureSummary(7)',
    '  expect(s.length).toBe(1)',
    '})',
    '',
    "it('② 写死日期的用例（日期写死 ⇒ 该被报）', () => {",
    "  const at = new Date('2026-10-14T00:00:00.000Z')",
    '  repo.record({ kind: "pack_exported" }, at)',
    '  const s = repo.fixtureSummary(7)',
    '  expect(s.length).toBe(1)',
    '})',
  ].join('\n'),
}

/** 一段**带 JS 侧相对窗口**的生产代码（⚠️ JS 侧没有表 ⇒ `table` 是**空串**）。 */
const PROD_JS: SourceFile = {
  file: 'packages/core/src/repos/jsWindow.ts',
  text: [
    'export class JsWindowRepo {',
    '  jsWindowSince(days: number): number {',
    '    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000',
    '    return cutoff',
    '  }',
    '}',
  ].join('\n'),
}

/** 另一段 JS 侧相对窗口（`new Date().getTime()` 那一支）。 */
const PROD_JS_GETTIME: SourceFile = {
  file: 'packages/core/src/repos/jsWindow.ts',
  text: [
    'export class JsWindowRepo {',
    '  jsWindowUntil(at: Date): number {',
    '    const cutoff = new Date().getTime() - 7 * 86_400_000',
    '    return cutoff',
    '  }',
    '}',
  ].join('\n'),
}

/** **写死日期**的测试用例（调用了 JS 形态那个方法 ⇒ **该被报**）。 */
const TEST_JS_HARDCODED: SourceFile = {
  file: 'packages/core/src/repos/jsWindow.test.ts',
  text: [
    "it('写死日期的用例', () => {",
    "  const at = new Date('2026-10-14T00:00:00.000Z')",
    '  repo.record({ kind: "pack_exported" }, at)',
    '  const cutoff = repo.jsWindowSince(7)',
    '  expect(cutoff).toBeGreaterThan(0)',
    '})',
  ].join('\n'),
}

/** **跟随当天**的测试用例（调用了 JS 形态那个方法 ⇒ **不该被报**）。 */
const TEST_JS_SAFE: SourceFile = {
  file: 'packages/core/src/repos/jsWindow.test.ts',
  text: [
    "it('跟随当天的用例', () => {",
    '  const at = new Date()',
    '  repo.record({ kind: "pack_exported" }, at)',
    '  const cutoff = repo.jsWindowSince(7)',
    '  expect(cutoff).toBeGreaterThan(0)',
    '})',
  ].join('\n'),
}

describe('M9 · 时间派生量守卫 · 生产侧', () => {
  it('① 相对窗口（`date("now")`）能被认出来，**并带上表名与方法名**', () => {
    const uses = findRelativeWindowUses([PROD])
    expect(uses).toHaveLength(1)
    expect(uses[0]?.table).toBe('local_events')
    expect(uses[0]?.method).toBe('fixtureSummary')
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
        text: ["it('a', () => {", "  const at = new Date('2026-10-14T00:00:00.000Z')", '})'].join(
          '\n',
        ),
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

  it("⑤ ⚠️ **跨行的 SQL 也能取到表名**（表名与 `date('now')` 不在同一行）", () => {
    const uses = findRelativeWindowUses([PROD_MULTILINE])
    expect(uses).toHaveLength(1)
    expect(uses[0]?.table).toBe('local_events')
    expect(uses[0]?.method).toBe('summary')
    // ⚠️ 行号指着 **`date('now')` 那一行**（不是 `FROM` 那一行）
    expect(uses[0]?.line).toBe(6)
  })

  it('⑥ ⚠️ **测试侧注释里的写死日期不算**（注释掉的造数语句不会执行 ⇒ 不会漂）', () => {
    const commented: SourceFile = {
      file: 'x.test.ts',
      text: [
        "it('a', () => {",
        "  // const at = new Date('2026-10-14T00:00:00.000Z')",
        '  // repo.record({ kind: "pack_exported" }, at)',
        '})',
      ].join('\n'),
    }
    expect(findHardCodedDateUses([commented])).toHaveLength(0)
  })
})

describe('M9 · 时间派生量守卫 · 判定式（三条同时成立才算风险）', () => {
  it('① ⚠️ **同一个用例**里既有调用又有写死日期 ⇒ 报出来', () => {
    const risks = findTimeDriftRisks([PROD], [TEST])
    expect(risks).toHaveLength(1)
    expect(risks[0]?.table).toBe('local_events')
    expect(risks[0]?.method).toBe('fixtureSummary')
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
        '  const s = repo.fixtureSummary(7)',
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
        '  const s = repo.fixtureSummary(7)',
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

describe('M9 · 时间派生量守卫 · JS 形态的相对窗口（当下时刻减去一个时长）', () => {
  it('① `Date.now() - days * 24 * 60 * 60 * 1000` 能被认出来，**方法名照旧要取到**、**表名留空串**', () => {
    const uses = findRelativeWindowUses([PROD_JS])
    expect(uses).toHaveLength(1)
    expect(uses[0]?.method).toBe('jsWindowSince')
    // ⚠️ JS 侧**没有表** ⇒ 空串（表名只作附加信息，**不参与**判定）
    expect(uses[0]?.table).toBe('')
    expect(uses[0]?.file).toBe(PROD_JS.file)
  })

  it('② `new Date().getTime() - 7 * 86_400_000` 也能被认出来', () => {
    const uses = findRelativeWindowUses([PROD_JS_GETTIME])
    expect(uses).toHaveLength(1)
    expect(uses[0]?.method).toBe('jsWindowUntil')
    expect(uses[0]?.table).toBe('')
  })

  it('③ ⚠️ **`Date.now()` 单独出现不算**（当 scan id 用，不是窗口）', () => {
    const scanId: SourceFile = {
      file: 'packages/core/src/source-scan/scan.ts',
      text: [
        'export async function scanProjectSource(opts: ScanProjectOptions): Promise<SourceScanResult> {',
        '  const scanId = opts.scanId ?? Date.now()',
        '  return { scanId }',
        '}',
      ].join('\n'),
    }
    expect(findRelativeWindowUses([scanId])).toHaveLength(0)
  })

  it('④ ⚠️ **减数不带时间单位不算**（`Date.now() - 7` 是减个常数，不是窗口）', () => {
    const notWindow: SourceFile = {
      file: 'x.ts',
      text: [
        'export class R {',
        '  recent(): number {',
        '    const t = Date.now() - 7',
        '    return t',
        '  }',
        '}',
      ].join('\n'),
    }
    expect(findRelativeWindowUses([notWindow])).toHaveLength(0)
  })

  it('⑤ ⚠️ **驼峰时间戳不算**（`now - startedMs` 是算已过时长，不是窗口）', () => {
    const elapsed: SourceFile = {
      file: 'x.ts',
      text: [
        'export class R {',
        '  elapsed(startedMs: number): number {',
        '    const t = Date.now() - startedMs',
        '    return t',
        '  }',
        '}',
      ].join('\n'),
    }
    expect(findRelativeWindowUses([elapsed])).toHaveLength(0)
  })

  it('⑥ ⚠️ **注释里的示例不算**（注释不是代码）', () => {
    const commented: SourceFile = {
      file: 'x.ts',
      text: [
        'export class R {',
        '  recent(): number {',
        '    // 截止 = Date.now() - 7 * 86_400_000',
        '    const t = Date.now()',
        '    return t',
        '  }',
        '}',
      ].join('\n'),
    }
    expect(findRelativeWindowUses([commented])).toHaveLength(0)
  })
})

describe('M9 · 时间派生量守卫 · JS 形态的判定式', () => {
  it('① ⚠️ **JS 形态 ＋ 写死日期 ⇒ 报出风险**（**表名空串不拦**它）', () => {
    const risks = findTimeDriftRisks([PROD_JS], [TEST_JS_HARDCODED])
    expect(risks).toHaveLength(1)
    expect(risks[0]?.method).toBe('jsWindowSince')
    // ⚠️ JS 侧没有表 ⇒ 表名是空串，**但风险照样报出来**（表名只作附加信息）
    expect(risks[0]?.table).toBe('')
    expect(risks[0]?.test.date).toBe('2026-10-14')
  })

  it('② ⚠️ **JS 形态 ＋ 跟随当天 ⇒ 不报**', () => {
    expect(findTimeDriftRisks([PROD_JS], [TEST_JS_SAFE])).toHaveLength(0)
  })

  it('③ ⚠️ **变异腿**：把「跟随当天」改成「写死日期」⇒ 风险从 0 变成 1', () => {
    const safeText = TEST_JS_SAFE.text
    expect(findTimeDriftRisks([PROD_JS], [TEST_JS_SAFE])).toHaveLength(0)

    // ⚠️ **变异**：只把 `new Date()` 改成写死的日期
    const mutatedText = safeText.replace('new Date()', "new Date('2026-10-14T00:00:00.000Z')")
    // ⚠️ **守卫自证**：断言「变异真的改了文本」（否则「没报出来」可能是因为变异没生效）
    expect(mutatedText).not.toBe(safeText)
    expect(mutatedText).toContain("new Date('2026-10-14T00:00:00.000Z')")

    const mutated: SourceFile = { ...TEST_JS_SAFE, text: mutatedText }
    const risks = findTimeDriftRisks([PROD_JS], [mutated])
    expect(risks).toHaveLength(1)
    expect(risks[0]?.test.date).toBe('2026-10-14')
  })

  it('④ ⚠️ **调用与写死日期分属不同用例 ⇒ 不报**（JS 形态也守「同一个用例」）', () => {
    const split: SourceFile = {
      file: 'x.test.ts',
      text: [
        "it('① 写死日期，但没调 JS 形态那个方法', () => {",
        "  const at = new Date('2026-10-14T00:00:00.000Z')",
        '  repo.record({ kind: "pack_exported" }, at)',
        '})',
        '',
        "it('② 调了 JS 形态那个方法，但没写死日期', () => {",
        '  const at = new Date()',
        '  repo.record({ kind: "pack_exported" }, at)',
        '  const cutoff = repo.jsWindowSince(7)',
        '})',
      ].join('\n'),
    }
    expect(findTimeDriftRisks([PROD_JS], [split])).toHaveLength(0)
  })
})

describe('M9 · 时间派生量守卫 · 全仓扫描（真实仓库）', () => {
  it('⚠️ **事故现场那一处确实被认出来**（`LocalEventsRepo.summary` 的相对窗口）', () => {
    // ⚠️ **为什么要有这一支**：守卫自己「全仓零风险」可能是因为**它压根没看见那一处**
    //   （2026-10-22 实测：表名逐行取 ⇒ `FROM local_events` 与 `date('now', ?)` 不同行
    //   ⇒ 表名取不到 ⇒ 整个 use 被丢掉 ⇒ 「零风险」是**漏报**出来的）。
    //   ⇒ 必须单独断言「那一处看得见」⇒ 零风险才有意义。
    const file = 'packages/core/src/repos/localEvents.ts'
    const text = readFileSync(join(REPO_ROOT, file), 'utf8')
    const uses = findRelativeWindowUses([{ file, text }])
    const hit = uses.find((u) => u.method === 'summary')
    expect(hit).toBeDefined()
    expect(hit?.table).toBe('local_events')
  })

  it('⚠️ **全仓零风险**（相对窗口 ＋ 写死日期 的组合不许存在）', () => {
    const production: SourceFile[] = []
    const tests: SourceFile[] = []

    const roots = [
      'packages/core/src',
      'packages/shared/src',
      'apps/server/src',
      'apps/web/src',
      'apps/cli/src',
    ]
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
