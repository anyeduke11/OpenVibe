import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { computeTransferPlan, type TopicProfileLite, type TopicStageLite } from '@openvibe/shared'
import { ModeTransferPanel } from './ModeTransferPanel'

/**
 * M9 v1.6 **P1e.1 出口**（`m9-dev-plan-2026-10.md` §6.6 · **DL-37**）。
 *
 * DL-37 断三件事：
 * ① 界面显示的**起始站**必须等于「已点亮速成必学 → 精通站位」的逐条映射结果；
 * ② **反证**：文案断「站到第 N 站之前」而非「已完成第 N 站」；
 * ③ 一条都没点亮时必须显示**完整站数**，不许空白或 0。
 *
 * ⚠️ **夹具用真实 slug** —— 取自仓内 `lang_topics` 种子（2026-10-20 实测），
 *   每站一个，Python 8 站 / Go 6 站。造「某知识点」这种占位名会让判据失去意义：
 *   读者一眼就知道它是假的，而真实的 slug 能让人核对站位对不对。
 */

/** Python 八站，每站一个真实 slug（取自 `lang_topics` 种子） */
const PY = [
  { id: 101, slug: 'python3-basic-syntax', stage_id: 0 },
  { id: 102, slug: 'python3-data-type', stage_id: 1 },
  { id: 103, slug: 'python3-iterator-generator', stage_id: 2 },
  { id: 104, slug: 'python3-class', stage_id: 3 },
  { id: 105, slug: 'python3-inputoutput', stage_id: 4 },
  { id: 106, slug: 'python3-multithreading', stage_id: 5 },
  { id: 107, slug: 'python3-cgi-programming', stage_id: 6 },
  { id: 108, slug: 'python3-pip', stage_id: 7 },
]

/** Go 六站 */
const GO = [
  { id: 201, slug: 'go-program-structure', stage_id: 0 },
  { id: 202, slug: 'go-data-types', stage_id: 1 },
  { id: 203, slug: 'go-functions', stage_id: 2 },
  { id: 204, slug: 'go-interfaces', stage_id: 3 },
  { id: 205, slug: 'go-error-handling', stage_id: 4 },
  { id: 206, slug: 'go-concurrent', stage_id: 5 },
]

const TOPICS: TopicStageLite[] = [
  ...PY.map((t) => ({ ...t, lang: 'python' as const, kind: 'language' as const })),
  ...GO.map((t) => ({ ...t, lang: 'go' as const, kind: 'language' as const })),
  // 库级条目（DL-12：不进路线）—— 它的 stage_id 恒为 0，会被误读成「第 1 站」
  { id: 301, lang: 'python', slug: 'python3-tutorial', stage_id: 0, kind: 'library' },
]

const PROFILES: TopicProfileLite[] = [
  // 速成必学：Python 前三站各一条 ＋ Go 前两站各一条
  ...PY.slice(0, 3).map((t, i) => ({
    topic_id: t.id,
    profile: 'vibe' as const,
    required: 1 as const,
    rank: i + 1,
    est_minutes: 8,
  })),
  ...GO.slice(0, 2).map((t, i) => ({
    topic_id: t.id,
    profile: 'vibe' as const,
    required: 1 as const,
    rank: i + 1,
    est_minutes: 9,
  })),
  // 精通必学：两门全部语言级条目（用于反查口径）
  ...[...PY, ...GO].map((t, i) => ({
    topic_id: t.id,
    profile: 'master' as const,
    required: 1 as const,
    rank: i + 1,
    est_minutes: null,
  })),
  // 库级条目**不**进任何模式的必学集
  {
    topic_id: 301,
    profile: 'master' as const,
    required: 0 as const,
    rank: 99,
    est_minutes: null,
  },
]

/** 独立复算：已点亮的速成必学 ⇒ 站区间（不借实现，自己扫行） */
function oracleRange(lit: ReadonlySet<number>): { from: number; to: number; count: number } {
  const stations: number[] = []
  for (const t of TOPICS) {
    if (t.kind !== 'language') continue
    if (!lit.has(t.id)) continue
    const row = PROFILES.find((r) => r.topic_id === t.id && r.profile === 'vibe')
    if (row?.required !== 1) continue
    stations.push(t.stage_id + 1)
  }
  return {
    from: Math.min(...stations),
    to: Math.max(...stations),
    count: stations.length,
  }
}

function planFor(lang: 'python' | 'go', lit: ReadonlySet<number>) {
  return computeTransferPlan({
    profile: 'vibe',
    lang,
    litTopicIds: lit,
    topics: TOPICS,
    profiles: PROFILES,
  })
}

