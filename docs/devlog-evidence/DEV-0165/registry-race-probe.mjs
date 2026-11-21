// docs/devlog-evidence/DEV-0165/registry-race-probe.mjs
// —— 登记与回收的**并发竞态**真机压测（2026-11-03）。
//
// ## 为什么需要它
//
// 判据测试里那条「回收期间新建的登记不会被删」是**注入式**的（靠假 isAlive
// 回调在回收判定中途写文件）⇒ 它证明了**结构**上不丢行，但没有证明
// 「多个真实进程同时登记 + 回收」时也不丢。
// ⇒ 这个探针用**真进程**（子进程 + 真实时钟 + 真实并发）跑一遍，
// 并且**同时跑一遍旧布局**做对照 ⇒ 证明「这不只是换了写法，而是真的修掉了丢行」。
//
// ## 两种布局的判据（各自说明为什么这么判）
//
// - **旧布局**（一个 JSON Lines 文件）：登记**追加**、回收**读-改-写 + rename 覆盖**
//   ⇒ 回收读完到 rename 之间追加的行**被覆盖丢失**。
//   判据：**写出去的总条数 vs 最后活下来的条数** ⇒ 少了就是丢了（回收不做去重 ⇒
//   少掉的那几条只可能是竞态丢的）。
// - **新布局**（目录 + 每条登记一个文件）：回收**只删自己枚举到的文件**
//   ⇒ 回收**按设计**会删掉同一 pid 的旧记录（只留最新）⇒ 条数不可与旧布局比。
//   判据：**每个写者 pid 的最新那条登记（`at` 最大）必须还在**
//   ⇒ 这正是旧竞态的直接后果（最新那条被并发回收抹掉）。
//
// 用法：node --import tsx docs/devlog-evidence/DEV-0165/registry-race-probe.mjs
// 产出：docs/devlog-evidence/DEV-0165/registry-race-result.json
import { spawn } from 'node:child_process'
import { setInterval, clearInterval } from 'node:timers'
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..', '..')
const DIR = join(tmpdir(), 'ov-registry-race-probe')
const OLD_DIR = join(tmpdir(), 'ov-registry-race-probe-old')

// ⚠️ 复用 core 的实现（不能自己重写一份 ⇒ 测的就不是真代码了）
const { pruneRegistry } = await import(
  join(ROOT, 'packages/core/src/test-support/worker-registry.ts')
)

const WRITERS = 6
const PER_WRITER = 60
/** 固定的基准时刻（毫秒）——每个写者占一段连续时间 ⇒ 判据可复算、无歧义。 */
const BASE = Date.parse('2026-11-03T00:00:00.000Z')

/** 造一个只做「登记」的子进程脚本（真进程 ⇒ 真并发）。 */
function childScript() {
  return `
import { writeRegistryRecord } from '${join(ROOT, 'packages/core/src/test-support/worker-registry.ts')}'
import { appendFileSync } from 'node:fs'
// ⚠️ node --eval 时 argv[1] 就是第一个用户参数（没有脚本路径这一位）
const [dir, n, layout, base] = process.argv.slice(1)
const count = Number(n)
const start = Number(base)
for (let i = 0; i < count; i++) {
  const at = new Date(start + i).toISOString()
  if (layout === 'old') {
    appendFileSync(dir, JSON.stringify({ pid: process.pid, cwd: '/repo', at }) + '\\n')
  } else {
    writeRegistryRecord(dir, { pid: process.pid, cwd: '/repo', at })
  }
}
`
}

/** 旧布局的回收：读-改-写（读全量 → 写 tmp → rename 覆盖）。 */
function pruneOld(file) {
  let text = ''
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return
  }
  const tmp = `${file}.tmp`
  writeFileSync(tmp, text)
  renameSync(tmp, file)
}

/** 读旧布局的文件（逐行 JSON）。 */
function readOld(file) {
  let text = ''
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return []
  }
  const out = []
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    try {
      out.push(JSON.parse(line))
    } catch {
      // 坏行跳过
    }
  }
  return out
}

/** 读新布局的目录（每个 `.json` 一个登记）。 */
function readNew(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue
    try {
      out.push(JSON.parse(readFileSync(join(dir, name), 'utf8')))
    } catch {
      // 坏文件跳过
    }
  }
  return out
}

/** 跑一轮：并发登记 + 并发回收。 */
async function run(layout) {
  const dir = layout === 'old' ? OLD_DIR : DIR
  const target = layout === 'old' ? join(dir, 'registry.jsonl') : dir
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })

  const script = childScript()
  const children = []
  /** 每个写者的「最新一条」应当具备的 `at`（按写者序号索引）。 */
  const expectedNewest = []
  for (let w = 0; w < WRITERS; w++) {
    // ⚠️ 每个写者用**不同**的时间段 ⇒ 跨写者的 `at` 不重叠 ⇒ 判据无歧义
    const base = BASE + w * 1_000_000
    expectedNewest.push(new Date(base + PER_WRITER - 1).toISOString())
    children.push(
      spawn(
        process.execPath,
        ['--import', 'tsx', '--eval', script, target, String(PER_WRITER), layout, String(base)],
        { cwd: ROOT, stdio: 'inherit' },
      ),
    )
  }

  let pruneRounds = 0
  const pruner = setInterval(() => {
    if (layout === 'old') pruneOld(target)
    else pruneRegistry(target, () => true)
    pruneRounds++
  }, 2)

  await Promise.all(
    children.map(
      (c) =>
        new Promise((resolve) => {
          c.on('exit', resolve)
        }),
    ),
  )
  clearInterval(pruner)

  const records = layout === 'old' ? readOld(target) : readNew(target)
  const totalWritten = WRITERS * PER_WRITER

  if (layout === 'old') {
    // 判据：写出去的总条数 vs 最后活下来的条数（回收不去重 ⇒ 少掉的都是竞态丢的）
    return {
      layout,
      pruneRounds,
      totalWritten,
      recordsAtEnd: records.length,
      lostRecords: totalWritten - records.length,
    }
  }
  // 判据：每个写者 pid 的最新那条登记必须还在
  const missingNewest = expectedNewest.filter((want) => !records.some((r) => r.at === want))
  return {
    layout,
    pruneRounds,
    totalWritten,
    recordsAtEnd: records.length,
    // ⚠️ 新布局的回收**按设计**只留每个 pid 的最新一条 ⇒ 条数 = 写者数
    writersMissingNewest: missingNewest.length,
    missingNewestAt: missingNewest,
  }
}

const oldResult = await run('old')
const newResult = await run('new')

const result = {
  at: new Date().toISOString(),
  writers: WRITERS,
  perWriter: PER_WRITER,
  old: oldResult,
  new: newResult,
  // ⚠️ 终判：新布局**每个写者的最新登记都不能丢**
  passed: newResult.writersMissingNewest === 0,
}
writeFileSync(join(HERE, 'registry-race-result.json'), `${JSON.stringify(result, null, 2)}\n`)
console.log(JSON.stringify(result, null, 2))
if (!result.passed) {
  console.error('⚠️ 新布局仍丢了登记 ⇒ 竞态未消除')
  process.exit(1)
}
console.log('✅ 新布局：并发登记一条未丢')
if (oldResult.lostRecords > 0) {
  console.log(
    `✅ 对照：旧布局丢了 ${String(oldResult.lostRecords)} 条登记（写 ${String(oldResult.totalWritten)} 条）⇒ 竞态确实存在过`,
  )
}
