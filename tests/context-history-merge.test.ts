import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { tempDir } from '@openvibe/core/test-support'
import { mergeHistories, type MergeSource } from '../scripts/context-history-merge'
import {
  readContextHistory,
  writeContextHistory,
  type ContextCheckHistory,
  type ContextCheckRun,
} from '../scripts/context-check'

/**
 * `context:history:merge` 的测试（跨机器趋势合并 + 可追溯清单）。
 *
 * ## 本文件的价值在「四个不搞错」
 *
 * ① **去重键 = `at`**：同一份历史重复合并不得翻倍；
 * ② **来源保留**：合并后仍看得见哪些轮次来自 `local`、哪些来自 `ci-<平台>`；
 * ③ **坏项逐条丢弃**：一项坏掉不得让整份历史消失；
 * ④ **清单可追溯**：每次合并留下「来源文件名 ＋ 读入数 ＋ 净增数」，
 *    事后能查到「这几轮是从哪个文件合进来的」。
 */

const run = (over: Partial<ContextCheckRun> = {}): ContextCheckRun => ({
  at: '2026-11-05T00:00:00.000Z',
  source: 'local',
  errors: 0,
  c5: 23,
  c5UpperBound: 23,
  c5OverBy: 0,
  c5SuggestLowerBound: null,
  coAnchors: 0,
  ...over,
})

/** 造一份历史（`schema 1`） */
const history = (runs: ContextCheckRun[]): ContextCheckHistory => ({ schema: 1, runs })

const from = (name: string, runs: ContextCheckRun[]): MergeSource => ({
  from: name,
  history: history(runs),
})

const NOW = '2026-11-05T06:00:00.000Z'

describe('context-history-merge · 合并口径', () => {
  it('空基座 ＋ 一份 CI 历史 ⇒ 合并后带来源，清单记下来源文件名与净增数', () => {
    const { history: merged, records } = mergeHistories(
      null,
      [from('ci-history.json', [run({ at: '2026-11-05T02:00:00.000Z', source: 'ci-Linux' })])],
      NOW,
    )
    expect(merged.runs).toHaveLength(1)
    expect(merged.runs[0]?.source).toBe('ci-Linux')
    expect(records[0]).toMatchObject({ from: 'ci-history.json', accepted: 1, added: 1, dropped: 0 })
    expect(merged.merges).toEqual([
      { at: NOW, from: 'ci-history.json', accepted: 1, added: 1, dropped: 0 },
    ])
  })

  it('⚠️ 同一份历史重复合并 ⇒ 不翻倍；第二次净增 0（清单仍留痕）', () => {
    const ci = from('ci-history.json', [
      run({ at: '2026-11-05T02:00:00.000Z', source: 'ci-Linux' }),
    ])
    const first = mergeHistories(null, [ci], NOW)
    const second = mergeHistories(first.history, [ci], '2026-11-05T07:00:00.000Z')
    expect(second.history.runs).toHaveLength(1)
    expect(second.records[0]).toMatchObject({ from: 'ci-history.json', accepted: 1, added: 0 })
    expect(second.history.merges).toHaveLength(2)
  })

  it('本机 ＋ CI 各一轮 ⇒ 两行、按 at 升序（最旧→最新）', () => {
    const { history: merged } = mergeHistories(
      history([run({ at: '2026-11-05T03:00:00.000Z', source: 'local' })]),
      [from('ci.json', [run({ at: '2026-11-05T01:00:00.000Z', source: 'ci-macOS' })])],
      NOW,
    )
    expect(merged.runs.map((r) => r.source)).toEqual(['ci-macOS', 'local'])
  })

  it('⚠️ 坏项逐条丢弃（不因一项坏掉丢掉整份），清单记丢弃数', () => {
    const dirty = {
      from: 'dirty.json',
      history: {
        schema: 1,
        runs: [
          run(),
          { at: 't' } as unknown as ContextCheckRun,
          run({ at: '2026-11-05T05:00:00.000Z' }),
        ],
      } as ContextCheckHistory,
    }
    const { history: merged, records } = mergeHistories(null, [dirty], NOW)
    expect(merged.runs).toHaveLength(2)
    expect(records[0]).toMatchObject({ accepted: 2, dropped: 1, added: 2 })
  })

  it('超过上限 ⇒ 只留最近 50 轮（最旧被截）', () => {
    const many = history(
      Array.from({ length: 60 }, (_, i) =>
        run({ at: `2026-11-05T00:${String(i).padStart(2, '0')}:00.000Z`, c5: i }),
      ),
    )
    const { history: merged } = mergeHistories(null, [{ from: 'many.json', history: many }], NOW)
    expect(merged.runs).toHaveLength(50)
    expect(merged.runs[0]?.c5).toBe(10)
    expect(merged.runs[49]?.c5).toBe(59)
  })

  it('旧产物（无 source）⇒ 保留为 undefined，面板按 local 显示（不伪造来源）', () => {
    const legacy = { schema: 1, runs: [{ ...run(), source: undefined }] } as ContextCheckHistory
    const { history: merged } = mergeHistories(
      null,
      [{ from: 'legacy.json', history: legacy }],
      NOW,
    )
    expect(merged.runs[0]?.source).toBeUndefined()
  })

  it('⚠️ 清单超上限 ⇒ 只留最近 50 条（并入 base 的旧清单）', () => {
    const base: ContextCheckHistory = {
      schema: 1,
      runs: [run()],
      merges: Array.from({ length: 50 }, (_, i) => ({
        at: `2026-11-0${(i % 9) + 1}T00:00:00.000Z`,
        from: `old-${String(i)}.json`,
        accepted: 1,
        dropped: 0,
        added: 0,
      })),
    }
    const { history: merged, records } = mergeHistories(
      base,
      [from('new.json', [run({ at: '2026-11-05T09:00:00.000Z', source: 'ci-Windows' })])],
      NOW,
    )
    expect(merged.merges).toHaveLength(50)
    // 最新一条必是本次合并（旧的被截掉）
    expect(merged.merges?.[49]).toMatchObject({ from: 'new.json', added: 1 })
    expect(records).toHaveLength(1)
  })
})

describe('context-history-merge · 往返（写盘可回读）', () => {
  it('合并结果写回后可被 readContextHistory 读回（含 merges 清单）', () => {
    const path = join(tempDir('ctx-hist-merge-'), 'context-check-history.json')
    const merged = mergeHistories(
      null,
      [from('ci.json', [run({ source: 'ci-ubuntu' })])],
      NOW,
    ).history
    expect(writeContextHistory(merged, path)).toBe(path)
    const read = readContextHistory(path)
    expect(read?.runs[0]?.source).toBe('ci-ubuntu')
    expect(read?.merges?.[0]?.from).toBe('ci.json')
  })
})
