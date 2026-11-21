import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * 收尾三段格式的合规检查（DEV-0229 方案 2）。
 *
 * 被测对象是 `scripts/wrap-format-check.mjs` —— 一个判「收尾文本是否符合
 * CLAUDE.md 新格式」的元层面工具。本文件用**三例样例**钉住它的判定边界：
 * 合规（含候选）、合规（本轮无候选）、不合规（旧格式 + 缺字段）。
 *
 * ## 为什么这条测试重要
 *
 * CLAUDE.md 于 2026-11-10 把收尾第三段改为「计划外候选与准入判定」，要求逐条给出
 * 准入判定与落点。规范改了，但**没有机制保证遵守** —— 首轮只能靠人看。
 * 本测试是那个机制的最小闭环：它不检查「人有没有遵守」（收尾文本不进仓），
 * 而是检查**检查器本身有没有判对** —— 检查器是元层面的，可以被测试覆盖。
 *
 * ⚠️ 本测试**不验证候选内容对错**（该不该通过准入、落点对不对）—— 那是人判。
 *   与 `risk-disposition.mjs` / `enhancement-admission.mjs` 同一口径。
 */

const SCRIPT = 'scripts/wrap-format-check.mjs'

/** 跑脚本并返回退出码（不因非零抛出） */
function run(args: string[]): number {
  try {
    execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8', stdio: 'pipe' })
    return 0
  } catch (err) {
    return (err as { status?: number }).status ?? 1
  }
}

describe('wrap-format-check · 自检模式', () => {
  it('--self 应通过（内置三例符合预期）', () => {
    expect(run(['--self'])).toBe(0)
  })
})

describe('wrap-format-check · 判定边界', () => {
  const okWithCandidate = `## 已完成
1. 改了 CLAUDE.md 收尾格式。

## 未完成
无。

## 计划外候选与准入判定
1. **方案 2 的元测试**
   - 准入判定：通过
   - 落点：既有验收（新增一道元测试）
   - 未通过测试：—
`

  it('合规样例（含候选 + 准入判定 + 落点）应判 0', () => {
    const tmp = `/tmp/ov-wrap-ok-${process.pid}.md`
    writeFileSync(tmp, okWithCandidate)
    expect(run(['--file', tmp])).toBe(0)
  })

  it('显式「本轮无候选」应判 0', () => {
    const tmp = `/tmp/ov-wrap-none-${process.pid}.md`
    writeFileSync(
      tmp,
      '## 已完成\n1. 三项完成。\n\n## 未完成\n无。\n\n## 计划外候选与准入判定\n本轮无候选。\n',
    )
    expect(run(['--file', tmp])).toBe(0)
  })

  it('旧格式（未考虑且需要增强的需求）应判 1', () => {
    const tmp = `/tmp/ov-wrap-bad-${process.pid}.md`
    writeFileSync(
      tmp,
      '## 已完成\n1. 改了 CLAUDE.md。\n\n## 未完成\n无。\n\n## 未考虑且需要增强的需求\n1. 加一条元测试。\n',
    )
    expect(run(['--file', tmp])).toBe(1)
  })

  it('候选缺「落点」应判 1', () => {
    const tmp = `/tmp/ov-wrap-noanchor-${process.pid}.md`
    writeFileSync(
      tmp,
      '## 已完成\n1. 完成。\n\n## 未完成\n无。\n\n## 计划外候选与准入判定\n1. **某候选**\n   - 准入判定：通过\n',
    )
    expect(run(['--file', tmp])).toBe(1)
  })
})
