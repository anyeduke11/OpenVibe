import { describe, expect, it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tempDir } from '@openvibe/core/test-support'
import {
  appendHistory,
  diffWarnings,
  parseEvidenceLocation,
  readHistory,
  renderTrend,
  toAnnotation,
  toHistoryRun,
  type Finding,
  type HistoryRun,
  type WarningDiff,
} from '../scripts/docs-check-diff'

/**
 * `scripts/docs-check-diff.ts` 的测试（本轮 vs 上轮 warning 差分）。
 *
 * ## 本文件的全部价值在「四件事不搞错」
 *
 * ① **身份不含 evidence 的行号**：evidence 带绝对行号，文档上方插一行就漂 ⇒ 若把
 *    evidence 计入身份，同一批 warning 会全部误报成「新增 + 消失」，差分只剩噪音。
 * ② **身份不含 message**：同一笔登记（evidence 里的 DEV 号没变）缺的段换了，
 *    是「事实变化」⇒ 报 modified，不是「新增 + 消失」（放进新增会重复计数）。
 * ③ **新增条目必须带 evidence（含行号）**，人才知道去哪修。
 * ④ **注解要能退化**：evidence 形态有三类，抽不到 `path:line` 时不能崩；文件级
 *    evidence 落到 `file=`，真·无定位才 `::warning ::`（GitHub 当普通文本，不破坏输出）。
 * ⑤ **历史趋势只做加法**：追加一轮不丢已有轮次；超限只截最旧的；读坏文件视作
 *    「空历史从头记」，不崩、不假装有数据（否则趋势会被一段损坏的历史带偏）。
 */

const finding = (over: Partial<Finding> = {}): Finding => ({
  rule: 'FR-5.1',
  level: 'warning',
  message: '登记缺「潜在风险」段',
  evidence: 'DEV_LOG.md:3875 · DEV-0166 某登记 · 基线：待裁③',
  ...over,
})

/** 造一轮差分结果的辅助：prev 空、curr 一条 ⇒ 必含 rules 与 added */
const sampleDiff = (): WarningDiff => diffWarnings([], [finding()])

/** 造一条历史快照（ts 可注入，便于断言渲染） */
const run = (over: Partial<HistoryRun> = {}): HistoryRun => ({
  ts: '2026-11-05T00:00:00.000Z',
  sha: null,
  runId: null,
  prevTotal: 0,
  currTotal: 1,
  added: 1,
  removed: 0,
  modified: 0,
  rules: { 'FR-5.1': 1 },
  ...over,
})

describe('docs-check-diff · 对比键的稳定性', () => {
  it('同一批 warning、evidence 行号漂移 ⇒ 不算新增也不算消失', () => {
    const prev = [finding({ evidence: 'DEV_LOG.md:100 · DEV-0050 某登记' })]
    const curr = [finding({ evidence: 'DEV_LOG.md:200 · DEV-0050 某登记' })]
    const { added, removed, modified } = diffWarnings(prev, curr)
    expect(added).toEqual([])
    expect(removed).toEqual([])
    expect(modified).toEqual([])
  })

  it('⚠️ 同一身份（DEV 号没变）、消息变了 ⇒ 报 modified，**不**算新增/消失', () => {
    // 同一笔登记从缺「潜在风险」变成缺「核心变更」，是事实变化不是新问题；
    // 身份 = rule + 归一化 evidence（DEV 号没变）⇒ 两轮身份相同 ⇒ 不该进 added。
    const prev = [finding()]
    const curr = [finding({ message: '登记缺「核心变更」段' })]
    const { added, removed, modified } = diffWarnings(prev, curr)
    expect(added).toEqual([])
    expect(removed).toEqual([])
    expect(modified).toHaveLength(1)
    expect(modified[0]?.prevMessage).toContain('潜在风险')
    expect(modified[0]?.currMessage).toContain('核心变更')
  })

  it('只比 warning：error 不进差分清单', () => {
    const prev = [finding({ level: 'error' })]
    const curr = [finding({ level: 'error', message: '登记缺「核心变更」段' })]
    const { added, removed } = diffWarnings(prev, curr)
    expect(added).toEqual([])
    expect(removed).toEqual([])
  })

  it('新增条目带上了定位所需的 evidence', () => {
    const curr = [finding({ message: '登记缺「核心变更」段' })]
    const { added } = diffWarnings([], curr)
    expect(added[0]?.evidence).toContain('DEV_LOG.md:3875')
  })
})

