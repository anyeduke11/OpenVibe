import { describe, expect, it } from 'vitest'
import {
  auditSectionRefs,
  buildAliasCandidateReport,
  buildAliasCandidates,
  buildReport,
  buildRewritePlan,
  buildRewriteReport,
  buildSplitRewriteRows,
  bucketAliasCandidates,
  classifyRef,
  indexSections,
  parseAliases,
  parseSectionRefs,
  resolveBareRef,
  type SectionIndex,
} from '../scripts/section-ref-audit'

/**
 * `tests/section-ref-audit.test.ts` —— §-引用解析器（`scripts/section-ref-audit.ts`）的判据。
 *
 * ## 它挡什么
 *
 * 文档里的「`dev-plan.md` §16.10」断了，肉眼要逐条读 263 处引用才看得出来；
 * 而**断了没被发现**的代价是：下一个人按着断指针改文档，改到不存在的节。
 *
 * ## 造什么样本
 *
 * 全部用**合成夹具**（不读活文档）—— 活文档的判定归脚本与 CI，
 * 测试只负责证明**机制**：解析、索引、判定三态、以及闸**能红**。
 *
 * ## ⭐ 变异腿（这一支是本测试的核心）
 *
 * 「闸能红」不是靠「期望值写个 1」证明的，而是靠**改内容、看到判定翻转**：
 * 改目标文件的节标题 ⇒ 绿变红；改回来 ⇒ 红变绿。
 * 若这两条不成立，闸就是恒绿或恒红的摆设。
 */

/* ════════════════════════════════════════════════════════ 夹具 */

/** 目标文件：三种节形态 ＋ 三种子项形态 */
const TARGET_MD = [
  '# SPEC · 夹具',
  '',
  '## 3. 数据与核心概念',
  '',
  '### 3.1 值域与挂载点',
  '',
  '### 3.2 模块明细',
  '',
  '#### M7 团队协作（P1）',
  '',
  '## 6. 边界与异常',
  '',
  '- **6.2 第二条**：反例 5 的触发条件原样采。',
  '',
  '## 7. 验收标准（pass/fail）',
  '',
  '| # | 条目 | 判据 |',
  '|---|---|---|',
  '| j | 人工验收腿 | 屏摄归档 |',
  '| k | 无回填 | 升级后首条事件时间 > 升级时间 |',
  '',
  '## 8. 依赖',
  '',
  '1. 第一条依赖。',
  '2. 第二条依赖。',
  '',
].join('\n')

function targetIndex(): SectionIndex {
  return indexSections(TARGET_MD)
}

/** 引用方：三条限定型引用 ＋ 一条裸引用 ＋ 一条不可判形态 */
const SOURCE_MD = [
  '# 引用方',
  '',
  '见 `docs/specs/target.md` §3.1 一节。',
  '另见 `target.md` §6.2 与 `target.md` §7 的 j 行。',
  '还有 §7-② 这种裸写形态。',
  '',
].join('\n')

/* ════════════════════════════════════════════════════════ 索引 */

describe('indexSections · 建目标文件的节号索引', () => {
  it('编号型标题三种形态都进 sections（`3` / `3.2` / 带字母后缀）', () => {
    const idx = indexSections(['## 3. 甲', '### 3.2 乙', '### 15.4b 丙', '## 3-9b. 丁'].join('\n'))
    expect(idx.sections.has('3')).toBe(true)
    expect(idx.sections.has('3.2')).toBe(true)
    expect(idx.sections.has('15.4b')).toBe(true)
    expect(idx.sections.has('3-9b')).toBe(true)
  })

  it('非编号子标题的标签挂到父节下，且**兄弟标签不丢**', () => {
    const idx = indexSections(
      ['### 3.2 模块明细', '#### M1 甲', '#### M7 乙', '### 3.3 边界'].join('\n'),
    )
    // ⭐ 回归点：早期版本在遇到非编号标题时把「当前节」置空，
    // 导致第二个兄弟标签（`M7`）丢失归属 ⇒ `§3.2-M7` 被判成不可判。
    expect(idx.labels.get('3.2')?.has('M1')).toBe(true)
    expect(idx.labels.get('3.2')?.has('M7')).toBe(true)
  })

  it('三种子项形态都进 labels（粗体条目 / 有序列表 / 表格行首标签）', () => {
    const idx = targetIndex()
    expect(idx.labels.get('6')?.has('6.2')).toBe(true)
    expect(idx.labels.get('7')?.has('j')).toBe(true)
    expect(idx.labels.get('8')?.has('1')).toBe(true)
  })

  it('代码块内的内容不进索引（围栏保护）', () => {
    const idx = indexSections(['## 3. 甲', '```', '## 99. 伪标题', '```'].join('\n'))
    expect(idx.sections.has('99')).toBe(false)
  })
})

