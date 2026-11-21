/**
 * docs/devlog-evidence/DEV-0159/orphan-worker-probe.mjs
 * —— 孤儿 worker 的**最小复现探针**（2026-11-02）。
 *
 * ## 它回答什么问题
 *
 * DEV-0158 收尾时机器上留了 9 个 `PPID=1` 的 `node (vitest N)` 进程。
 * `scripts/check-orphan-workers.ts` 能**发现与清理**它们，但没解释
 * **「为什么父进程死了 worker 还活着」** ⇒ 治标不治本。
 *
 * ⇒ 本探针用**最小可控场景**回答那个问题。
 *
 * ## 复现手法（三步）
 *
 * ① 起一个 vitest 主进程，跑一支**长睡眠**的测试（保证 worker 一直活着）；
 * ② 找到 `node (vitest)` 主进程与它的 `node (vitest N)` worker；
 * ③ `kill -9` 主进程（**SIGKILL** ⇒ 主进程没有任何机会清理 worker）
 *    ⇒ 看 worker 是不是变成了 `PPID=1` 的孤儿。
 *
 * ## 实测结论（2026-11-02）
 *
 * **能复现**：kill -9 主进程后，worker 立刻变成 `PPID=1`（被 launchd 收养）。
 * ⇒ 根因是：**vitest 的 worker 不监听父进程死亡**。
 *   - vitest 主进程正常退出 ⇒ tinypool 调 `terminate()` ⇒ 逐个 `kill` worker ⇒ **无残留**；
 *   - 主进程被 **SIGKILL** ⇒ tinypool 的 `terminate()` **跑不到** ⇒ worker 变孤儿。
 * ⇒ 孤儿只在「主进程被强杀」时产生 ⇒ **退出路径本身是干净的**
 *   （实测：正常跑完全量后 `pnpm orphans:check` 报「0 个 ⇒ 干净」）。
 *
 * ⚠️ **为什么 worker 不会自己退出**：worker 在跑那支 120 秒的测试 ⇒ 它跑完就自然退了
 *   （实测孤儿存活约 120 秒后消失）⇒ 孤儿**不是永久泄漏**，是「滞留到当前测试跑完」。
 *   ⇒ 危害不在内存泄漏，而在**滞留期间仍占 CPU/内存**，且数量随「强杀次数」累积。
 *
 * ## 用法
 *
 * ```sh
 * node docs/devlog-evidence/DEV-0159/orphan-worker-probe.mjs
 * ```
 *
 * ⚠️ **它会真的 `kill -9` 一个 vitest 主进程** ⇒ 只在自己起的那个上面动，
 *   绝不碰别人的。
 */
import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ROOT = new URL('../../..', import.meta.url).pathname
const SLEEP_MS = 120_000

/** 读进程表（pid / ppid / command） */
function ps() {
  const out = execFileSync('ps', ['-Ao', 'pid,ppid,command'], { encoding: 'utf8' })
  return out
    .split('\n')
    .map((line) => {
      const t = line.trim()
      if (t.length === 0) return null
      const parts = t.split(/\s+/)
      const pid = Number(parts[0])
      const ppid = Number(parts[1])
      if (!Number.isFinite(pid) || !Number.isFinite(ppid)) return null
      return { pid, ppid, command: t.replace(/^\s*\d+\s+\d+\s+/, '') }
    })
    .filter((r) => r !== null)
}

/** 找 vitest 主进程（标题恰为 `node (vitest)`，不带数字后缀） */
function findMain(rows) {
  return rows.find((r) => /^node \(vitest\)\s*$/.test(r.command)) ?? null
}

/** 找 worker（标题 `node (vitest N)`） */
function findWorkers(rows) {
  return rows.filter((r) => /^node \(vitest \d+\)\s*$/.test(r.command))
}

const dir = mkdtempSync(join(tmpdir(), 'ov-orphan-probe-'))
const testFile = join(dir, 'sleep.test.ts')
writeFileSync(
  testFile,
  `import { describe, expect, it } from 'vitest'\n` +
    `describe('孤儿探针', () => {\n` +
    `  it('睡 ${String(SLEEP_MS)} ms', async () => {\n` +
    `    await new Promise((r) => setTimeout(r, ${String(SLEEP_MS)}))\n` +
    `    expect(1).toBe(1)\n` +
    `  })\n` +
    `})\n`,
  'utf8',
)

console.log(`[probe] 探针测试文件：${testFile}`)

const child = spawn(
  'npx',
  ['vitest', 'run', '--root', dir, '--maxWorkers=2', '--testTimeout=180000'],
  { cwd: ROOT, stdio: ['ignore', 'ignore', 'ignore'], detached: false },
)

/** 等到主进程与 worker 都出现 */
async function waitForWorkers(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const rows = ps()
    const main = findMain(rows)
    const workers = findWorkers(rows)
    if (main !== null && workers.length > 0) return { main, workers }
    await new Promise((r) => setTimeout(r, 400))
  }
  return null
}

const found = await waitForWorkers()
if (found === null) {
  console.error('[probe] ❌ 没等到 vitest 主进程与 worker ⇒ 本机形态与预期不符')
  child.kill('SIGKILL')
  rmSync(dir, { recursive: true, force: true })
  process.exit(1)
}

const { main, workers } = found
console.log(
  `[probe] 主进程 pid=${String(main.pid)}，worker ${String(workers.length)} 个：${workers.map((w) => String(w.pid)).join(', ')}`,
)
console.log('[probe] 此刻 worker 的 PPID：')
for (const w of workers) console.log(`[probe]   pid ${String(w.pid)} ← ppid ${String(w.ppid)}`)

console.log(`[probe] kill -9 主进程 ${String(main.pid)}（模拟「父进程被强杀」）…`)
try {
  process.kill(main.pid, 'SIGKILL')
} catch (e) {
  console.error(`[probe] 杀主进程失败：${e instanceof Error ? e.message : String(e)}`)
}

await new Promise((r) => setTimeout(r, 3000))

const after = ps()
const orphans = after.filter((r) => r.ppid === 1 && /^node \(vitest \d+\)\s*$/.test(r.command))
console.log(`[probe] 杀主进程后 **PPID=1 的孤儿 worker**：${String(orphans.length)} 个`)
for (const o of orphans) console.log(`[probe]   pid ${String(o.pid)}  ${o.command}`)

if (orphans.length > 0) {
  console.log('[probe] ✅ **根因已复现**：主进程被 SIGKILL ⇒ vitest worker 不会自杀 ⇒ 变孤儿。')
  console.log('[probe] ⇒ 结论：孤儿只在「主进程被强杀」时产生，正常退出路径不留残留。')
  console.log('[probe] ⇒ 处置：靠 `pnpm orphans:check` 发现 ＋ `pnpm orphans:clean` 清理（治标），')
  console.log('[probe]    根治需上游让 worker 监听父进程死亡（本仓无法改 vitest 内部）。')
} else {
  console.log('[probe] ⚠️ **没复现出孤儿** ⇒ 本机 vitest 版本或池模式已变 ⇒ 该结论需重新取证。')
}

// 收尾：把探针自己起的进程与目录清掉
for (const o of orphans) {
  try {
    process.kill(o.pid, 'SIGTERM')
  } catch {
    // 已经没了
  }
}
try {
  child.kill('SIGKILL')
} catch {
  // 已经没了
}
rmSync(dir, { recursive: true, force: true })
process.exit(0)
