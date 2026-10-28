import { describe, expect, it, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  applyBaseline,
  checkDevNumbering,
  checkDevCrossFileUniqueness,
  collectDevShadowRegistrations,
  checkCredentialTargets,
  checkEntrySections,
  checkFrozenSurface,
  checkProbeResults,
  checkQueue,
  checkRelativeLinks,
  checkNegativeClaims,
  checkSectionRefs,
  classifyNegativeClaim,
  checkRuleBudget,
  checkScriptsRegistry,
  checkSpecVersions,
  extractGrepClaims,
  JUDGMENT_RULES,
  NEGATIVE_CLAIM_PATTERNS,
  parseGrepCommand,
  PROBE_QUESTIONS,
  RULE_BUDGET_LIMIT,
  sampleClaimCredentials,
  type Baseline,
  type Finding,
} from '../scripts/docs-check'

/** 本仓根：几支腿要读真实基线文件与真实探针结果文件 */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** 造一份「文档路径 + 按行切开的正文」；FR-11 与抽样面吃的就是这个形状 */
const asDocFiles = (content: string) => [{ path: 'docs/specs/x.md', lines: content.split('\n') }]

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
    const noHeader = [
      '| # | 事项 |',
      '|---|---|',
      '| ① | 甲 |',
      '',
      '## 净状态',
      '- **待裁 1**：①',
    ].join('\n')
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
    const noVersion = ['# SPEC', '', '| 项 | 值 |', '|------|------|', '| 模块 | 甲 |', ''].join(
      '\n',
    )
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
    const broken = logWith().replace(
      '- **测试验证**: `grep -c foo apps` → 1',
      '- **测试验证**: 手工点了几下，看着对。',
    )
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
    const fs = errorsOf(
      checkFrozenSurface('/x', (face) =>
        face === 'tests/golden/' ? '?? tests/golden/b.json' : '',
      ),
    )
    expect(fs).toHaveLength(1)
    expect(fs[0]!.message).toContain('tests/golden/')
  })
})

/* ------------------------------------------------------------------ 基线机制 */

describe('docs-check · 基线机制', () => {
  const fs = [
    {
      rule: 'FR-5.1',
      level: 'error' as const,
      message: '登记缺「潜在风险」段',
      evidence: 'DEV_LOG.md · 甲',
    },
    {
      rule: 'FR-9.1',
      level: 'error' as const,
      message: '冻结面 content/seed/ 有改动',
      evidence: 'git status',
    },
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
    const r = applyBaseline(
      [
        { ...fs[0]!, rule: 'FR-5.2' },
        { ...fs[0]!, rule: 'FR-5.2' },
      ],
      {
        note: '',
        known: { 'FR-5.2|*': '待裁③ 未闭合，只报不判' },
      },
    )
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
    const ok = [
      '# SPEC',
      '',
      '- 全仓没有 X。复算：`grep -rn X apps packages | wc -l` → 0',
      '',
    ].join('\n')
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
      expect(
        NEGATIVE_CLAIM_PATTERNS.some((p) => p.re.test(phrase)),
        phrase,
      ).toBe(true)
    }
    for (const phrase of ['该组件不存在', '零命中', '没有任何一列的损坏率数据', '全仓搜索过一次']) {
      expect(
        NEGATIVE_CLAIM_PATTERNS.some((p) => p.re.test(phrase)),
        phrase,
      ).toBe(false)
    }
  })
})

/**
 * 「限定的否定断言」与「裸否定断言」两档（2026-10-24 实测定案）。
 *
 * ## 为什么要两档
 *
 * 判据要的区分是：**宣称穷尽却没有复算入口的句子**（裸）vs **自带紧邻复算入口的句子**（有限）。
 * 区分**不在措辞表内做**（表内做「限定词」识别必然假绿 —— 「点名被引对象」与
 * 「点名检索面」在文本上不可分），而在**凭据窗口**做。
 *
 * ## ⭐ 变异腿（这组的价值全在这里）
 *
 * 「有限 → 裸」的翻转必须真的发生 ⇒ 证明闸**能红**；且凭据在断言**前**或**后**都算数
 * ⇒ 证明它不是靠位置碰巧过的（自然写法「**实测**全仓零命中」把凭据放在断言之前）。
 */
