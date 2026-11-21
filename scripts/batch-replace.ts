#!/usr/bin/env tsx
/**
 * `scripts/batch-replace.ts` —— 批量文本替换工具（**白名单 + 单遍 + 嵌套自检**）。
 *
 * ## 它解决什么
 *
 * 存量文档的批量改写（例如 C-7 把「裸 `.md` 引用」统一成 markdown 链接）不适合手写：
 * 处数多、格式有细微差别、改错一处就污染一片。但**手写脚本本身就翻过两次车**：
 *
 * | 版本 | 翻法 | 后果 |
 * |---|---|---|
 * | 第一版 | 「两轮替换」 | 第二轮把第一轮的产物再包一层 ⇒ `[[x.md](./x.md)](./[x.md](./x.md))` |
 * | 第二版 | 正则误匹配已链接形态 | 85 处过度替换（预期 13 处），**且改动了并行会话的未跟踪文件** |
 *
 * 两次都不是「正则写错」这么简单，而是**缺三条纪律**。本工具把它们做成结构性约束：
 *
 * ① **白名单** —— `files` 逐字给定，不在表内的一律不读不写（不「扫目录全改」）。
 * ② **单遍** —— 每行先由 `scan` 产出**全部** token，再一次性应用到**原文**；
 *    替换产物**永不二次入扫** ⇒ 结构上不可能出现嵌套。
 * ③ **嵌套自检** —— 每行替换后跑 `findNestedLinks`；命中即**整个文件不落盘**
 *    （不是「跳过那一行继续改」—— 半改的文件比不改更难查）。
 *
 * ## 判据与改写器同口径
 *
 * 链接与 specs 文件名的两条正则**从 `scripts/context-check.ts` 导入**（不再抄一份）：
 * 改写器按自己的理解改、判据按另一份理解判 ⇒ 迁移看着成功、C-7 仍报红。
 *
 * ## 零依赖
 *
 * 只用 node 内建模块（`node:fs` / `node:path`）。
 *
 * ```bash
 * npx tsx scripts/batch-replace.ts --preset specs-link --dir docs/specs           # 预演（不落盘）
 * npx tsx scripts/batch-replace.ts --preset specs-link --dir docs/specs --write    # 真改
 * npx tsx scripts/batch-replace.ts --preset specs-link --dir docs/specs --write --verify
 * ```
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { MD_LINK_RE, reportNonLinkedRefs } from './context-check'

/* ════════════════════════════════════════════════════════ 纯函数：单遍替换 */

export interface ReplaceToken {
  /** 命中起点（0 基，含） */
  start: number
  /** 命中终点（0 基，不含） */
  end: number
  /** 替换文本；`null` = 保留原文（该区间视为已占用，后续 token 不与它重叠） */
  to: string | null
}

export interface TokenContext {
  file: string
  /** 行号（1 起） */
  lineNo: number
}

/**
 * 行内 token 扫描器。约定：
 * - 同一位置可以返回多个 token，**先命中者（`start` 小）优先**，重叠的直接丢弃；
 * - 已处理成链接的区间应由扫描器自己用 `to: null` 占位，避免里面的文件名被再匹配。
 */
export type TokenScanner = (line: string, ctx: TokenContext) => ReplaceToken[]

export interface LineEdit {
  start: number
  end: number
  from: string
  to: string
}

export interface LineResult {
  text: string
  edits: LineEdit[]
}

/**
 * 对**一行**做单遍替换。
 *
 * ## 为什么这是「单遍」
 *
 * 所有 token 在**原文**上确定完毕后才开始拼串；拼串只读原文、不再扫描产物
 * ⇒ 无论 `to` 里含什么，都不可能被自己那条规则再命中（纪律②）。
 */
export function replaceLine(line: string, scan: TokenScanner, ctx: TokenContext): LineResult {
  const tokens = [...scan(line, ctx)].sort((a, b) => a.start - b.start)
  let text = ''
  let copied = 0
  let cursor = 0
  const edits: LineEdit[] = []
  for (const t of tokens) {
    if (t.start < cursor) continue
    cursor = t.end
    if (t.to === null) continue
    text += line.slice(copied, t.start) + t.to
    edits.push({ start: t.start, end: t.end, from: line.slice(t.start, t.end), to: t.to })
    copied = t.end
  }
  text += line.slice(copied)
  return { text, edits }
}

/* ════════════════════════════════════════════════════════ 纯函数：嵌套自检 */

/** 通用 markdown 链接（**不要求目标含 `.md`**）——嵌套自检用，比判据正则宽是刻意的 */
const GENERAL_LINK_RE = /\[[^\]]*\]\([^)]*\)/g

/**
 * 找出文本里的**嵌套链接**。
 *
 * 两个无歧义的签名：
 * ① `[[` —— 链接标签里又起了个链接（`[[x.md](./x.md)](./x.md)`）；
 * ② 剥掉所有合法链接后**仍剩 `](`** —— 有链接没被识别成合法形态（即嵌套）。
 *
 * ⚠️ 只报数不修：修嵌套需要判断「哪一层是用户想要的」，机器猜不了。
 */