/* ════════════════════════════════════════════════════════ 解析 */

describe('parseSectionRefs · 抽限定型引用', () => {
  const index = new Map<string, string[]>([['target.md', ['docs/specs/target.md']]])

  it('抽出带文件名的引用（路径前缀与反引号都认），行号正确', () => {
    const { refs, bareCount } = parseSectionRefs(SOURCE_MD, 'docs/source.md', index)
    expect(refs.map((r) => r.ref)).toEqual(['3.1', '6.2', '7'])
    expect(refs[0]?.target).toBe('docs/specs/target.md')
    expect(refs[0]?.from).toBe('docs/source.md')
    expect(refs[0]?.line).toBe(3)
    // 夹具里那条「§7-②」是裸写 ⇒ 只进 bareCount
    expect(bareCount).toBe(1)
  })

  it('裸引用**不**产出限定型引用，只计入 bareCount', () => {
    const { refs, bareCount } = parseSectionRefs('§6.2 与 §7-j。', 'docs/source.md', index)
    expect(refs).toHaveLength(0)
    expect(bareCount).toBe(2)
  })

  it('basename 重名 ⇒ 记 ambiguous 且不产出引用（指向不可判，不猜）', () => {
    const dup = new Map<string, string[]>([['target.md', ['a/target.md', 'b/target.md']]])
    const { refs, ambiguousCount } = parseSectionRefs('见 target.md §3.1。', 'docs/source.md', dup)
    expect(refs).toHaveLength(0)
    expect(ambiguousCount).toBe(1)
  })
})

/* ════════════════════════════════════════════════════════ 判定 */

describe('classifyRef · 三态判定', () => {
  const idx = targetIndex()

  it('标题型 ⇒ heading', () => {
    expect(classifyRef('3.1', idx)).toBe('heading')
    expect(classifyRef('6', idx)).toBe('heading')
  })

  it('条目型 ⇒ item（父节在、子项标签命中）', () => {
    expect(classifyRef('6.2', idx)).toBe('item')
    expect(classifyRef('7.j', idx)).toBe('item')
    expect(classifyRef('8.1', idx)).toBe('item')
    expect(classifyRef('3.2-M7', idx)).toBe('item')
  })

  it('父节在、子项未登记 ⇒ undecidable（**不判红**）', () => {
    expect(classifyRef('3.9', idx)).toBe('undecidable')
  })

  it('顶层节在目标文件不存在 ⇒ dangling（红）', () => {
    expect(classifyRef('7', targetIndex())).toBe('heading')
    expect(classifyRef('7', indexSections(['## 1. 甲', '## 2. 乙'].join('\n')))).toBe('dangling')
  })

  it('形态不可判（如 `7-`）⇒ undecidable', () => {
    expect(classifyRef('7-', idx)).toBe('undecidable')
  })
})

/* ════════════════════════════════════════════════════════ 变异腿 */

