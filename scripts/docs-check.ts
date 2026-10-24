/**
 * docs:check —— 文档治理闸（2026-10-16，docs-governance-check.md / RF0-4 / 0-g）。
 *
 * ## 它管的是「靠人工同步已经不可能保持一致」
 *
 * 本仓已实测：5,016 行文档 ＋ 331 个源码文件 ＋ 百余条登记，靠人工保持彼此一致已经失败过多次
 * （计数错报、断号、版本行形状走形）。可机判的那几类，正确处置不是逐条修存量，
 * 而是**建校验**，让它们不再发生。
 *
 * ## 八条能红能绿的独立判据（dev-plan §16.10 的计数口径：输出面不计入）
 *
 * | 判据 | 管什么 |
 * |---|---|
 * | FR-1 | DEV 登记号段连续且唯一（「同号＋补记」是合法形态） |
 * | FR-2 | 队列行状态枚举合法 ＋ 净状态计数自洽 |
 * | FR-3.4 | 相对链接的目标必须真实存在（FR-3 里唯一纯可判定的一条） |
 * | FR-4 | spec 版本行存在（分式断言）＋ 列数与表头一致 ＋ 版本链单调 |
 * | FR-6 | 触 A 契约的改动须有独立复核记录段 |
 * | FR-9 | 冻结面零 diff（`tests/golden/` **与** `content/seed/` 两面） |
 * | FR-11 | 否定式全局断言必须自带可复算凭据 |
 * | FR-12 | §-引用必须落在目标文件**真实存在**的节上（限定型；裸引用只报数） |
 *
 * **8 ＝ 触发线**，超限即触发复审，处置是**撤回而非调松**（dev-plan §16.10）。
 * 撤回要撤具体某一条 ⇒ 候补清单预先登记在基线文件里，触线时闸直接把它打出来，
 * 见 `checkRuleBudget`。
 *
 * ⚠️ **FR-5 已于 2026-10-24 从判据集降级为「只报数的面」**：它本来就只报不判
 * （待裁③ 未闭合，规格 FR-5.3 明写「只报不判」）⇒ 降级**零代价**，检查仍在跑；
 * 腾出的名额由 FR-12 接上，判据条数仍为 8。处置依据：基线 `withdrawalCandidates[0].executed`。
 *
 * ## 四块只报数、不判红绿的面（**按 §16.10 原文不计入判据数**）
 *
 * | 面 | 报什么 |
 * |---|---|
 * | FR-7 | MT4 验收覆盖比 |
 * | FR-8 | MT6 可机判漂移数 |
 * | FR-5 | 登记五段齐备 ＋「测试验证」段含可复算命令（**2026-10-24 起由判据降级为只报数面**：待裁③ 未闭合，它本来就只报不判） |
 * | `claimSample` | 否定断言的凭据命令**抽样实跑**，核对「文档说的数」与「真跑出的数」 |
 * | `probe` | 探针五问的实机跑结果文件是否存在、五问是否都有结论 |
 *
 * ⚠️ 后两块是 2026-10-17 加的，**刻意做成报告面而非判据**：它们要解决的是
 * 「欠账可见」与「抽查能抓到漂移」，不是「保证零漂移」；做成判据会把判据数推过线。
 * 代价是它们**不会让 CI 红** —— 这是有意的取舍，不是遗漏。
 *
 * ## 为什么本闸有「基线」机制，而不给历史开豁免名单
 *
 * DEV 号段历史上有 16 个**真空断号**（62/63/64…），它们不可能被「修好」——
 * 回填等于替当年那几轮没有登记的改动背书。规格 FR-1.4 也明写「本 FR 此刻就是红的」。
 * 于是本闸的做法是：**把已知存量登记进 `docs/docs-check-baseline.json`，
 * 登记内的报 warning，登记外的报 error；登记项若某天不再出现，反而要报「基线该清理了」**。
 * 末一条是关键 —— 没有它，基线文件本身会慢慢变成一堆没人再对得上的死条目。
 *
 * ## 退出判据的诚实状态
 *
 * 规格 §7.1a 要求「当前仓库 0 违规」。**本闸首版达不到**，且规格写死了处置方式：
 * 「若 a 达不到，处置是**登记未闭合项而不是把闸调松**」。故基线文件即那份未闭合项清单。
 *
 * ## 越权登记（2026-10-16，owner 指令「Phase 0 的未完成进行开发和实现」）
 *
 * 规格 §8.2 明写「三处待裁未闭合 ⇒ 本文件不构成开工依据」，另有一道本文件外的
 * **人测耗时闸**（PRD §10.4.1 末段，脚本代不了）。本次按 owner 授权越过这两道，
 * 代价如实登记：① §7.1a 未达（见基线文件）；② 人测耗时**至今未测**，
 * 因此本闸**不得**被引用来声称任何「治理成本次线性」结论。
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, dirname, join, normalize } from 'node:path'
import {
  auditScope,
  auditSectionRefs,
  danglingMessage,
  indexSections,
  parseKnownDangling,
  type SectionIndex,
} from './section-ref-audit'

export type Level = 'error' | 'warning'

export interface Finding {
  /** 判据编号，如 FR-1.1 */
  rule: string
  level: Level
  /** 人看的一行说明 */
  message: string
  /** 可复算的凭据（命令或文件:位置） */
  evidence: string
}

/* ════════════════════════════════════════════════════════ 判据各条的纯函数 */

/**
 * FR-1 · DEV 登记号段。
 *
 * **「同号 + 标题含『补记』」是合法形态**（FR-1.4）：本仓要求「日志不回改」，
 * 更正只能另起一笔同号，故 DEV-0085 出现三次是合规的，不是违规。
 *
 * 断号无法被「修好」——回填等于替当年未登记的改动背书。故断号走基线（warning）。
 */
