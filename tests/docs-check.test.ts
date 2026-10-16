import { describe, expect, it } from 'vitest'
import {
  applyBaseline,
  checkDevNumbering,
  checkEntrySections,
  checkFrozenSurface,
  checkQueue,
  checkRelativeLinks,
  checkNegativeClaims,
  checkSpecVersions,
  NEGATIVE_CLAIM_PATTERNS,
  type Baseline,
  type Finding,
} from '../scripts/docs-check'

/**
 * `scripts/docs-check.ts` 的判据测试（2026-10-16，docs-governance-check.md §7.2）。
 *
 * ## 本文件的全部价值在「变异样本各报 1 违规」
 *
 * 规格 §7.1a 要求「当前仓库 0 违规」—— 那只证明闸在**这一刻**是绿的，
 * 证明不了它**能红**。一份全绿的判据既可能是真的严，也可能是恒真。
 * 故本文件不给「当前仓库绿」写用例，只给「改了它必红」写用例。
 *
 * ## 为什么用纯函数 + 合成样本，不去改真实文档
 *
 * 真实文档里有并行会话的改动面（`docs/decisions.md`、`docs/tasks.md`、
 * `docs/specs/m4-playbook.md` 等），改它们造样本会毁掉别人的工作；
 * `content/seed/` 与 `tests/golden/` 更是冻结面。故全部样本走合成输入。
 */

/* ------------------------------------------------------------------ 夹具 */

/** 造一份号段连续的日志；`gaps` 里的号会被跳过，用来造断号 */
function logWith(gaps: number[] = [], opts: { dupNotSupplement?: boolean } = {}): string {
  const nums = [1, 2, 3, 4, 5]
  const lines: string[] = ['# DEV_LOG\n']
  for (const n of nums) {
    if (gaps.includes(n)) continue
    const dup = n === 3
    // 合法形态 = 一条原始 + 若干「补记」。要造**违规**，两条都得不是补记形态：
    // 只让额外那条不是补记，得到的仍是「原始 + 补记」，那是合规的，测不出东西。
    const suffix = dup && !opts.dupNotSupplement ? '补记——更正上一个数' : ''
    lines.push(`## [DEV-${String(n).padStart(4, '0')}] 某笔${suffix}`)
    // 重号必须**真的多出一行**，否则这条 fixture 造不出重号，测的会是一个恒绿用例。
    if (dup && opts.dupNotSupplement) {
      // ⚠️ 标题里刻意避开「补记」二字：判据按该词判定形态，
      // 写成「非补记形态」会被自己的规则认成补记 —— 与「注释里的示例把自己扫成命中」同根因。
      lines.push(`## [DEV-0003] 又一笔真重号`)
      lines.push('- **类型**: C 级')
      lines.push('- **问题描述**: 描述')
      lines.push('- **实现思路**: 思路')
      lines.push('- **核心变更**: 变更')
      lines.push('- **测试验证**: `grep -c foo apps` → 1')
      lines.push('- **潜在风险**: 风险')
      lines.push('')
    }
    lines.push(`- **类型**: C 级`)
    lines.push(`- **问题描述**: 描述`)
    lines.push(`- **实现思路**: 思路`)
    lines.push(`- **核心变更**: 变更`)
    lines.push(`- **测试验证**: \`grep -c foo apps\` → 1`)
    lines.push(`- **潜在风险**: 风险`)
    lines.push('')
  }
  return lines.join('\n')
}

const CLEAN_QUEUE = [
  '| # | 事项 | 状态 | 现状 | 落点 | 阻塞 |',
  '|---|---|---|---|---|---|',
  '| ① | 事项一 | **待裁** | 说明 | 落点 | 无 |',
  '| ② | 事项二 | **已裁已落** | 说明 | 落点 | 无 |',
  '',
  '## 净状态',
  '- **待裁 1**：①',
  '- **已裁已落 1**：②',
  '',
].join('\n')