describe('docs-check · FR-11 两档判定（有限声明 / 裸否定断言）', () => {
  const asFiles = (content: string) => [{ path: 'docs/specs/x.md', lines: content.split('\n') }]

  it('裸否定断言（无凭据）⇒ 判红，且档次是 bare', () => {
    const lines = ['# SPEC', '', '- 全仓没有 X。', '']
    const fs = checkNegativeClaims(asFiles(lines.join('\n')))
    expect(errorsOf(fs)).toHaveLength(1)
    expect(fs[0]!.message).toContain('裸否定断言')
    expect(classifyNegativeClaim(lines, 2)).toEqual({ tier: 'bare', where: 'none' })
  })

  it('有限声明：凭据在断言**之前**（自然写法「实测全仓零命中」）⇒ 放行', () => {
    const lines = ['- 实测全仓零命中：含 `matchMedia` 亦零命中 → 见 §6.7', '']
    expect(checkNegativeClaims(asFiles(lines.join('\n')))).toEqual([])
    expect(classifyNegativeClaim(lines, 0)).toEqual({ tier: 'limited', where: 'same-line' })
  })

  it('有限声明：凭据在断言**之后** ⇒ 放行', () => {
    const lines = ['- 全仓没有 X。复算：`grep -rn X apps packages | wc -l` → 0', '']
    expect(checkNegativeClaims(asFiles(lines.join('\n')))).toEqual([])
    expect(classifyNegativeClaim(lines, 0)).toEqual({ tier: 'limited', where: 'same-line' })
  })

  it('有限声明：凭据折到后两行（订正段的形态）⇒ 放行，且 where 是 following-lines', () => {
    const lines = [
      '# SPEC',
      '',
      '> 原文记「**全仓没有**跑模板这个用户动作」—— 该结论是错的。',
      '>',
      '> 实测三处反证：`FlowsPage.tsx:59` 有 `onRun`。',
      '',
    ]
    expect(checkNegativeClaims(asFiles(lines.join('\n')))).toEqual([])
    expect(classifyNegativeClaim(lines, 2)).toEqual({ tier: 'limited', where: 'following-lines' })
  })

  it('⭐ 变异腿：把凭据删掉 ⇒ 档次从 limited 翻成 bare ⇒ 判红（证明闸能红）', () => {
    const withEvidence = ['- 全仓没有 X。复算：`grep -rn X | wc -l` → 0', '']
    expect(classifyNegativeClaim(withEvidence, 0).tier).toBe('limited')
    expect(checkNegativeClaims(asFiles(withEvidence.join('\n')))).toEqual([])

    const without = ['- 全仓没有 X。', '']
    expect(classifyNegativeClaim(without, 0).tier).toBe('bare')
    expect(errorsOf(checkNegativeClaims(asFiles(without.join('\n'))))).toHaveLength(1)
  })

  it('⭐ 变异腿：凭据挪到断言之前 ⇒ 仍是有限声明（位置无关，不是碰巧过的）', () => {
    const after = ['- 全仓没有 X。复算：`grep -rn X | wc -l` → 0', '']
    const before = ['- 复算：`grep -rn X | wc -l` → 0。全仓没有 X。', '']
    expect(classifyNegativeClaim(after, 0).tier).toBe('limited')
    expect(classifyNegativeClaim(before, 0).tier).toBe('limited')
  })
})

/* ------------------------------------------------------------------ FR-12 */

describe('docs-check · FR-12（§-引用必须落在真实存在的节上）', () => {
  const tmpRoots: string[] = []

  function mkRepo(files: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), 'ov-refs-'))
    tmpRoots.push(root)
    mkdirSync(join(root, 'docs'), { recursive: true })
    for (const [rel, content] of Object.entries(files)) {
      const abs = join(root, 'docs', rel)
      mkdirSync(dirname(abs), { recursive: true })
      writeFileSync(abs, content, 'utf8')
    }
    return root
  }

  afterEach(() => {
    while (tmpRoots.length) {
      const d = tmpRoots.pop()
      if (d) rmSync(d, { recursive: true, force: true })
    }
  })

  it('限定型引用落在目标文件**存在的节**上 ⇒ 不报', () => {
    const root = mkRepo({
      'a.md': '# A\n\n见 `b.md` §3。\n',
      'b.md': '# B\n\n## 3. 某节\n',
    })
    expect(checkSectionRefs(root)).toEqual([])
  })

  it('⭐ 变异腿：目标文件删掉那一节 ⇒ 报 FR-12.1（证明这道闸能红）', () => {
    const root = mkRepo({
      'a.md': '# A\n\n见 `b.md` §9。\n',
      'b.md': '# B\n\n## 3. 某节\n',
    })
    const fs = checkSectionRefs(root)
    expect(errorsOf(fs)).toHaveLength(1)
    expect(fs[0]!.rule).toBe('FR-12.1')
    expect(fs[0]!.message).toContain('§9')
    expect(fs[0]!.evidence).toBe('docs/a.md:3')
  })

  it('裸引用（不带文件名）⇒ **不判红**（指向不可判定；假红比不红更坏）', () => {
    const root = mkRepo({
      'a.md': '# A\n\n见 §99 —— 裸写，指向不明。\n',
      'b.md': '# B\n\n## 3. 某节\n',
    })
    expect(checkSectionRefs(root)).toEqual([])
  })

  it('父节在、子项未登记（可能指表格行）⇒ **不判红**', () => {
    const root = mkRepo({
      'a.md': '# A\n\n见 `b.md` §3.7。\n',
      'b.md': '# B\n\n## 3. 某节\n',
    })
    expect(checkSectionRefs(root)).toEqual([])
  })
})

