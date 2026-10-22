#!/usr/bin/env tsx
/**
 * `scripts/export-agent-memory.ts` —— 把 agent 记忆目录**导出进仓**（`docs/agent-memory/`）。
 *
 * ## 它解决什么
 *
 * 记忆文件（`MEMORY.md` ＋ `topics/*.md`）原本只活在 agent 的**本机数据目录**里：
 * 换机器、换 profile、清理 profile 都会丢。⇒ 本脚本把它们导出进仓，随版本化走，
 * 另一台机器 clone 后直接可读。
 *
 * ## 它做什么
 *
 * 1. 读源目录的 `MEMORY.md` 与 `topics/*.md`；
 * 2. **逐条自证**（不产出「看起来对」的导出件）：
 *    - 索引里点名的每个 topic 文件都存在；
 *    - 每个 topic 文件非空、且带 `Type:` 标记；
 *    - 导出件与源**逐字节相同**（sha256 比对）；
 *    - 生成的 `README.md` **零绝对路径**（`/Users/`、`/home/`、`C:\` 全零命中）——
 *      这条是「零本机路径」纪律的机器形态，本仓的文档治理闸不查它，所以本脚本自带。
 * 3. 写 `docs/agent-memory/README.md`（来源 profile ＋ 导出日 ＋ 清单 ＋ 复算命令）。
 *
 * ## 零依赖
 *
 * 只用 node 内建模块（`node:fs` / `node:path` / `node:os` / `node:crypto` / `node:url`）。
 *
 * ```bash
 * npx tsx scripts/export-agent-memory.ts --from ~/.minimax/agents/<profile>/memory
 * ```
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 导出目录的识别标记 —— 清空前必须确认它存在，否则不许动那个目录 */
export const EXPORT_MARKER = '<!-- openvibe:agent-memory-export -->'

/** 索引里一条目的形状：`| 标题 | 要点 |`（表头行与分隔行不算） */
const INDEX_ROW = /^\|\s*(?!\s*条目\s*\|)(?!\s*-{2,})(.+?)\s*\|\s*(.+?)\s*\|\s*$/

/**
 * 解析 `MEMORY.md` 索引：主题名 → 该主题的条目行数。
 *
 * **纯函数**（不碰文件系统）—— 检查器能直接调它，不用先造目录。
 *
 * @returns 主题名 → 条目行数（按 `## 主题（name）` 分组）
 */
export function parseIndexCounts(md: string): Map<string, number> {
  const out = new Map<string, number>()
  let current: string | null = null
  for (const line of md.split('\n')) {
    const head = /^##\s.*?（([a-z][a-z0-9-]*)）/.exec(line)
    if (head?.[1]) {
      current = head[1]
      if (!out.has(current)) out.set(current, 0)
      continue
    }
    if (!current) continue
    const row = INDEX_ROW.exec(line)
    if (row) out.set(current, (out.get(current) ?? 0) + 1)
  }
  return out
}

/** 索引里点名的 topic 文件（按索引出现顺序） */
export function indexTopicNames(md: string): string[] {
  const out: string[] = []
  for (const name of parseIndexCounts(md).keys()) {
    if (!out.includes(name)) out.push(name)
  }
  return out
}

/** 绝对路径形态（导出件里一个都不许有） */
export function absolutePathHits(text: string): string[] {
  const patterns = [/\/Users\//i, /\/home\/[a-z]/i, /[A-Za-z]:\\/, /^\/private\/var\//m]
  return patterns.filter((p) => p.test(text)).map((p) => p.source)
}

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

export interface ExportOptions {
  /** 源记忆目录 */
  from: string
  /** 导出目标目录 */
  to: string
  /** 来源 profile 名（默认取源目录的上一级目录名） */
  profile: string
  /** 导出日（绝对日期，`YYYY-MM-DD`） */
  date: string
}

export interface ExportResult {
  /** 导出的文件相对目标目录的路径 */
  files: string[]
  /** 索引里的条目总数 */
  entryCount: number
  /** 每个主题的条目数 */
  topicCounts: Map<string, number>
  /** sha256（源 → 导出件逐字节相同） */
  digests: Record<string, string>
}

function parseArgs(argv: string[]): ExportOptions {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  let from = ''
  let to = join(repoRoot, 'docs', 'agent-memory')
  let profile = ''
  let date = new Date().toISOString().slice(0, 10)
  // 两种写法都收：`--key=value` 与 `--key value`
  const raw = new Map<string, string>()
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a?.startsWith('--')) continue
    const eq = a.indexOf('=')
    if (eq > 0) {
      raw.set(a.slice(2, eq), a.slice(eq + 1))
    } else {
      const next = argv[i + 1]
      if (next !== undefined && !next.startsWith('--')) {
        raw.set(a.slice(2), next)
        i++
      } else {
        raw.set(a.slice(2), '')
      }
    }
  }
  from = (raw.get('from') ?? '').replace(/^~\//, `${homedir()}/`)
  const toArg = raw.get('to')
  if (toArg) to = resolve(toArg)
  profile = raw.get('profile') ?? ''
  const dateArg = raw.get('date')
  if (dateArg) date = dateArg
  if (!from) {
    throw new Error('用法：npx tsx scripts/export-agent-memory.ts --from <记忆目录> [--to <导出目录>] [--profile <名>] [--date YYYY-MM-DD]')
  }
  from = resolve(from)
  if (!profile) profile = basename(dirname(from))
  return { from, to, profile, date }
}

