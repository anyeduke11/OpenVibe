import pc from 'picocolors'

/**
 * CLI 输出单出口（m6b §5.1）：`--json` 时 stdout 只有一个可被 jq 解析的对象，
 * 人读文案（进度、表格、提示）一律静默；提示类信息走 warn()，在 --json 下折叠进 summary.warnings。
 * 退出码由命令自己决定，Printer 不碰 process.exit。
 */

export const ExitCode = { ok: 0, error: 1, drift: 2 } as const
export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode]

/** 五状态（m6b FR-2.2），顺序即表格与计数的固定顺序 */
export const SYNC_STATES = ['NEW', 'IN_SYNC', 'UPDATE', 'CONFLICT', 'DRIFT'] as const
export type SyncState = (typeof SYNC_STATES)[number]

export interface PlanItem {
  state: SyncState
  path: string
  action: string
  sizeBytes?: number
  backupPath?: string
  /** --target 过滤后本次是否在写入范围内（范围外一律 skip） */
  inScope?: boolean
}

export type ReportRow = Record<string, unknown>
export type Summary = Record<string, unknown>

export interface CliEnvelope {
  command: string
  plan?: PlanItem[]
  report?: ReportRow[]
  summary: Summary
}

export interface PrinterOptions {
  command: string
  json: boolean
  write?: (chunk: string) => void
  writeErr?: (chunk: string) => void
  /** 缺省跟随 picocolors 对当前环境的支持判定；每个 printer 各自持有，不共享全局色状态 */
  color?: boolean
}

/**
 * 一条提示的两个通道（`warn` 用）。
 *
 * `message` 是**人话**（中文一句话）；`detail` 是**诊断原文**（允许英文：
 * Node 的 errno 消息、JSON 解析器原文等）。
 *
 * ⚠️ 与 `fail` 的双通道同一套纪律：中文句子里不混英文机器串，但诊断不丢。
 * 缺省即不产生该字段——无诊断信息的提示不必多写一个字段。
 */
export interface Warning {
  message: string
  detail?: string
}

export interface Printer {
  readonly mode: 'json' | 'human'
  /** 人读进度/说明；--json 下静默 */
  info(line: string): void
  /**
   * 非致命提示；人读即时输出，--json 按序收集进 summary.warnings。
   *
   * `detail` 是诊断原文（允许英文），缺省即不产生该字段。
   */
  warn(message: string, detail?: string): void
  /** 计划表；人读渲染，--json 下由 result() 带出 */
  plan(items: PlanItem[]): void
  /** 唯一收尾出口 */
  result(envelope: Omit<CliEnvelope, 'command'>): void
  /**
   * 失败出口：--json 仍是 stdout 单对象（脚本据 summary.ok 判断），人读走 stderr。
   *
   * `message` 是**人话**（中文一句话，说清发生了什么、下一步做什么）；
   * `detail` 是**诊断原文**（允许英文：Node/第三方错误消息、ABI 常量名、修复命令）。
   * 两者分通道的理由：同一条 `message` 里既塞人话又塞英文诊断，会让中文界面/终端
   * 出现机器串；而丢掉诊断又会让排障失去依据。拆开后各归各位。
   */
  fail(code: string, message: string, detail?: string): void
  warnings(): Warning[]
}

const STATE_WIDTH = 8 // 'CONFLICT'.length
const PATH_WIDTH = 40
const pad = (s: string, width: number): string =>
  s.length >= width ? s : s + ' '.repeat(width - s.length)

/** CJK 汉字（本仓文案的语言标志） */
const CJK_RE = /[\u4e00-\u9fff]/

/**
 * 这段文本是不是**英文**（不含汉字）。
 *
 * 用途：某些来源的 `.message` **可能是中文也可能是英文**——例如 zod 的
 * `issue.message`：本仓自定义了校验文案（中文，如「非法相对路径（design §7.7：…）」），
 * 但 zod 内置的默认文案是英文（`Expected string, received number`）。
 * 这类来源不能一刀切地丢进 detail 位 ⇒ 先看语言再决定。
 */
