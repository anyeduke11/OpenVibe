/**
 * docs-check 差分 —— 「本轮 vs 上轮」的 warning 清单对比。
 *
 * 输入是两份 `pnpm docs:check --json` 的产物（`{ findings: Finding[] }`）。
 * 输出新增/消失的 warning，并可直接吐 GitHub 注解（`::warning file=…,line=…::`）。
 *
 * ## 三层身份模型（为什么要分三层）
 *
 * ① **规则计数**（`rule`）：最粗、也最稳的一层。它只数「这条规则命中了几次」，
 *    不含任何会随编辑变动的字符串 ⇒ **永不受行号漂移影响**。
 *
 * ② **实例身份**（`rule|归一化 evidence`）：一次具体命中。
 *    归一化要剥掉会漂的东西：
 *    - **行号**（`DEV_LOG.md:215` → `DEV_LOG.md`）：文档上方插一行就漂；
 *    - **基线登记理由**（` · 基线：…`）：基线文件改一个字就漂，而那条理由
 *      描述的是「为什么这条被登记」，与「这条是不是同一条」无关。
 *
 *    ⚠️ **身份不含 message**：同一笔登记（evidence 里的 DEV 号没变）从缺「潜在风险」
 *    变成缺「核心变更」，身份不变、消息变了 —— 这是**事实变化**，单独报 modified，
 *    不报「新增 + 消失」（放进新增会重复计数）。
 *
 * ③ **定位**（`location` / evidence 的 `path:line`）：给人看的「去哪儿修」。
 *    它**不进身份**，只进输出 —— 否则行号一漂，同一条 warning 就被报成
 *    「新增 + 消失」一对，差分只剩噪音。
 *
 * ## 差分口径（四类，逐条对应上面三层）
 *
 * 1. **只比 warning**：error 由 `docs:check` 自己判红，差分不重复它的职责；
 * 2. **计数差无条件报**：规则命中数变了就是变了，这是最稳的一层；
 * 3. **实例差分只对计数变化的规则做**：有些 warning 的**内容天生随登记数变化**
 *    （FR-1.2 断号：号段与清单每登记一笔就变）⇒ 若无条件做实例差分，这类 warning
 *    每一轮都会被报成「新增 1 条 + 消失 1 条」⇒ CI 天天报假增量 ⇒ 这个步骤会被无视。
 *    代价是「一修一增、总数抵消」的情况看不到 —— 这是刻意取舍：
 *    **假增量比漏报更坏**（假红比不红更坏是本仓一贯口径）。
 * 4. **同一身份、消息变了 ⇒ 报 modified，不报新增/消失**：见文件头「身份不含 message」。
 *
 * ## 退出码（三层，与本仓其他脚本一致）
 *
 * | 码 | 含义 |
 * |---|---|
 * | 0 | 差分完成，且**无新增** warning |
 * | 1 | 差分完成，**有新增** warning（报告用；CI 不据此判红） |
 * | 2 | **不可判定**（输入缺失／不是合法 JSON）—— 脚本没跑成，不是「无新增」 |
 *
 * ## 用法
 *
 * ```sh
 * pnpm docs:check --json > this.json          # 本轮
 * pnpm docs:diff -- --json1 prev.json --json2 this.json
 * pnpm docs:diff -- --json1 prev.json --json2 this.json --annotation
 * pnpm docs:diff -- --json1 prev.json --json2 this.json --history test-results/docs-diff-history.json
 * ```
 * `--history <path>`：把本轮快照追加进历史文件并打印跨轮趋势（见下方「历史趋势」段）。
 * CI 里工作流先把上轮历史拷到目标路径再做底，上传时连同本轮 `docs-check.json` 一起归档。
 * */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname } from 'node:path'
import type { Finding } from './docs-check'

/** 基线登记理由的固定分隔（`applyBaseline` 追加） */
const BASELINE_MARK = ' · 基线：'

/**
 * 剥掉 evidence 里的「基线登记理由」后缀。
 *
 * **为什么**：基线文件里那句理由改一个字（人常这么干），会让同一批 warning 的
 * evidence 全变 ⇒ 实例身份全变 ⇒ 差分把「理由改写」报成「整批新增 + 整批消失」。
 * 理由是「为什么被登记」，身份是「是不是同一条」，两者必须分开。
 */