/* ------------------------------------------------------------------ FR-12.9 */

describe('docs-check · FR-12.9（别名表登记的目标文件必须还在）', () => {
  const tmpRoots: string[] = []

  function mkRepo(files: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), 'ov-alias-'))
    tmpRoots.push(root)
    mkdirSync(join(root, 'docs'), { recursive: true })
    for (const [rel, content] of Object.entries(files)) {
      const abs = join(root, 'docs', rel)
      mkdirSync(dirname(abs), { recursive: true })
      writeFileSync(abs, content, 'utf8')
    }
    return root
  }

  afterEach(() => {
    for (const d of tmpRoots) rmSync(d, { recursive: true, force: true })
    tmpRoots.length = 0
  })

  it('⭐ 变异腿：别名表登记的目标文件不存在 ⇒ 报 FR-12.9（证明这道闸能红）', () => {
    const root = mkRepo({
      'a.md': '# A\n\n见 §3。\n',
      'b.md': '# B\n\n## 3. 某节\n',
      'section-ref-aliases.json': JSON.stringify({ aliases: { '3': ['docs/gone.md'] } }),
    })
    const fs = checkSectionRefs(root)
    expect(errorsOf(fs)).toHaveLength(1)
    expect(fs[0]!.rule).toBe('FR-12.9')
    expect(fs[0]!.message).toContain('docs/gone.md')
  })

  it('文档别名表登记的目标文件不存在 ⇒ 同样报 FR-12.9', () => {
    const root = mkRepo({
      'a.md': '# A\n\n见 §3。\n',
      'doc-aliases.json': JSON.stringify({ aliases: { m5: 'docs/no-such-spec.md' } }),
    })
    const fs = checkSectionRefs(root)
    expect(errorsOf(fs)).toHaveLength(1)
    expect(fs[0]!.rule).toBe('FR-12.9')
  })

  it('别名表登记的目标文件**存在** ⇒ 不报（这是常态，不该红）', () => {
    const root = mkRepo({
      'a.md': '# A\n\n见 §3。\n',
      'b.md': '# B\n\n## 3. 某节\n',
      'section-ref-aliases.json': JSON.stringify({ aliases: { '3': ['docs/b.md'] } }),
      'doc-aliases.json': JSON.stringify({ aliases: { m5: 'docs/b.md' } }),
    })
    expect(checkSectionRefs(root)).toEqual([])
  })

  it('别名表文件不存在 ⇒ 不报（表还没建不是错）', () => {
    const root = mkRepo({ 'a.md': '# A\n\n见 §3。\n' })
    expect(checkSectionRefs(root)).toEqual([])
  })
})

/* ════════════════════════════════════════════════════════ 判据预算（元判据） */

/** 造 n 条占位判据，用来把计数推过线 */
function plusFakeRules(base: { id: string; checks: string }[], n: number) {
  return [...base, ...Array.from({ length: n }, (_, i) => ({ id: `FR-X${i}`, checks: '填充项' }))]
}