export function isEnglish(text: string | undefined): boolean {
  if (text === undefined || text === '') return false
  return !CJK_RE.test(text)
}

/**
 * 「像单词」的词元：形如 `Unexpected` / `EADDRINUSE` / `openvibe` / `NODE_MODULE_VERSION`。
 *
 * ⚠️ **路径与 URL 不算单词**：含 `/` 的 token 整体判为「非单词」（见 `scanSegment`）。
 * 这是必须的：仓里自己的文案大量内嵌 URL 与路径（`非法 URL: ${raw}`），
 * 若把它们当英文句子，好文案会被误切。
 */
const WORD_TOKEN_RE = /^[A-Za-z][A-Za-z0-9_.-]*$/

/**
 * 强边界标点：出现在这里 ⇒ 两侧是**不同子句**，不算「同一句英文」。
 *
 * 全部是**全角中文标点**加列表分隔符：
 *  - **句读**（`：，、；！？（）「」《》。`）：中文文案里出现全角标点，说明这里是
 *    子句边界。英文诊断跟在它后面（`不是合法 JSON：Unexpected token ...`），
 *    边界之前的标签词（`JSON`）留在人话通道。
 *  - **列表分隔**（`|`）：`status | next | checklist` 是**清单**不是句子。
 *    ⚠️ 这条是踩过坑才补上的：早先只按「连续 ≥3 个单词」判定，把本仓的
 *    关键词枚举整段当成英文句子切走，导致 `ask` 的报错文案丢了七个闭集关键词。
 *
 * ⚠️ **全角与半角要分开**：ASCII 标点（`: , ( ) " '`）是**英文句内**的标点，
 * 不打断句子。`EACCES: permission denied, open '/x'` 是**一句**英文诊断，
 * 若把 ASCII 冒号当边界，`EACCES` 会被留在人话通道、句子进 detail，
 * 诊断信息被拆成两半——排障时看到的是残句。
 */
const STRONG_PUNCT_RE = /[：，、；！？（）「」《》。|]/

/** 段内切分：非强边界的一段 / 单个强边界标点 */
const PART_RE = /[^：，、；！？（）「」《》。|]+|[：，、；！？（）「」《》。|]/g

/** 词元性质：单词（计入句长）/ 修饰（不计入但不打断）/ 强边界（打断） */
type PieceKind = 'word' | 'soft' | 'hard'

interface Piece {
  kind: PieceKind
  /** 在原始字符串中的起止下标（用于精确切除，不靠字符串替换） */
  start: number
  end: number
}

/** token 去掉首尾非单词字符后的核心部分 */
function tokenCore(token: string): string {
  return token.replace(/^[^\w.-]+/, '').replace(/[^\w.-]+$/, '')
}

/**
 * 词元分类：
 *  - 纯标点（`<` `—` `"` `:` `,`）⇒ soft：不计入句长，但**不打断**连续性
 *    （`token < in JSON`、`EACCES: permission denied` 都要算成一句）。
 *  - 形如单词 ⇒ word。
 *  - 数字（`26.4.0` `137`）⇒ soft：版本号与计数不是英文单词，但也不该打断句子。
 *  - 其余（`foo=bar` 这类含结构符号的）⇒ hard。
 */
function classifyRun(run: string): PieceKind {
  const core = tokenCore(run)
  if (core === '') return 'soft'
  if (WORD_TOKEN_RE.test(core)) return 'word'
  if (/^[0-9]/.test(core)) return 'soft'
  return 'hard'
}