export function stripBaselineNote(evidence: string): string {
  const at = evidence.indexOf(BASELINE_MARK)
  return at < 0 ? evidence : evidence.slice(0, at)
}

/**
 * 剥掉 evidence 开头的行号（`path:line` → `path`）。
 *
 * **为什么**：行号是**绝对行号**，文档上方插一行，下方全部漂 ⇒ 行号进身份
 * 就会让同一批 warning 每轮都被报成「新增 + 消失」。定位靠 `location` 与输出
 * 里的 evidence 保留行号即可，身份不必带它。
 */
export function stripLineNumber(evidence: string): string {
  return evidence.replace(/^([^:]+):\d+/, '$1')
}

/** 实例身份：规则 + 归一化 evidence（不含行号、不含基线理由、**不含 message**） */
export function instanceKey(f: Finding): string {
  return `${f.rule}|${stripLineNumber(stripBaselineNote(f.evidence))}`
}

/**
 * 从 evidence 里抽 `path:line`（定位用，不进身份）。
 *
 * 形态：`path:line`、`path:line · 描述`、`path · 描述`（文件级）、散文。
 * 抽不到行号时返回 `null`（**不猜行号**）。
 */
export function parseEvidenceLocation(evidence: string): { path: string; line: number } | null {
  const base = stripBaselineNote(evidence)
  const m = /^(.*?):(\d+)/.exec(base)
  if (m === null) return null
  return { path: m[1] ?? '', line: Number(m[2]) }
}

/** 取一条 finding 的定位：`location` 优先，缺则解析 evidence */
export function locationOf(f: Finding): { path: string; line: number } | null {
  if (f.location !== undefined) {
    return f.location.line === undefined ? null : { path: f.location.path, line: f.location.line }
  }
  return parseEvidenceLocation(f.evidence)
}

/**
 * 把一条 finding 转成 GitHub 注解行。
 *
 * 有 `path:line` ⇒ `::warning file=…,line=…::`（PR 上直接高亮到那一行）；
 * 只知道文件（文件级／号段级 warning）⇒ `::warning file=…::`（只高亮文件）；
 * 两者皆无 ⇒ `::warning ::`（纯文本，GitHub 当普通行处理，不会崩）。
 */
export function toAnnotation(f: Finding): string {
  const loc = locationOf(f)
  if (loc !== null) {
    return `::warning file=${loc.path},line=${String(loc.line)}::${f.rule} ${f.message}`
  }
  const path = f.location?.path ?? pathOfEvidence(f.evidence)
  if (path !== null) {
    return `::warning file=${path}::${f.rule} ${f.message}`
  }
  return `::warning ::${f.rule} ${f.message}（${f.evidence}）`
}

/**
 * 只抽路径（不抽行号）：文件级 finding 也要能落到文件上。
 *
 * ⚠️ **只认「像路径」的 token**：含 `/`（`docs/specs/`）或已知扩展名（`DEV_LOG.md`）。
 * 散文型／命令型 evidence（`git status --porcelain …`）抽出来的 `git` 不是路径，
 * 不得当 `file=` 用（GitHub 会把不存在的文件当普通文本，但 `file=git` 是垃圾定位）。
 */
export function pathOfEvidence(evidence: string): string | null {
  const base = stripBaselineNote(evidence)
  const m = /^([^:]+?)(?::\d+)?(?:\s|$|·)/.exec(base)
  const path = m?.[1]?.trim()
  if (path === undefined || path === '') return null
  if (!path.includes('/') && !/\.(md|json|ts|tsx|js)$/.test(path)) return null
  return path
}

/** 一条规则在两轮的命中数 */
export interface RuleDelta {
  rule: string
  prev: number
  curr: number
  delta: number
}