describe('docs-check · 判据预算变异样本（2026-10-17 owner 指令）', () => {
  const CANDIDATES = [
    { id: 'FR-A', what: '第一条候选', why: '甲理由' },
    { id: 'FR-B', what: '第二条候选', why: '乙理由' },
  ]
  const withCandidates = { note: '', known: {}, withdrawalCandidates: CANDIDATES }

  it('判据数恰好等于上限 ⇒ 不得有任何输出（现测 8 条，正好压线不触发）', () => {
    expect(RULE_BUDGET_LIMIT).toBe(8)
    expect(JUDGMENT_RULES).toHaveLength(RULE_BUDGET_LIMIT)
    expect(checkRuleBudget({ note: '', known: {} }, JUDGMENT_RULES)).toEqual([])
  })

  it('⚠️ 变异样本：加到第 9 条 ⇒ 必须打出**建议撤回项与理由**，且按清单顺序', () => {
    const out = checkRuleBudget(withCandidates, plusFakeRules(JUDGMENT_RULES, 1))
    expect(out).toHaveLength(1)
    expect(out[0]?.level).toBe('error')
    expect(out[0]?.message).toContain('9 > 上限 8')
    expect(out[0]?.message).toContain('FR-A')
    expect(out[0]?.message).toContain('甲理由')
  })

  it('⚠️ 超限两条 ⇒ 一次给出**两项**建议，不是一轮只吐一项', () => {
    const out = checkRuleBudget(withCandidates, plusFakeRules(JUDGMENT_RULES, 2))
    expect(out).toHaveLength(2)
    expect(out.map((f) => f.message)).toEqual([
      expect.stringContaining('第 1 项：FR-A'),
      expect.stringContaining('第 2 项：FR-B'),
    ])
  })

  it('⚠️ 触线却**没有**登记撤回清单 ⇒ 必须报「需先补清单」，不得静默放行', () => {
    // 最容易出的事故：有人加了第 9 条却没登记候补，闸若默认放行等于没设防。
    const out = checkRuleBudget({ note: '', known: {} }, plusFakeRules(JUDGMENT_RULES, 1))
    expect(out).toHaveLength(1)
    expect(out[0]?.message).toContain('未登记任何候补撤回项')
  })

  it('⚠️ 登记表**不得**把自己算进去（否则本判据的存在本身就把计数推过线 ⇒ 永远触发）', () => {
    expect(JUDGMENT_RULES.some((r) => r.id.includes('BUDGET'))).toBe(false)
    expect(JUDGMENT_RULES).toHaveLength(RULE_BUDGET_LIMIT)
  })

  it('真实基线文件里的候补撤回清单必须非空且逐项带理由（不得是空壳）', () => {
    const b = JSON.parse(
      readFileSync(join(REPO_ROOT, 'docs', 'docs-check-baseline.json'), 'utf8'),
    ) as Baseline
    expect(Array.isArray(b.withdrawalCandidates)).toBe(true)
    expect(b.withdrawalCandidates?.length ?? 0).toBeGreaterThanOrEqual(2)
    for (const c of b.withdrawalCandidates ?? []) {
      expect(c.id.length, c.id).toBeGreaterThan(0)
      expect(c.what.length, c.id).toBeGreaterThan(0)
      expect(c.why.length, c.id).toBeGreaterThan(10)
    }
  })
})

/* ════════════════════════════════════════════════════════ FR-13 变异样本 */

/**
 * FR-13 · §1.5 脚本登记闸。
 *
 * **为什么要有这道闸**：§1.5 目录树是 `scripts/` 入口的登记处，但 `package.json`
 * 会新增/改名 scripts 而不改目录树 —— 本仓已实测两次（`m9:grade-guard` 与
 * `barrel-audit` 漏登记，`barrel-snapshot` 更是被这道闸当场抓到）。
 *
 * 变异腿：给 package.json 加一个 scripts 条目 → §1.5 不登记 ⇒ 必须报红。
 */
describe('docs-check · FR-13 变异样本（§1.5 脚本登记）', () => {
  /** 造一份 dev-plan：§1.5 目录树里登记了 given 这几个文件 */
  const planWith = (registered: string[]): string =>
    [
      '# 计划',
      '',
      '### 1.5 Monorepo 目录树（三级）',
      '',
      '```',
      'openvibe/',
      ...registered.map((f) => `├── scripts/${f}`),
      '└── .github/workflows/ci.yml',
      '```',
      '',
      '### 1.6 别的节',
      '',
    ].join('\n')

  const pkgWith = (files: string[]): string =>
    JSON.stringify(
      { scripts: Object.fromEntries(files.map((f, i) => [`s${i}`, `tsx scripts/${f}`])) },
      null,
      2,
    )

  it('干净样本：package.json 引用的文件都已登记 ⇒ 无 error', () => {
    const fs = checkScriptsRegistry(pkgWith(['a.ts', 'b.ts']), planWith(['a.ts', 'b.ts']))
    expect(errorsOf(fs)).toEqual([])
  })

  it('⚠️ 变异样本：package.json 新增一个未登记的 scripts ⇒ 必须报红', () => {
    const fs = checkScriptsRegistry(pkgWith(['a.ts', 'b.ts']), planWith(['a.ts']))
    expect(errorsOf(fs)).toHaveLength(1)
    expect(errorsOf(fs)[0]!.rule).toBe('FR-13.1')
    expect(errorsOf(fs)[0]!.message).toContain('b.ts')
  })

  it('⚠️ §1.5 里登记了但 package.json 没引用 ⇒ **不**报（只防「代码先走、文档没跟上」）', () => {
    // 反向收紧会把「计划中的入口」误判成违规，故判据只单向。
    const fs = checkScriptsRegistry(pkgWith(['a.ts']), planWith(['a.ts', 'planned-but-absent.ts']))
    expect(errorsOf(fs)).toEqual([])
  })

  it('⚠️ dev-plan 里没有 §1.5 目录树代码块 ⇒ 必须报「找不到代码块」，不得静默放行', () => {
    const fs = checkScriptsRegistry(pkgWith(['a.ts']), '# 计划\n\n没有目录树。\n')
    expect(errorsOf(fs)).toHaveLength(1)
    expect(errorsOf(fs)[0]!.message).toContain('§1.5')
  })

  it('⚠️ 真实仓库：package.json 引用的每个 scripts/* 都必须已在 §1.5 登记（0 违规）', () => {
    // 本仓腿：证明这条闸对**真实**文件也成立，而不只是合成样本。
    const pkg = readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')
    const plan = readFileSync(join(REPO_ROOT, 'docs', 'dev-plan.md'), 'utf8')
    expect(errorsOf(checkScriptsRegistry(pkg, plan))).toEqual([])
  })
})