const CLEAN_SPEC = [
  '# SPEC · 某规格',
  '',
  '| 项 | 值 |',
  '|------|------|',
  '| 模块 | 某模块 |',
  '| 版本 | **v1.0（2026-10-01）** → **v1.1（2026-10-14）**。本轮改了两条。 |',
  '',
].join('\n')

const errorsOf = (fs: Finding[]): Finding[] => fs.filter((f) => f.level === 'error')

/* ------------------------------------------------------------------ FR-1 */

describe('docs-check · FR-1 变异样本', () => {
  it('干净样本（号段连续 1–5）⇒ 无 error', () => {
    expect(errorsOf(checkDevNumbering(logWith()))).toEqual([])
  })

  it('⚠️ 变异样本 c：挖掉中间一个号（断号）⇒ 必须报出', () => {
    const fs = checkDevNumbering(logWith([3]))
    const gap = fs.find((f) => /断号/.test(f.message))
    expect(gap, '断号必须被报出来').toBeDefined()
    expect(gap!.message).toContain('3')
  })

  it('⚠️ 变异样本 c2：同号且**不**是「补记」形态 ⇒ 判 error', () => {
    const fs = checkDevNumbering(logWith([], { dupNotSupplement: true }))
    expect(errorsOf(fs).some((f) => /DEV-0003 出现/.test(f.message))).toBe(true)
  })

  it('⚠️ 但「一条原始 ＋ 若干补记」必须**不**判红（本仓 DEV-0085 就是这个形态）', () => {
    // 首版把规则写成「必须全是补记才合法」，会把这条真合规的判红。
    expect(errorsOf(checkDevNumbering(logWith()))).toEqual([])
  })
})

/* ------------------------------------------------------------------ FR-2 */

describe('docs-check · FR-2 变异样本', () => {
  it('干净样本（状态合法 ＋ 求和 2 = 行数 2）⇒ 无 error', () => {
    expect(errorsOf(checkQueue(CLEAN_QUEUE))).toEqual([])
  })

  it('⚠️ 变异样本 d：把净状态某个数 +1 ⇒ 计数自洽必须报出', () => {
    const broken = CLEAN_QUEUE.replace('- **待裁 1**：①', '- **待裁 2**：①')
    const fs = errorsOf(checkQueue(broken))
    expect(fs.some((f) => f.rule === 'FR-2.2' && /求和 3 ≠ 队列行数 2/.test(f.message))).toBe(true)
  })

  it('⚠️ 状态写成枚举外的词 ⇒ 枚举校验必须报出', () => {
    const broken = CLEAN_QUEUE.replace('**待裁**', '**大概要裁**')
    expect(errorsOf(checkQueue(broken)).some((f) => f.rule === 'FR-2.1')).toBe(true)
  })

  it('⚠️ 表头没有「状态」列时只报 warning，不刷一屏假红', () => {
    const noHeader = ['| # | 事项 |', '|---|---|', '| ① | 甲 |', '', '## 净状态', '- **待裁 1**：①'].join('\n')
    const fs = checkQueue(noHeader)
    expect(errorsOf(fs)).toEqual([])
    expect(fs.some((f) => f.level === 'warning' && /找不到「状态」列/.test(f.message))).toBe(true)
  })

  it('⚠️ 多字节圆圈序号必须逐字识别，不能按范围糊过去', () => {
    // FR-2.4 记的真实坑：BSD grep 的 `[①-㉟]` 在本机返 21，按码点逐字返 34。
    const many = ['| # | 事项 | 状态 |', '|---|---|---|']
    for (const [i, ch] of [...'①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳㉑㉒㉓㉔㉕'].entries()) {
      many.push(`| ${ch} | 事项${i + 1} | **待裁** |`)
    }
    many.push('', '## 净状态', '- **待裁 25**：㉑㉒㉓㉔㉕')
    const fs = checkQueue(many.join('\n'))
    // 25 行、25 项求和 ⇒ 自洽 ⇒ 无 error；若按范围糊过去会漏识别或误报
    expect(errorsOf(fs)).toEqual([])
  })
})

/* ------------------------------------------------------------------ FR-3.4 */