/**
 * 把一个非 CJK 段切成词元序列。
 *
 * 两级切分：**先按强边界标点切子句，再按空白切词**。顺序不能反：
 * 路径常与相邻文字粘连（`bundle.json（EACCES: xxx`），先切空白会把
 * `bundle.json` 与后面的诊断并成一个 token，诊断就被整段吞掉、切不出句子。
 *
 * token 的三类处理：
 *  - **尾部闭合括号**（`)` `]`）单独成片：它终止句子，不属于句子内容。
 *    不拆出来的话，`'/tmp/x')` 会被当成一个路径词元，右括号被吞进诊断里，
 *    片段边界就找不准了。
 *  - **独立的 `/`** ⇒ hard：列表分隔符（`refuse-overwrite / refuse-merge`）。
 *  - **含 `/` 的 token**（路径 / URL）⇒ 整段 soft：路径不打断句子
 *    （`EACCES: permission denied, open '/x'` 要算完整一句），但路径本身
 *    不是英文单词，不计入句长。
 */
function scanSegment(text: string, offset: number): Piece[] {
  const pieces: Piece[] = []
  for (const p of text.matchAll(PART_RE)) {
    const part = p[0]
    const partStart = offset + (p.index ?? 0)
    if (STRONG_PUNCT_RE.test(part)) {
      pieces.push({ kind: 'hard', start: partStart, end: partStart + part.length })
      continue
    }
    for (const t of part.matchAll(/\S+/g)) {
      const token = t[0]
      const tokenStart = partStart + (t.index ?? 0)
      const close = /[）)】]」》]+$/.exec(token)?.[0] ?? ''
      const core = close === '' ? token : token.slice(0, token.length - close.length)
      if (core !== '') {
        const kind: PieceKind =
          core === '/' || core === '\\'
            ? 'hard'
            : core.includes('/') || core.includes('\\')
              ? 'soft'
              : classifyRun(core)
        pieces.push({ kind, start: tokenStart, end: tokenStart + core.length })
      }
      for (let i = 0; i < close.length; i += 1) {
        pieces.push({
          kind: 'hard',
          start: tokenStart + core.length + i,
          end: tokenStart + core.length + i + 1,
        })
      }
    }
  }
  return pieces
}

/**
 * 找出文本里所有「英文诊断」片段（返回在原串中的区间，便于精确切除）。
 *
 * ## 判据：片段带**错误特征**才算诊断
 *
 * 早先的判据是「连续 ≥3 个单词」。用真实样本校准后**这个判据不成立**：
 * `npm rebuild better-sqlite3`（修复命令，3 词）与 `spawn xdg-open ENOENT`
 * （错误消息，3 词）词数相同，按词数切必然误伤一边。
 *
 * 校准样本（取自 apps/cli/src、apps/server/src、packages/core/src 的真实文案）：
 *  - **该判为错误**：`EACCES: permission denied`、`Unexpected token < in JSON`、
 *    `connect ECONNREFUSED`、`SQLITE_ERROR: no such table`、`Failed to fetch`、
 *    `The user name or passphrase you entered is not correct` 等；
 *  - **不该判为错误**：`npm rebuild better-sqlite3`、`openvibe sync <projectPath>`、
 *    `xcode-select --install`、`apt install build-essential python3`、
 *    `darwin arm64`、`NODE_MODULE_VERSION 137` 等命令与标识符。
 *
 * 两者在**词数**上无法区分，区别在**形态**：错误消息带错误码、错误类名或
 * 错误语义词，命令与标识符不带。故判据改为「片段内命中任一错误特征」。
 *
 * ## 为什么要保留子句切分
 *
 * 切分（强边界标点 / 列表分隔符 / 路径）仍是必要的：它保证「标签词留在人话、
 * 诊断进 detail」（`不是合法 JSON：Unexpected token ...` ⇒ 人话留 `不是合法 JSON`）。
 */
function englishFragments(raw: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = []
  let cursor = 0
  for (const m of raw.matchAll(/[\u4e00-\u9fff]+/g)) {
    const start = m.index ?? 0
    if (start > cursor) out.push(...fragmentsInSegment(raw.slice(cursor, start), cursor))
    cursor = start + m[0].length
  }
  if (cursor < raw.length) out.push(...fragmentsInSegment(raw.slice(cursor), cursor))
  return out
}