/** 打开弹层并返回它（弹层 portal 到 body，不在 render 的 container 里） */
function openPanel(lang: 'python' | 'go' = 'python', lit = new Set([101, 102, 103])): HTMLElement {
  render(<ModeTransferPanel lang={lang} plan={planFor(lang, lit)} />)
  fireEvent.click(screen.getByRole('button', { name: /这些学够了/ }))
  return screen.getByRole('dialog')
}

afterEach(cleanup)

describe('M9 P1e.1 · DL-37 速成转档弹层', () => {
  it('① 界面显示的站区间 == 「已点亮速成必学 → 精通站位」的逐条映射结果', () => {
    const lit = new Set([101, 102, 103])
    const oracle = oracleRange(lit)
    expect(oracle).toEqual({ from: 1, to: 3, count: 3 })

    const dialog = openPanel('python', lit)
    expect(within(dialog).getByText(`你的 3 条速成必学落在第 1–3 站`)).toBeTruthy()
    expect(within(dialog).getByText('你已经站到第 1 站之前')).toBeTruthy()
    expect(within(dialog).getByText('精通路线还剩 8 站')).toBeTruthy()
  })

  it('② 反证：文案断「站到第 N 站之前」，**不含「已完成」**（DL-37 的反证腿）', () => {
    const dialog = openPanel()
    // ⚠️ 断的是**整个弹层**，不是某一段 —— 「已完成」出现在哪一句都算违规
    expect(within(dialog).queryAllByText(/已完成/)).toHaveLength(0)
    // 而且必须**确实**写的是「站到第 N 站之前」（否则上面那条只是「没写错话」）
    expect(within(dialog).getByText('你已经站到第 1 站之前')).toBeTruthy()
  })

  it('③ 一条都没点亮 ⇒ 显示完整站数，不许空白、不许 0', () => {
    const dialog = openPanel('python', new Set())
    expect(within(dialog).getByText('精通路线完整 8 站，从第 1 站开始')).toBeTruthy()
    expect(within(dialog).queryAllByText(/第 0 站/)).toHaveLength(0)
    expect(within(dialog).queryAllByText(/还剩 0 站/)).toHaveLength(0)
  })

  it('④ 弹层里必须有那句提醒：速成是「看懂并能提问」，精通是「能独立写出」', () => {
    const dialog = openPanel()
    expect(within(dialog).getByText(/看懂并能提问/)).toBeTruthy()
    expect(within(dialog).getByText(/能独立写出/)).toBeTruthy()
  })

  it('⑤ 变异腿：抽掉任意一条映射 ⇒ 界面显示的站区间不再等于映射结果 ⇒ 断言必须红', () => {
    const lit = new Set([101, 102, 103])
    const plan = planFor('python', lit)
    const expected = `你的 ${oracleRange(lit).count} 条速成必学落在第 1–3 站`
    expect(plan.mapping).toHaveLength(3)

    for (const victim of plan.mapping) {
      cleanup()
      // ⚠️ **模拟「实现抽掉了一条映射」**：映射少一条，且**由它派生的字段也跟着少**
      //   （条数、起止站都是从同一份映射算出来的 ⇒ 只删数组元素、留着派生字段，
      //    那不是「实现丢了一条映射」，那是「数据自相矛盾」）
      const mapping = plan.mapping.filter((m) => m !== victim)
      const broken = {
        ...plan,
        mapping,
        litRequiredCount: mapping.length,
        stationFrom: mapping.length ? Math.min(...mapping.map((m) => m.stationNo)) : null,
        stationTo: mapping.length ? Math.max(...mapping.map((m) => m.stationNo)) : null,
      }
      render(<ModeTransferPanel lang="python" plan={broken} />)
      fireEvent.click(screen.getByRole('button', { name: /这些学够了/ }))
      const dialog = screen.getByRole('dialog')
      const shown = within(dialog).getByText(/条速成必学落在第/).textContent
      // ⚠️ 生产断言是「显示 == 期望」；变异后二者必须**不再相等**，否则这条判据抓不住任何东西
      expect(shown, `抽掉 ${victim.slug} 这条映射后界面显示没变 ⇒ 判据抓不住`).not.toBe(expected)
    }
  })

  it('⑥ Go 的站总数按该语言实测（6 站，不是 Python 的 8 站）', () => {
    const dialog = openPanel('go', new Set())
    expect(within(dialog).getByText('精通路线完整 6 站，从第 1 站开始')).toBeTruthy()
  })
})