/** 差分结果 */
export interface WarningDiff {
  /** 上轮 warning 总数 */
  prevTotal: number
  /** 本轮 warning 总数 */
  currTotal: number
  /** 逐规则计数差（只含计数有变化的规则，按规则号排序） */
  deltas: RuleDelta[]
  /** 本轮各规则计数（全部规则；供历史趋势展示） */
  rules: Record<string, number>
  /** 新增实例（只在计数增长的规则里找） */
  added: Finding[]
  /** 消失实例（只在计数下降的规则里找） */
  removed: Finding[]
  /** 同一身份、消息变化（只在计数不变的规则里找） */
  modified: ModifiedWarning[]
}

/** 同一身份（rule + 归一化 evidence）在两轮都在、但 message 变了 */
export interface ModifiedWarning {
  rule: string
  prevMessage: string
  currMessage: string
  /** 定位（两轮身份相同 ⇒ 定位也相同，取本轮即可） */
  location: { path: string; line: number } | null
}

const warningsOf = (fs: Finding[]): Finding[] => fs.filter((f) => f.level === 'warning')

/**
 * 比两轮 warning 清单。
 *
 * ## 口径（三条，逐条对应上面「三层身份模型」）
 *
 * 1. **只比 warning**：error 由 `docs:check` 自己判红，差分不重复它的职责；
 * 2. **计数差无条件报**：规则命中数变了就是变了，这是最稳的一层；
 * 3. **实例差分只对计数变化的规则做**：见文件头「为什么实例差分按规则计数变化开关」。
 */
export function diffWarnings(prev: Finding[], curr: Finding[]): WarningDiff {
  const prevWarn = warningsOf(prev)
  const currWarn = warningsOf(curr)

  const countBy = (fs: Finding[]): Map<string, number> => {
    const m = new Map<string, number>()
    for (const f of fs) m.set(f.rule, (m.get(f.rule) ?? 0) + 1)
    return m
  }
  const prevCount = countBy(prevWarn)
  const currCount = countBy(currWarn)

  const rules = [...new Set([...prevCount.keys(), ...currCount.keys()])].sort()
  const deltas: RuleDelta[] = []
  for (const rule of rules) {
    const p = prevCount.get(rule) ?? 0
    const c = currCount.get(rule) ?? 0
    if (p !== c) deltas.push({ rule, prev: p, curr: c, delta: c - p })
  }

  const added: Finding[] = []
  const removed: Finding[] = []
  for (const d of deltas) {
    const prevInRule = prevWarn.filter((f) => f.rule === d.rule)
    const currInRule = currWarn.filter((f) => f.rule === d.rule)
    const prevKeys = new Set(prevInRule.map(instanceKey))
    const currKeys = new Set(currInRule.map(instanceKey))
    if (d.delta > 0) {
      for (const f of currInRule) if (!prevKeys.has(instanceKey(f))) added.push(f)
    } else {
      for (const f of prevInRule) if (!currKeys.has(instanceKey(f))) removed.push(f)
    }
  }

  // 计数不变的规则：同身份、消息不同 ⇒ 报 modified（事实变化，但非「新出现」）。
  // ⚠️ 身份在两轮各有 >1 条时，按「身份相同」视作同一笔，逐条比较消息集合。
  const modified: ModifiedWarning[] = []
  for (const rule of rules) {
    if ((prevCount.get(rule) ?? 0) !== (currCount.get(rule) ?? 0)) continue
    const prevInRule = prevWarn.filter((f) => f.rule === rule)
    const currInRule = currWarn.filter((f) => f.rule === rule)
    const prevMsg = new Map<string, Set<string>>()
    for (const f of prevInRule) {
      const set = prevMsg.get(instanceKey(f)) ?? new Set<string>()
      set.add(f.message)
      prevMsg.set(instanceKey(f), set)
    }
    const currMsg = new Map<string, Set<string>>()
    for (const f of currInRule) {
      const set = currMsg.get(instanceKey(f)) ?? new Set<string>()
      set.add(f.message)
      currMsg.set(instanceKey(f), set)
    }
    for (const [key, prevMsgs] of prevMsg) {
      const currMsgs = currMsg.get(key)
      if (currMsgs === undefined) continue // 身份消失 ⇒ 计数变化，已被上面积分处理
      // 消息集合内容相等才算没变：size 相同但内容不同（缺「潜在风险」→ 缺「核心变更」）
      // 是**事实变化**，必须报出来。
      const unchanged =
        prevMsgs.size === currMsgs.size && [...prevMsgs].every((m) => currMsgs.has(m))
      if (unchanged) continue
      const currF = currInRule.find((f) => instanceKey(f) === key)
      modified.push({
        rule,
        prevMessage: [...prevMsgs].join(' ／ '),
        currMessage: [...currMsgs].join(' ／ '),
        location: locationOf(currF ?? currInRule[0]!),
      })
    }
  }

  return {
    prevTotal: prevWarn.length,
    currTotal: currWarn.length,
    deltas,
    rules: Object.fromEntries(currCount),
    added,
    removed,
    modified,
  }
}