export function findNestedLinks(text: string): string[] {
  const hits: string[] = []
  for (const m of text.matchAll(/\[\[/g)) {
    hits.push(text.slice(m.index ?? 0, (m.index ?? 0) + 40))
  }
  // 剥掉所有合法链接后仍剩 `](` ⇒ 有链接没被识别成合法形态（即嵌套）
  const rest = text.replace(GENERAL_LINK_RE, '')
  if (rest.includes('](')) hits.push(rest.trim().slice(0, 40))
  return hits
}

/* ════════════════════════════════════════════════════════ 批量驱动 */

export interface BatchReplaceOptions {
  /** **白名单**：只有表内文件会被读；不在表内的一律不碰（纪律①） */
  files: string[]
  scan: TokenScanner
  /** 行过滤器：返回 false 的行原样保留（例如「只改头部两行」） */
  lineFilter?: (line: string, lineNo: number) => boolean
  /** 自定义嵌套判定（默认 `findNestedLinks`） */
  detectNested?: (text: string) => string[]
  /** 缺省只预演；`--write` 才落盘 */
  dryRun?: boolean
  readFile?: (file: string) => string
  writeFile?: (file: string, content: string) => void
}

export interface NestedViolation {
  file: string
  lineNo: number
  snippets: string[]
}

export interface BatchReplaceStats {
  filesScanned: number
  /** 有改动的文件（`dryRun` 下是「会改」） */
  filesChanged: string[]
  totalEdits: number
  /** 因嵌套自检不过而被**整体跳过**的文件（一个字节都没写） */
  blockedFiles: string[]
  nestedViolations: NestedViolation[]
  dryRun: boolean
}

/**
 * 跑一遍批量替换。
 *
 * **落盘粒度是文件**：某文件任一行自检不过 ⇒ 该文件整体不写（`blockedFiles`）。
 * 半改的文件比不改更难查 —— 读者会以为「这个文件已经是改过的形态」。
 */
export function batchReplace(opts: BatchReplaceOptions): BatchReplaceStats {
  const readFile = opts.readFile ?? ((f) => readFileSync(f, 'utf8'))
  const writeFile = opts.writeFile ?? ((f, c) => writeFileSync(f, c, 'utf8'))
  const detectNested = opts.detectNested ?? findNestedLinks
  const dryRun = opts.dryRun ?? true

  const stats: BatchReplaceStats = {
    filesScanned: 0,
    filesChanged: [],
    totalEdits: 0,
    blockedFiles: [],
    nestedViolations: [],
    dryRun,
  }

  for (const file of opts.files) {
    const before = readFile(file)
    const lines = before.split('\n')
    let edits = 0
    const violations: NestedViolation[] = []

    for (let i = 0; i < lines.length; i++) {
      const lineNo = i + 1
      const line = lines[i] ?? ''
      if (opts.lineFilter && !opts.lineFilter(line, lineNo)) continue
      const r = replaceLine(line, opts.scan, { file, lineNo })
      if (r.edits.length === 0) continue
      const nested = detectNested(r.text)
      if (nested.length > 0) {
        violations.push({ file, lineNo, snippets: nested })
        continue
      }
      lines[i] = r.text
      edits += r.edits.length
    }

    stats.filesScanned++
    if (violations.length > 0) {
      stats.blockedFiles.push(file)
      stats.nestedViolations.push(...violations)
      continue
    }
    if (edits === 0) continue

    stats.filesChanged.push(file)
    stats.totalEdits += edits
    if (!dryRun) writeFile(file, lines.join('\n'))
  }

  return stats
}

/* ════════════════════════════════════════════════════════ 预设：C-7 引用形态 */

/**
 * C-7 行过滤器：只处理头部 `| 上游` / `| 下游设计` 两行。
 *
 * **为什么不改正文**：正文里提到文件名常常是**讨论对象**（「`xxx.md` 的头部写法不一致」），
 * 不是引用 —— 改它会把讨论记录改坏。
 */
export function headerLineFilter(line: string): boolean {
  return line.startsWith('| 上游') || line.startsWith('| 下游设计')
}

/**
 * C-7 扫描器：把对 `docs/specs/` 内文件的**非链接形态**引用统一成 markdown 链接。
 *
 * 三种输入形态 → 同一种产物 `[xxx.md](./xxx.md)`：
 *
 * | 形态 | 示例 |
 * |---|---|
 * | 带路径反引号 | `` `docs/specs/xxx.md` `` |
 * | 带路径裸写 | `docs/specs/xxx.md` |
 * | 裸名（可带反引号） | `xxx.md` / `` `xxx.md` `` |
 *
 * 已是链接的（`[xxx.md](./xxx.md)`）由 `MD_LINK_RE` 的区间占位（`to: null`）跳过。
 *
 * @param names specs 目录下的 `.md` 文件名集合 —— **只有表内的名字算引用目标**
 *              （`package.md` 之类不在表内的不动）。
 */
export function scanSpecsRefs(names: ReadonlySet<string>): TokenScanner {
  const PATHED_RE = /`?docs\/specs\/([a-z0-9-]+\.md)`?/g
  const BACKTICKED_RE = /`([a-z0-9-]+\.md)`/g
  const BARE_RE = /(?<![a-z0-9-/.])([a-z0-9-]+\.md)(?![a-z0-9-])/g

  return (line) => {
    // 合法链接区间：整段占位，里面的文件名不再参与匹配
    const linked: [number, number][] = []
    for (const m of line.matchAll(MD_LINK_RE)) {
      const s = m.index ?? 0
      linked.push([s, s + m[0].length])
    }
    const isLinked = (s: number, e: number): boolean => linked.some(([a, b]) => s >= a && e <= b)

    const tokens: ReplaceToken[] = []
    const push = (m: RegExpMatchArray): void => {
      const name = m[1] ?? ''
      if (!names.has(name)) return
      const s = m.index ?? 0
      const e = s + m[0].length
      if (isLinked(s, e)) return
      tokens.push({ start: s, end: e, to: `[${name}](./${name})` })
    }

    // 顺序无妨：重叠时 replaceLine 按 start 先命中者优先（带路径的 start 更小）
    for (const m of line.matchAll(PATHED_RE)) push(m)
    for (const m of line.matchAll(BACKTICKED_RE)) push(m)
    for (const m of line.matchAll(BARE_RE)) push(m)
    return tokens
  }
}

/* ════════════════════════════════════════════════════════ CLI */

export interface SpecsLinkPresetOptions {
  dir: string
  write: boolean
  verify: boolean
  json: boolean
}

/**
 * `--preset specs-link`：C-7 引用形态迁移。
 *
 * 白名单 = `dir` 下实存的 `.md`（**不递归**：specs 是平铺目录，递归会碰到子目录里的存档）。
 */
export function runSpecsLinkPreset(opts: SpecsLinkPresetOptions): number {
  const names = new Set(
    readdirSync(opts.dir)
      .filter((n) => n.endsWith('.md'))
      .sort(),
  )
  const files = [...names].map((n) => join(opts.dir, n))

  const stats = batchReplace({
    files,
    scan: scanSpecsRefs(names),
    lineFilter: headerLineFilter,
    dryRun: !opts.write,
  })

  if (opts.json) {
    console.log(JSON.stringify(stats, null, 2))
  } else {
    console.log(`── specs-link 批量替换（${opts.write ? '落盘' : '预演'}）──`)
    console.log(`白名单：${String(files.length)} 个文件（${opts.dir}）`)
    console.log(`改动：${String(stats.filesChanged.length)} 个文件、${String(stats.totalEdits)} 处`)
    for (const f of stats.filesChanged) console.log(`  · ${f}`)
    for (const v of stats.nestedViolations) {
      console.error(`  ✗ 嵌套自检不过：${v.file}:${String(v.lineNo)} ${v.snippets.join(' / ')}`)
    }
    for (const f of stats.blockedFiles) console.error(`  ✗ 已整体跳过（未落盘）：${f}`)
    if (!opts.write) console.log('\n预演模式：加 --write 才落盘。')
  }

  if (stats.nestedViolations.length > 0) return 1

  if (opts.verify && opts.write) {
    // 改写器跑完，**用判据自己复检一遍** —— 「我认为改完了」不算数，判据说 0 才算。
    const remaining = reportNonLinkedRefs(opts.dir, (p) => readFileSync(p, 'utf8'))
    if (remaining.length > 0) {
      console.error(`\n✗ 复检仍报 ${String(remaining.length)} 处非链接引用：`)
      for (const h of remaining) console.error(`  · ${h.file}:${String(h.line)} → ${h.target}`)
      return 1
    }
    if (!opts.json) console.log('\n✓ 复检：C-7 非链接引用 0 处。')
  }

  return 0
}

const USAGE = `用法：
  npx tsx scripts/batch-replace.ts --preset specs-link --dir <dir> [--write] [--verify] [--json]

  --preset specs-link  把头部两行里对 <dir> 内 .md 的裸引用统一成 markdown 链接（C-7）
  --dir <dir>          specs 目录（白名单 = 该目录下实存的 .md，不递归）
  --write             真落盘；缺省只预演
  --verify             落盘后用 C-7 判据复检（应 0 处）
  --json               机器可读输出`

function main(): number {
  const args = process.argv.slice(2)
  if (args.includes('-h') || args.includes('--help') || args.length === 0) {
    console.log(USAGE)
    return args.length === 0 ? 2 : 0
  }
  const preset = args[args.indexOf('--preset') + 1]
  if (preset !== 'specs-link') {
    console.error(`✗ 未知 preset：${preset ?? '(缺)'}（当前仅 specs-link）`)
    console.error(USAGE)
    return 2
  }
  const dirIdx = args.indexOf('--dir')
  const dir = dirIdx >= 0 ? (args[dirIdx + 1] ?? '') : ''
  if (!dir) {
    console.error('✗ 缺 --dir')
    return 2
  }
  return runSpecsLinkPreset({
    dir,
    write: args.includes('--write'),
    verify: args.includes('--verify'),
    json: args.includes('--json'),
  })
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main()
}
