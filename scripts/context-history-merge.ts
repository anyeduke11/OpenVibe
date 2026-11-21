/**
 * context:history:merge —— 把多份 `context-check-history.json` 合并进本机历史。
 *
 * ## 为什么需要它
 *
 * 面板的趋势读的是**本机** `test-results/context-check-history.json`。CI 每轮把历史
 * 按 artifact 归档（`context-check-<平台>`），但那在另一台机器上 ⇒ 本机面板看不到。
 * 本脚本把「从 artifact 解出来的历史」按 `at` 去重合并进来，于是同一张趋势表里
 * 同时出现本机与 CI 的轮次。
 *
 * ## 合并口径（三条）
 *
 * 1. **去重键 = `at`（ISO 时间戳）**：每轮只有一个 `at`；重复合并同一份文件不会翻倍。
 *    时间戳是各机器本地时钟，理论上有同毫秒撞车的可能，但概率极低；
 *    真撞了按「后到的覆盖」处理（便于用新文件修正旧数据）。
 * 2. **排序 = `at` 升序**（最旧→最新），与面板/端点的「最旧→最新」口径一致。
 * 3. **上限 = `HISTORY_MAX_RUNS`（50 轮）**：与 `context:check` 的追加上限同源（同一常量）。
 *
 * ## 用法
 *
 * ```sh
 * # 从 CI artifact 解出历史文件后：
 * pnpm context:history:merge -- --from /tmp/ctx-prev/context-check-history.json
 * # 多份（如三个平台各一份）：
 * pnpm context:history:merge -- --from macos.json --from linux.json --from windows.json
 * # 指定目标文件（默认 test-results/context-check-history.json）：
 * pnpm context:history:merge -- --from x.json --out /tmp/merged.json
 * ```
 *
 * 退出码：0 合并完成；2 参数缺失/输入不可读（**不是「合并成功」**）。
 */

import { basename, resolve } from 'node:path'
import {
  HISTORY_MAX_RUNS,
  MERGE_LOG_MAX,
  readContextHistory,
  writeContextHistory,
  type ContextCheckHistory,
  type ContextCheckRun,
  type MergeRecord,
} from './context-check'

const DEFAULT_OUT = 'test-results/context-check-history.json'

/** 一份待合并的来源（`from` 只取 basename，便于事后按文件名追溯） */
export interface MergeSource {
  from: string
  history: ContextCheckHistory | null
}

/** 一项历史记录的**最小合格形状**：`at` 必填（去重键），其余计数必须齐 */
function isRun(raw: unknown): raw is ContextCheckRun {
  const r = raw as Partial<ContextCheckRun>
  return (
    typeof r?.at === 'string' &&
    typeof r?.errors === 'number' &&
    typeof r?.c5 === 'number' &&
    (typeof r?.c5UpperBound === 'number' || r?.c5UpperBound === null) &&
    typeof r?.c5OverBy === 'number' &&
    (typeof r?.c5SuggestLowerBound === 'number' || r?.c5SuggestLowerBound === null) &&
    typeof r?.coAnchors === 'number' &&
    (r?.source === undefined || typeof r.source === 'string')
  )
}

/**
 * 合并多份历史（纯函数，可测）。
 *
 * 不合格的项**逐条丢弃**（不因一项坏掉就丢掉整份）；同 `at` 的轮次只留一条（后到覆盖）。
 * 每份来源产出一条 `MergeRecord`（含净增轮次），追加进 `history.merges` ——
 * 这就是「合并来源的可追溯清单」：事后能查到「这几轮是从哪个文件合进来的」。
 *
 * @param now 合并动作的时间戳（注入以便测试钉住）
 */
export function mergeHistories(
  base: ContextCheckHistory | null,
  sources: MergeSource[],
  now: string,
): { history: ContextCheckHistory; records: MergeRecord[] } {
  const byAt = new Map<string, ContextCheckRun>()
  for (const raw of base?.runs ?? []) if (isRun(raw)) byAt.set(raw.at, raw)

  const records: MergeRecord[] = []
  for (const s of sources) {
    let accepted = 0
    let dropped = 0
    let added = 0
    for (const raw of s.history?.runs ?? []) {
      if (!isRun(raw)) {
        dropped += 1
        continue
      }
      accepted += 1
      // 「净增」按合并**前**的集合判：同一 `at` 已在表里 ⇒ 不算新增
      if (!byAt.has(raw.at)) added += 1
      byAt.set(raw.at, raw)
    }
    records.push({ at: now, from: s.from, accepted, dropped, added })
  }

  const runs = [...byAt.values()].sort((a, b) => a.at.localeCompare(b.at)).slice(-HISTORY_MAX_RUNS)
  const merges = [...(base?.merges ?? []), ...records].slice(-MERGE_LOG_MAX)
  return { history: { schema: 1, runs, merges }, records }
}

function main(argv: string[]): number {
  // ⚠️ 调用处已 `process.argv.slice(2)` ⇒ 这里**不再二次 slice**（否则前两个参数被吃掉）。
  const args = argv
  const from: string[] = []
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--from' && args[i + 1] !== undefined) {
      from.push(args[i + 1] as string)
    }
  }
  const outAt = args.indexOf('--out')
  const out =
    outAt >= 0 && args[outAt + 1] !== undefined ? (args[outAt + 1] as string) : DEFAULT_OUT
  if (from.length === 0) {
    console.error('缺参数：至少一个 --from <history.json>（可选 --out <path>）')
    return 2
  }

  const basePath = out
  const base = readContextHistory(basePath)
  const sources: MergeSource[] = from.map((p) => ({
    from: basename(p),
    history: readContextHistory(p),
  }))
  if (sources.some((s) => s.history === null)) {
    console.error('输入不可读或不是合法历史文件（schema 1）—— 合并未执行')
    return 2
  }

  const { history, records } = mergeHistories(base, sources, new Date().toISOString())
  if (writeContextHistory(history, resolve(basePath)) === null) {
    console.error(`写不进去：${basePath}`)
    return 2
  }

  const accepted = records.reduce((n, r) => n + r.accepted, 0)
  const dropped = records.reduce((n, r) => n + r.dropped, 0)
  const added = records.reduce((n, r) => n + r.added, 0)
  const allSources = [...new Set(history.runs.map((r) => r.source ?? 'local'))].sort()
  console.log(
    `合并完成：目标 ${basePath} · 读入 ${String(accepted)} 轮（丢弃不合格 ${String(dropped)}）· 净增 ${String(added)} 轮 · 表内 ${String(history.runs.length)} 轮（上限 ${String(HISTORY_MAX_RUNS)}）`,
  )
  console.log(`轮次来源：${allSources.join(' ／ ')}`)
  // 可追溯清单：每条记录对应一份来源文件（含净增数），同时写进 history.merges
  for (const r of records) {
    console.log(
      `  ← ${r.from}：读入 ${String(r.accepted)} 轮 / 净增 ${String(r.added)} / 丢弃 ${String(r.dropped)}`,
    )
  }
  console.log(`合并清单已写盘：history.merges（累计 ${String(history.merges?.length ?? 0)} 条）`)
  return 0
}

if (
  process.argv[1] !== undefined &&
  basename(process.argv[1]).startsWith('context-history-merge')
) {
  process.exitCode = main(process.argv.slice(2))
}