describe('⭐ 变异腿 · 闸必须能红（且不是恒红）', () => {
  const source = '见 `target.md` §7。'

  it('改目标文件的节标题 ⇒ 同一条引用由绿变红', () => {
    const before = classifyRef('7', indexSections('## 7. 验收标准\n'))
    expect(before).toBe('heading')

    // 变异：把目标里的 §7 改名（等价于「那一节被删了」）
    const after = classifyRef('7', indexSections('## 7x. 验收标准\n'))
    expect(after).toBe('dangling')
  })

  it('把目标文件的节标题改回去 ⇒ 红变绿（证明不是恒红）', () => {
    const broken = indexSections('## 7x. 验收标准\n')
    const fixed = indexSections('## 7. 验收标准\n')
    expect(classifyRef('7', broken)).toBe('dangling')
    expect(classifyRef('7', fixed)).toBe('heading')
  })

  it('在引用方**新增**一条指向不存在节的引用 ⇒ 审计当场抓到', () => {
    const targets = new Map<string, SectionIndex>([['docs/specs/target.md', indexSections('## 7. 甲\n')]])
    const clean = auditSectionRefs([{ path: 'docs/source.md', content: source }], targets)
    expect(clean.dangling).toHaveLength(0)

    const mutated = auditSectionRefs(
      [{ path: 'docs/source.md', content: `${source}\n另见 \`target.md\` §99。` }],
      targets,
    )
    expect(mutated.dangling).toHaveLength(1)
    expect(mutated.dangling[0]?.ref.ref).toBe('99')
  })
})

/* ════════════════════════════════════════════════════════ 汇总与存量 */

describe('auditSectionRefs · 汇总与已知存量', () => {
  const targets = new Map<string, SectionIndex>([['docs/specs/target.md', targetIndex()]])

  it('裸引用**不会**产生断链（假红防护：这一条比「能红」更重要）', () => {
    const result = auditSectionRefs(
      [{ path: 'docs/source.md', content: '裸写 §3.1 §6.2 §7-j §999 —— 指向未知。' }],
      targets,
    )
    expect(result.dangling).toHaveLength(0)
    expect(result.bareCount).toBe(4)
  })

  it('已知存量被认出 ⇒ 不进未登记断链', () => {
    const result = auditSectionRefs(
      [{ path: 'docs/source.md', content: '见 `target.md` §9。' }],
      targets,
      // 登记形态与基线文件一致：键为判定消息全文（`FR-12.1|<消息>` 的后半段）
      [{ message: '§-引用指向不存在的节：docs/specs/target.md §9', why: '夹具：登记项' }],
    )
    expect(result.dangling).toHaveLength(0)
    expect(result.knownDangling).toHaveLength(1)
  })

  it('登记项本轮不再出现 ⇒ 报「该清理了」（反向检查）', () => {
    const result = auditSectionRefs(
      [{ path: 'docs/source.md', content: '见 `target.md` §7。' }],
      targets,
      [{ message: '§-引用指向不存在的节：docs/specs/target.md §9', why: '夹具：登记项已失效' }],
    )
    // staleKnown 报的是登记键本身（判定消息全文），不再是「文件 §节号」的拼装
    expect(result.staleKnown).toEqual(['§-引用指向不存在的节：docs/specs/target.md §9'])
  })
})

/* ════════════════════════════════════════════════════════ 改写清单 */

describe('buildRewritePlan · 裸引用的限定化建议', () => {
  const targets = new Map<string, SectionIndex>([
    ['docs/a.md', indexSections('## 3. 甲\n')],
    ['docs/b.md', indexSections('## 16.2 乙\n')],
    ['docs/c.md', indexSections('## 7. 丙\n')],
  ])

  it('自家能解的裸引用 ⇒ 不给建议（它本来就是同文件引用）', () => {
    const plan = buildRewritePlan(
      [{ from: 'docs/a.md', line: 1, id: '3', context: '见 §3', offset: 0 }],
      targets,
    )
    expect(plan.suggestions).toHaveLength(0)
  })

  it('全仓唯一可解 ⇒ 出限定化建议（写成带文件名的引用）', () => {
    const plan = buildRewritePlan(
      [{ from: 'docs/a.md', line: 1, id: '16.2', context: '见 §16.2', offset: 0 }],
      targets,
    )
    expect(plan.suggestions).toHaveLength(1)
    expect(plan.suggestions[0]?.target).toBe('docs/b.md')
    expect(plan.ambiguities).toHaveLength(0)
  })

  it('目标不唯一 ⇒ 进「待人工确认」，**机器不猜**', () => {
    const multi = new Map<string, SectionIndex>([
      ['docs/a.md', indexSections('## 3. 甲\n')],
      ['docs/b.md', indexSections('## 7. 乙\n')],
      ['docs/c.md', indexSections('## 7. 丙\n')],
    ])
    const plan = buildRewritePlan(
      [{ from: 'docs/a.md', line: 1, id: '7', context: '见 §7', offset: 0 }],
      multi,
    )
    expect(plan.suggestions).toHaveLength(0)
    expect(plan.ambiguities).toHaveLength(1)
    expect(plan.ambiguities[0]?.resolverCount).toBe(2)
  })

  it('全仓无可解目标 ⇒ 进「真·断链」桶', () => {
    const plan = buildRewritePlan(
      [{ from: 'docs/a.md', line: 1, id: '99', context: '见 §99', offset: 0 }],
      targets,
    )
    expect(plan.suggestions).toHaveLength(0)
    expect(plan.ambiguities).toHaveLength(0)
    expect(plan.unresolvable).toHaveLength(1)
  })
})