describe('docs-check · FR-3.4 变异样本（相对链接）', () => {
  const files = [{ path: 'docs/a.md', content: '见 [分析文](./b.md)' }]

  it('目标存在 ⇒ 无 error', () => {
    expect(errorsOf(checkRelativeLinks(files, (p) => p === 'docs/b.md'))).toEqual([])
  })

  it('⚠️ 变异样本 r：目标不存在 ⇒ 报 1 违规', () => {
    const fs = errorsOf(checkRelativeLinks(files, () => false))
    expect(fs).toHaveLength(1)
    expect(fs[0]!.rule).toBe('FR-3.4')
  })

  it('⚠️ 自指陷阱：规格正文里的示例链接形态**不得**被判成死链', () => {
    // 本仓规格用 `[X](./Y)` 说明「什么算相对链接」；扫到它就会把自己判成违规，
    // 与「把校验命令写进文档、命令扫到自己」同根因。
    const selfRef = [{ path: 'docs/spec.md', content: '例如 `[X](./Y)` 这种形态' }]
    expect(checkRelativeLinks(selfRef, () => false)).toEqual([])
  })

  it('⚠️ 占位形态（含省略号）也不判', () => {
    const ph = [{ path: 'docs/p.md', content: '见 [分析文](./analysis-…md)' }]
    expect(checkRelativeLinks(ph, () => false)).toEqual([])
  })
})

/* ------------------------------------------------------------------ FR-4 */

describe('docs-check · FR-4 变异样本（版本行）', () => {
  const asSpec = (content: string) => [{ path: 'docs/specs/x.md', lines: content.split('\n') }]

  it('干净样本（2 列 ＋ v1.0 → v1.1 递增）⇒ 无 error', () => {
    expect(errorsOf(checkSpecVersions(asSpec(CLEAN_SPEC)))).toEqual([])
  })

  it('⚠️ 变异样本 e：把版本改成 v0.8（断链）⇒ 报 1 违规', () => {
    const broken = CLEAN_SPEC.replace('v1.1（2026-10-14）', 'v0.8（2026-10-14）')
    const fs = errorsOf(checkSpecVersions(asSpec(broken)))
    expect(fs.some((f) => f.rule === 'FR-4.3')).toBe(true)
  })

  it('⚠️ 变异样本 f：版本行塞一个未转义竖线 ⇒ 列数必须报出', () => {
    const broken = CLEAN_SPEC.replace('本轮改了两条。', '本轮改了两条 | 多一列')
    const fs = errorsOf(checkSpecVersions(asSpec(broken)))
    expect(fs.some((f) => f.rule === 'FR-4.2' && /渲染成 3 列/.test(f.message))).toBe(true)
  })

  it('⚠️ 版本正文里的非版本箭头**不得**误报（级别变更 / 数值变化）', () => {
    // 首版按「箭头两侧最近各有一个版本号」判定，于是这两条真合规的写法被刷成假阳性：
    //   「判级 C → B」是级别变更；「定值 20 → 21」是数值变化。
    const levelArrow = CLEAN_SPEC.replace('本轮改了两条。', '判级由 **C → B** 改判。')
    const numberArrow = CLEAN_SPEC.replace('本轮改了两条。', '精选提示词定值 20 → 21。')
    expect(errorsOf(checkSpecVersions(asSpec(levelArrow)))).toEqual([])
    expect(errorsOf(checkSpecVersions(asSpec(numberArrow)))).toEqual([])
  })

  it('⚠️ 最新版写在最前、旧版标「上一版」写在后面（无箭头）⇒ 合规，不得报', () => {
    const newestFirst = [
      '# SPEC',
      '',
      '| 项 | 值 |',
      '|------|------|',
      '| 版本 | **v1.0（2026-10-14）**。本 spec 现构成开工依据。**上一版**：**v0.9 草案（2026-10-03）**。 |',
      '',
    ].join('\n')
    expect(errorsOf(checkSpecVersions(asSpec(newestFirst)))).toEqual([])
  })

  it('⚠️ 缺版本行 ⇒ FR-4.1 用**分式**报，不写死份数', () => {
    const noVersion = ['# SPEC', '', '| 项 | 值 |', '|------|------|', '| 模块 | 甲 |', ''].join('\n')
    const fs = errorsOf(checkSpecVersions([...asSpec(CLEAN_SPEC), ...asSpec(noVersion)]))
    expect(fs.some((f) => f.rule === 'FR-4.1' && /1\/2/.test(f.message))).toBe(true)
  })
})

