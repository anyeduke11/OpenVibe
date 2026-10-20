/**
 * check-m9-links —— M9 v1.6 **P1c · 资源链接失效巡检**（§3.14 · DL-30）
 *
 * ## 它是什么
 *
 * 主清单 89 条 ＋ 速成专区 11 条，共 100 行资源、**98 个去重 URL**，
 * 逐个发一次 **HEAD**，把状态码与失败计数落库。
 *
 * ## ⚠️ 默认只打印计划，不发请求
 *
 * §3.14 写死「**默认手动触发，不进启动流程**」——
 * 产品启动时做网络请求，会把「打开一个本机工具」变成「等网络」。
 * ⇒ 不给 `--execute` 就只列计划，**一个包都不发、库一个字都不改**。
 *
 * ## ⚠️ 三条纪律
 *
 * 1. 只发 HEAD（不抓正文）—— §3.2 的版权纪律在网络上同样生效；
 * 2. 响应体零落库 —— 落库的只有状态码与计数；
 * 3. 永不删除 —— 连续两次失败只标灰，行仍在表里。
 *
 * ## 用法
 *
 * ```
 * pnpm m9:links                      # 只列计划（默认，不发请求）
 * pnpm m9:links -- --execute         # 真出网巡检
 * pnpm m9:links -- --execute --json  # 机器可读输出
 * pnpm m9:links -- --db <路径>       # 指定库（默认 ~/.openvibe/data/openvibe.db）
 * pnpm m9:links -- --seed            # 库空时先导入 M9 资源层种子
 * ```
 *
 * ## ⚠️ 退出码
 *
 * 0 = 巡检跑完（**发现失效不算失败** —— 那是数据，不是报错）；
 * 1 = 自检发现异常（行数对不上、状态机对不上等）；
 * 2 = 用法或前置条件不对（库不存在、资源层为空且没给 --seed）。
 */
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createHeadTransport,
  defaultDbPath,
  openDatabase,
  planLinkTargets,
  runLinkProbe,
  seedLangResourceLayer,
  seedLangTopics,
  verifyLinkProbeRun,
  verdictOf,
  type SqliteDatabase,
} from '@openvibe/core'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SEEDS_DIR = join(REPO_ROOT, 'packages', 'core', 'src', 'db', 'seeds')

interface Args {
  db: string
  execute: boolean
  seed: boolean
  json: boolean
  all: boolean
  timeoutMs: number
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = {
    db: defaultDbPath(),
    execute: false,
    seed: false,
    json: false,
    all: false,
    timeoutMs: 10_000,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--execute') args.execute = true
    else if (arg === '--seed') args.seed = true
    else if (arg === '--json') args.json = true
    else if (arg === '--all') args.all = true
    else if (arg === '--db') {
      const next = argv[i + 1]
      if (next === undefined) {
        console.error('--db 后面要跟一个路径')
        process.exit(2)
      }
      args.db = next
      i += 1
    } else if (arg === '--timeout') {
      const next = Number(argv[i + 1])
      if (!Number.isFinite(next) || next <= 0) {
        console.error('--timeout 后面要跟一个正整数（毫秒）')
        process.exit(2)
      }
      args.timeoutMs = next
      i += 1
    } else if (arg === '--help' || arg === '-h') {
      console.log(
        '用法: check-m9-links [--execute] [--seed] [--json] [--all] [--db <路径>] [--timeout <毫秒>]',
      )
      process.exit(0)
    } else {
      console.error(`不认识的参数: ${arg}`)
      process.exit(2)
    }
  }
  return args
}

function countRows(db: SqliteDatabase): number {
  const main = db.prepare('SELECT COUNT(*) AS c FROM lang_resources').get() as { c: number }
  const vibe = db.prepare('SELECT COUNT(*) AS c FROM lang_vibe_resources').get() as { c: number }
  return main.c + vibe.c
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  if (!existsSync(args.db)) {
    console.error(`库不存在: ${args.db}`)
    console.error('先跑一次应用让它建库，或用 --db 指定别的路径。')
    process.exit(2)
  }
  const db = openDatabase(args.db)

  if (countRows(db) === 0) {
    if (!args.seed) {
      console.error('资源层是空的（lang_resources / lang_vibe_resources 都没有行）。')
      console.error('先导入种子：pnpm m9:links -- --seed')
      process.exit(2)
    }
    const topics = db.prepare('SELECT COUNT(*) AS c FROM lang_topics').get() as { c: number }
    if (topics.c === 0) {
      // 挂接行引用知识点 ⇒ 知识点为空时挂接只能整条跳过（导入器会逐条告警）
      seedLangTopics(db, SEEDS_DIR)
    }
    const results = seedLangResourceLayer(db, SEEDS_DIR)
    for (const r of results) {
      console.log(`[种子] ${r.bundle}: ${r.status}（新建 ${String(r.created)} 条）`)
    }
  }

  const targets = planLinkTargets(db)
  const rowsBefore = countRows(db)
  const mainRows = (db.prepare('SELECT COUNT(*) AS c FROM lang_resources').get() as { c: number }).c
  const vibeRows = (db.prepare('SELECT COUNT(*) AS c FROM lang_vibe_resources').get() as { c: number }).c

  if (!args.execute) {
    console.log('[m9:links] 计划（dry-run —— 没发任何请求，库也没动）')
    console.log(`  主清单 lang_resources   ${String(mainRows)} 行`)
    console.log(`  速成   lang_vibe_resources ${String(vibeRows)} 行`)
    console.log(`  去重后待探测 URL        ${String(targets.length)} 个`)
    console.log('  真要跑就加 --execute（手动触发，不进启动流程）。')
    db.close()
    return
  }

  const report = await runLinkProbe(db, createHeadTransport({ timeoutMs: args.timeoutMs }))
  const rowsAfter = countRows(db)
  const violations = verifyLinkProbeRun({ report, rowsBefore, rowsAfter })

  if (args.json) {
    console.log(JSON.stringify({ report, violations }, null, 2))
  } else {
    console.log(`[m9:links] 巡检完成 —— ${new Date(report.checkedAt).toISOString()}`)
    console.log(`  请求 ${String(report.requestedUrls)} 个 URL（方法 ${report.method}）`)
    console.log(`  失败 ${String(report.failedUrls)} 个 · 判死 ${String(report.markedDead)} 行`)
    console.log(`  疑似 ${String(report.markedSuspect)} 行 · 已过时 ${String(report.outdatedRows)} 行`)
    for (const target of report.targets) {
      const verdict = verdictOf(target)
      if (args.all || verdict.liveness !== 'ok' || verdict.outdated) {
        const code = target.statusCode === null ? '连不上' : String(target.statusCode)
        console.log(`  · [${verdict.liveness}] ${code} ${target.url} —— ${verdict.notice}`)
      }
    }
    for (const v of violations) {
      console.error(`  ✗ ${v.rule}: ${v.detail}`)
    }
  }
  db.close()
  if (violations.length > 0) process.exit(1)
}

await main()
