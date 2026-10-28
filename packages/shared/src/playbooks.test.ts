import { describe, expect, it } from 'vitest'
import {
  LIMITS,
  PlaybookCreateInput,
  PlaybookUpdateInput,
  PLAYBOOKS_MD_DIVIDER,
  PLAYBOOKS_MD_HEADER,
  renderPlaybooksMdTable,
} from '@openvibe/shared'

/** m4 §7.1：结构与收紧。三必填 / 反例可空 / 四段字节上限 / verified 无证据即拒 / status 两态闭集 */
const base = {
  scenario: '商业银行核心系统投产前的变更评审',
  problem: '评审只看功能清单，回退方案口头带过',
  practice: '把评审材料固定成变更清单、可执行回退脚本、影响面清单三件套，回退耗时必须实测。',
}

describe('UT-PB-01 · 三段必填（FR-1.1）', () => {
  it('scenario / problem / practice 任一缺失或空串即拒', () => {
    expect(PlaybookCreateInput.safeParse(base).success).toBe(true)
    expect(PlaybookCreateInput.safeParse({ ...base, scenario: '' }).success).toBe(false)
    expect(PlaybookCreateInput.safeParse({ ...base, problem: '' }).success).toBe(false)
    expect(PlaybookCreateInput.safeParse({ ...base, practice: '' }).success).toBe(false)
    const { scenario: _s, problem: _p, practice: _c, ...rest } = base
    expect(PlaybookCreateInput.safeParse(rest).success).toBe(false)
  })
})

describe('UT-PB-02 · 反例可空（FR-1.1 / FR-6.3）', () => {
  it('省略与显式空串都过，默认落空串；渲染时该单元格留空、不产空标签', () => {
    expect(PlaybookCreateInput.safeParse(base).data?.antiPractice).toBe('')
    expect(PlaybookCreateInput.safeParse({ ...base, antiPractice: '' }).success).toBe(true)

    const md = renderPlaybooksMdTable('选集', [{ ...base, antiPractice: '', verified: false }])
    const row = md.split('\n')[6] ?? ''
    expect(row.endsWith('|  |')).toBe(true)
    expect(row).not.toContain('反例：')
  })
})

describe('UT-PB-03 · 四段字节上限（§3 字节族口径）', () => {
  it('中文按 UTF-8 字节计：每段越界即拒，界内通过', () => {
    const cases: [keyof typeof base, number][] = [
      ['scenario', LIMITS.playbookScenarioMaxBytes],
      ['problem', LIMITS.playbookProblemMaxBytes],
      ['practice', LIMITS.playbookPracticeMaxBytes],
    ]
    for (const [key, max] of cases) {
      // 中文一字三字节：floor(max/3) 个「安」恰在界内，+1 字越界
      const inside = '安'.repeat(Math.floor(max / 3))
      const outside = '安'.repeat(Math.floor(max / 3) + 1)
      expect(PlaybookCreateInput.safeParse({ ...base, [key]: inside }).success, key).toBe(true)
      expect(PlaybookCreateInput.safeParse({ ...base, [key]: outside }).success, key).toBe(false)
    }
    // 反例单独一档（2048B），与 practice 不同值 ⇒ 断言的是真限值而非同一个数
    expect(LIMITS.playbookAntiPracticeMaxBytes).toBe(2 * 1024)
    expect(LIMITS.playbookPracticeMaxBytes).toBe(4 * 1024)
    expect(
      PlaybookCreateInput.safeParse({
        ...base,
        antiPractice: '安'.repeat(LIMITS.playbookAntiPracticeMaxBytes / 3 + 1),
      }).success,
    ).toBe(false)
    // 三键的值互不相同，避免「四键其实是同一个数」这类假绿
    expect(LIMITS.playbookScenarioMaxBytes).toBe(1024)
    expect(LIMITS.playbookProblemMaxBytes).toBe(1024)
    expect(LIMITS.playbookPracticeMaxBytes).toBe(4 * 1024)
  })
})

describe('UT-PB-04 · verified 收紧（FR-4.1 / §6.1）', () => {
  // 负向腿：这条不 fail-fast，整族可信度归零（§7.1 pass 条件）
  it('verified=true 且 evidence 为空 ⇒ 拒，归因到 verified 字段', () => {
    const rejected = PlaybookCreateInput.safeParse({ ...base, verified: true })
    expect(rejected.success).toBe(false)
    expect(rejected.success ? [] : rejected.error.issues.map((i) => i.path.join('.'))).toContain(
      'verified',
    )

    expect(PlaybookCreateInput.safeParse({ ...base, verified: true, evidence: [] }).success).toBe(
      false,
    )
    expect(PlaybookCreateInput.safeParse({ ...base, verified: false, evidence: [] }).success).toBe(
      true,
    )
    const ok = PlaybookCreateInput.safeParse({
      ...base,
      verified: true,
      evidence: [{ command: 'ls -l /var/log', resultSummary: '确认留存 180 天' }],
    })
    expect(ok.success).toBe(true)
    expect(ok.data?.evidence).toHaveLength(1)
  })

  it('PATCH 同向收紧：显式 verified=true 且 evidence=[] 仍拒（不补证据不许置真）', () => {
    expect(PlaybookUpdateInput.safeParse({ verified: true, evidence: [] }).success).toBe(false)
    expect(PlaybookUpdateInput.safeParse({ verified: true }).success).toBe(true)
    expect(
      PlaybookUpdateInput.safeParse({
        verified: true,
        evidence: [{ command: 'curl -sI http://x', resultSummary: '403' }],
      }).success,
    ).toBe(true)
  })
})

describe('UT-PB-05 · status 两态闭集与默认值（FR-1.3）', () => {
  it('默认 draft；published 过；其它字面量一律拒', () => {
    expect(PlaybookCreateInput.safeParse(base).data?.status).toBe('draft')
    expect(PlaybookCreateInput.safeParse({ ...base, status: 'published' }).success).toBe(true)
    expect(PlaybookCreateInput.safeParse({ ...base, status: 'draft' }).success).toBe(true)
    for (const bad of ['active', 'deprecated', 'Published', '']) {
      expect(PlaybookCreateInput.safeParse({ ...base, status: bad }).success, bad).toBe(false)
    }
  })
})

describe('UT-PB-06 · PLAYBOOKS.md 渲染契约（FR-6.1 / FR-4.3）', () => {
  it('表头逐字固定；亲测有效用文字标注，不靠颜色单义', () => {
    const md = renderPlaybooksMdTable('选集', [
      { ...base, antiPractice: '口头承诺出问题就切回去', verified: true },
      { ...base, scenario: 'B 场景', antiPractice: '', verified: false },
    ])
    const lines = md.split('\n')
    expect(lines[4]).toBe(PLAYBOOKS_MD_HEADER)
    expect(lines[5]).toBe(PLAYBOOKS_MD_DIVIDER)
    expect(PLAYBOOKS_MD_HEADER).toBe('| 场景 | 问题 | 正确做法 | 反例 | 亲测有效 |')
    expect(lines[6]).toContain('| 是 |')
    expect(lines[7]).toMatch(/\|\s*\|$/)
    // 裸 `|` 存原文、转义只发生一次
    expect(
      renderPlaybooksMdTable('x', [
        { ...base, practice: 'A | B', antiPractice: '', verified: false },
      ]),
    ).toContain('A \\| B')
  })
})