/**
 * 错误特征：errno 码 / 错误类名 / 错误语义词。
 *
 * 三类各自对应真实样本里的一类错误消息：
 *  - **errno 码**（`EACCES` `ENOENT` `EADDRINUSE` `ECONNREFUSED`）：Node 的错误码。
 *  - **错误类名**（`SyntaxError` `TypeError` `SQLITE_ERROR`）：运行时与库抛的类型名。
 *  - **错误语义词**（`failed` `denied` `invalid` `unexpected` `no such` …）：
 *    没有码也没有类名时的通用描述（`Failed to fetch` / `fetch failed`）。
 *
 * ⚠️ 刻意**不收**「命令动词」类词（`rebuild` `install` `run` `sync` `diff`）：
 * 它们出现在本仓的中文人话里（`请升级 CLI（npx openvibe-cli@latest）后重试`），
 * 收进来会把人话里的命令切走。
 */
const ERRNO_RE = /\bE[A-Z]{2,}\b/
const ERROR_NAME_RE = /\b\w*Error\b/
const ERROR_SEMANTIC_RE =
  /\b(fail(ed|s)?|denied|not found|invalid|unexpected|permission|cannot|can't|no such|not supported|missing|refused|incorrect|not a|aborted|compiled against|entered is not)\b/i

/** 片段是否带错误特征（据此决定切走还是留在人话通道） */
function isErrorish(text: string): boolean {
  return ERRNO_RE.test(text) || ERROR_NAME_RE.test(text) || ERROR_SEMANTIC_RE.test(text)
}

/** 单个非 CJK 段内的英文诊断区间 */
function fragmentsInSegment(text: string, offset: number): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = []
  const pieces = scanSegment(text, offset)
  let runStart = -1
  let runEnd = -1
  const flush = (): void => {
    if (runStart >= 0) {
      const fragment = text.slice(runStart - offset, runEnd - offset)
      if (isErrorish(fragment)) out.push({ start: runStart, end: runEnd })
    }
    runStart = -1
    runEnd = -1
  }
  for (const p of pieces) {
    if (p.kind === 'word') {
      if (runStart < 0) runStart = p.start
      runEnd = p.end
      continue
    }
    if (p.kind === 'soft') {
      // 修饰性词元：跟在片段里就一起带走（`at position 0` 的 `0`、`open '/tmp/x'` 的路径）
      if (runStart >= 0) runEnd = p.end
      continue
    }
    flush()
  }
  flush()
  return out
}

/**
 * 片段的**移除范围**：比英文本体大一点，把包着它的排版符号一并清掉。
 *
 * 两处要清：
 *  - **外层成对括号**：`删除失败（EACCES: permission denied）`——括号是中文
 *    文案的排版，不属于诊断原文。清掉它，人话通道才不会剩一个孤立的 `（`。
 *  - **引导冒号**：`写入 X 失败：EACCES: permission denied。已完成 1/2 项`——
 *    冒号是中文子句与英文诊断的分界，英文切走后它会悬在原地变成「失败：。」。
 *
 * ⚠️ 移除范围 ≠ detail 内容：detail 只取英文本体（`EACCES: permission denied`），
 * 括号与冒号是人话侧的排版，不进诊断通道。
 */
function widenCut(raw: string, start: number, end: number): { start: number; end: number } {
  const OPEN = '（('
  const left = raw.slice(0, start).replace(/\s+$/, '')
  const lastChar = left[left.length - 1] ?? ''
  if (lastChar !== '' && OPEN.includes(lastChar)) {
    // 这对括号包住整个片段 ⇒ 连括号一起切走
    const after = raw.slice(end)
    const closeIdx = after.search(/[）)]/)
    if (closeIdx >= 0 && after.slice(0, closeIdx).trim() === '') {
      return { start: left.length - 1, end: end + closeIdx + 1 }
    }
    return { start, end }
  }
  // 引导冒号：与英文诊断同进同出，避免人话通道留下「失败：。」
  if (lastChar === '：' || lastChar === ':') return { start: left.length - 1, end }
  return { start, end }
}