/* ════════════════════════════════════════════════════════ 历史趋势 */

/**
 * 差分历史 —— 把每轮结果追加进 `--history <path>`，让「各规则计数」跨轮可见。
 *
 * **为什么需要它**：单轮差分只回答「本轮 vs 上轮差多少」，回答不了
 * 「这几轮是收敛还是在恶化」——同一个 FR-5.1 从 107 涨到 110 再掉回 107，
 * 只看相邻两轮每次都只看到一个 ±3。落盘成时间序列后，趋势一眼可见。
 *
 * 历史文件是 **JSON（schema 1）**：`{ schema, runs: HistoryRun[] }`。
 * 只保留最近 `HISTORY_MAX_RUNS` 轮（防无限膨胀）。
 */

/** 一轮差分的结果快照 */
export interface HistoryRun {
  ts: string
  /** CI 里取 `GITHUB_SHA`；本地为 null */
  sha: string | null
  /** CI 里取 `GITHUB_RUN_ID`；本地为 null */
  runId: string | null
  prevTotal: number
  currTotal: number
  added: number
  removed: number
  modified: number
  /** 本轮各规则计数（全部规则；走势展示用） */
  rules: Record<string, number>
}

/** 历史文件形状；schema 版本号让未来加字段可兼容校验 */
export interface DocsDiffHistory {
  schema: 1
  runs: HistoryRun[]
}

/** 保留最近多少轮（防历史文件无限膨胀） */
const HISTORY_MAX_RUNS = 50

/** 读历史文件；不存在／非法 JSON／schema 不匹配 ⇒ null（视为空历史，从头记） */
export function readHistory(path: string): DocsDiffHistory | null {
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown
    const obj = raw as Partial<DocsDiffHistory>
    if (obj?.schema !== 1 || !Array.isArray(obj.runs)) return null
    return obj as DocsDiffHistory
  } catch {
    return null
  }
}

/** 追加一轮；超限截断到最近 N 轮（纯函数，可测） */
export function appendHistory(history: DocsDiffHistory | null, run: HistoryRun): DocsDiffHistory {
  const runs = [...(history?.runs ?? []), run]
  return { schema: 1, runs: runs.slice(-HISTORY_MAX_RUNS) }
}

/** 把一轮差分转成历史快照 */
export function toHistoryRun(
  d: WarningDiff,
  meta: { ts: string; sha: string | null; runId: string | null },
): HistoryRun {
  return {
    ...meta,
    prevTotal: d.prevTotal,
    currTotal: d.currTotal,
    added: d.added.length,
    removed: d.removed.length,
    modified: d.modified.length,
    rules: d.rules,
  }
}

/** 渲染最近几轮的趋势摘要（最旧→最新；文本表格，CI summary 里包进 ``` 即可） */
export function renderTrend(history: DocsDiffHistory, window = 5): string {
  const runs = history.runs.slice(-window)
  const lines: string[] = []
  lines.push(`── 历史趋势（最近 ${runs.length} 轮，最旧→最新；共记录 ${history.runs.length} 轮）`)
  lines.push('   轮次                 总量      新增 消失 修改')
  runs.forEach((r, i) => {
    const stamp = r.runId !== null ? `run#${r.runId}` : `本地#${i + 1}`
    lines.push(
      `   ${r.ts.slice(0, 19).replace('T', ' ')}  ${stamp.padEnd(12)}  ${String(r.prevTotal).padStart(3)}→${String(r.currTotal).padEnd(3)}   +${String(r.added).padStart(2)}   -${String(r.removed).padStart(2)}   ~${String(r.modified).padStart(2)}`,
    )
  })
  const allRules = [...new Set(runs.flatMap((r) => Object.keys(r.rules)))].sort()
  if (allRules.length > 0) {
    lines.push('   规则          走势（各轮计数）')
    for (const rule of allRules) {
      const seq = runs.map((r) => String(r.rules[rule] ?? 0)).join(' · ')
      lines.push(`   ${rule.padEnd(12)} ${seq}`)
    }
  }
  return lines.join('\n')
}