/**
 * 执行导出。
 *
 * **纯逻辑与 IO 分离**：`buildReadme` 是纯函数（给内容即可生成 README），
 * 便于测试直接断言它的产出。
 */
export function exportAgentMemory(opts: ExportOptions): ExportResult {
  const indexPath = join(opts.from, 'MEMORY.md')
  if (!existsSync(indexPath)) throw new Error(`源目录没有 MEMORY.md：${opts.from}`)
  const indexMd = readFileSync(indexPath, 'utf8')

  const topicCounts = parseIndexCounts(indexMd)
  const entryCount = [...topicCounts.values()].reduce((a, b) => a + b, 0)
  const names = indexTopicNames(indexMd)

  const topicDir = join(opts.from, 'topics')
  if (!existsSync(topicDir)) throw new Error(`源目录没有 topics/：${opts.from}`)
  const onDisk = readdirSync(topicDir)
    .filter((f) => f.endsWith('.md'))
    .sort()

  // ① 索引点名的每个 topic 必须存在
  for (const n of names) {
    if (!onDisk.includes(`${n}.md`)) throw new Error(`索引点名的 topic 不存在：topics/${n}.md`)
  }
  // ② 每个 topic 非空且带 Type 标记
  const bodies = new Map<string, string>()
  for (const f of onDisk) {
    const body = readFileSync(join(topicDir, f), 'utf8')
    if (body.trim().length === 0) throw new Error(`topic 是空文件：topics/${f}`)
    if (!/^Type:\s*\S/m.test(body)) throw new Error(`topic 缺 Type 标记：topics/${f}`)
    bodies.set(f, body)
  }

  // ③ 目标目录只清「自己管的那部分」—— 必须带标记才许清
  const targetIndex = join(opts.to, 'MEMORY.md')
  const targetTopics = join(opts.to, 'topics')
  if (existsSync(opts.to)) {
    const markerPath = join(opts.to, 'README.md')
    const hasMarker = existsSync(markerPath) && readFileSync(markerPath, 'utf8').includes(EXPORT_MARKER)
    if (!hasMarker && !isPartialExport(opts.to)) {
      throw new Error(`目标目录没有导出标记，拒绝清理：${opts.to}（先手动确认或换个 --to）`)
    }
    rmSync(targetTopics, { recursive: true, force: true })
    rmSync(targetIndex, { force: true })
  }
  mkdirSync(targetTopics, { recursive: true })
  writeFileSync(targetIndex, indexMd, 'utf8')
  for (const [f, body] of bodies) writeFileSync(join(targetTopics, f), body, 'utf8')

  // ④ 导出件与源逐字节相同
  const digests: Record<string, string> = {}
  digests['MEMORY.md'] = sha256(indexMd)
  for (const [f, body] of bodies) digests[`topics/${f}`] = sha256(body)
  if (sha256(readFileSync(targetIndex, 'utf8')) !== digests['MEMORY.md']) {
    throw new Error('导出件的 MEMORY.md 与源不是逐字节相同')
  }
  for (const [f] of bodies) {
    if (sha256(readFileSync(join(targetTopics, f), 'utf8')) !== digests[`topics/${f}`]) {
      throw new Error(`导出件与源不是逐字节相同：topics/${f}`)
    }
  }

  const files = ['MEMORY.md', ...[...bodies.keys()].map((f) => `topics/${f}`)]
  const readme = buildReadme({ opts, files, entryCount, topicCounts, names })
  // ⑤ 生成的 README 零绝对路径
  const hits = absolutePathHits(readme)
  if (hits.length > 0) throw new Error(`生成的 README 含绝对路径形态：${hits.join(' , ')}`)
  writeFileSync(join(opts.to, 'README.md'), readme, 'utf8')

  return { files, entryCount, topicCounts, digests }
}