/**
 * 把一条错误文本拆成「人话」与「诊断原文」两个通道。
 *
 * ## 判据（三级）
 *
 * 1. **不含中文** ⇒ 整条是机器串（Node/第三方/代理抛出的英文原文）：
 *    人话位置给一句中文兜底，原文整条进 detail。
 * 2. **含中文且没有「英文诊断片段」** ⇒ 本仓自己写的文案（可能内嵌标识符、路径、
 *    URL、版本号、关键词清单、**修复命令**），原样进人话通道。
 * 3. **含中文但夹着「英文诊断片段」** ⇒ 半中半英的第三方文案（如
 *    `不是合法 JSON：Unexpected token < in JSON at position 0`）：
 *    把诊断片段切出来进 detail，人话位置只留中文部分。
 *
 * ## 「英文诊断片段」怎么认
 *
 * **片段带错误特征才算诊断**（errno 码 / 错误类名 / 错误语义词）。
 *
 * ⚠️ 判据**不是**「词数 ≥3」：用真实样本校准后发现 `npm rebuild better-sqlite3`
 * （修复命令，3 词）与 `spawn xdg-open ENOENT`（错误消息，3 词）词数相同，
 * 按词数切必然误伤一边，而误伤的一边是**本仓写给人看的命令**。
 * 校准样本见 `apps/cli/test/split-calibration.test.ts`。
 *
 * 切分（强边界标点 / 列表分隔符 / 路径）仍保留：它保证「标签词留在人话、
 * 诊断进 detail」（`不是合法 JSON：Unexpected token ...` ⇒ 人话留 `不是合法 JSON`）。
 *
 * ## 为什么不按错误类名分类
 *
 * 那要维护一份 14 个类名的清单，新增一个错误类就漏；而「本仓文案是中文」
 * 这条是随代码写出来的事实，不需要清单去追。
 *
 * ## 为什么保留英文原文
 *
 * 排障要用（`EACCES`、`NODE_MODULE_VERSION`、`SQLITE_ERROR: no such table`）。
 * 它进 `printer.fail` 的 detail 参数，人读模式缩进打印，--json 模式进
 * `summary.error.detail`。
 */
export function splitMessage(raw: string): { message: string; detail?: string } {
  if (!CJK_RE.test(raw)) return { message: '执行失败', detail: raw }

  const fragments = englishFragments(raw)
  if (fragments.length === 0) return { message: raw }

  // 按区间切除（不靠字符串替换：原文里可能有多空格/换行，替换会失配）
  let message = ''
  const details: string[] = []
  let cursor = 0
  for (const f of fragments) {
    const cut = widenCut(raw, f.start, f.end)
    message += raw.slice(cursor, cut.start)
    // detail 只取英文本体：括号与冒号是人话侧的排版，不进诊断通道
    details.push(raw.slice(f.start, f.end))
    cursor = cut.end
  }
  message += raw.slice(cursor)
  message = message
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[：:，,、；;]+$/, '')
  return { message: message === '' ? '执行失败' : message, detail: details.join('\n') }
}

/**
 * `splitMessage` 的展开形式，供 `printer.fail(code, ...splitArgs(raw))` 直接接住。
 *
 * 存在的理由是可读性：调用点不必为第三个参数写一段条件，也不必先解构两行。
 *
 * @param explicitDetail 已知来源的诊断原文（错误类自带的 `detail` 字段）。
 *   它**优先于**内容判定：那个字段是构造者明确放的（已知是诊断原文），
 *   而内容判定只是「猜」的（看到英文就猜它是诊断）。
 *
 * ⚠️ 两者**不互相吞掉**：显式 detail 与内容判定出的英文片段都进 detail 通道，
 * 前者在前、后者在后。吞掉后者等于把诊断信息静默丢弃（那正是分通道要解决的问题）。
 */