/* ════════════════════════════════════════════════════════ 输出面 A · 凭据抽样实跑 */

describe('docs-check · 否定断言凭据抽样实跑（2026-10-17 owner 指令）', () => {
  /** 造一份「否定断言 + 一条声称值的 grep 凭据」的文档 */
  const claimDoc = (cmd: string, said: number) =>
    asDocFiles(['实测「全仓没有那个符号」。', `\`${cmd}\` → ${said}`, ''].join('\n'))

  it('⚠️ 变异样本：凭据实跑返回非 0 ⇒ 必须被抓出（文档称 0，实跑 1）', () => {
    // 这正是 owner 验收标准那句「凭据存在 ≠ 凭据为真」：闸放得过审，但没人真跑过它。
    const r = sampleClaimCredentials(
      '/nonexistent',
      claimDoc('grep -rn GhostSym apps packages', 0),
      6,
      () => ({
        rc: 0,
        stdout: 'apps/web/src/x.ts:12: const GhostSym = 1\n',
      }),
    )
    expect(r.mismatches).toHaveLength(1)
    expect(r.mismatches[0]?.claim.claimed).toBe(0)
    expect(r.mismatches[0]?.actual).toBe(1)
    expect(r.mismatches[0]?.note).toContain('实跑 1')
  })

  it('⚠️ 变异样本：命令跑不通（退出码非 0）⇒ 必须报「凭据可能已失效」，不得静默跳过', () => {
    const r = sampleClaimCredentials(
      '/nonexistent',
      claimDoc('grep -rn Gone apps packages', 0),
      6,
      () => ({
        rc: 2,
        stdout: '',
      }),
    )
    expect(r.mismatches).toHaveLength(1)
    expect(r.mismatches[0]?.actual).toBeNull()
    expect(r.mismatches[0]?.note).toContain('跑不通')
  })

  it('文档说的数与实跑一致 ⇒ 不得误报（否则这条面会被当噪音忽略）', () => {
    const r = sampleClaimCredentials(
      '/nonexistent',
      claimDoc('grep -rn GhostSym apps packages', 0),
      6,
      () => ({
        rc: 0,
        stdout: '',
      }),
    )
    expect(r.mismatches).toEqual([])
    expect(r.sampled).toBe(1)
    expect(r.total).toBe(1)
  })

  it('⚠️ 抽样比例必须可见：超限没跑的那些要**单独报数**，否则「没抓到」会被读成「全对」', () => {
    // 每条否定断言各占两行（断言行 + 凭据行），凭据必须落在 FR-11 的三行窗口内才进抽样清单。
    // ⚠️ 早先把这 10 条全堆在一段里，结果它们挤在同一个三行窗口内 —— 抽出来只有 1 条，
    // 差点被当成「抽样上限生效了」。窗口是判据的一部分，造样本也得守它。
    const lines: string[] = []
    for (let i = 0; i < 10; i++) {
      lines.push(`实测「全仓没有符号 ${i}」。`)
      lines.push(`\`grep -rn Sym${i} apps packages\` → 0`)
    }
    const r = sampleClaimCredentials('/nonexistent', asDocFiles(lines.join('\n')), 3, () => ({
      rc: 0,
      stdout: '',
    }))
    expect(r.total).toBe(10)
    expect(r.sampled).toBe(3)
    expect(r.skipped).toBe(0)
  })

  it('⚠️ 走 shell 的形态一律不抽样（凭据是文档里的不可信输入，不得因此执行任意命令）', () => {
    for (const bad of [
      'grep -rn X apps; rm -rf /',
      'grep -rn X apps | sh',
      'grep -rn X apps > out.txt',
      'grep -rn $(whoami) apps',
      'cat /etc/passwd',
    ]) {
      expect(parseGrepCommand(bad), bad).toBeNull()
    }
  })

  it('⚠️ 省略号命令不是凭据 ⇒ 必须拒掉，不得报成「凭据失效」', () => {
    // 本轮实测踩到：正文里顺手写了个缩写 `grep … → 0`，抽出来真去跑 ⇒ 退出码 2，
    // 被报成「凭据可能已失效」。而真相是**这里压根没写凭据**。两者混起来，
    // 会让真正的凭据失效显得比实际更频繁。
    for (const elided of ['grep … → 0', 'grep -rn ... apps', 'rg ...']) {
      expect(parseGrepCommand(elided), elided).toBeNull()
    }
  })

  it('末尾的计数管道必须能被剥掉（那是本仓凭据的常见形态，不剥就一条都跑不了）', () => {
    const p = parseGrepCommand("grep -c 'local_events' apps/server/src | wc -l")
    expect(p).not.toBeNull()
    expect(p?.argv).toEqual(['grep', '-c', 'local_events', 'apps/server/src'])
    expect(p?.mode).toBe('count')
  })

  it('抽取必须以「有声称值」为前提 —— 没有可比对的值就不该进抽样清单', () => {
    const noNumber = asDocFiles(
      ['实测「全仓没有那个符号」。', '`grep -rn GhostSym apps` 是复算入口。', ''].join('\n'),
    )
    expect(extractGrepClaims(noNumber)).toEqual([])
    expect(extractGrepClaims(claimDoc('grep -rn GhostSym apps', 0))).toHaveLength(1)
  })

  it('⚠️ 命令在、值认不出 ⇒ 必须**单独报数**，不得让这一面静默退化成 0/0 全绿', () => {
    // 本轮实测踩到：凭据写成 `→ **3**`（数字加粗），`→ N` 的正则匹配不上，
    // 刚抓过一条真错事实的面瞬间变成「0/0 条已跑｜不符 0 条」—— 看着全绿，实则一条没验。
    const bolded = asDocFiles(
      ['实测「全仓没有那个符号」。', '`grep -rn GhostSym apps` → **0**（数字被加粗了）。', ''].join(
        '\n',
      ),
    )
    expect(extractGrepClaims(bolded)).toEqual([])
    const r = sampleClaimCredentials('/nonexistent', bolded, 6, () => ({ rc: 0, stdout: '' }))
    expect(r.total).toBe(0)
    expect(r.unparsed).toBe(1)
  })
})