export function checkDevNumbering(log: string): Finding[] {
  const out: Finding[] = []
  const titles = [...log.matchAll(/^## \[DEV-(\d{4})\] (.+)$/gm)]
  const nums = titles.map((m) => Number(m[1]))
  if (nums.length === 0) return out

  const seen = new Map<number, string[]>()
  for (const m of titles) {
    const n = Number(m[1])
    const arr = seen.get(n) ?? []
    arr.push(m[2] ?? '')
    seen.set(n, arr)
  }

  // 重号：合法形态是「一条原始登记 ＋ 若干条『补记』」——因为「日志不回改」，
  // 更正只能另起一笔同号。判据因此是「**至多一条非补记**」：
  // DEV-0085（一条原始 + 补记 + 补记二）合规；若写成「必须全是补记」会把这条真合规的判红，
  // 若写成「有一个不是补记就放过」则两笔真重号会被放过。
  for (const [n, titlesForN] of [...seen].sort((a, b) => a[0] - b[0])) {
    if (titlesForN.length < 2) continue
    const nonSupplement = titlesForN.filter((t) => !/补记/.test(t))
    if (nonSupplement.length <= 1) continue
    out.push({
      rule: 'FR-1.1',
      level: 'error',
      message: `DEV-${String(n).padStart(4, '0')} 出现 ${titlesForN.length} 次，其中 ${nonSupplement.length} 条不是「补记」形态（至多允许 1 条）`,
      evidence: `DEV_LOG.md · 标题：${titlesForN.map((t) => t.slice(0, 40)).join(' ／ ')}`,
    })
  }

  const min = Math.min(...nums)
  const max = Math.max(...nums)
  const gaps: number[] = []
  for (let n = min; n <= max; n++) if (!seen.has(n)) gaps.push(n)
  if (gaps.length > 0) {
    out.push({
      // 另立 FR-1.2 而不并进 FR-1.1：断号的 message 里嵌了号段区间，
      // 而号段会随每一笔新登记增长（103 → 104 …）。若与重号共用一个规则号，
      // 基线键就得跟着号段变 —— 每加一笔登记失配一次，那不是「防腐烂」，是「制造腐烂」。
      rule: 'FR-1.2',
      level: 'warning',
      message: `号段 ${min}–${max} 有 ${gaps.length} 个断号：${gaps.join(', ')}`,
      evidence: 'DEV_LOG.md · 回填等于替未登记的改动背书，故走基线不判红',
    })
  }
  return out
}

/** 队列状态闭集（FR-2.1）。**枚举写死在代码里**，新增态必须显式改代码，不能在文档里随手造词。 */
export const QUEUE_STATES = ['待裁', '待签', '可做待排', '部分授权', '已裁待落', '已裁已落'] as const

const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳㉑㉒㉓㉔㉕㉖㉗㉘㉙㉚㉛㉜㉝㉞㉟'

/**
 * FR-2 · 队列行状态枚举合法 ＋ 净状态计数自洽。
 *
 * **取数禁用多字节区间字符类**（FR-2.4）：BSD `grep -cE '^\| [①-㉟]+ +\|'` 实测返 21，
 * 而按码点逐字匹配返 34 —— 两者差 13。JS 正则没有 POSIX 字符类语义，用码点集合逐字比对。
 */
export function checkQueue(decisions: string): Finding[] {
  const out: Finding[] = []
  const lines = decisions.split('\n')
  const rowRe = /^\|\s*([①-㉟]+)\s*\|/
  const rows: { id: string; state: string; line: number }[] = []

  // 状态列的偏移**从表头取**，不写死索引：写死 `cells[3]` 的话，
  // 表头一旦插列，全表行会被拿「事项」当状态刷出一片假红（实测踩过）。
  let stateOffset = -1
  for (const l of lines) {
    const cells = l.split('|').map((c) => c.trim())
    const at = cells.indexOf('状态')
    if (at > 0) {
      stateOffset = at
      break
    }
  }
  if (stateOffset < 0) {
    return [
      {
        rule: 'FR-2.1',
        level: 'warning',
        message: '队列表头里找不到「状态」列，跳过状态枚举校验',
        evidence: 'docs/decisions.md',
      },
    ]
  }

  lines.forEach((l, i) => {
    const m = l.match(rowRe)
    if (!m) return
    // 逐字校验每个字符都在闭集内（不是范围匹配）
    const id = m[1] ?? ''
    for (const ch of id) {
      if (!CIRCLED.includes(ch)) {
        out.push({
          rule: 'FR-2.1',
          level: 'error',
          message: `队列行首出现非闭集字符「${ch}」`,
          evidence: `docs/decisions.md:${i + 1}`,
        })
      }
    }
    const cells = l.split('|').map((c) => c.trim())
    rows.push({ id, state: cells[stateOffset] ?? '', line: i + 1 })
  })

  for (const r of rows) {
    if (!QUEUE_STATES.some((s) => r.state.includes(s))) {
      out.push({
        rule: 'FR-2.1',
        level: 'error',
        message: `队列 ${r.id} 的状态「${r.state.slice(0, 24)}」不在合法枚举内`,
        evidence: `docs/decisions.md:${r.line}`,
      })
    }
  }

  // FR-2.2 净状态小节：bullet 首个粗体内的**结尾数字**求和，须等于队列行数。
  // 刻意取结尾数字而不是首个数字 —— 「可做待排（owner 手上，不需裁决）5」里
  // 中间就有数字，取首个会把括号里的内容当成计数。
  const section = decisions.slice(decisions.indexOf('## 净状态'))
  const sum = [...section.matchAll(/^-\s+\*\*([^*]+)\*\*/gm)]
    .map((m) => Number((m[1] ?? '').match(/(\d+)\s*$/)?.[1] ?? Number.NaN))
    .filter((n) => Number.isFinite(n))
    .reduce((a, b) => a + b, 0)

  if (rows.length > 0) {
    if (section === '' || sum === 0) {
      out.push({
        rule: 'FR-2.2',
        level: 'warning',
        message: '未找到「## 净状态」小节的 bullet 计数，跳过求和校验',
        evidence: 'docs/decisions.md',
      })
    } else if (sum !== rows.length) {
      out.push({
        rule: 'FR-2.2',
        level: 'error',
        message: `净状态求和 ${sum} ≠ 队列行数 ${rows.length}`,
        evidence: 'docs/decisions.md · 净状态小节 vs 表格行',
      })
    }
  }
  return out
}

/**
 * FR-3.4 · 相对链接的目标必须已入库/存在。
 *
 * **自指陷阱**：本仓文档会用示例形态（如规格里的占位链接）说明「什么算一条相对链接」，
 * 扫描器必须把这类**示例**排除，否则会把自己判成违规 —— 与「把校验命令写进文档、
 * 命令扫到自己」同根因。故只扫**确实以 `./` 开头且后面像真实路径**的形态，
 * 并排除纯占位（路径段数不足、含省略号）。
 */
export function checkRelativeLinks(
  files: { path: string; content: string }[],
  exists: (p: string) => boolean,
): Finding[] {
  const out: Finding[] = []
  for (const f of files) {
    const dir = dirname(f.path)
    for (const m of f.content.matchAll(/\[[^\]]*\]\((\.\.?\/[^)]+)\)/g)) {
      const raw = m[1] ?? ''
      // 排除占位与说明性示例：含省略号、或末段没有扩展名（`./Y` 这类形状）
      if (/…|\.\.\./.test(raw)) continue
      if (!/\.[A-Za-z0-9]{1,5}(#.*)?$/.test(raw)) continue
      const target = normalize(join(dir, raw.split('#')[0] ?? raw))
      if (!exists(target)) {
        out.push({
          rule: 'FR-3.4',
          level: 'error',
          message: `相对链接指向不存在的目标：${raw}`,
          evidence: f.path,
        })
      }
    }
  }
  return out
}

/**
 * FR-4 · spec 版本行存在 ＋ 列数与表头一致 ＋ 版本链单调。
 *
 * **写成「分式」而不是写死数字**（FR-4.1）：含版本行的份数 ÷ spec 总份数，两个数都现场取。
 * 把任何一次的份数写进断言字面量，那个数会在下一份 spec 落地的当天腐烂。
 *
 * **列数必须与所在表头一致**（FR-4.2）：版本正文里有未转义的竖线时，
 * GFM 在解析代码跨度**之前**就切单元格，于是渲染出多列。
 */
export function checkSpecVersions(specs: { path: string; lines: string[] }[]): Finding[] {
  const out: Finding[] = []
  let withVersion = 0
  for (const s of specs) {
    const idx = s.lines.findIndex((l) => l.trimStart().startsWith('| 版本'))
    if (idx < 0) continue
    withVersion++
    const vline = s.lines[idx]!
    // 列数 = 竖线分段数 − 2：`| a | b |` 切出 ['', ' a ', ' b ', ''] 共 4 段，
    // 两端各有一个空段。写 −1 会多算一列（本仓两份 m6 spec 实测因此虚报）。
    const vCols = vline.split('|').length - 2
    // 往上找最近一行形如 | 表头 | 分隔线 |
    let header = ''
    for (let i = idx - 1; i >= 0; i--) {
      const l = s.lines[i] ?? ''
      if (/^\|\s*-{2,}/.test(l.trim())) continue
      if (l.trimStart().startsWith('|')) {
        header = l
        break
      }
    }
    if (header) {
      const hCols = header.split('|').length - 2
      if (vCols !== hCols) {
        out.push({
          rule: 'FR-4.2',
          level: 'error',
          message: `版本行渲染成 ${vCols} 列，而所在表头是 ${hCols} 列（正文里有未转义的竖线）`,
          evidence: `${s.path} · 版本行所在表`,
        })
      }
    }
    // FR-4.3 版本链单调：**只看被箭头连接**的相邻版本。
    //
    // 为什么不按出现顺序整体比较：本仓普遍把最新版写在最前、旧的标「上一版」写在后面
    // （例：`v1.0（…）。本 spec 现构成开工依据。上一版：v0.9 草案（…）`），
    // 按出现顺序比会把这种**合规**的写法判成非单调 —— 首版就是这么假阳性满屏的。
    // 规格说的「箭头段递增」指的是 `v0.9 → v1.0 → v1.1` 这种链，故以箭头为界逐段比。
    const body = vline.slice(vline.indexOf('|') + 1)
    // 直配「版本号（可带括号补充）→ 版本号」整段，**不看箭头两侧是否恰好各有版本号**。
    //
    // 为什么必须直配：版本行里的箭头不只用于版本链 —— 「判级 C → B」是级别变更、
    // 「定值 20 → 21」是数值变化。首版按「箭头两侧最近各有一个版本号」判定，
    // 三条假阳性全来自这里。直配要求箭头左侧紧邻版本号、右侧紧邻版本号，
    // 上面两种形态自然落选，而真正的链 `v1.0（…）→ v1.1（…）` 命中。
    // 容许版本号被粗体包裹：仓内真实形态是 `**v1.0（…）** → **v1.1（…）**`，
    // 箭头与版本号之间隔着 `**`。正则不认粗体的话整条链匹配不上，
    // 「链是单调的」就会因为**根本没匹配到链**而永真通过 —— 那比报错更坏。
    const chainRe = /\*{0,2}v(\d+)\.(\d+)(?:（[^）]*）)?\*{0,2}\s*→\s*\*{0,2}v(\d+)\.(\d+)/g
    for (const m of body.matchAll(chainRe)) {
      const b = Number(m[1]) * 100 + Number(m[2])
      const a = Number(m[3]) * 100 + Number(m[4])
      if (a <= b) {
        out.push({
          rule: 'FR-4.3',
          level: 'error',
          message: `版本链非单调：v${Math.floor(b / 100)}.${b % 100} → v${Math.floor(a / 100)}.${a % 100} 未递增`,
          evidence: `${s.path} · 版本行`,
        })
        break
      }
    }
  }
  if (specs.length > 0 && withVersion < specs.length) {
    out.push({
      rule: 'FR-4.1',
      level: 'error',
      message: `${withVersion}/${specs.length} 份 spec 有版本行（缺 ${specs.length - withVersion} 份）`,
      evidence: 'docs/specs/',
    })
  }
  return out
}

/** FR-5 要求的五段（FR-5.1：段名以 DEV_LOG 现行八段式模板为准，不在本文件复制清单） */
export const REQUIRED_ENTRY_SECTIONS = ['问题描述', '实现思路', '核心变更', '测试验证', '潜在风险'] as const

/** 「可复算命令」口径（FR-5.2）：反引号跨度内含其一 */
const RECOMPUTE_HINT =
  /`[^`]*(grep|git|gh|awk|sed|wc|stat|npm|pnpm|pnpm|node|ls|cmp|sha256|SELECT|find|curl)[^`]*`/

/**
 * FR-5 · 登记结构化必填。
 *
 * **本项一律 warning，不判 error** —— FR-5.3 明写「CHECK 段是否必须存在按 §8.2 待裁③ 的
 * 裁定结果实现；**裁定前本闸对该项只报不判**，不静默放宽，也不假装已裁」。待裁③ 未闭合。
 */
export function checkEntrySections(log: string): Finding[] {
  const out: Finding[] = []
  const blocks = log.split(/^## \[DEV-\d{4}\]/m).slice(1)
  for (const raw of blocks) {
    const title = (raw.split('\n')[0] ?? '').trim()
    for (const sec of REQUIRED_ENTRY_SECTIONS) {
      if (!new RegExp(`\\*\\*${sec}`).test(raw)) {
        out.push({
          rule: 'FR-5.1',
          level: 'warning',
          message: `登记缺「${sec}」段`,
          evidence: `DEV_LOG.md · ${title.slice(0, 40)}`,
        })
      }
    }
    const vIdx = raw.indexOf('**测试验证**')
    if (vIdx >= 0) {
      const seg = raw.slice(vIdx, raw.indexOf('\n- **', vIdx + 1) < 0 ? vIdx + 2000 : raw.indexOf('\n- **', vIdx + 1))
      if (!RECOMPUTE_HINT.test(seg)) {
        out.push({
          rule: 'FR-5.2',
          level: 'warning',
          message: '「测试验证」段没有可复算命令',
          evidence: `DEV_LOG.md · ${title.slice(0, 40)}`,
        })
      }
    }
  }
  return out
}

/**
 * FR-6 · 触 A 契约的改动须有独立复核记录段。
 *
 * **判据只验「复核记录存在」，不代签、不代裁**（FR-6.3）。
 */
/**
 * ⚠️ 本判据**只报不判**（一律 warning），理由与规格 FR-3.3 同类：
 * 「这条登记是否真的触了 A 面」与「它到底有没有做复核」**两处都只能从自由文本猜**。
 * 首版按「A 级 ＋ golden 同现」粗判，扫出二十余条，其中多数是自陈「**未触** A 级」的登记。
 * 收窄到「类型」行宣告后又仍有 7 条存疑 —— 与其用一个不可靠的触发器刷屏、
 * 让整闸显得不可信，不如只报出条数与标题，由人判断。
 * 真要判红，需要登记自身带机器可读标记（规格 FR-3.3 的建议），那是另一次改动。
 */
export function checkReviewRecord(log: string): Finding[] {
  const out: Finding[] = []
  const blocks = log.split(/^## \[DEV-\d{4}\]/m).slice(1)
  for (const raw of blocks) {
    const title = (raw.split('\n')[0] ?? '').trim()
    // 触 A 面的判定：**先排掉自陈「未触」的**，再要求「宣告触」与 A 面的词同现。
    //
    // 本仓绝大多数提到「A 级」的登记恰恰是在说「**未触** A 级冻结契约」（附一句零 diff 凭据）。
    // 只做「A 级 ＋ golden 同现」的粗判会把它们全部误报 —— 实测首版刷出 20+ 条假阳性。
    if (/未触\s*A\s*[级面]|零\s*A\s*级|不触\s*A/.test(raw)) continue
    const announcesA = /A\s*[级面]/.test(raw)
    const aSurface = /design\s*§[78]|schemaVersion|golden|冻结契约/.test(raw)
    const claimsTouch = /落地|触|变更|修改|重基|动了/.test(raw)
    if (!(announcesA && aSurface && claimsTouch)) continue
    if (!/复核/.test(raw)) {
      out.push({
        rule: 'FR-6.1',
        level: 'warning',
        message: '登记的「类型」行宣告触 A 契约，但正文未见复核记录',
        evidence: `DEV_LOG.md · ${title.slice(0, 40)}`,
      })
    }
  }
  return out
}

/* ════════════════════════════════════════════════════════ FR-11 */

/**
 * 否定式**全局**断言的措辞表。
 *
 * **为什么只收「全局」不收泛指的「不存在」**：泛指的「不存在」多半是**观察**
 * （「`grep -rln 'EmptyState' apps/web/src` → 0 命中」），它诚实地限定了一个检索面。
 * 宣称穷尽的才危险 ——「全仓没有 X」「在仓内不存在 X」把**一个检索面**的结论
 * 写成了**整个仓库**的结论。本仓已为这种句式付出过两次代价：
 * ① 「`EmptyState` 沿用既有」—— 实为该组件根本不存在；② 「`flow_template_run` 全仓没有
 * 跑模板动作」—— 实为 `FlowsPage` 一直有 `onRun`，而我当初只 grep 了一个文件 ＋
 * 两个自己想的函数名。两次的成因相同：**检索面比句子小**。
 *
 * 措辞表刻意**窄**。实测全仓这类句子只有十来处，而泛指形态（不含「全仓/仓内/整个仓库」
 * 限定词的「不存在」「零命中」）有 135 处 —— 全收就是刷屏，而刷屏的闸会被当成噪音忽略。
 *
 * ## 「限定的否定断言」与「裸否定断言」的区分落在**哪里**（2026-10-24 实测定案）
 *
 * 判据要的区分是：**宣称穷尽却没有复算入口的句子**（裸）vs **自带紧邻复算入口的句子**（有限）。
 * 这个区分**不在表内做**，而在**凭据窗口**做（见 `classifyNegativeClaim`）。理由有实证：
 *
 * ① **表内做「限定词」识别必然假绿**。候选限定词（冻结面 / 本次 / 该文件 / 范围内…）里，
 *    「点名被引对象」与「点名检索面」在文本上不可分 ——「全仓无 `foo.ts`」里的 `foo.ts`
 *    既是对象名也是路径形态。判成限定 ⇒ 真的裸断言漏判；判成不限定 ⇒ 白收一条。
 * ② **「凭据必须在断言之后」也会假红**。自然写法「**实测**全仓零命中：…」把凭据放在断言
 *    **之前**（既有判据测试里就有这一支）。按方向收紧 ⇒ 这类合法写法被误判。
 * ③ **按句子/子句收紧同样假红**：实测 15 条命中里，**7 条**的凭据合法地落在断言之外
 *    （转述别的文档的结论、或「引用错话并当场纠正」的订正段）⇒ 按句子收紧会一次性造出
 *    7 条假红，而**假红比不红更坏**。
 *
 * ⇒ **表不动、判据不放宽**，只把两档**显式化并可测**（下面 `classifyNegativeClaim`）。
 */
export const NEGATIVE_CLAIM_PATTERNS: { re: RegExp; label: string }[] = [
  // 刻意**不含「搜／搜索」**：「全仓搜索过一次」是在描述一个动作，不是在宣称某物不存在。
  // 收录它会把每条「我在全仓搜过…」的过程叙述都变成待判项 —— 首版收了它，
  // 于是 decisions.md 那条「全仓搜」被扫进来，它其实说的是 git 全仓搜索、与代码存在性无关。
  // 那次是被凭据窗口**碰巧**滤掉的，不是被措辞表滤掉的 ⇒ 措辞表必须自己站得住。
  { re: /全仓(没有|无|零|0)/, label: '全仓级' },
  { re: /在仓内(查无|不存在|没有)/, label: '仓内级' },
  { re: /整个仓库(没有|无)/, label: '全仓级' },
  { re: /仓内(查无|不存在)/, label: '仓内级' },
]

/** 凭据判据沿用 FR-5.2 的「可复算命令」口径，另接受显式的「实测」自陈 */
const EVIDENCE_HINT = new RegExp(RECOMPUTE_HINT.source + '|实测|现测|现查')

/** 否定断言的两档 */
export type NegativeClaimTier = 'limited' | 'bare'

export interface NegativeClaimVerdict {
  /**
   * `limited` = **有限声明**（自带紧邻的复算凭据）—— 通过；
   * `bare` = **裸否定断言**（宣称穷尽却没留复算入口）—— 判红。
   */
  tier: NegativeClaimTier
  /** 凭据所在位置：`same-line` 同行 · `following-lines` 后续行（订正段的常见形态）· `none` 无 */
  where: 'same-line' | 'following-lines' | 'none'
}

/**
 * 给一条否定断言定档：**有限声明** vs **裸否定断言**。
 *
 * **凭据窗口 = 本行 ＋ 后两行**（为什么是三行：本仓的否定断言多写在 Markdown 块引用里，
 * 而证据习惯折到下一两行；一行窗口会把「引用了错话并当场纠正」的段落判成无凭据，
 * 那是**自指误报** —— 纠正段必须原样引出被纠正的那句话）。
 *
 * ⚠️ **窗口向前不借**：实测 `decisions.md` 的「全仓零用法」靠**同一段另一句**里的
 * 「实测会红」蒙混过关（断言在行尾、凭据在行首几百字处）—— 那是**假绿**。
 * 但窗口也不能收窄到「断言之后」：自然写法「**实测**全仓零命中」把凭据放在断言之前。
 * ⇒ 现行口径是**位置无关但必须在窗内**，这条借用点已如实登记（见基线与 DEV_LOG），
 * **不做静默收紧** —— 收紧会一次性造出 7 条假红（转述与订正段的凭据合法地在窗外）。
 */
export function classifyNegativeClaim(lines: string[], lineIdx: number): NegativeClaimVerdict {
  const line = lines[lineIdx] ?? ''
  if (EVIDENCE_HINT.test(line)) return { tier: 'limited', where: 'same-line' }
  const following = `${lines[lineIdx + 1] ?? ''}\n${lines[lineIdx + 2] ?? ''}`
  if (EVIDENCE_HINT.test(following)) return { tier: 'limited', where: 'following-lines' }
  return { tier: 'bare', where: 'none' }
}

/**
 * FR-11 · 否定式全局断言必须自带可复算凭据。
 *
 * **本判据只断「有没有凭据」，不判断言本身真假** —— 判真假要真去跑一遍每条命令，
 * 那是另一件事（规格 FR-8 的 MT6 面）。它要挡的是**一个连复算入口都没留下的句子**：
 * 那种句子一旦腐烂，下一轮没人能发现。
 *
 * **先断「全局」再断凭据，不是反过来**：先判真假会把这条判据变成「一个必然过期的数字清单」。
 */
export function checkNegativeClaims(files: { path: string; lines: string[] }[]): Finding[] {
  const out: Finding[] = []
  for (const f of files) {
    f.lines.forEach((line, i) => {
      let hit: (typeof NEGATIVE_CLAIM_PATTERNS)[number] | undefined
      for (const p of NEGATIVE_CLAIM_PATTERNS) {
        if (!p.re.test(line)) continue
        hit = p
        break
      }
      if (!hit) return
      // 两档判定：有限声明（自带紧邻凭据）放行；裸否定断言（无复算入口）判红。
      // 凭据窗口 = 本行 ＋ 后两行 —— 为什么是三行、为什么不向前借，见 classifyNegativeClaim 的说明。
      const verdict = classifyNegativeClaim(f.lines, i)
      if (verdict.tier === 'limited') return
      out.push({
        rule: 'FR-11.1',
        level: 'error',
        message: `${hit.label}裸否定断言未附可复算凭据：「${line.trim().slice(0, 46)}」`,
        evidence: `${f.path}:${i + 1}`,
      })
    })
  }
  return out
}

/* ════════════════════════════════════════════════════════ FR-12 */

/**
 * FR-12 · §-引用必须落在目标文件**真实存在**的节上。
 *
 * ## 它判什么、只判什么
 *
 * 只判**限定型**引用（`文件.md §N`）：目标文件由仓内实际文件名反查得到。
 * **裸 `§N` 只报数不判红** —— 它在文档头部表格里常指**别的文档**的节
 * （`§0.3`/`§0.4` 是跨文档的书写约定，`§10.4` 指 PRD 而非本文件）；
 * 把裸引用当「同文件」判，实测会造出 600 余条假红 —— **假红比不红更坏**。
 *
 * ## 红的口径（**可证伪**）
 *
 * 被引编号的**顶层节在目标文件里不存在** ⇒ 无歧义的死链。
 * 父节在、子项没登记的（可能指未登记的表格行）⇒ **不判红**。
 *
 * ## 与既有闸的边界
 *
 * 本面**只判「引用落不落空」**，不判被引内容对不对 —— 后者是规格 FR-8 的 MT6 面。
 *
 * ## 已知存量与「该清理了」
 *
 * 已知存量从**基线文件**读（与独立脚本共用一份 ⇒ 口径单处），
 * 已登记的断链**以 warning 出列**（基线命中它），
 * ⇒ 基线的反向检查能看见它 ⇒ 它哪天不再出现时，基线会报「该清理了」。
 *
 * ⚠️ **不把 known 传进来会让这条能力失效**：断链会一律进 findings，
 * 基线永远命中 ⇒ 反向检查永远看不到「它消失了」这件事。
 *
 * @param repoRoot 仓根
 * @param baseline 基线（读其中 `known` 的 FR-12.1 条目）
 */
export function checkSectionRefs(
  repoRoot: string,
  baseline: { known?: Record<string, string> } = { known: {} },
): Finding[] {
  const targets = new Map<string, SectionIndex>()
  const docs: { path: string; content: string }[] = []
  const walk = (dir: string, rel: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue
      const abs = join(dir, entry.name)
      const relPath = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        walk(abs, relPath)
        continue
      }
      if (!entry.name.endsWith('.md')) continue
      const content = readFileSync(abs, 'utf8')
      targets.set(relPath, indexSections(content))
      if (auditScope(relPath)) docs.push({ path: relPath, content })
    }
  }
  walk(join(repoRoot, 'docs'), 'docs')

  const result = auditSectionRefs(docs, targets, parseKnownDangling(baseline))
  const out: Finding[] = []
  for (const f of result.dangling) {
    out.push({
      rule: 'FR-12.1',
      level: 'error',
      message: danglingMessage(f.ref.target, f.ref.ref),
      evidence: `${f.ref.from}:${f.ref.line}`,
    })
  }
  // 已登记的存量：以 warning 出列 ⇒ 基线命中它；若它不再出现，基线的反向检查会报「该清理了」
  for (const f of result.knownDangling) {
    out.push({
      rule: 'FR-12.1',
      level: 'warning',
      message: f.message,
      evidence: `${f.ref.from}:${f.ref.line}`,
    })
  }
  return out
}

/* ════════════════════════════════════════════════════════ 基线 */

/**
 * 基线机制：登记内的报 warning，登记外的报 error；登记项若不再出现，报「该清理了」。
 *
 * 末一条是这套机制能长期活着的原因 —— 否则基线文件会积累没人再对得上的死条目，
 * 而「登记了就不报」会让新出现的同类问题混在里面一起被放过。
 */
export interface Baseline {
  note: string
  /**
   * 键 = `规则|说明`。`说明` 取两种形态之一：
   * - 精确：`FR-4.2|版本行渲染成 8 列…` —— 只压住这一条；
   * - 通配：`FR-5.2|*` —— 压住该规则的**全部**命中。
   *
   * **为什么需要通配**：FR-5 现在有百余条历史命中，逐条登记的话，
   * 基线文件会在下一次改动后立刻对不上号（登记了 100 条、改一次多一条少一条），
   * 而「基线该清理了」的反向检查会天天误报。通配登记的是「这条规则当前整体不判红」，
   * 理由写在值里；等它被判红时，把通配换成逐条精确登记即可。
   */
  known: Record<string, string>
  /**
   * **候补撤回清单**（2026-10-17）：判据数触线时照单撤，不临时吵。
   * 顺序即撤回优先级；闸只负责「按顺序输出前 N 条」，不自己挑。
   */
  withdrawalCandidates?: WithdrawalCandidate[]
}

const BASELINE_PATH = 'docs/docs-check-baseline.json'

export function applyBaseline(findings: Finding[], baseline: Baseline): {
  findings: Finding[]
  staleBaselineKeys: string[]
} {
  const keyOf = (f: Finding): string => `${f.rule}|${f.message}`
  const keys = Object.keys(baseline.known)
  const matchedKeyOf = (f: Finding): string | null => {
    const exact = keyOf(f)
    if (keys.includes(exact)) return exact
    const wild = `${f.rule}|*`
    if (keys.includes(wild)) return wild
    return null
  }
  const hit = new Set<string>()
  const out = findings.map((f) => {
    const k = matchedKeyOf(f)
    if (k === null) return f
    hit.add(k)
    return { ...f, level: 'warning' as Level, evidence: `${f.evidence} · 基线：${baseline.known[k]}` }
  })
  const stale = keys.filter((k) => !hit.has(k))
  const staleFindings: Finding[] = stale.map((k) => ({
    rule: 'BASELINE',
    level: 'error',
    message: `基线里登记的「${k}」本轮没再出现 —— 该清理了（留着会让同类新问题混进去一起被放过）`,
    evidence: BASELINE_PATH,
  }))
  return { findings: [...out, ...staleFindings], staleBaselineKeys: stale }
}

/* ════════════════════════════════════════════════════════ 输出面（不判红绿） */

export interface Metrics {
  /** FR-7：验收覆盖比 —— 分子「有可定位测试凭据」/ 分母「全部 §7 数据行」 */
  mt4: { numerator: number; denominator: number; ratio: string }
  /** FR-8：本轮可机判漂移数，按四类分开 */
  mt6: Record<string, number>
  /** 否定断言的凭据命令抽样实跑结果（不判红绿） */
  claimSample: ClaimSample
  /** 探针五问结果文件的存在性与填写度（不判红绿） */
  probe: { file: string | null; missing: string[]; unfilled: string[] }
}

export function collectMetrics(repoRoot: string): Pick<Metrics, 'mt4' | 'mt6'> {
  const specs = readdirSync(join(repoRoot, 'docs/specs')).filter((f) => f.endsWith('.md'))
  let denominator = 0
  let numerator = 0
  for (const f of specs) {
    const content = readFileSync(join(repoRoot, 'docs/specs', f), 'utf8')
    for (const line of content.split('\n')) {
      if (!/^\|\s*[a-z0-9]+\s*\|/.test(line)) continue
      denominator++
      // 凭据列里出现可定位形态（文件路径 + 行号，或反引号包起来的标识符）即算有凭据
      if (/`[^`]+\.(ts|tsx|md|sql)(:\d+)?`|:\d+/.test(line)) numerator++
    }
  }
  const ratio = denominator === 0 ? '0/0' : `${numerator}/${denominator}`
  return {
    mt4: { numerator, denominator, ratio },
    mt6: {
      编号连续: 0,
      计数自洽: 0,
      被引用数字vs来源: 0,
      契约串vs实现: 0,
    },
  }
}

/* ════════════════════════════════════════════════════════ 判据预算（元判据） */

/**
 * 能红能绿的独立判据登记表 —— **计数口径的单源**（dev-plan §16.10）。
 *
 * ⚠️ **本表刻意不含「输出面」**：FR-7／FR-8 与本轮新增的 `claimSample`／`probe`
 * 各产一个数、不判红绿，按 §16.10 原文**不计入**。
 *
 * ⚠️ **本表也刻意不含 `checkRuleBudget` 自己**。它判的是「判据集」而非文档，
 * 若把自己算进去，则它的存在本身就把计数推到上限以上 ⇒ **永远触发**。
 * 这属**结构性自指**（判据按构造必然包含自己），处置是显式登记豁免，不是调松判据。
 */
export const JUDGMENT_RULES: { id: string; checks: string }[] = [
  { id: 'FR-1', checks: 'DEV 登记号段连续且唯一（「同号＋补记」是合法形态）' },
  { id: 'FR-2', checks: '队列行状态枚举合法 ＋ 净状态计数自洽' },
  { id: 'FR-3.4', checks: '相对链接的目标必须真实存在（FR-3 里唯一纯可判定的一条）' },
  { id: 'FR-4', checks: 'spec 版本行存在（分式断言）＋ 列数一致 ＋ 版本链单调' },
  { id: 'FR-6', checks: '触 A 契约的改动须有独立复核记录段' },
  { id: 'FR-9', checks: '冻结面零 diff（tests/golden/ 与 content/seed/ 两面）' },
  { id: 'FR-11', checks: '否定式全局断言必须自带可复算凭据' },
  // FR-5 已于 2026-10-24 按 dev-plan §16.10 的触线处置降级为「只报数的面」
  // （它本来就只报不判 ⇒ 零代价；检查仍在跑，见基线 withdrawalCandidates[0].executed）。
  { id: 'FR-12', checks: '§-引用必须落在目标文件真实存在的节上（限定型；裸引用只报数）' },
]

/** dev-plan §16.10 的触发线：「规则条数 > 8 即触发复审」 */
export const RULE_BUDGET_LIMIT = 8

export interface WithdrawalCandidate {
  /** 被撤对象，如 `FR-5` */
  id: string
  /** 撤什么，一句话 */
  what: string
  /** 为什么它是这个顺位的被撤对象 */
  why: string
  /** 已执行则写明执行日与做了什么（未执行则缺省） */
  executed?: string
}

/**
 * 判据预算检查：条数超限时，**直接把该撤哪几条连同理由打出来**。
 *
 * **为什么要它**：触线处置是「撤回而非调松」，而撤回要撤具体某一条。
 * 没有预登记清单时，下一轮会被迫在「临时吵」与「随手调松阈值」之间二选一 ——
 * 后者正是 dev-plan §16.10 要防的漂移方向。故把取舍**提前**做成清单，触发时照单执行。
 *
 * **它按登记顺序输出前 N 条**（N ＝ 超出量），不自己挑：挑选权在人，清单只负责排序。
 */
export function checkRuleBudget(
  baseline: Baseline,
  rules: { id: string; checks: string }[] = JUDGMENT_RULES,
  limit = RULE_BUDGET_LIMIT,
): Finding[] {
  const over = rules.length - limit
  if (over <= 0) return []
  const cands = baseline.withdrawalCandidates ?? []
  if (cands.length === 0) {
    return [
      {
        rule: 'RULE-BUDGET',
        level: 'error',
        message: `判据数 ${rules.length} > 上限 ${limit}，而基线未登记任何候补撤回项 —— 按 dev-plan §16.10，触线的处置是撤回而非调松，需先补清单`,
        evidence: BASELINE_PATH,
      },
    ]
  }
  return cands.slice(0, over).map((c, i) => ({
    rule: 'RULE-BUDGET',
    level: 'error' as Level,
    message: `判据数 ${rules.length} > 上限 ${limit} ⇒ 建议按清单撤回第 ${i + 1} 项：${c.id}（${c.what}）。理由：${c.why}`,
    evidence: `${BASELINE_PATH} → withdrawalCandidates[${i}]`,
  }))
}

/* ════════════════════════════════════════════════════════ 输出面 A · 凭据抽样实跑 */

/** 一条待核的凭据命令：文档说它输出多少，我们真去跑一遍看是多少 */
export interface GrepClaim {
  path: string
  line: number
  command: string
  /** 文档声称的数值；`空` 视作 0 */
  claimed: number
}

const SHELL_METACHARS = /[;&|`$><]/

/**
 * 把凭据里的 grep 命令拆成 argv。
 *
 * ⚠️ **绝不走 shell**。凭据来自仓库文档，是不可信输入；一旦交给 shell，
 * 一个文档行就能让 `docs:check` 执行任意命令。故只认「首个 token 是 grep/rg」的数组形式，
 * 且任何 shell 元字符一律拒绝 —— 宁可漏抽样，不可执行面放宽。
 *
 * 末尾的 `| wc -l`／`| head -N` 先剥掉：我们自己数行数，不需要管道。
 *
 * ⚠️ **含省略号（`…`／`...`）的命令一律拒掉**。正文里为了行文顺畅常写
 * `grep … → 0` 这种缩写，它**不是凭据**—— 本轮实测差点因此把「跑不通（退出码 2）」
 * 报成一条凭据失效，而真实原因只是文档没写全。区分「凭据失效」与「这里根本没写凭据」
 * 很重要：前者要修文档，后者要改文档的**写法规范**，混起来会让前者显得更频繁。
 */
export function parseGrepCommand(cmd: string): { argv: string[]; mode: 'lines' | 'count' } | null {
  if (/…|\.\.\./.test(cmd)) return null
  const stripped = cmd.replace(/\|\s*(?:wc\s+-l|head|head\s+-\S+|tail|tail\s+-\S+)\s*$/, '')
  if (SHELL_METACHARS.test(stripped)) return null
  const tokens = stripped.match(/"[^"]*"|'[^']*'|\S+/g)
  if (!tokens || tokens.length < 2) return null
  const argv = tokens.map((t) =>
    t.length > 1 && (t.startsWith('"') || t.startsWith("'")) ? t.slice(1, -1) : t,
  )
  if (argv[0] !== 'grep' && argv[0] !== 'rg') return null
  const mode = argv.some((a) => a === '-c' || /^-[a-zA-Z]*c[a-zA-Z]*$/.test(a)) ? 'count' : 'lines'
  return { argv, mode }
}

/** 从 FR-11 命中行的三行窗口里，抽出「命令 + 声称值」 */
export function extractGrepClaims(files: { path: string; lines: string[] }[]): GrepClaim[] {
  const out: GrepClaim[] = []
  for (const f of files) {
    f.lines.forEach((line, i) => {
      if (!NEGATIVE_CLAIM_PATTERNS.some((p) => p.re.test(line))) return
      const window = `${line}\n${f.lines[i + 1] ?? ''}\n${f.lines[i + 2] ?? ''}`
      const claimedMatch = window.match(/→\s*(\d+)/) ?? window.match(/同样\s*(\d+)/)
      if (!claimedMatch) return
      for (const m of window.matchAll(/`([^`]+)`/g)) {
        const cmd = (m[1] ?? '').trim()
        if (!/^(grep|rg)\b/.test(cmd)) continue
        out.push({ path: f.path, line: i + 1, command: cmd, claimed: Number(claimedMatch[1]) })
      }
    })
  }
  return out
}

export interface ClaimSample {
  /** 抽了几条 / 一共几条（治理成本必须可见） */
  sampled: number
  total: number
  /** 形态不在白名单、没跑的条数 —— 单独报出，否则「没抓到」会被读成「全对」 */
  skipped: number
  /**
   * ⚠️ 窗口里有凭据命令、但**没能解析出声称值**的条数。
   *
   * **为什么必须单独报**：认不出来的那条会**悄悄从清单里消失**，
   * 于是本轮可能跑成 `0/0 条已跑｜不符 0 条` —— 看着全绿，实则一条都没验。
   * 本轮实测就踩到：把凭据写成 `→ **3**`（数字加了粗），`→ N` 的正则就匹配不上，
   * 抓过一条真错事实的面瞬间退化成空转。
   */
  unparsed: number
  mismatches: { claim: GrepClaim; actual: number | null; note: string }[]
}

/**
 * 抽样实跑否定断言的凭据命令，核对「文档说的数」与「真跑出来的数」。
 *
 * **FR-11 只断「有没有凭据」，凭据本身对不对没人验** —— 一句 `grep … → 0` 能过审，
 * 但没人真跑过它。这与本仓登记过的「24 个虚构测试 ID」是同一层：**凭据存在 ≠ 凭据为真**。
 *
 * ⚠️ **只报不判，且限抽样**：全量实跑的成本随文档增长，而这条面要解决的是
 * 「抽查能不能抓到漂移」，不是「保证零漂移」。所以抽样量固定并**把比例打出来** ——
 * 治理成本不可见的自动化等于没有成本约束。
 */
export function sampleClaimCredentials(
  repoRoot: string,
  files: { path: string; lines: string[] }[],
  limit = 6,
  run: (argv: string[], root: string) => { rc: number | null; stdout: string } = (argv, root) => {
    const [bin, ...rest] = argv
    // `noUncheckedIndexedAccess` 下首元素是 `string | undefined`；解析器已保证它必是 grep/rg，
    // 这里只是把类型收干净，真走到 undefined 就当作「没有可执行体」。
    if (bin === undefined) return { rc: null, stdout: '' }
    const r = spawnSync(bin, rest, { cwd: root, encoding: 'utf8', timeout: 5000 })
    return { rc: r.status, stdout: r.stdout ?? '' }
  },
): ClaimSample {
  const claims = extractGrepClaims(files)
  const parsed = claims.map((c) => ({ c, p: parseGrepCommand(c.command) }))
  const skipped = parsed.filter((x) => x.p === null).length
  const runnable = parsed.filter((x) => x.p !== null).slice(0, limit)
  const mismatches: ClaimSample['mismatches'] = []
  for (const { c, p } of runnable) {
    if (p === null) continue
    const { rc, stdout } = run(p.argv, repoRoot)
    if (rc !== 0) {
      mismatches.push({ claim: c, actual: null, note: `命令跑不通（退出码 ${rc}）—— 凭据可能已失效或路径已不存在` })
      continue
    }
    const lines = stdout.split('\n').filter((l) => l !== '')
    const actual =
      p.mode === 'count'
        ? lines.reduce((sum, l) => {
            const n = Number(l.slice(l.lastIndexOf(':') + 1))
            return sum + (Number.isFinite(n) ? n : 0)
          }, 0)
        : lines.length
    if (actual !== c.claimed) {
      mismatches.push({ claim: c, actual, note: `文档称 ${c.claimed}，实跑 ${actual}` })
    }
  }
  const unparsed = countUnparsedClaimWindows(files)
  return { sampled: runnable.length, total: claims.length, skipped, unparsed, mismatches }
}

/**
 * 数一数：有多少否定断言的窗口里**摆着凭据命令，却没给出可比的声称值**。
 *
 * ⚠️ 与 `extractGrepClaims` 是**两个不同的问题**：那条只收「命令 ＋ 声称值」都齐的，
 * 这里数的是**命令在、值认不出**的。两者不分开报，就会出现「跑成 0/0 却显示全绿」。
 */
function countUnparsedClaimWindows(files: { path: string; lines: string[] }[]): number {
  let n = 0
  for (const f of files) {
    f.lines.forEach((line, i) => {
      if (!NEGATIVE_CLAIM_PATTERNS.some((p) => p.re.test(line))) return
      const window = `${line}\n${f.lines[i + 1] ?? ''}\n${f.lines[i + 2] ?? ''}`
      const hasGrep = [...window.matchAll(/`([^`]+)`/g)].some((m) => /^(grep|rg)\b/.test((m[1] ?? '').trim()))
      if (!hasGrep) return
      const hasClaim = /→\s*\d+/.test(window) || /同样\s*\d+/.test(window)
      if (!hasClaim) n++
    })
  }
  return n
}

/* ════════════════════════════════════════════════════════ 输出面 B · 探针五问结果 */

/** 探针五问的题号（dev-plan §6.3）。Q2 本轮作废，但仍占一格 —— 作废是结论，不是删题 */
export const PROBE_QUESTIONS = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'] as const

const PROBE_DIR = 'docs/devlog-evidence/M8-probe'
const FILLED_PLACEHOLDERS = /^(（?\s*(待填|待补|未填|todo|tbd|—|-)\s*）?)$/i

/**
 * 探针五问的实机跑结论必须落成机器可读的**结果文件**，且五问都要有结论。
 *
 * **为何要有这道面**：owner 在 GUI 跑完的结论若只贴进聊天，dev-plan §6.3 的表格不会被更新，
 * 下一轮又有人以为没跑过 —— 「跑过」这件事本身开始腐烂。
 *
 * ⚠️ **只报不判**：四问要 owner 上机才跑得到，脚本代不了；这条面的作用是**让欠账可见**，
 *   不是逼人编答案。
 */
export function checkProbeResults(repoRoot: string): {
  file: string | null
  missing: string[]
  unfilled: string[]
} {
  const dir = join(repoRoot, PROBE_DIR)
  if (!existsSync(dir)) return { file: null, missing: [...PROBE_QUESTIONS], unfilled: [] }
  const results = readdirSync(dir)
    .filter((f) => f.startsWith('results-') && f.endsWith('.md'))
    .sort()
  if (results.length === 0) return { file: null, missing: [...PROBE_QUESTIONS], unfilled: [] }
  const file = `${PROBE_DIR}/${results[results.length - 1]}`
  const text = readFileSync(join(repoRoot, file), 'utf8')
  const missing: string[] = []
  const unfilled: string[] = []
  for (const q of PROBE_QUESTIONS) {
    const row = text.split('\n').find((l) => new RegExp(`^\\|\\s*\\*\\*${q}\\*\\*`).test(l))
    if (!row) {
      missing.push(q)
      continue
    }
    // ⚠️ 下标是 **2** 不是 1：按 `|` 切开后第 0 段是行首竖线前的空串，
    // 第 1 段是**题列**（` **Q1** 加载时机…`），结论在第 2 段。
    // 取成 1 会把题列当结论 —— 而题列永远不是占位符，于是「留空」这一支**恒不触发**。
    const conclusion = (row.split('|')[2] ?? '').replace(/\*\*/g, '').trim()
    if (conclusion === '' || FILLED_PLACEHOLDERS.test(conclusion)) unfilled.push(q)
  }
  return { file, missing, unfilled }
}

/* ════════════════════════════════════════════════════════ 装配与 CLI */

function git(args: string[], cwd: string): string {
  return spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).stdout ?? ''
}

/**
 * FR-9 · 冻结面零 diff。
 *
 * **两面**（`tests/golden/` 与 `content/seed/`）：只查 golden 会在种子已脏时报「OK 零 diff」。
 * **取数用 `git status --porcelain`**，不用 `git diff --name-only` —— 后者漏暂存与未跟踪。
 */
/** 冻结面取数的注入点（默认真跑 git）。测试用它造「某面被改」的样本。 */
export type StatusRunner = (face: string, repoRoot: string) => string

export function checkFrozenSurface(
  repoRoot: string,
  run: StatusRunner = (face, root) => git(['status', '--porcelain', '--', face], root),
): Finding[] {
  const out: Finding[] = []
  for (const face of ['tests/golden/', 'content/seed/']) {
    const s = run(face, repoRoot).trim()
    if (s !== '') {
      out.push({
        rule: 'FR-9.1',
        level: 'error',
        message: `冻结面 ${face} 有改动（${s.split('\n').length} 行）`,
        evidence: `git status --porcelain -- ${face}`,
      })
    }
  }
  return out
}

export function runAll(repoRoot: string): { findings: Finding[]; metrics: Metrics } {
  const log = readFileSync(join(repoRoot, 'DEV_LOG.md'), 'utf8')
  const decisions = readFileSync(join(repoRoot, 'docs/decisions.md'), 'utf8')
  const specDir = join(repoRoot, 'docs/specs')
  const specs = readdirSync(specDir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => ({ path: join('docs/specs', f), lines: readFileSync(join(specDir, f), 'utf8').split('\n') }))

  const linkFiles = [
    { path: join(repoRoot, 'docs/PRD.md'), content: readFileSync(join(repoRoot, 'docs/PRD.md'), 'utf8') },
    { path: join(repoRoot, 'docs/specs/docs-governance-check.md'), content: readFileSync(join(specDir, 'docs-governance-check.md'), 'utf8') },
  ]

  // FR-11 的扫描面：docs/ 与 docs/specs/ 下的全部 md（含 PRD 与计划文）。
  // 刻意**不扫** scripts/ 与 tests/ —— 本闸自己的判据实现与夹具按构造必然含这些措辞，
  // 那属结构性自指（见 SELF_QUOTING 的同型处置），不是文档腐烂。
  // 扫描面 = `docs/` 顶层 ＋ `docs/specs/`，**排除归档目录**。
  // `docs/devlog-evidence/` 是历次复审的**存档**：它记录「当时为真」，不是活断言。
  // 把「现状断言须附复算凭据」这条判据套到存档上，等于要求三年前的复审记录补今天的命令 ——
  // 那不是防腐烂，是给历史制造噪声。
  const ARCHIVE_PREFIX = 'devlog-evidence/'
  const docFiles = [
    ...readdirSync(join(repoRoot, 'docs'))
      .filter((f) => f.endsWith('.md'))
      .map((f) => `docs/${f}`),
    ...readdirSync(join(repoRoot, 'docs/specs'))
      .filter((f) => f.endsWith('.md'))
      .map((f) => `docs/specs/${f}`),
  ]
    .filter((rel) => !rel.includes(ARCHIVE_PREFIX))
    .map((rel) => ({ path: rel, lines: readFileSync(join(repoRoot, rel), 'utf8').split('\n') }))

  const baseline: Baseline = existsSync(join(repoRoot, BASELINE_PATH))
    ? (JSON.parse(readFileSync(join(repoRoot, BASELINE_PATH), 'utf8')) as Baseline)
    : { note: '（基线文件不存在：所有问题一律按 error 计）', known: {} }

  const findings: Finding[] = [
    ...checkSectionRefs(repoRoot, baseline),
    ...checkDevNumbering(log),
    ...checkQueue(decisions),
    ...checkRelativeLinks(linkFiles, (p) => existsSync(p)),
    ...checkSpecVersions(specs),
    ...checkEntrySections(log),
    ...checkReviewRecord(log),
    ...checkNegativeClaims(docFiles),
    ...checkFrozenSurface(repoRoot),
    // ⚠️ 必须在 applyBaseline **之前**入列：基线的通配登记是按 `规则|*` 压命中项的，
    // 若先过基线，这条「判据集」层面的检查会被任何一条无关规则的通配压掉。
    ...checkRuleBudget(baseline),
  ]

  const applied = applyBaseline(findings, baseline)

  return {
    findings: applied.findings,
    metrics: {
      ...collectMetrics(repoRoot),
      claimSample: sampleClaimCredentials(repoRoot, docFiles),
      probe: checkProbeResults(repoRoot),
    },
  }
}

export function render(result: { findings: Finding[]; metrics: Metrics }): string {
  const errors = result.findings.filter((f) => f.level === 'error')
  const warns = result.findings.filter((f) => f.level === 'warning')
  const out: string[] = []
  out.push(
    `docs:check —— error ${errors.length} · warning ${warns.length} · 基线内 ${result.findings.filter((f) => f.evidence.includes('基线：')).length}`,
  )
  out.push('')
  for (const group of [
    ['⛔ error', errors],
    ['⚠️ warning', warns],
  ] as [string, Finding[]][]) {
    if (group[1].length === 0) continue
    out.push(`── ${group[0]}（${group[1].length}）`)
    for (const f of group[1]) {
      out.push(`  [${f.rule}] ${f.message}`)
      out.push(`      ${f.evidence}`)
    }
    out.push('')
  }
  out.push(`── MT4 验证覆盖比：${result.metrics.mt4.ratio}（不判红绿，只报数）`)
  out.push('── MT6 可机判漂移数（不判红绿，只报数）')
  for (const [k, v] of Object.entries(result.metrics.mt6)) out.push(`   · ${k}：${v}`)

  const cs = result.metrics.claimSample
  out.push(
    `── 否定断言凭据抽样实跑：${cs.sampled}/${cs.total} 条已跑（上限 ${cs.sampled}，另 ${cs.skipped} 条形态不合规/已省略未跑、${cs.unparsed} 条窗口内认不出声称值）｜不符 ${cs.mismatches.length} 条（不判红绿，只报数）`,
  )
  for (const m of cs.mismatches) {
    out.push(`   · ${m.claim.path}:${m.claim.line} —— ${m.note}`)
    out.push(`       \`${m.claim.command}\``)
  }

  const pr = result.metrics.probe
  const probeState = [
    pr.file === null ? '结果文件缺失' : `结果文件 ${pr.file}`,
    pr.missing.length > 0 ? `缺题 ${pr.missing.join('/')}` : null,
    pr.unfilled.length > 0 ? `留空 ${pr.unfilled.join('/')}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
  out.push(`── 探针五问结果（不判红绿，只报数）：${probeState || '五问齐备'}`)
  return out.join('\n')
}

function main(argv: string[]): number {
  const args = argv.slice(2)
  const repoRoot = process.cwd()
  const result = runAll(repoRoot)
  if (args.includes('--json')) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } else {
    process.stdout.write(`${render(result)}\n`)
  }
  return result.findings.some((f) => f.level === 'error') ? 1 : 0
}

if (process.argv[1] && basename(process.argv[1]).startsWith('docs-check')) {
  process.exitCode = main(process.argv)
}