export function splitArgs(raw: string, explicitDetail?: string): [string, string?] {
  const { message, detail } = splitMessage(raw)
  const explicit =
    explicitDetail !== undefined && explicitDetail !== '' ? explicitDetail : undefined
  if (explicit === undefined) return detail === undefined ? [message] : [message, detail]
  if (detail === undefined) return [message, explicit]
  return [message, `${explicit}\n${detail}`]
}

/**
 * 命令层 outcome 的提示形态：**人话**与**诊断原文**两路。
 *
 * `warnings` 是**对外契约**（`--json` 的 `summary.warnings` 是 `string[]`，
 * 脚本按 `jq '.summary.warnings[]'` 读）⇒ 元素类型不动。
 * `warningDetails` 与 `warnings` **同序等长**，多出的一路专门放诊断原文：
 * 没有诊断的位置是 `undefined`。
 *
 * ⚠️ 为什么同序等长而不是稀疏表：命令层多处把 warnings 从子函数
 * `push(...sub.warnings)` 汇入，稀疏表在汇入时要重算下标，容易错位；
 * 同序等长则两条数组永远一一对应。
 */
export interface WarningsCarrier {
  warnings: string[]
  warningDetails?: (string | undefined)[]
}

/**
 * 提示收集器：一次 push 同时记下人话与诊断原文，**天然同序**。
 *
 * 存在的理由：命令层的 warnings 有多条产出路径（有的从子函数整段汇入、
 * 有的在 catch 里追加），分开维护 `string[]` 与 detail 数组必然错位。
 * 收进一个收集器后，错位在结构上不可能发生。
 *
 * @param base 外部已有的提示数组（直接复用同一引用，不复制）。
 *   测试与 CLI 入口都靠它读回实际产出的提示。
 */
export interface WarningBag {
  /** 与 `warnings` 同序等长的诊断原文（没有诊断的位置是 undefined） */
  readonly warningDetails: (string | undefined)[]
  push(message: string, detail?: string): void
}

export function createWarningBag(base: string[] = []): WarningBag {
  const details: (string | undefined)[] = new Array<string | undefined>(base.length).fill(undefined)
  return {
    warningDetails: details,
    push(message: string, detail?: string): void {
      base.push(message)
      details.push(detail)
    },
  }
}

/**
 * 把命令层的提示逐条打到 printer（诊断原文一并带上）。
 *
 * 存在的理由是收口：`index.ts` 有十来处 `for (const w of x.warnings) printer.warn(w)`，
 * 每处各写一遍「取同序 detail」会漏。
 */
export function emitWarnings(printer: Printer, source: WarningsCarrier): void {
  for (let i = 0; i < source.warnings.length; i += 1) {
    printer.warn(source.warnings[i] ?? '', source.warningDetails?.[i])
  }
}

/** 计划数组 → 五状态计数（五类恒在，顺序固定）+ 需实际写入条数 */
export function summarizePlan(items: PlanItem[]): {
  counts: Record<SyncState, number>
  pending: number
} {
  const counts = Object.fromEntries(SYNC_STATES.map((s) => [s, 0])) as Record<SyncState, number>
  for (const item of items) counts[item.state] += 1
  return { counts, pending: items.filter((i) => i.action !== 'skip').length }
}