/* ════════════════════════════════════════════════════════ 输出面 B · 探针五问结果 */

describe('docs-check · 探针五问结果文件（2026-10-17 owner 指令）', () => {
  const tmpRoots: string[] = []

  /** 造一个只含探针结果文件的假仓根；`null` 表示不放任何文件 */
  const fakeRepo = (contents: string | null): string => {
    const root = mkdtempSync(join(tmpdir(), 'docs-check-probe-'))
    tmpRoots.push(root)
    if (contents !== null) {
      const dir = join(root, 'docs', 'devlog-evidence', 'M8-probe')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'results-20261016.md'), contents, 'utf8')
    }
    return root
  }

  const row = (q: string, conclusion: string) =>
    `| **${q}** 题目文字 | ${conclusion} | 跑的人 | 时间 | 依据 |`

  afterEach(() => {
    for (const d of tmpRoots.splice(0)) rmSync(d, { recursive: true, force: true })
  })

  it('⚠️ 变异样本：结果文件缺失 ⇒ 五问全部点名报出', () => {
    const r = checkProbeResults(fakeRepo(null))
    expect(r.file).toBeNull()
    expect(r.missing).toEqual([...PROBE_QUESTIONS])
  })

  it('⚠️ 变异样本：某问留空（待填）⇒ 只报那一问，其余不算缺', () => {
    const text = PROBE_QUESTIONS.map((q) => row(q, q === 'Q3' ? '（待填）' : '实测结论')).join('\n')
    const r = checkProbeResults(fakeRepo(`# 探针五问\n\n${text}\n`))
    expect(r.missing).toEqual([])
    expect(r.unfilled).toEqual(['Q3'])
  })

  it('五问都有结论 ⇒ 既不缺也不留空（正向对照，防止闸严到没有实用价值）', () => {
    const text = PROBE_QUESTIONS.map((q) => row(q, '实测结论')).join('\n')
    const r = checkProbeResults(fakeRepo(`# 探针五问\n\n${text}\n`))
    expect(r.missing).toEqual([])
    expect(r.unfilled).toEqual([])
  })

  it('⚠️ 缺题与留空是两件事：整行缺失记 missing，有行但答「—」记 unfilled', () => {
    const text = [
      row('Q1', '实测结论'),
      row('Q2', '本轮作废'),
      row('Q4', '实测结论'),
      row('Q5', '—'),
    ].join('\n')
    const r = checkProbeResults(fakeRepo(`# 探针五问\n\n${text}\n`))
    expect(r.missing).toEqual(['Q3'])
    expect(r.unfilled).toEqual(['Q5'])
  })

  it('本仓真实结果文件必须存在且五问都有行（否则这条面在本仓是永不生效的装饰）', () => {
    const r = checkProbeResults(REPO_ROOT)
    expect(r.file).not.toBeNull()
    expect(r.missing).toEqual([])
  })
})

