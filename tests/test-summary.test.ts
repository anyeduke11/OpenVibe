import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseSummary } from '../scripts/test-summary'

/**
 * `pnpm test` 的**四数汇总**判据（2026-10-31 · v0.2.4 R0 · F13 / X3）。
 *
 * ## 它钉的是哪一件事
 *
 * PRD F13 / X3 要求：测试输出要同时给出 **passed / failed / skipped / todo** 四个数，
 * 且 **todo 不得计入 passed**（必须单列）——
 * 因为旧口径「2438 条通过」里混着「根本没跑」的用例（环境门控写成裸 `if (!hasGo) return`
 * ⇒ 框架记为 passed）⇒ 环境缺失被读作覆盖率。
 *
 * ## 为什么测「解析函数」而不是「跑一次全量」
 *
 * 四数的**来源**是 vitest 的汇总行（它自己已把四数分开给）⇒ 真正该判的是
 * 「我们的解析与呈现没有把四数弄丢或弄混」。
 * ⇒ 测解析函数（快、稳）+ 测「脚本确实接在 test 入口上」（静态）。
 */

const ROOT = resolve(__dirname, '..')

describe('test 四数汇总（R0 · F13 / X3）', () => {
  it('解析 vitest 的汇总行：四数齐全', () => {
    const out = [
      ' Test Files  1 passed (1)',
      '      Tests  13 passed | 2 skipped | 1 todo (16)',
      '   Duration  318ms',
    ].join('\n')
    expect(parseSummary(out)).toEqual({ passed: 13, failed: 0, skipped: 2, todo: 1 })
  })

  it('解析含 failed 的汇总行', () => {
    const out = '      Tests  3 failed | 10 passed | 1 skipped (14)'
    expect(parseSummary(out)).toEqual({ passed: 10, failed: 3, skipped: 1, todo: 0 })
  })

  it('ANSI 彩色输出不影响解析（vitest 默认带色）', () => {
    const out =
      '[2m      Tests [22m [1m[32m1 passed[39m[22m | [2m[33m1 skipped[39m[22m | [2m[90m1 todo[39m[22m (3)'
    expect(parseSummary(out)).toEqual({ passed: 1, failed: 0, skipped: 1, todo: 1 })
  })

  it('⚠️ todo 单列（不计入 passed）—— X3 的硬要求', () => {
    // 「3 条 todo」若被当成「3 条通过」，那「全绿」就含没跑的用例 ⇒ 覆盖率被读错。
    const out = '      Tests  5 passed | 3 todo (8)'
    const s = parseSummary(out)
    expect(s?.todo).toBe(3)
    expect(s?.passed).toBe(5)
    // 总数 8 = passed 5 + todo 3 ⇒ 两者必须互不重叠
    expect((s?.passed ?? 0) + (s?.todo ?? 0)).toBe(8)
  })

  it('没抓到汇总行 ⇒ 返回 null（脚本据此明确报错，不假装成功）', () => {
    expect(parseSummary('some unrelated output\n')).toBeNull()
    expect(parseSummary('')).toBeNull()
  })

  it('test 入口接的是四数汇总脚本（不是裸 vitest run）', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }
    expect(pkg.scripts['test']).toContain('test-summary')
    // ⚠️ 裸 vitest run 不会给四数汇总 ⇒ 这条判的是「入口没被改回去」
    expect(pkg.scripts['test']).not.toBe('vitest run')
  })

  it('汇总脚本明确说明「todo 不计入 passed」（文案自证意图）', () => {
    const src = readFileSync(join(ROOT, 'scripts', 'test-summary.ts'), 'utf8')
    expect(src).toContain('不计入 passed')
    expect(src).toContain('skipped')
    expect(src).toContain('todo')
  })

  it('⚠️ test 收尾跑孤儿体检（登记目录才会在每台跑过测试的机器上被回收）', () => {
    // ⚠️ 为什么要判这条：回收只在体检进程里做 ⇒
    //   体检不挂在 `pnpm test` 收尾，登记目录在大多数机器上就**永远不会被回收**。
    const src = readFileSync(join(ROOT, 'scripts', 'test-summary.ts'), 'utf8')
    expect(src).toContain("from './check-orphan-workers'")
    expect(src).toContain('checkOrphans(')
    // ⚠️ 体检是报告不是门禁 ⇒ 退出码仍只取 vitest 的
    expect(src).toContain('process.exitCode = code ?? (signal !== null ? 1 : 0)')
  })
})