export function createPrinter(options: PrinterOptions): Printer {
  const write = options.write ?? ((s: string) => void process.stdout.write(s))
  const writeErr = options.writeErr ?? ((s: string) => void process.stderr.write(s))
  const colors = pc.createColors(options.color ?? pc.isColorSupported)
  const collected: Warning[] = []
  const { command, json } = options

  /**
   * 把收集到的提示折进 summary。
   *
   * ⚠️ **`summary.warnings` 的元素类型不动**（仍是 `string[]`）：它是 `--json`
   * 对外契约（m6b §5.1 信封附加键），脚本按 `jq '.summary.warnings[]'` 读，
   * 改成对象数组就是形状变更。
   *
   * 诊断原文另走**新增键** `summary.warningDetails`：只收录**确实有诊断原文**的
   * 那几条（稀疏数组），每项 `{message, detail}`。这样：
   *  - 老脚本读 `warnings` 照旧拿到中文人话；
   *  - 排障要的英文原文不丢（不必混进中文句子）；
   *  - 无诊断信息的提示不产生噪声字段（与 `summary.error.detail` 同一纪律）。
   */
  const warningsInto = (summary: Summary): void => {
    if (collected.length === 0) return
    summary.warnings = collected.map((w) => w.message)
    const withDetail = collected
      .map((w, i) =>
        w.detail === undefined ? undefined : { index: i, message: w.message, detail: w.detail },
      )
      .filter((x): x is { index: number; message: string; detail: string } => x !== undefined)
    if (withDetail.length > 0) summary.warningDetails = withDetail
  }

  const paint = (state: SyncState, text: string): string => {
    switch (state) {
      case 'NEW':
        return colors.green(text)
      case 'IN_SYNC':
        return colors.dim(text)
      case 'UPDATE':
        return colors.cyan(text)
      case 'CONFLICT':
        return colors.yellow(text)
      case 'DRIFT':
        return colors.magenta(text)
    }
  }

  return {
    mode: json ? 'json' : 'human',
    info(line) {
      if (!json) write(`${line}\n`)
    },
    warn(message, detail) {
      collected.push(detail === undefined || detail === '' ? { message } : { message, detail })
      if (!json) {
        write(`${colors.yellow('提示')} ${message}\n`)
        // 诊断原文缩进成块：一眼看出「这是细节，不是结论」（与 fail 同一形态）
        if (detail !== undefined && detail !== '') {
          for (const line of detail.split('\n')) write(`  ${line}\n`)
        }
      }
    },
    plan(items) {
      if (json) return
      write(`${pad('状态', STATE_WIDTH)} ${pad('路径', PATH_WIDTH)} 动作\n`)
      for (const item of items) {
        const backup = item.backupPath ? `  备份 ${item.backupPath}` : ''
        write(
          `${paint(item.state, pad(item.state, STATE_WIDTH))} ${pad(item.path, PATH_WIDTH)} ${item.action}${backup}\n`,
        )
      }
    },
    result(envelope) {
      if (json) {
        const summary: Summary = { ...envelope.summary }
        warningsInto(summary)
        const out: CliEnvelope = {
          command,
          ...(envelope.plan ? { plan: envelope.plan } : {}),
          ...(envelope.report ? { report: envelope.report } : {}),
          summary,
        }
        write(`${JSON.stringify(out, null, 2)}\n`)
        return
      }
      const counts = envelope.summary.counts as Partial<Record<SyncState, number>> | undefined
      if (counts)
        write(`${SYNC_STATES.map((s) => `${paint(s, s)} ${counts[s] ?? 0}`).join('  ')}\n`)
    },
    fail(code, message, detail) {
      const hasDetail = detail !== undefined && detail !== ''
      if (json) {
        const summary: Summary = {
          ok: false,
          error: { code, message, ...(hasDetail ? { detail } : {}) },
        }
        warningsInto(summary)
        write(`${JSON.stringify({ command, summary }, null, 2)}\n`)
        return
      }
      writeErr(`${colors.red('错误')} [${code}] ${message}\n`)
      // 诊断原文单独成块：缩进 + 逐行缩进，一眼看出「这是细节，不是结论」。
      // 人读模式下它必须仍然出现——FR-3 的三要素诊断（ABI/平台/修复命令）就在这里。
      if (hasDetail) {
        for (const line of detail.split('\n')) writeErr(`  ${line}\n`)
      }
    },
    warnings: () => [...collected],
  }
}