/* ------------------------------------------------------------------ FR-1.5 */

describe('docs-check · FR-1.5 变异样本（DEV 号跨文件唯一）', () => {
  /** 造一份 DEV_LOG：`[[号, 标题]]`，标题开头带登记日期 */
  const log = (rows: [string, string][]): string =>
    ['# DEV_LOG', ...rows.map(([n, t]) => `## [DEV-${n}] ${t}`)].join('\n')

  const doc = (lines: string[]) => [{ path: 'docs/specs/x.md', lines }]

  it('干净样本：同一个号只有一处登记 ⇒ 无 error', () => {
    const l = log([['0001', '2026-10-24 · 一件事']])
    const files = doc(['> **DEV-0001（2026-10-24）· 同一件事**'])
    expect(checkDevCrossFileUniqueness(l, files)).toHaveLength(0)
  })

  it('⚠️ 变异样本：同一个号在两处各有登记且日期不同 ⇒ 必须报出', () => {
    const l = log([['0001', '2026-10-24 · 一件事']])
    const files = doc(['> **DEV-0001（2026-10-17）· 另一件事**'])
    const out = checkDevCrossFileUniqueness(l, files)
    expect(out).toHaveLength(1)
    expect(out[0]?.rule).toBe('FR-1.5')
    expect(out[0]?.level).toBe('error')
    expect(out[0]?.message).toContain('2026-10-17')
    expect(out[0]?.message).toContain('2026-10-24')
  })

  it('⚠️ 变异样本：分隔形态「（2026-10-17 · DEV-0117）」必须能配对（否则撞号漏检）', () => {
    const l = log([['0117', '2026-10-24 · 另一件事']])
    const files = doc(['> #### ✅ Phase 0 结项登记（2026-10-17 · DEV-0117）'])
    expect(checkDevCrossFileUniqueness(l, files)).toHaveLength(1)
  })

  it('⚠️ 采样行的日期不得挂到号上（否则造出假歧义号）', () => {
    const l = log([['0092', '2026-10-24 · 一件事']])
    const files = doc(['（DEV-0092；2026-10-13 20:00 / …）'])
    expect(checkDevCrossFileUniqueness(l, files)).toHaveLength(0)
  })

  it('⚠️ 订正语里的日期不得挂到号上', () => {
    const l = log([['0101', '2026-10-24 · 一件事']])
    const files = doc(['（2026-10-16 订正：本行原记「❌ 不存在」，是采样早于 DEV-0101 所致）'])
    expect(checkDevCrossFileUniqueness(l, files)).toHaveLength(0)
  })

  it('⚠️ 同一个号在同一处登记两次（同日期）⇒ 不判', () => {
    const l = log([['0001', '2026-10-24 · 一件事']])
    const files = doc(['> **DEV-0001（2026-10-24）· 同一件事**', '> 又提到 DEV-0001（2026-10-24）'])
    expect(checkDevCrossFileUniqueness(l, files)).toHaveLength(0)
  })

  it('⚠️ 一个歧义号多处被引 ⇒ 只报 1 条（判的是歧义本身，不是每一处引用）', () => {
    const l = log([['0001', '2026-10-24 · 一件事']])
    const files = doc([
      '> **DEV-0001（2026-10-17）· 另一件事**',
      '> 又提到 DEV-0001（2026-10-24）',
      '> 再提到 DEV-0001（2026-10-24）',
    ])
    expect(checkDevCrossFileUniqueness(l, files)).toHaveLength(1)
  })

  it('只报数面：登记散落（有带日期的登记但 DEV_LOG 无标题）⇒ 进清单', () => {
    const l = log([['0001', '2026-10-24 · 一件事']])
    const files = doc(['> **DEV-0002（2026-10-17）· 没进 DEV_LOG 的登记**'])
    const shadow = collectDevShadowRegistrations(l, files)
    expect(shadow.map((s) => s.number)).toEqual(['0002'])
    expect(shadow[0]?.dates).toEqual(['2026-10-17'])
  })

  it('只报数面：已进 DEV_LOG 的号不算散落', () => {
    const l = log([['0001', '2026-10-24 · 一件事']])
    const files = doc(['> **DEV-0001（2026-10-24）· 同一件事**'])
    expect(collectDevShadowRegistrations(l, files)).toHaveLength(0)
  })
})