describe('buildSplitRewriteRows · 拆分改写映射', () => {
  const findings = [
    {
      ref: {
        target: 'docs/dev-plan.md',
        ref: '16.2',
        from: 'docs/PRD.md',
        line: 7,
        context: '',
      },
      verdict: 'heading' as const,
      known: false,
      message: 'docs/dev-plan.md §16.2',
    },
  ]

  it('有映射 ⇒ 进 mapped，且带新指向', () => {
    const { mapped, unmapped } = buildSplitRewriteRows(findings, {
      'docs/dev-plan.md': { '16.2': 'docs/dev-plan-16.md' },
    })
    expect(mapped).toHaveLength(1)
    expect(mapped[0]?.newTarget).toBe('docs/dev-plan-16.md')
    expect(unmapped).toHaveLength(0)
  })

  it('无映射 ⇒ 进 unmapped（**不猜**新指向）', () => {
    const { mapped, unmapped } = buildSplitRewriteRows(findings, {})
    expect(mapped).toHaveLength(0)
    expect(unmapped).toHaveLength(1)
    expect(unmapped[0]?.places).toEqual(['docs/PRD.md:7'])
  })
})

describe('buildRewriteReport · 改写清单形态', () => {
  it('三节齐备：限定化建议 / 待人工确认 / 拆分改写', () => {
    const plan = buildRewritePlan(
      [{ from: 'docs/a.md', line: 1, id: '99', context: '见 §99', offset: 0 }],
      new Map<string, SectionIndex>([['docs/a.md', indexSections('## 3. 甲\n')]]),
    )
    const report = buildRewriteReport(plan, { mapped: [], unmapped: [] })
    expect(report).toContain('## 1. 裸引用 → 限定化建议')
    expect(report).toContain('## 2. 待人工确认')
    expect(report).toContain('## 3. 拆分改写清单')
    expect(report).toContain('（映射未定义或无命中）')
  })
})

describe('buildReport · 对账表', () => {
  it('含四节：摘要 / 断链清单 / 拆分影响面 / 附面', () => {
    const targets = new Map<string, SectionIndex>([
      ['docs/specs/target.md', targetIndex()],
      ['docs/dev-plan.md', indexSections('## 16. 依赖图\n')],
    ])
    const result = auditSectionRefs(
      [
        { path: 'docs/a.md', content: '见 `docs/dev-plan.md` §16。' },
        { path: 'docs/b.md', content: '见 `target.md` §3.1。' },
      ],
      targets,
    )
    const aux = auditSectionRefs([{ path: 'DEV_LOG.md', content: '见 `target.md` §99。' }], targets)
    const report = buildReport(result, { aux })

    expect(report).toContain('## 1. 判定摘要')
    expect(report).toContain('## 2. 断链清单')
    expect(report).toContain('## 3. 拆分影响面')
    expect(report).toContain('## 4. 附面')
    expect(report).toContain('| §16 | 1 |')
    // 附面只报数：附面的断链不得进主面
    expect(result.dangling).toHaveLength(0)
    expect(aux.dangling).toHaveLength(1)
  })
})

/* ════════════════════════════════════════════════════════ 章式顶层节 */