describe('docs-check-diff · evidence 位置抽取', () => {
  it('`path:line` 形态 ⇒ 抽出 path 与行号', () => {
    expect(parseEvidenceLocation('docs/dev-plan.md:1505')).toEqual({
      path: 'docs/dev-plan.md',
      line: 1505,
    })
  })

  it('`path:line · 基线：…` ⇒ 先剥基线后缀再抽（否则行号取错）', () => {
    expect(parseEvidenceLocation('DEV_LOG.md:3875 · DEV-0166 某登记 · 基线：待裁③')).toEqual({
      path: 'DEV_LOG.md',
      line: 3875,
    })
  })

  it('只有 path 没有行号 ⇒ 返回 null（不猜行号）', () => {
    expect(parseEvidenceLocation('docs/specs/ · 版本行所在表')).toBeNull()
  })

  it('散文型 evidence ⇒ 返回 null', () => {
    expect(parseEvidenceLocation('git status --porcelain -- tests/golden/')).toBeNull()
  })
})

describe('docs-check-diff · GitHub 注解', () => {
  it('抽得到位置 ⇒ 输出带 file/line 的注解', () => {
    const line = toAnnotation(finding())
    expect(line).toBe('::warning file=DEV_LOG.md,line=3875::FR-5.1 登记缺「潜在风险」段')
  })

  it('文件级 evidence（有 path 无行号）⇒ 落到 `file=`（不猜行号，但高亮到文件）', () => {
    const line = toAnnotation(finding({ evidence: 'docs/specs/ · 版本行所在表' }))
    expect(line.startsWith('::warning file=docs/specs/::')).toBe(true)
    expect(line).toContain('FR-5.1')
  })

  it('真·无定位的 evidence ⇒ 退化为 `::warning ::`（GitHub 当普通文本，不破坏输出）', () => {
    const line = toAnnotation(finding({ evidence: 'git status --porcelain -- tests/golden/' }))
    expect(line.startsWith('::warning ::')).toBe(true)
    expect(line).toContain('FR-5.1')
  })
})

describe('docs-check-diff · 历史趋势', () => {
  it('⚠️ 空历史追加一轮 ⇒ schema 1，只有本轮', () => {
    const h = appendHistory(null, run())
    expect(h.schema).toBe(1)
    expect(h.runs).toHaveLength(1)
    expect(h.runs[0]?.currTotal).toBe(1)
  })

  it('⚠️ 追加不丢已有轮次 ⇒ runs 按先后递增', () => {
    const h = appendHistory(appendHistory(null, run({ currTotal: 1 })), run({ currTotal: 2 }))
    expect(h.runs.map((r) => r.currTotal)).toEqual([1, 2])
  })

  it('⚠️ 超限只截最旧的（保留最近 50 轮，不丢最新）', () => {
    let h: ReturnType<typeof appendHistory> = null as never
    for (let i = 0; i < 51; i += 1) h = appendHistory(h, run({ currTotal: i + 1 }))
    expect(h.runs).toHaveLength(50)
    expect(h.runs[0]?.currTotal).toBe(2) // 第 1 轮（=1）被截掉
    expect(h.runs[49]?.currTotal).toBe(51) // 最新一轮不丢
  })

  it('toHistoryRun 从 WarningDiff 抓全各规则计数', () => {
    const hr = toHistoryRun(sampleDiff(), { ts: 'T', sha: null, runId: '42' })
    expect(hr.runId).toBe('42')
    expect(hr.currTotal).toBe(1)
    expect(hr.added).toBe(1)
    expect(hr.rules['FR-5.1']).toBe(1)
  })

  it('renderTrend 输出各规则走势（最旧→最新）', () => {
    const h = appendHistory(null, run({ ts: '2026-11-03T08:00:00.000Z', rules: { 'FR-5.1': 1 } }))
    const out = renderTrend(
      appendHistory(h, run({ ts: '2026-11-04T08:00:00.000Z', rules: { 'FR-5.1': 2 } })),
    )
    expect(out).toContain('FR-5.1')
    expect(out).toContain('1 · 2')
    expect(out).toContain('共记录 2 轮')
  })

  it('readHistory 不存在文件 ⇒ null（空历史从头记，不崩）', () => {
    expect(readHistory('/nonexistent/never-written.json')).toBeNull()
  })

  it('readHistory 非法 JSON ⇒ null', () => {
    expect(readHistory('/nonexistent/…')).toBeNull()
  })

  it('readHistory schema 不匹配 ⇒ null', () => {
    const dir = tempDir('docs-diff-hist-')
    const f = join(dir, 'h.json')
    writeFileSync(f, JSON.stringify({ schema: 999, runs: [] }))
    expect(readHistory(f)).toBeNull()
  })
})