/* ------------------------------------------------------------------ FR-11.2 */

describe('docs-check · FR-11.2 变异样本（否定断言的凭据指向空处）', () => {
  const doc = (content: string) => [{ path: 'docs/specs/x.md', lines: content.split('\n') }]

  it('干净样本：凭据是可复算命令 ⇒ 不报', () => {
    const files = doc(
      '# SPEC\n\n## 3. 目标\n\n> 全仓零实现（`grep -rni foo packages | wc -l` → 0）',
    )
    expect(checkCredentialTargets(files)).toHaveLength(0)
  })

  it('⚠️ 变异样本：凭据是「本文件 §N」而本文件无该节 ⇒ 必须报出', () => {
    const files = doc('# SPEC\n\n## 3. 目标\n\n> 全仓零实现（复算口径见本文件 §7）')
    const out = checkCredentialTargets(files)
    expect(out).toHaveLength(1)
    expect(out[0]?.rule).toBe('FR-11.2')
    expect(out[0]?.level).toBe('error')
  })

  it('⚠️ 变异样本：凭据是「本文件 FR-N」而本文件无该条目 ⇒ 必须报出', () => {
    const files = doc('# SPEC\n\n### FR-1 条目\n\n> 全仓零实现（复算口径见本文件 FR-9.3）')
    const out = checkCredentialTargets(files)
    expect(out).toHaveLength(1)
    expect(out[0]?.rule).toBe('FR-11.2')
  })

  it('本文件确有该 FR 条目 ⇒ 不报', () => {
    const files = doc('# SPEC\n\n### FR-9.3 复算口径\n\n> 全仓零实现（复算口径见本文件 FR-9.3）')
    expect(checkCredentialTargets(files)).toHaveLength(0)
  })

  it('本文件确有该节 ⇒ 不报', () => {
    const files = doc('# SPEC\n\n## 7. 复算口径\n\n> 全仓零实现（复算口径见本文件 §7）')
    expect(checkCredentialTargets(files)).toHaveLength(0)
  })

  it('⚠️ 排除一：窗口里有可复算命令 ⇒ 不报（那条指针是订正段/旁证，不是凭据本身）', () => {
    const files = doc(
      '# SPEC\n\n## 3. 目标\n\n> 全仓零实现（旧凭据写的是见本文件 §7，现已改）\n> 复算：`grep -rni foo packages | wc -l` → 0',
    )
    expect(checkCredentialTargets(files)).toHaveLength(0)
  })

  it('⚠️ 排除二：引号内的指针是引述 ⇒ 不报（纠正段必须原样引出被纠正的那句话）', () => {
    const files = doc('# SPEC\n\n## 3. 目标\n\n> 全仓零实现（旧凭据写的是「见本文件 §7」，已改）')
    expect(checkCredentialTargets(files)).toHaveLength(0)
  })

  it('⚠️ 限定型节指针不由本闸判（那是 FR-12.1 的口径，判据口径单处）', () => {
    const files = doc('# SPEC\n\n## 3. 目标\n\n> 全仓零实现（复算口径见 other.md §9）')
    expect(checkCredentialTargets(files)).toHaveLength(0)
  })

  it('⚠️ 跨文件 FR 指针不由本闸判（子编号常是节内条目，实测会假红）', () => {
    const files = doc('# SPEC\n\n## 3. 目标\n\n> 全仓零实现（复算口径见 other.md FR-5.2）')
    expect(checkCredentialTargets(files)).toHaveLength(0)
  })

  it('⚠️ 非否定断言行不在本闸的扫描面内', () => {
    const files = doc('# SPEC\n\n## 3. 目标\n\n> 本文件 §7 讲的是别的事')
    expect(checkCredentialTargets(files)).toHaveLength(0)
  })
})

describe('docs-check · FR-1.5 覆盖漏洞腿', () => {
  it('⚠️ 同一行里同一个号被指认两个不同日期 ⇒ 必须报出（单值日期会静默丢掉前一个）', () => {
    const log = ['# DEV_LOG', '## [DEV-0001] 2026-10-24 · 一件事'].join('\n')
    const files = [
      { path: 'docs/specs/x.md', lines: ['> DEV-0001（2026-10-17）与 DEV-0001（2026-10-24）并存'] },
    ]
    expect(checkDevCrossFileUniqueness(log, files)).toHaveLength(1)
  })
})