/* ------------------------------------------------------------------ FR-5 */

describe('docs-check · FR-5 变异样本（登记结构）', () => {
  it('干净样本 ⇒ 五段齐备且验证段含可复算命令，无 warning', () => {
    expect(checkEntrySections(logWith())).toEqual([])
  })

  it('⚠️ 变异样本 h：删掉「潜在风险」段 ⇒ 必须报出', () => {
    const broken = logWith().replace('- **潜在风险**: 风险\n', '')
    expect(checkEntrySections(broken).some((f) => /缺「潜在风险」段/.test(f.message))).toBe(true)
  })

  it('⚠️ 变异样本 i：验证段换成散文（无可复算命令）⇒ 必须报出', () => {
    const broken = logWith().replace('- **测试验证**: `grep -c foo apps` → 1', '- **测试验证**: 手工点了几下，看着对。')
    expect(checkEntrySections(broken).some((f) => /没有可复算命令/.test(f.message))).toBe(true)
  })
})

/* ------------------------------------------------------------------ FR-9 */

describe('docs-check · FR-9 变异样本（冻结面两面）', () => {
  it('两面都干净 ⇒ 无 error', () => {
    expect(errorsOf(checkFrozenSurface('/x', () => ''))).toEqual([])
  })

  it('⚠️ 变异样本 g：只改 content/seed 下任一文件 ⇒ 冻结面必须报出', () => {
    // 只测 golden 不算过 —— 本仓实测踩过「种子已脏却报 OK 零 diff」。
    const fs = errorsOf(
      checkFrozenSurface('/x', (face) => (face === 'content/seed/' ? ' M content/seed/a.md' : '')),
    )
    expect(fs).toHaveLength(1)
    expect(fs[0]!.message).toContain('content/seed/')
  })

  it('⚠️ golden 面脏也要报（两面是复数）', () => {
    const fs = errorsOf(checkFrozenSurface('/x', (face) => (face === 'tests/golden/' ? '?? tests/golden/b.json' : '')))
    expect(fs).toHaveLength(1)
    expect(fs[0]!.message).toContain('tests/golden/')
  })
})

/* ------------------------------------------------------------------ 基线机制 */

describe('docs-check · 基线机制', () => {
  const fs = [
    { rule: 'FR-5.1', level: 'error' as const, message: '登记缺「潜在风险」段', evidence: 'DEV_LOG.md · 甲' },
    { rule: 'FR-9.1', level: 'error' as const, message: '冻结面 content/seed/ 有改动', evidence: 'git status' },
  ]

  it('登记内的 ⇒ 降为 warning 并附登记理由', () => {
    const b: Baseline = { note: '', known: { 'FR-5.1|登记缺「潜在风险」段': '历史登记，待裁③' } }
    const r = applyBaseline(fs, b)
    expect(r.findings[0]!.level).toBe('warning')
    expect(r.findings[0]!.evidence).toContain('待裁③')
  })

  it('未登记的 ⇒ 仍是 error', () => {
    const r = applyBaseline(fs, { note: '', known: {} })
    expect(r.findings.every((f) => f.level === 'error')).toBe(true)
  })

  it('⚠️ 规则级通配：FR-5.2 能压住全部同类命中', () => {
    const r = applyBaseline([{ ...fs[0]!, rule: 'FR-5.2' }, { ...fs[0]!, rule: 'FR-5.2' }], {
      note: '',
      known: { 'FR-5.2|*': '待裁③ 未闭合，只报不判' },
    })
    expect(r.findings.every((f) => f.level === 'warning')).toBe(true)
    expect(r.staleBaselineKeys).toEqual([])
  })

  it('⚠️ 登记项本轮不再出现 ⇒ 必须反过来报「该清理了」', () => {
    // 没有这条反向检查，基线文件会慢慢变成一堆没人对得上的死条目，
    // 而「登记了就不报」会让新出现的同类问题混在里面一起被放过。
    const r = applyBaseline(fs, { note: '', known: { 'FR-9.1|某条已消失的登记': '旧' } })
    const stale = r.findings.filter((f) => f.rule === 'BASELINE')
    expect(stale).toHaveLength(1)
    expect(stale[0]!.level).toBe('error')
    expect(stale[0]!.message).toContain('该清理了')
  })

  it('⚠️ 通配登记在某规则彻底不再命中时，同样要报过期', () => {
    const r = applyBaseline([fs[1]!], { note: '', known: { 'FR-5.2|*': '旧' } })
    expect(r.findings.some((f) => f.rule === 'BASELINE')).toBe(true)
  })
})