describe('indexSections · 「第 N 章」式顶层节（回归腿）', () => {
  it('`## 第 2 章 · …` 被索引成节号 `2`（不是只索引到 `2.1`）', () => {
    const idx = indexSections(
      ['## 第 2 章 · 现状量化', '', '### 2.1 差距的优先级', ''].join('\n'),
    )
    // ⭐ 回归点：早期只认「数字开头」的标题 ⇒ 顶层 `2` 缺失 ⇒ 引用「§2」被误判断链。
    expect(idx.sections.has('2')).toBe(true)
    expect(idx.sections.has('2.1')).toBe(true)
  })

  it('`## 第 2 章` 的子标题挂到 `2` 下 ⇒ `§2.1` 判条目型（绿）', () => {
    const idx = indexSections(
      ['## 第 2 章 · 现状量化', '', '### 2.1 差距的优先级', ''].join('\n'),
    )
    expect(idx.labels.get('2')?.has('2.1')).toBe(true)
    // `2.1` 本身就是编号标题 ⇒ 判「标题型」（绿）
    expect(classifyRef('2.1', idx)).toBe('heading')
  })

  it('章式标题**不会**把非编号标题的标签归属弄丢', () => {
    const idx = indexSections(
      ['## 第 3 章 · 数据', '', '#### M7 协作', '', '#### M8 面板', ''].join('\n'),
    )
    expect(idx.labels.get('3')?.has('M7')).toBe(true)
    expect(idx.labels.get('3')?.has('M8')).toBe(true)
  })
})

/* ════════════════════════════════════════════════════════ 別名表 */

describe('parseAliases · 解析別名表（純函數）', () => {
  it('读出「節號 → 目標檔案」映射', () => {
    const table = parseAliases({ aliases: { '3': ['docs/a.md'], '7': ['docs/b.md', 'docs/c.md'] } })
    expect(table.aliases.get('3')).toEqual(['docs/a.md'])
    expect(table.aliases.get('7')).toEqual(['docs/b.md', 'docs/c.md'])
  })

  it('空值 / 非字符串 / 空列表 ⇒ 該項不進表（不留空殼）', () => {
    const table = parseAliases({
      aliases: {
        '3': [],
        '7': ['docs/a.md', 42 as unknown as string, ''],
        '9': undefined as unknown as string[],
      },
    })
    expect(table.aliases.has('3')).toBe(false)
    expect(table.aliases.get('7')).toEqual(['docs/a.md'])
    expect(table.aliases.has('9')).toBe(false)
  })
})

describe('resolveBareRef · 別名表收窄候選', () => {
  const targets = new Map<string, SectionIndex>([
    ['docs/a.md', indexSections('## 3. 甲\n')],
    ['docs/b.md', indexSections('## 3. 乙\n')],
    ['docs/c.md', indexSections('## 9. 丙\n')],
  ])

  it('未登記 ⇒ 候選是「全倉能解該節號的檔案」（**不收窄成自家**）', () => {
    const r = resolveBareRef('3', 'docs/source.md', targets, { aliases: new Map() })
    expect(r.candidates.sort()).toEqual(['docs/a.md', 'docs/b.md'])
    expect(r.resolvers.sort()).toEqual(['docs/a.md', 'docs/b.md'])
    expect(r.viaAlias).toBe(false)
  })

  it('已登記 ⇒ 候選被**收窄**到登記的目標（別處不再是候選）', () => {
    const table = parseAliases({ aliases: { '3': ['docs/a.md'] } })
    const r = resolveBareRef('3', 'docs/source.md', targets, table)
    expect(r.candidates).toEqual(['docs/a.md'])
    expect(r.resolvers).toEqual(['docs/a.md'])
    expect(r.viaAlias).toBe(true)
  })
})

describe('buildRewritePlan · 別名表把「多目標」變成「可落筆的建議」', () => {
  const targets = new Map<string, SectionIndex>([
    ['docs/a.md', indexSections('## 3. 甲\n')],
    ['docs/b.md', indexSections('## 3. 乙\n')],
  ])
  const bare = [{ from: 'docs/source.md', line: 1, id: '3', context: '见 §3', offset: 0 }]

  it('未登記 ⇒ 多目標 ⇒ 進「待人工確認」（機器不猜）', () => {
    const plan = buildRewritePlan(bare, targets)
    expect(plan.suggestions).toHaveLength(0)
    expect(plan.ambiguities).toHaveLength(1)
  })

  it('登記後 ⇒ 唯一可解 ⇒ 出限定化建議', () => {
    const table = parseAliases({ aliases: { '3': ['docs/a.md'] } })
    const plan = buildRewritePlan(bare, targets, table)
    expect(plan.suggestions).toHaveLength(1)
    expect(plan.suggestions[0]?.target).toBe('docs/a.md')
    expect(plan.ambiguities).toHaveLength(0)
  })
})