/** 读一份 `--json` 产物；读不到或不是合法 JSON ⇒ 返回 null（⇒ 退出码 2） */
function readJson(path: string): Finding[] | null {
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    return null
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  const findings = (parsed as { findings?: unknown }).findings
  if (!Array.isArray(findings)) return null
  return findings as Finding[]
}

function main(argv: string[]): number {
  const arg = (flag: string): string | null => {
    const at = argv.indexOf(flag)
    const value = at < 0 ? undefined : argv[at + 1]
    return value ?? null
  }
  const p1 = arg('--json1')
  const p2 = arg('--json2')
  if (p1 === null || p2 === null) {
    console.error('缺参数：--json1 <上轮.json> --json2 <本轮.json>')
    return 2
  }
  const prev = readJson(p1)
  const curr = readJson(p2)
  if (prev === null || curr === null) {
    console.error(
      `输入不可读或不是合法 JSON：${prev === null ? p1 : p2} —— 本轮无法判差分（≠「无新增」）`,
    )
    return 2
  }

  const d = diffWarnings(prev, curr)
  const annotation = argv.includes('--annotation')

  console.log(
    `warning 差分：上一轮 ${String(d.prevTotal)} 条 · 本轮 ${String(d.currTotal)} 条 · 新增 ${String(d.added.length)} 条 · 消失 ${String(d.removed.length)} 条 · 修改 ${String(d.modified.length)} 条`,
  )
  if (d.deltas.length > 0) {
    console.log('── 规则计数差')
    for (const delta of d.deltas) {
      console.log(
        `   ${delta.rule}：${String(delta.prev)} → ${String(delta.curr)}（${delta.delta > 0 ? '+' : ''}${String(delta.delta)}）`,
      )
    }
  }
  for (const f of d.added) {
    if (annotation) console.log(toAnnotation(f))
    else console.log(`  + [${f.rule}] ${f.message}\n      ${stripBaselineNote(f.evidence)}`)
  }
  for (const f of d.removed) {
    console.log(`  - [${f.rule}] ${f.message}\n      ${stripBaselineNote(f.evidence)}`)
  }
  for (const m of d.modified) {
    const pos = m.location === null ? '（无定位）' : `${m.location.path}:${String(m.location.line)}`
    console.log(`  ~ [${m.rule}] ${m.prevMessage} → ${m.currMessage} @ ${pos}`)
  }

  // `--history <path>`：把本轮快照追加进历史文件并打印趋势（本地与 CI 同一条命令）。
  // 文件不存在 ⇒ 从头记（本轮成为第一轮）；CI 里由工作流把上轮历史先拷过来再做底。
  const historyPath = arg('--history')
  if (historyPath !== null) {
    const history = readHistory(historyPath)
    const next = appendHistory(
      history,
      toHistoryRun(d, {
        ts: new Date().toISOString(),
        sha: process.env.GITHUB_SHA ?? null,
        runId: process.env.GITHUB_RUN_ID ?? null,
      }),
    )
    mkdirSync(dirname(historyPath), { recursive: true })
    writeFileSync(historyPath, `${JSON.stringify(next, null, 2)}\n`)
    console.log(renderTrend(next))
  }

  return d.added.length > 0 ? 1 : 0
}

if (process.argv[1] !== undefined && basename(process.argv[1]).startsWith('docs-check-diff')) {
  process.exitCode = main(process.argv.slice(2))
}

export type { Finding }