/* ------------------------------------------------------------------ FR-11 */

describe('docs-check · FR-11 变异样本（否定式全局断言须附凭据）', () => {
  const asFiles = (content: string) => [{ path: 'docs/specs/x.md', lines: content.split('\n') }]

  it('带凭据的命令 ⇒ 不报', () => {
    const ok = ['# SPEC', '', '- 全仓没有 X。复算：`grep -rn X apps packages | wc -l` → 0', ''].join('\n')
    expect(checkNegativeClaims(asFiles(ok))).toEqual([])
  })

  it('⚠️ 变异样本：同句去掉命令 ⇒ 必须报出', () => {
    const bad = ['# SPEC', '', '- 全仓没有 X。', ''].join('\n')
    const fs = checkNegativeClaims(asFiles(bad))
    expect(errorsOf(fs)).toHaveLength(1)
    expect(fs[0]!.rule).toBe('FR-11.1')
  })

  it('⚠️ 变异样本：把否定改成肯定（不再宣称穷尽）⇒ 不报', () => {
    // 这是本判据的**另一半**：它只管「宣称穷尽的句子」，不管事实真假。
    // 断言一旦改成「在该处查无」这类有界观察，本判据即放手 —— 那是 FR-3/人工核对的事。
    const scoped = ['# SPEC', '', '- `useFlows.ts` 里没有 run/execute（单点检索）。', ''].join('\n')
    expect(checkNegativeClaims(asFiles(scoped))).toEqual([])
  })

  it('⚠️ 自指：引用错话并当场纠正的段落必须放行（凭据可折到后两行）', () => {
    // 纠正段必须原样引出被纠正的那句话，否则就不是纠正而是含糊其辞。
    // 若凭据窗口只有一行，本用例会红 —— 那正是自指误报。
    const correction = [
      '# SPEC',
      '',
      '> 原文记「**全仓没有**跑模板这个用户动作」—— 该结论是错的。',
      '>',
      '> 实测三处反证：`FlowsPage.tsx:59` 有 `onRun`。',
      '',
    ].join('\n')
    expect(checkNegativeClaims(asFiles(correction))).toEqual([])
  })

  it('⚠️ 凭据落在本行也认（不必折行）', () => {
    const inline = ['- 实测全仓零命中：含 `matchMedia` 亦零命中 → 见 §6.7', ''].join('\n')
    expect(checkNegativeClaims(asFiles(inline))).toEqual([])
  })

  it('⚠️ 措辞表本身要窄：泛指的「不存在」不在表内', () => {
    // 收窄是刻意的：泛指形态实测 135 处，全收就刷屏，而刷屏的闸会被当噪音忽略。
    for (const phrase of ['全仓没有', '全仓零命中', '在仓内查无', '整个仓库无']) {
      expect(NEGATIVE_CLAIM_PATTERNS.some((p) => p.re.test(phrase)), phrase).toBe(true)
    }
    for (const phrase of ['该组件不存在', '零命中', '没有任何一列的损坏率数据', '全仓搜索过一次']) {
      expect(NEGATIVE_CLAIM_PATTERNS.some((p) => p.re.test(phrase)), phrase).toBe(false)
    }
  })
})