/**
 * 「半份导出」判定：目录里**只有**本脚本管的那几件（`MEMORY.md` ＋ `topics/*.md`）。
 *
 * **为什么要这一条**：上一次导出若在写 README 前失败（例如 README 自己的零绝对路径
 * 检查没过），目录里会留下半份内容而**没有标记文件** ⇒ 只认标记的话，重跑会死锁，
 * 人只能手动删目录。
 *
 * ⚠️ 判定**很严**：只认「恰好是这两样」；多一个文件就当不是导出目录，拒绝清理。
 */
export function isPartialExport(dir: string): boolean {
  const entries = readdirSync(dir)
  // 空目录 ⇒ 没有东西可删，直接安全
  if (entries.length === 0) return true
  const allowed = new Set(['MEMORY.md', 'topics'])
  if (entries.some((e) => !allowed.has(e))) return false
  if (!entries.includes('MEMORY.md')) return false
  const topicsDir = join(dir, 'topics')
  if (!existsSync(topicsDir)) return false
  return readdirSync(topicsDir).every((f) => f.endsWith('.md'))
}

/** 生成导出目录的 README（纯函数） */
export function buildReadme(input: {
  opts: ExportOptions
  files: string[]
  entryCount: number
  topicCounts: Map<string, number>
  names: string[]
}): string {
  const { opts, files, entryCount, topicCounts, names } = input
  const rows = names
    .map((n) => `| \`topics/${n}.md\` | **${topicCounts.get(n) ?? 0}** |`)
    .join('\n')
  return `${EXPORT_MARKER}
# agent 记忆（导出件）

> 这是 **agent 的工作记忆**（跨项目教训，不只属于本仓）的**导出件**。
> 源在 agent 的本机数据目录（\`~/.minimax/agents/<profile>/memory/\`）——
> 导出进仓是为了**可移植**：换机器、换 profile、清理 profile 之后，仓里这一份仍在。

| 项 | 值 |
|---|---|
| 来源 profile | **${opts.profile}** |
| 导出日 | **${opts.date}** |
| 索引条目数 | **${entryCount}** |
| 导出文件数 | **${files.length} + 1**（本 README） |

## 文件清单

| 文件 | 条目数 |
|---|---|
${rows}

## 复算命令

\`\`\`bash
# 条目数复算：数索引表的数据行（表头与分隔行不算）
npx tsx scripts/export-agent-memory.ts --from ~/.minimax/agents/${opts.profile}/memory --date ${opts.date}
\`\`\`

## 这份导出件的三条自证（导出脚本自跑，失败即报错）

1. **索引点名的每个 topic 都存在** —— 少一个就报错，不产出半份导出件；
2. **每个 topic 非空且带 \`Type:\` 标记**；
3. **导出件与源逐字节相同**（sha256 比对）——
   以及本 README **零绝对路径**（用户目录形态、home 目录形态、Windows 盘符形态三者全零命中；
   ⚠️ **这条规则不能在本文件里写出它自己的字面量** —— 写出来就会被自己的检查抓到，
   所以上面只描述形态、不复写样例）。

⚠️ **源改了要重导**：这份是**点时导出件**（见上方「导出日」），
不是实时镜像；改动请在源目录里做，再重跑上面的命令。
`
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
if (isMain) {
  try {
    const opts = parseArgs(process.argv.slice(2))
    const res = exportAgentMemory(opts)
    process.stdout.write(
      `[export-agent-memory] 导出完成 → ${opts.to}\n` +
        `  · profile=${opts.profile} · 导出日=${opts.date}\n` +
        `  · 索引条目数=${res.entryCount} · 文件数=${res.files.length} + README.md\n`,
    )
  } catch (e) {
    process.stderr.write(`[export-agent-memory] 失败：${e instanceof Error ? e.message : String(e)}\n`)
    process.exitCode = 1
  }
}
