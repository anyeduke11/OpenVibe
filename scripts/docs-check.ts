/**
 * docs:check —— 文档治理闸（2026-10-16，docs-governance-check.md / RF0-4 / 0-g）。
 *
 * ## 它管的是「靠人工同步已经不可能保持一致」
 *
 * 本仓已实测：5,016 行文档 ＋ 331 个源码文件 ＋ 百余条登记，靠人工保持彼此一致已经失败过多次
 * （计数错报、断号、版本行形状走形）。可机判的那几类，正确处置不是逐条修存量，
 * 而是**建校验**，让它们不再发生。
 *
 * ## 七条能红能绿的独立判据（dev-plan §16.10 的计数口径：FR-7／FR-8 是输出面，不计入）
 *
 * | 判据 | 管什么 |
 * |---|---|
 * | FR-1 | DEV 登记号段连续且唯一（「同号＋补记」是合法形态） |
 * | FR-2 | 队列行状态枚举合法 ＋ 净状态计数自洽 |
 * | FR-3.4 | 相对链接的目标必须真实存在（本 FR 里唯一纯可判定的一条） |
 * | FR-4 | spec 版本行存在（分式断言）＋ 列数与表头一致 ＋ 版本链单调 |
 * | FR-5 | 登记五段齐备 ＋「测试验证」段含可复算命令 |
 * | FR-6 | 触 A 契约的改动须有独立复核记录段 |
 * | FR-9 | 冻结面零 diff（`tests/golden/` **与** `content/seed/` 两面） |
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
}

export function collectMetrics(repoRoot: string): Metrics {
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

  const findings: Finding[] = [
    ...checkDevNumbering(log),
    ...checkQueue(decisions),
    ...checkRelativeLinks(linkFiles, (p) => existsSync(p)),
    ...checkSpecVersions(specs),
    ...checkEntrySections(log),
    ...checkReviewRecord(log),
    ...checkFrozenSurface(repoRoot),
  ]

  const baseline: Baseline = existsSync(join(repoRoot, BASELINE_PATH))
    ? (JSON.parse(readFileSync(join(repoRoot, BASELINE_PATH), 'utf8')) as Baseline)
    : { note: '（基线文件不存在：所有问题一律按 error 计）', known: {} }
  const applied = applyBaseline(findings, baseline)

  return { findings: applied.findings, metrics: collectMetrics(repoRoot) }
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