/* ════════════════════════════════════════════════════════ ⭐ 變異腿 */

describe('⭐ 變異腿 · 別名表登錯**不得**造出假紅', () => {
  const targets = new Map<string, SectionIndex>([
    ['docs/a.md', indexSections('## 3. 甲\n')],
    ['docs/b.md', indexSections('## 3. 乙\n')],
  ])
  const bare = [{ from: 'docs/source.md', line: 1, id: '3', context: '见 §3', offset: 0 }]

  it('登記的目標**不含**該節號 ⇒ 退回「不可解」，**不是斷鏈**', () => {
    // 变异：把登记的目标写错（指向一个没有 §3 的文件）
    const table = parseAliases({ aliases: { '3': ['docs/a.md'] } })
    const mutated = new Map<string, SectionIndex>([
      ...targets,
      ['docs/a.md', indexSections('## 4. 甲\n')], // ⇒ a.md 里没有 §3 了
    ])
    const plan = buildRewritePlan(bare, mutated, table)
    expect(plan.suggestions).toHaveLength(0)
    expect(plan.unresolvable).toHaveLength(1)
    // ⭐ 关键断言：别名表写错只会让引用**退回不可解**，不会变成断链
    expect(plan.unresolvable[0]?.id).toBe('3')
  })

  it('別名表登錯**不影響** FR-12 的斷鏈判定（別名表不參與判紅）', () => {
    const table = parseAliases({ aliases: { '3': ['docs/does-not-exist.md'] } })
    const result = auditSectionRefs(
      [{ path: 'docs/source.md', content: '裸写 §3 —— 指向未知。' }],
      targets,
    )
    // 裸引用在任何别名表下都不产生断链
    expect(result.dangling).toHaveLength(0)
    // 限定型引用照旧判红：别名表只服务裸引用
    const broken = auditSectionRefs(
      [{ path: 'docs/source.md', content: '见 `docs/a.md` §99。' }],
      targets,
    )
    expect(broken.dangling).toHaveLength(1)
    expect(table.aliases.size).toBe(1)
  })
})

describe('buildAliasCandidates · 別名表候選登記表', () => {
  const targets = new Map<string, SectionIndex>([
    ['docs/a.md', indexSections('## 3. 甲\n')],
    ['docs/b.md', indexSections('## 3. 乙\n')],
    ['docs/c.md', indexSections('## 7. 丙\n')],
  ])

  it('只收「自家不可解」的裸引用；唯一可解 / 多目標 / 無可解分三檔', () => {
    const bare = [
      { from: 'docs/a.md', line: 1, id: '3', context: '自家有 §3', offset: 0 },
      { from: 'docs/source.md', line: 2, id: '3', context: '多目标', offset: 0 },
      { from: 'docs/source.md', line: 3, id: '7', context: '唯一可解', offset: 0 },
      { from: 'docs/source.md', line: 4, id: '99', context: '无可解', offset: 0 },
    ]
    const candidates = buildAliasCandidates(bare, targets)
    const buckets = bucketAliasCandidates(candidates)
    // 自家能解的 §3 不进候选（它是同文件引用，本就不该限定化）
    expect(candidates.map((c) => c.id).sort()).toEqual(['3', '7', '99'])
    expect(buckets.needHuman.map((c) => c.id)).toEqual(['3'])
    expect(buckets.auto.map((c) => c.id)).toEqual(['7'])
    expect(buckets.hopeless.map((c) => c.id)).toEqual(['99'])
  })

  it('報告含「需人工裁定」與「分檔摘要」兩節', () => {
    const report = buildAliasCandidateReport(
      buildAliasCandidates(
        [{ from: 'docs/source.md', line: 1, id: '3', context: '见 §3', offset: 0 }],
        targets,
      ),
    )
    expect(report).toContain('## 1. 需人工裁定来源（多目标）')
    expect(report).toContain('## 2. 分档摘要')
  })
})
